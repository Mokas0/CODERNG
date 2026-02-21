# Precise deployment steps (do in order)

Do these in order. Check off each step before moving on.

---

## Step 1: Supabase — create project (if you don’t have one)

1. Open **https://supabase.com** in your browser.
2. Sign in or click **Start your project** and sign up (email or GitHub).
3. Click **New project**.
4. **Organization:** Keep the default or create one (e.g. “My projects”).
5. **Name:** Type `rng-roller` (or any name).
6. **Database password:** Type a strong password and **save it somewhere** (you need it for DB access later).
7. **Region:** Choose the one closest to you (e.g. East US).
8. Click **Create new project**.
9. Wait until the status at the top is **Active** (about 1–2 minutes).

---

## Step 2: Supabase — create tables

1. In the **left sidebar**, click **SQL Editor** (icon that looks like `</>`).
2. Click the **+ New query** button.
3. On your computer, open the file **`supabase-schema.sql`** in your CODERNG folder (in Cursor or Notepad).
4. Press **Ctrl+A** to select all, then **Ctrl+C** to copy.
5. Click inside the Supabase SQL editor (the big text area).
6. Press **Ctrl+V** to paste.
7. Click the green **Run** button (or press Ctrl+Enter).
8. At the bottom you should see: **Success. No rows returned.**  
   - If you see an error, copy it and fix the SQL or ask for help.

---

## Step 3: Supabase — turn on Realtime

1. In the **left sidebar**, click **Database**.
2. Click **Replication** in the submenu (or **Publications** in some layouts).
3. Find the publication named **supabase_realtime**.
4. Click it or **Edit**.
5. Under **Tables**, make sure **messages** and **trades** are **included** (checked or added).  
   - If you see a list of tables, check the boxes for `messages` and `trades`.  
   - If you see “Add table,” add `messages` and `trades`.
6. Save / close.

---

## Step 4: Supabase — copy URL and key

1. In the **left sidebar**, click the **gear icon** (**Project Settings**) at the bottom.
2. Click **API** in the left menu under “Project Settings.”
3. Under **Project URL**, click **Copy** (or select the URL and copy).  
   - It looks like: `https://abcdefghijk.supabase.co`  
   - Paste it into a temporary note (Notepad or similar).
4. Under **Project API keys**, find **anon** **public**.
5. Click **Reveal** (or the copy icon), then copy that key.  
   - It’s a long string (e.g. `eyJhbGciOi...`).  
   - Paste it into your temporary note next to the URL.

---

## Step 5: Your project — set env vars locally

1. Open your **CODERNG** folder (e.g. in Cursor or File Explorer).
2. Open the file **`.env.local`** (create it if it doesn’t exist; same folder as `package.json`).
3. Make sure it has **exactly** these two lines (no quotes, no spaces around `=`):

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...your-full-key...
   ```

4. Replace:
   - `https://YOUR-PROJECT-REF.supabase.co` with the **Project URL** you copied in Step 4.
   - `eyJhbGciOi...your-full-key...` with the **anon public** key you copied in Step 4.
5. Save the file and close it.  
   - Do **not** commit `.env.local` to Git (it’s in `.gitignore`).

---

## Step 6: Your project — push to GitHub

1. Open a terminal in the **CODERNG** folder (e.g. Cursor terminal, or PowerShell / Command Prompt after `cd` to CODERNG).

2. If this folder is **not** yet a Git repo, run:

   ```bash
   git init
   ```

3. Stage and commit (use one of these; PowerShell uses `;`):

   **PowerShell:**

   ```powershell
   git add .
   git commit -m "Ready for deployment"
   ```

   **Git Bash / Mac/Linux:**

   ```bash
   git add .
   git commit -m "Ready for deployment"
   ```

4. Create the repo on GitHub:
   - Go to **https://github.com** and sign in.
   - Click the **+** (top right) → **New repository**.
   - **Repository name:** e.g. `CODERNG` (must match what you’ll use below).
   - Leave **Add a README** **unchecked**.
   - Click **Create repository**.

5. Connect and push (replace `YOUR_GITHUB_USERNAME` and `CODERNG` with your username and repo name):

   **PowerShell / Git Bash:**

   ```bash
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/CODERNG.git
   git push -u origin main
   ```

6. If Git asks for **username:** type your GitHub username.  
   If it asks for **password:** do **not** use your GitHub password. Use a **Personal Access Token**:
   - GitHub → your profile (top right) → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**.
   - Name it e.g. “Netlify deploy,” check **repo**, then **Generate token**.
   - Copy the token and paste it when Git asks for the password.

---

## Step 7: Netlify — create site from GitHub

1. Go to **https://app.netlify.com** and sign in (e.g. **Sign up with GitHub** or **Log in with GitHub**).
2. Click **Add new site** → **Import an existing project**.
3. Click **Deploy with GitHub** (or **Connect to Git provider** → **GitHub**).
4. If asked, authorize Netlify to access GitHub and choose your account.
5. In the list of repositories, find **CODERNG** (or the name you used) and click **Import** or **Select**.

---

## Step 8: Netlify — set build settings

1. On the “Import project” / “Configure build” page, set:
   - **Branch to deploy:** `main` (or your default branch).
   - **Build command:** type exactly: `npm run build`
   - **Publish directory:** type exactly: `dist`
2. **Do not** click Deploy yet. Scroll down to **Environment variables** (or **Advanced build settings**).

---

## Step 9: Netlify — add Supabase env vars (required for Hub)

1. Under **Environment variables** (or **Options**), click **Add a variable** or **New variable**.
2. Add the first variable:
   - **Key:** `VITE_SUPABASE_URL`  
   - **Value:** paste your Supabase **Project URL** (same as in `.env.local`).  
   - **Scopes:** leave default (e.g. “All” or “Builds”).
3. Click **Add** / **Save** (or **Add another**).
4. Add the second variable:
   - **Key:** `VITE_SUPABASE_ANON_KEY`  
   - **Value:** paste your Supabase **anon public** key (same as in `.env.local`).  
   - **Scopes:** leave default.
5. Click **Save** or **Deploy**.

---

## Step 10: Netlify — deploy

1. Click **Deploy site** (or **Deploy CODERNG**).
2. Wait for the deploy to finish (usually 1–2 minutes). The status will change to **Published** or show a green check.
3. Click **Open production deploy** or the site URL (e.g. `https://random-name-12345.netlify.app`).

---

## Step 11: Verify

1. On your live Netlify URL:
   - Click **Roll** a few times and check that rolls and rarities show.
   - Open the **Hub** tab, set a display name, send a chat message, and post a trade.
2. If the Hub shows “Hub is offline,” the env vars were not applied:
   - Netlify → **Site settings** → **Environment variables** → confirm **VITE_SUPABASE_URL** and **VITE_SUPABASE_ANON_KEY** are set.
   - Go to **Deploys** → **Trigger deploy** → **Deploy site** to rebuild with the env vars.

---

## Checklist (quick reference)

- [ ] Supabase project created and active  
- [ ] `supabase-schema.sql` run in SQL Editor (Success)  
- [ ] Realtime enabled for `messages` and `trades`  
- [ ] Project URL and anon key copied  
- [ ] `.env.local` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`  
- [ ] `git add .` and `git commit` done  
- [ ] GitHub repo created (e.g. CODERNG)  
- [ ] `git remote add origin` and `git push -u origin main` done  
- [ ] Netlify site created and connected to GitHub repo  
- [ ] Build command: `npm run build`, Publish directory: `dist`  
- [ ] Netlify env vars: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`  
- [ ] Deploy triggered and finished  
- [ ] Live site opens and Hub works (chat + trades)
