# OwlMind

## Run locally on Replit

The app lives in `project/` and uses React, TypeScript, and Vite.

```bash
cd project
npm ci
npm run dev -- --host 0.0.0.0 --port 5000
```

The `Start application` workflow runs the same command on port 5000.

## Vercel / Telegram Mini App

When deploying from this repository, set Vercel's **Root Directory** to
`project`, then redeploy. The app can render without Supabase configuration;
the Study Rooms tab stays unavailable until these Vercel environment variables
are added:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

After changing Vercel environment variables, create a new deployment so Vite
includes them in the frontend build. Use the resulting HTTPS deployment URL
as the Telegram Mini App URL.