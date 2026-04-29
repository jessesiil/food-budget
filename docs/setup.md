# Setup walkthrough

End-to-end setup for Phase 0: from "I have nothing" to "I can open this in Safari on my iPhone and click two buttons that work."

Estimate: ~30 minutes if you start from zero, including waiting on Supabase to provision the database.

---

## 1. Sign up for accounts

All free, no credit card required for any of the three. Sign in with GitHub everywhere — it makes deployment one-click later.

### Supabase (database)
1. Go to https://supabase.com and click **Start your project**.
2. Sign in with GitHub.
3. Click **New project**.
4. Organization: yours. Name: `food-budget`. Database password: pick a strong one and save it in a password manager — you'll need it. Region: **West EU (Ireland)** or **Central EU (Frankfurt)** for low latency from NL.
5. Click **Create new project**. Wait ~2 minutes for it to provision.

### Render (backend hosting)
1. Go to https://render.com and click **Get Started for Free**.
2. Sign up with GitHub.
3. When prompted, authorize Render to access your `food-budget` repo. We'll create the actual web service in step 5.

### Vercel (frontend hosting)
1. Go to https://vercel.com and click **Sign Up**.
2. Sign up with GitHub.
3. Authorize Vercel for the `food-budget` repo. We'll deploy the frontend in step 5.

---

## 2. Apply the database schema

1. In your Supabase project dashboard, click the **SQL Editor** icon in the left sidebar.
2. Click **New query**.
3. Open `schema.sql` from this repo, copy all of it, paste it into the editor, click **Run** (Ctrl+Enter).
4. You should see "Success. No rows returned" (the insert is silent in this view). To verify, run:
   ```sql
   select * from _ping;
   ```
   You should see one row with `message = 'hello from supabase'`.

---

## 3. Get your database connection string

> **IMPORTANT — use the Session pooler, not the Direct connection.**
> Supabase's direct connection (`db.<project>.supabase.co`) is IPv6-only since 2024 and will fail from most home networks and from Render/Vercel free tiers (both are IPv4-only). The Session pooler works over IPv4 from anywhere.

1. In Supabase, go to **Settings** (gear icon) -> **Database**.
2. Scroll to **Connection string**. You'll see tabs labeled **Direct connection**, **Session pooler**, and **Transaction pooler**. Click **Session pooler**.
3. Copy the string. It looks like:
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   Note that the username is `postgres.<project-ref>` (with a dot), not just `postgres`. The host is the pooler, not `db.<project>.supabase.co`.
4. Replace `[YOUR-PASSWORD]` with the database password you set in step 1. If your password contains any of `@ : / ? # [ ] !`, URL-encode those characters (e.g. `@` -> `%40`).

**Why not Transaction pooler?** It's more efficient but disables prepared statements, which `psycopg` uses by default. Use Session pooler unless you specifically know you want transaction pooling.

---

## 4. Run locally

### Backend

In a terminal:

```bash
cd backend
copy .env.example .env       # Windows (cmd)
# cp .env.example .env       # macOS/Linux/PowerShell
```

Open `backend/.env` in a text editor and paste your connection string into `DATABASE_URL=...`. Save.

Then create a virtual environment and install dependencies:

```bash
python -m venv .venv
.venv\Scripts\activate       # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

Start the server:

```bash
uvicorn main:app --reload
```

You should see `Uvicorn running on http://127.0.0.1:8000`. Visit http://localhost:8000/health in your browser — you should see `{"status":"ok"}`. Visit http://localhost:8000/api/test-db — you should see `{"message":"hello from supabase","created_at":"..."}`.

If `/api/test-db` fails, check that `DATABASE_URL` in `.env` is correct and the Supabase project is running.

### Frontend

The simplest way: open `frontend/index.html` directly in your browser. This works for testing, but file-protocol pages have CORS quirks. The cleaner way is VS Code's **Live Server** extension — install it, right-click `index.html`, "Open with Live Server". It serves the page at http://localhost:5500.

Click **Test backend**. You should see `{"message":"Hello from food-budget backend"}`.
Click **Test database**. You should see `{"message":"hello from supabase","created_at":"..."}`.

If both work, Phase 0 local is done.

---

## 5. Deploy to the internet

### Backend on Render

1. In Render, click **New +** -> **Web Service**.
2. Connect your `food-budget` GitHub repo.
3. Configure:
   - **Name**: `food-budget-api`
   - **Region**: Frankfurt (closest to NL)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free
4. Under **Environment Variables**, add:
   - `DATABASE_URL` = your Supabase connection string (same one you put in `.env`)
   - `FRONTEND_ORIGIN` = leave blank for now; we'll set it after Vercel gives us a URL
5. Click **Create Web Service**. First deploy takes ~3-5 minutes.
6. Once it shows "Live", visit `https://food-budget-api.onrender.com/health`. You should see `{"status":"ok"}`. (First request may take 30-50 seconds — that's the cold start.)

### Frontend on Vercel

1. In Vercel, click **Add New** -> **Project**.
2. Import the `food-budget` repo.
3. Configure:
   - **Framework Preset**: Other
   - **Root Directory**: `frontend`
   - **Build Command**: leave empty
   - **Output Directory**: leave empty (defaults to root, which is correct for static files)
4. Click **Deploy**. Takes ~30 seconds.
5. Vercel gives you a URL like `https://food-budget-abc123.vercel.app`. Copy it.

### Wire them together

1. Open `frontend/config.js`. Change the `BACKEND_URL` line to your Render URL:
   ```js
   const BACKEND_URL = window.BACKEND_URL_OVERRIDE || "https://food-budget-api.onrender.com";
   ```
2. Commit and push:
   ```bash
   git add frontend/config.js
   git commit -m "Point frontend at production backend"
   git push
   ```
   Vercel auto-redeploys on push.
3. Back in Render, set the `FRONTEND_ORIGIN` environment variable to your Vercel URL (e.g. `https://food-budget-abc123.vercel.app`). Render will restart the backend automatically.

### Test from your iPhone

1. Open Safari on your iPhone, go to your Vercel URL.
2. Tap both buttons. Both should succeed (the first DB call may take 30-50 seconds because of Render's cold start).
3. To install as a PWA: tap the **Share** button -> **Add to Home Screen**. The icon appears on your home screen and opens full-screen.

If both buttons work from the phone, **Phase 0 is done**. We move on to Phase 1.

---

## Troubleshooting

- **Backend test fails locally with "DATABASE_URL is not configured"**: `.env` file is missing or `DATABASE_URL=` line is empty.
- **Backend test fails locally with a connection error**: connection string is wrong or your password has special characters that need URL-encoding.
- **Frontend buttons fail with "CORS error"**: backend's `allow_origins` list doesn't include the URL the frontend is being served from. For local dev, Live Server is on port 5500 (already allowed). For production, set `FRONTEND_ORIGIN` on Render.
- **Render shows "Build failed"**: check the build logs; usually a missing dependency in `requirements.txt`.
- **Slow first request after idle**: that's the Render free-tier cold start. Working as designed for now; we'll address it in Phase 1.
