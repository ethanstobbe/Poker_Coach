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

## Troubleshooting
If you receive an error that says "...running scripts is disabled on this system." then run this command before trying the above instructions again:

```bash
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
```

This will bypass the execution policy on your system for your current session in PowerShell and cmd. 
If you exit out of your current session, you will need to run this again. 
You can replace "Process" with "CurrentUser"
This will make it so you don't have to run the above command everytime,
but will make a permanent change to your execution policy to allow all scripts.
To undo this, Replace "RemoteSigned" with "Restricted" to restore script
settings to the Windows default.

Allow all scripts:
```bash
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser  // huh
```

Disable all scripts (Windows default):
```bash
Set-ExecutionPolicy -ExecutionPolicy Restricted -Scope CurrentUser
```

If you get the error

`pip : The term 'pip' is not recognized as the name of a cmdlet, function, script file, or operable program.` OR `'pip' is not recognized as an internal or external command,
operable program or batch file.`

Ensure that Python is [installed](https://www.python.org/downloads/) on your system.

If you have determined that Python is already installed on your system,
it may not be configured on your PATH in your system's environment variables.
To fix this:

1. Press Win + S and search "Edit the system environment variables" and click it.
2. Click "Environment Variables..."
3. Under "User variables" or "System variables", find and select Path, then click Edit
4. Click New and paste the location of your scripts folder(`\Python312\Scripts`).
5. Click OK on all dialogs
6. Try the pip commands again.

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
