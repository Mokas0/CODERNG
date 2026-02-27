/**
 * Netlify Function: create-paypal-order
 * Creates a PayPal order for the requested product and returns the orderID.
 * The frontend PayPal SDK uses this orderID to launch the payment popup.
 */

const PAYPAL_BASE = process.env.PAYPAL_ENV === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

// Product catalogue — keep in sync with STORE_PRODUCTS in src/main.js
const PRODUCTS = {
  coin_s:   { amount: "0.99",  description: "Coin Pack S — 500M coins" },
  coin_m:   { amount: "4.99",  description: "Coin Pack M — 3B coins" },
  coin_l:   { amount: "9.99",  description: "Coin Pack L — 7.5B coins" },
  luck_s:   { amount: "1.99",  description: "Luck Boost S — x10M luck" },
  luck_l:   { amount: "4.99",  description: "Luck Boost L — x100M luck" },
};

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

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let productId;
  try {
    ({ productId } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid body" }) };
  }

  const product = PRODUCTS[productId];
  if (!product) {
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown product" }) };
  }

  try {
    const accessToken = await getAccessToken();

    const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: product.amount },
            description: product.description,
          },
        ],
      }),
    });

    const order = await res.json();
    if (!res.ok) {
      console.error("[create-paypal-order] PayPal error:", order);
      return { statusCode: 502, body: JSON.stringify({ error: "PayPal order creation failed" }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ orderID: order.id }),
    };
  } catch (err) {
    console.error("[create-paypal-order] Unexpected error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
