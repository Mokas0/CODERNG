# How to set up the Hub (chat + trading) and push your project

## Part 1: Supabase (free) — chat and trading backend

1. **Create an account**
   - Go to [supabase.com](https://supabase.com) and sign up (free).

2. **Create a new project**
   - Click **New project**.
   - Pick an organization (or create one).
   - **Name:** e.g. `rng-roller`.
   - **Database password:** choose one and save it.
   - **Region:** pick one close to you.
   - Click **Create new project** and wait until it’s ready.

3. **Create the tables**
   - In the left sidebar click **SQL Editor**.
   - Click **New query**.
   - Open the file `supabase-schema.sql` in this repo, copy **all** of it, paste into the Supabase SQL editor, then click **Run**.
   - You should see “Success. No rows returned.”

4. **Turn on Realtime for the tables**
   - Go to **Database** → **Replication** (or **Publications**).
   - Find the `supabase_realtime` publication and add the `messages` and `trades` tables so chat and trades update live for everyone.

5. **Get your URL and key**
   - Go to **Project Settings** (gear icon) → **API**.
   - Copy:
     - **Project URL**
     - **anon public** key (under “Project API keys”).

6. **Add them to your app (local)**
   - In your project folder create a file named `.env.local` (same folder as `package.json`).
   - Put this in it (replace with your real URL and key):

   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

   - Save the file. **Do not** commit `.env.local` to Git (it’s in `.gitignore`).

7. **Run the app**
   - In the project folder run: `npm install` then `npm run dev`.
   - Open the **Hub** tab, set a display name, and try sending a chat message and posting a trade.

---

## Part 2: Push your code to GitHub

1. **Install Git** (if you don’t have it): [git-scm.com](https://git-scm.com).

2. **Open a terminal** in your project folder (e.g. `CODERNG`).

3. **Turn the folder into a Git repo** (only if you haven’t already):
   ```bash
   git init
   ```

4. **Add and commit everything:**
   ```bash
   git add .
   git commit -m "Add hub and deploy setup"
   ```

5. **Create a repo on GitHub**
   - Go to [github.com](https://github.com) and sign in.
   - Click the **+** (top right) → **New repository**.
   - Name it (e.g. `CODERNG`), leave “Add a README” **unchecked**.
   - Click **Create repository**.

6. **Connect and push**
   - GitHub will show commands; use these (replace `YOUR_USERNAME` and `YOUR_REPO` with yours):
   ```bash
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
   - If it asks for a password, use a **Personal Access Token** (GitHub → Settings → Developer settings → Personal access tokens → Generate new token). Use the token as the password.

---

## Part 3: Deploy on Netlify (so the site is online)

1. **Go to [netlify.com](https://netlify.com)** and sign up / log in (e.g. with GitHub).

2. **Add a new site**
   - Click **Add new site** → **Import an existing project**.
   - Choose **GitHub** and pick your repo (e.g. `CODERNG`).

3. **Build settings** (Netlify often fills these from `netlify.toml`):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - Click **Deploy** (or **Deploy site**).

4. **Add Supabase env vars so the Hub works online**
   - In Netlify: **Site settings** → **Environment variables** → **Add a variable** (or **Add from .env**).
   - Add:
     - Key: `VITE_SUPABASE_URL` → Value: your Supabase Project URL.
     - Key: `VITE_SUPABASE_ANON_KEY` → Value: your Supabase anon key.
   - **Save** and then trigger a **new deploy** (Deploys → Trigger deploy → Deploy site).

5. **Open your site**
   - Use the URL Netlify gives you (e.g. `something.netlify.app`). The Hub tab will work for everyone who visits.

---

## Part 4 (optional): Bazaar and Email auth

The **Bazaar** lets signed-in players sell auras for coins. It requires Email auth and extra tables.

1. **Enable Email auth in Supabase**
   - In your project go to **Authentication** → **Providers**.
   - Enable **Email** (and optionally disable “Confirm email” for quick testing).

2. **Run the Bazaar schema**
   - In **SQL Editor**, open a new query.
   - Copy all of **`supabase-bazaar.sql`** (run this after `supabase-schema.sql` and `supabase-casino.sql`), paste, and **Run**.

3. **Realtime for Bazaar**
   - In **Database** → **Replication**, add **bazaar_listings** to the `supabase_realtime` publication so new/sold listings update live.

4. **No new env vars**
   - The same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used; the Bazaar and auth work with the anon key.

5. **Using the Bazaar**
   - Users **Sign up** (email, password, display name) or **Sign in** from the header.
   - In the **Bazaar** tab they can deposit/withdraw game coins to Bazaar balance, link their Casino vault (generate code in Casino, enter in Bazaar), import auras from Casino, list auras for sale, and buy from others.

---

## Quick reference

| Step            | What to do |
|-----------------|------------|
| Supabase tables | Run `supabase-schema.sql` in Supabase SQL Editor. |
| Casino          | Run `supabase-casino.sql`; add coinflip/itemflip tables to Realtime. |
| Bazaar + Auth   | Enable Email in Authentication → Providers; run `supabase-bazaar.sql`; add `bazaar_listings` to Realtime. |
| Local env       | Create `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. |
| Push to GitHub  | `git add .` → `git commit -m "message"` → `git push`. |
| Deploy Netlify  | Connect GitHub repo, build command `npm run build`, publish `dist`, add the two env vars, redeploy. |
