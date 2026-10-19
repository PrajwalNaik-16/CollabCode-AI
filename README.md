# CollabEditor

**A shared coding workspace for editing, discussing, and reviewing code together.**

CollabEditor is a web application for teams that want to work on code in the same room. It combines a Monaco-based editor, real-time document synchronization, room access controls, chat, and optional AI assistance.

> This project is in active development. Code execution is available for local development only; it is disabled in production until a secure isolated runner is configured.

## Features

- **Live collaboration** — edit shared files with Yjs synchronization and multi-user presence.
- **Room and file management** — create rooms, organize files, and download the current file.
- **Access control** — share invite links, request room access, and let owners approve or deny requests.
- **Team tools** — room chat, friend requests, and collaborator invitations.
- **AI code assistant** — ask for explanations, bug reviews, optimization ideas, or comments using a Groq API key.
- **Code editor** — Monaco Editor with language-aware syntax highlighting.
- **Responsive workspace** — use Files, Editor, and Chat panels on smaller screens.

## Technology

| Area | Tools |
| --- | --- |
| Frontend | React, TypeScript, Vite, Monaco Editor, Zustand |
| Collaboration | Yjs, y-websocket, y-webrtc, y-monaco |
| Backend | Node.js, Express, WebSocket, Prisma |
| Database | PostgreSQL (Supabase free tier for hosting; Docker Compose locally) |
| AI assistant | Groq API (optional) |
| Deployment | Docker, Docker Compose, Render Blueprint |

## Run locally

### Requirements

- Node.js 24 LTS and npm
- Python, a C/C++ compiler, or Java only if you want to run programs in that language locally
- Use a free Supabase project or install Docker Desktop to run PostgreSQL locally

### 1. Get the source and install dependencies

Clone this repository from its GitHub page, then open the project folder in VS Code:

```powershell
npm ci
```

### 2. Configure the backend

In PowerShell, from the project root:

```powershell
Copy-Item apps/backend/.env.example apps/backend/.env
```

Set `DATABASE_URL` and `DIRECT_URL` in `apps/backend/.env` to your Supabase PostgreSQL connection strings. `DATABASE_URL` is used by the app; Prisma migrations use `DIRECT_URL`. A Supabase Session Pooler URL can be used for both if the direct connection is unreachable. Set a private `JWT_SECRET` too. To enable the AI assistant, add your `GROQ_API_KEY`. Do not commit `.env` files or API keys.

### 3. Create the database schema and start the app

```powershell
npm run db:deploy --workspace=apps/backend
npm run dev
```

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). The backend listens on `http://localhost:3001`. For a local database instead of Supabase, copy the root `.env.example` to `.env`, set `POSTGRES_PASSWORD` and `JWT_SECRET`, then run `docker compose up --build`; this starts PostgreSQL and the app together.

If port 3001 is already in use, stop the other backend process before starting another one.

## Language support

The **Run** button executes JavaScript and Python in a Web Worker in the user's browser, including on the hosted site. Python uses the Pyodide WebAssembly runtime from jsDelivr; the first Python run needs an internet connection to download the runtime and any supported imported packages. Browser runs have a 10-second execution limit and a 50 KB output limit. This keeps submitted code off the app server, but it is not a general-purpose sandbox for protecting a visitor from code they choose to run; browser code can make network requests.

C, C++, and Java run only during local development through the backend and require their compiler or runtime on the backend machine. They are unavailable on the hosted site. TypeScript and TSX execution are not currently supported. The production backend intentionally refuses to execute submitted code; do not remove that guard to run code on the server.

## Deploy to Render

The repository includes `render.yaml` and `apps/backend/Dockerfile` for a free, single-service Render deployment with a free Supabase PostgreSQL database.

1. Push the repository to GitHub.
2. In Supabase, create a project on the Free plan. Choose a database password and keep it private. Choose a region near your Render service.
3. When the project is ready, open its **Connect** dialog and select **Session pooler**. Copy the full connection string (port `5432`). Replace only its password placeholder with your database password. This is the app's `DATABASE_URL`.
4. Copy the direct connection string from **Connect** for `DIRECT_URL`, which Prisma uses to apply migrations. Supabase direct connections are IPv6; if Render cannot reach it, use the Session pooler string for `DIRECT_URL` too. If the password contains reserved URL characters such as `#`, `?`, `&`, or spaces, percent-encode them in both URLs.
5. In Render, choose **New > Blueprint** and connect the GitHub repository. It reads `render.yaml`, creates the web service on the Free plan, and asks for `DATABASE_URL`, `DIRECT_URL`, and `GROQ_API_KEY`. Paste the two Supabase strings. `GROQ_API_KEY` can be left blank if you do not want AI; Render generates `JWT_SECRET` automatically.
6. Render runs the PostgreSQL migrations at startup. After deployment, open `https://<your-service>.onrender.com/health` and confirm it returns `{"status":"ok"}`.

This is a no-cost educational deployment. Render's free service sleeps when idle, and Supabase may pause a free database after a week without enough activity. Free hosting has limited capacity and no production uptime guarantee. JavaScript and Python run in each visitor's browser; C, C++, and Java are not available online without a separate isolated runner. AI assistance requires a Groq API key and depends on that provider's current free usage limits.

#### Move existing local SQLite data

The old SQLite file is left untouched, but the PostgreSQL version does not use it. To move local users, rooms, permissions, requests, friendships, and saved file contents, export before deploying:

```powershell
python apps/backend/prisma/export-sqlite.py apps/backend/dev.db collab-export.json
```

After Supabase migrations have run, configure `apps/backend/.env` with the Supabase connection strings and import into the still-empty database:

```powershell
npm run db:import-sqlite --workspace=apps/backend -- ../../collab-export.json
```

The export contains account email addresses and password hashes. It is ignored by Git; keep it private and delete it after confirming the import.

## Docker on your computer

Docker Desktop is not required for a Render Blueprint deployment. To build and run the app and PostgreSQL locally in Docker, install Docker Desktop, create a root `.env` from `.env.example`, set strong `JWT_SECRET` and `POSTGRES_PASSWORD` values, then run:

```powershell
docker compose up --build
```

Open `http://localhost:3001`. PostgreSQL data is stored in the Compose volume. Production code execution remains disabled.

## Project layout

```text
apps/
  backend/       Express API, WebSocket collaboration server, Prisma schema
  frontend/      React application, editor, dashboard, and room UI
.github/
  workflows/     Continuous integration checks
docker-compose.yml
render.yaml
```

## Useful commands

```powershell
npm run dev
npm run build --workspace=apps/backend
npm run build --workspace=apps/frontend
npm test --workspace=apps/backend
```

Backend tests require an isolated PostgreSQL database named `collab_editor_test` and `NODE_ENV=test`; the test suite refuses to run against another database. GitHub Actions provisions this database automatically.

## Contributing

Bug reports and improvements are welcome. Open an issue with steps to reproduce a problem, or submit a pull request with a focused change and a clear description.
