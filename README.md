# food-budget

Personal web app for tracking grocery spending and nutrition. Designed to install on iPhone home screen as a PWA (Progressive Web App) and to extend later into broader personal-finance tracking.

## Stack

- **Backend**: FastAPI (Python 3.12+)
- **Frontend**: Plain HTML / CSS / JavaScript
- **Database**: PostgreSQL on Supabase
- **Hosting**: Render (backend), Vercel (frontend)

## Project layout

```
food-budget/
├── backend/          FastAPI server
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/         HTML/JS client
│   ├── index.html
│   ├── style.css
│   ├── config.js
│   └── app.js
├── docs/
│   └── setup.md      Step-by-step setup walkthrough
├── schema.sql        Database schema (apply in Supabase SQL editor)
├── .gitignore
└── README.md         this file
```

## Quick start (local)

Full walkthrough — including account signups for Supabase / Render / Vercel — is in `docs/setup.md`. Short version once accounts are created:

1. Apply `schema.sql` in your Supabase SQL editor.
2. Copy `backend/.env.example` to `backend/.env`. Fill in `DATABASE_URL` from Supabase.
3. Set up the backend:
   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate          # Windows
   # source .venv/bin/activate     # macOS/Linux
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```
4. Open `frontend/index.html` in your browser (or use VS Code's Live Server). Click both buttons.

## Phases

- **Phase 0** (current): scaffold; prove backend + frontend + database wiring.
- **Phase 1**: real product/purchase tables, add-edit-delete, dashboard with weekly/monthly spend.
- **Phase 2**: spend by category, charts over time, cost-per-kcal / cost-per-gram-protein metrics, PWA polish.
- **Phase 3+**: TBD based on usage.
