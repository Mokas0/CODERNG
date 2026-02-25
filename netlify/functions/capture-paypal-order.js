/**
 * Netlify Function: capture-paypal-order
 * Captures an approved PayPal order, generates a one-time claim code,
 * and stores it in Supabase. Returns the claim code to the frontend.
 */

import { createClient } from "@supabase/supabase-js";

const PAYPAL_BASE = process.env.PAYPAL_ENV === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

// Supabase admin client (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Valid product IDs — must match STORE_PRODUCTS in src/main.js
const VALID_PRODUCTS = new Set(["coin_s", "coin_m", "coin_l", "luck_s", "luck_l"]);

async function getAccessToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token;
}

function generateClaimCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/1/0 to avoid confusion
  let code = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code; // e.g. ABCD-EFGH-JKLM-NPQR
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let orderID, productId;
  try {
    ({ orderID, productId } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid body" }) };
  }

  if (!orderID || !VALID_PRODUCTS.has(productId)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing or invalid parameters" }) };
  }

  try {
    const accessToken = await getAccessToken();

    // Capture the payment
    const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const capture = await captureRes.json();
    if (!captureRes.ok || capture.status !== "COMPLETED") {
      console.error("[capture-paypal-order] Capture failed:", capture);
      return { statusCode: 402, body: JSON.stringify({ error: "Payment capture failed" }) };
    }

    // Generate and store claim code
    const claimCode = generateClaimCode();
    const { error: dbError } = await supabase
      .from("purchase_codes")
      .insert({ code: claimCode, product_id: productId });

    if (dbError) {
      console.error("[capture-paypal-order] DB insert error:", dbError);
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to store claim code" }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ claimCode }),
    };
  } catch (err) {
    console.error("[capture-paypal-order] Unexpected error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
