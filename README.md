# **Introduction to Poker Coach**

If you want to sharpen your Texas Hold'em skills, this is the application for it. The app helps players at different levels learn at their own pace and can support practice toward solid, balanced decision-making.

## What Is GTO?

Game Theory Optimal (GTO) is a strategy framework for poker and other games. A player using GTO ideas can blend strong, medium, and weak hands in ways that stay **hard to exploit** while still aiming to **maximize long-run results**.

[GTO Explained in under 10 minutes](https://www.youtube.com/watch?v=Vx0iJ7h_b8o) by Finding Equilibrium.

## Goal of This App

Instead of playing full hands from the start, **Poker Trainer** drops you into a **mid-hand scenario** (flop / turn / river). You decide the best action from the information on the table.

Each scenario has a **graded answer**. After you choose, the app scores your decision and can explain it with an **AI coach**. Over time, your accuracy reflects how well you’re reading spots.

---

## Repo layout

| Area | Location |
|------|----------|
| API + dev server | `Poker_Trainer/backend` (Express, `src/index.js`) |
| Static UI | `Poker_Trainer/Frontend` (served by the backend in dev) |
| Scenario generators (Python) | `Poker_Trainer/backend/src/scengen` |


---

## Prerequisites

- **Node.js** 18 or newer  
- **Python** 3 with `pip` (needed if you use **server-side scenario generation** that runs those scripts)

---

## Quick start — run the app locally

Run `npm` from **`Poker_Trainer/backend/src`** — the folder that contains `package.json`

```bash
cd Poker_Trainer/backend/src
npm install
pip install treys
pip install pandas 
npm run dev

```

The API and static frontend are served together (see `backend/src/index.js`). By default:

- App: **http://localhost:3000**
- Health check: **http://localhost:3000/api/health**

---

## Backend environment variables

Copy or create `Poker_Trainer/backend/.env` with values your project expects (Supabase URL/keys, `FRONTEND_ORIGIN`, OpenAI keys for AI routes, etc.). Without valid Supabase settings, login and DB-backed features won’t work.

---

## Python packages (scenario generation)

If your flow runs scripts under `backend/src/scengen` (e.g. `/api/game/generate-next-scenario`), install minimal deps:

```bash
pip install treys
pip install pandas 
```

Use the same Python interpreter your terminal uses (`python`, `py`, or a venv) so imports resolve when Node spawns Python.

---

## Scripts (`backend/package.json`)

| Command | Description |
|---------|--------------|
| `npm run dev` | Start API with **`node --watch`** (restart on file changes) |
| `npm start` | Start API once (`node src/index.js`) |

---