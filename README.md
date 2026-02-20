# RNG Roller

Roll one of **500** unique text/font/color/style results. Rarity spans from **1/2** (common) to **1/10 billion** (ultra rare). Salvage past rolls for coins and spend coins to boost your luck for better odds on the next roll.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Deploy to Netlify

1. Push this repo to GitHub (or connect your repo in Netlify).
2. In [Netlify](https://app.netlify.com): **Add new site → Import an existing project** and select the repo.
3. Build settings (already in `netlify.toml`):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. Deploy. Netlify will run `npm install` and `npm run build`, then serve the `dist` folder.

No environment variables or server required; the app is static and uses `localStorage` for coins, history, and luck.
