# Poker Trainer — Frontend / Backend Structure

Node backend (REST API) + JS frontend, with Supabase as the database. The backend serves the frontend and exposes REST endpoints; the frontend talks to the API only (no direct Supabase from the browser in this setup; optional later).

## Project structure

```
Poker_Trainer/
├── backend/                 # Node.js REST API
│  ├── src/
│   │   ├── config/
│   │   │   └── supabase.js  # Supabase client (server-side)
│   │   ├── routes/
│   │   │   ├── auth.js      # POST /api/auth/login, logout
│   │   │   ├── users.js     # GET/PATCH /api/users/me
│   │   │   └── leaderboards.js  # GET /api/leaderboards
│   │   └── index.js         # Express app, CORS, static frontend
│   ├── .env.example
│   ├── .gitignore
│   └── package.json
│
└── frontend/                # Static JS/HTML/CSS (may appear as Frontend on Windows)
    ├── css/
    │   └── style.css
    ├── js/
    │   └── app.js           # Calls /api/* via fetch
    ├── index.html
    ├── menu.html
    ├── play.html
    ├── profile.html
    └── leaderboards.html
``` 

## Setup

### 1. Backend

```bash
cd Poker_Trainer/backend
cp .env.example .env
# Edit .env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from your Supabase project
npm install
npm run dev
```

API runs at **http://localhost:3001**. The same server serves the frontend and the REST API.

### 2. Supabase

- Create a project at [supabase.com](https://supabase.com).
- In **Settings → API**: copy **Project URL** → `SUPABASE_URL`, **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`.
- Add tables as needed (e.g. `profiles`, `leaderboard`) and wire them in `backend/src/routes/*.js`.

### 3. Frontend (development)

- **Option A:** Run only the backend (`npm run dev` in `backend/`). Open **http://localhost:3000** — the backend serves the frontend.
- **Option B:** Serve `frontend/` with any static server (e.g. `npx serve frontend`) and set `FRONTEND_ORIGIN` in backend `.env` so CORS allows that origin.

## REST API (connector)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/login` | Login (body: `{ "username", "password" }`) |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/users/me` | Current user profile |
| PATCH | `/api/users/me` | Update profile (e.g. `{ "xp" }`) |
| GET | `/api/leaderboards` | Top players (from Supabase when configured) |

## Old .NET frontend

The previous .NET (C#) app and its `Frontend/wwwroot/` duplicates have been removed. The repo now uses only `backend/` and `frontend/` as above.
