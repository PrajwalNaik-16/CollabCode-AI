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
| Local database | SQLite |
| AI assistant | Groq API (optional) |
| Deployment | Docker, Docker Compose, Render Blueprint |

## Run locally

### Requirements

- Node.js 20 or later and npm
- Python, a C/C++ compiler, or Java only if you want to run programs in that language locally
- Docker Desktop is optional for local development; it is only needed to run the Docker setup on your computer

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

Set a private `JWT_SECRET` in `apps/backend/.env`. To enable the AI assistant locally, add your `GROQ_API_KEY` there. Do not commit `.env` files or API keys.

### 3. Create the local database and start the app

```powershell
npm run db:deploy --workspace=apps/backend
npm run dev
```

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). The backend listens on `http://localhost:3001`.

If port 3001 is already in use, stop the other backend process before starting another one.

## Language support

The **Run** button can execute JavaScript, Python, C, C++, and Java during local development, provided the relevant runtime or compiler is installed where the backend runs. Installing a language toolchain on a visitor’s computer does not affect a hosted app: execution happens on the backend host.

Production execution is currently disabled. Do not enable it by simply removing the production guard; public code execution needs a dedicated isolated runner with strict time, memory, process, and output limits.

## Deploy to Render

The repository includes `render.yaml` and `apps/backend/Dockerfile` for a single-service Render deployment.

1. Push the repository to GitHub.
2. In Render, create a **Blueprint** and connect the GitHub repository.
3. Review the service settings from `render.yaml`. It uses a persistent disk for SQLite data; Render does not provide persistent disks on its free web-service plan, so this configuration requires a paid web service if data must survive restarts and deploys.
4. Add `GROQ_API_KEY` in Render if you want AI features. Render generates `JWT_SECRET` from the Blueprint configuration.
5. After deployment, open `https://<your-service>.onrender.com/health` and confirm it returns `{"status":"ok"}`.

The current SQLite setup is intended for a small, single-instance deployment. Before scaling to multiple instances, move to a shared production database such as PostgreSQL and review the collaboration persistence and execution architecture.

## Docker on your computer

Docker Desktop is not required for a Render Blueprint deployment. To build and run the app locally in Docker, install Docker Desktop, create a root `.env` from `.env.example`, set a strong `JWT_SECRET`, then run:

```powershell
docker compose up --build
```

Open `http://localhost:3001`. The SQLite database is stored in the Compose volume. Production code execution remains disabled.

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

Backend tests require an isolated test database. Set `DATABASE_URL=file:./test.db` and `JWT_SECRET` before running them; the test suite refuses to run against a non-test database.

## Contributing

Bug reports and improvements are welcome. Open an issue with steps to reproduce a problem, or submit a pull request with a focused change and a clear description.
