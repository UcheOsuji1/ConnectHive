# ConnectHive

A community-building platform where people join small, curated groups — Hives — based on shared interests, goals, and availability. Think of it as Discord for real-life connections: purpose-driven, locally aware, and built for people who want more than a follower count.

## Stack

| Layer     | Technology                                                       |
|-----------|------------------------------------------------------------------|
| Frontend  | React 18 · Vite · React Router v6 · Socket.IO client            |
| Backend   | Node.js 20 · Express 4 · Socket.IO · JWT (httpOnly cookie)      |
| Database  | Neon (serverless PostgreSQL 16)                                  |
| Storage   | Cloudinary (signed uploads — images, video, files)               |
| AI        | Anthropic API — `claude-haiku-4-5` · 7-day DB cache             |

## Project layout

```
ConnectHive1/
├── client/                 # Vite + React frontend
│   └── src/
│       ├── components/     # Shared UI (HiveDashboardLayout, HiveSettings, …)
│       ├── context/        # AuthContext (user + loading state)
│       ├── lib/api.js      # Typed fetch wrapper around the Express API
│       ├── pages/          # Route-level page components
│       └── styles/         # Per-feature CSS modules
└── server/                 # Express backend
    └── src/
        ├── controllers/    # Route handlers
        ├── db/
        │   ├── index.js    # pg Pool + query() + getClient()
        │   ├── migrate.js  # Idempotent schema migration (run before first start)
        │   ├── schema.sql  # Current schema source of truth
        │   └── seed.js     # Dev seed — realistic LA/CSUN/NSBE demo data
        ├── lib/            # Shared helpers (hiveChannels, hiveMembership, …)
        ├── middleware/     # requireAuth, requireMembership
        ├── realtime/
        │   └── socket.js   # Socket.IO — presence, chat, reactions, status
        └── routes/         # Express routers
```

## Local setup

### Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) project (free tier is fine)
- A [Cloudinary](https://cloudinary.com) account (free tier)
- An [Anthropic API key](https://console.anthropic.com) (optional — enables AI match explanations)

### 1. Clone and install

```bash
git clone <repo-url>
cd ConnectHive1

# Install both sides
npm install --prefix client
npm install --prefix server
```

### 2. Configure environment variables

**`server/.env`** (copy from `server/.env.example`):

| Variable                | Required | Description                                                |
|-------------------------|----------|------------------------------------------------------------|
| `DATABASE_URL`          | Yes      | Neon connection string (include `?sslmode=require`)        |
| `JWT_SECRET`            | Yes      | Random 64-char string — `openssl rand -hex 32`             |
| `CLIENT_URL`            | Yes      | Frontend origin — `http://localhost:5173` locally          |
| `NODE_ENV`              | Yes      | `development` locally, `production` on Render/Fly/Heroku   |
| `CLOUDINARY_CLOUD_NAME` | Yes      | From your Cloudinary dashboard                             |
| `CLOUDINARY_API_KEY`    | Yes      | From your Cloudinary dashboard                             |
| `CLOUDINARY_API_SECRET` | Yes      | From your Cloudinary dashboard                             |
| `ANTHROPIC_API_KEY`     | No       | Enables AI compatibility explanations (graceful fallback)  |

**`client/.env`** (only needed if your API runs somewhere other than `localhost:5000`):

```
VITE_API_URL=http://localhost:5000
```

### 3. Run the database migration

```bash
cd server
npm run db:migrate
```

The migration is idempotent — safe to re-run. It creates all 25+ tables and backfills seed categories.

### 4. (Optional) Seed demo data

```bash
npm run db:seed            # adds realistic LA/CSUN/NSBE demo data
npm run db:seed -- --reset # wipe seeded rows first, then re-seed
```

All seeded users share the password `Connect2024!` and use the email domain `@seed.connecthive.local`. The `--reset` flag only deletes rows with that domain — real user data is never touched.

### 5. Start the servers

```bash
# Backend (from /server)
npm run dev     # nodemon, auto-restarts on change — port 5000

# Frontend (from /client)
npm run dev     # Vite HMR — port 5173
```

Open `http://localhost:5173`.

## Deployment

ConnectHive is tested on **Render** (backend) + **Vercel** (frontend).

### Before you deploy

1. **Run the migration first.** The app will crash on startup if tables are missing. Render's pre-deploy command: `node src/db/migrate.js` (run from `server/`).

2. **Set `NODE_ENV=production`.** This switches cookies to `sameSite: none; secure: true` — required for cross-origin cookie auth.

3. **Trust proxy.** `app.set('trust proxy', 1)` is already in `server/src/index.js` — required for `secure` cookies to work behind Render's reverse proxy.

4. **`CLIENT_URL` must not have a trailing slash.** `https://your-app.vercel.app` ✓ `https://your-app.vercel.app/` ✗

5. **WebSocket support.** Socket.IO requires HTTP upgrade support. Render's standard web service supports WebSockets. Vercel Serverless Functions do not (use Vercel Edge or deploy the backend elsewhere).

### Cross-origin cookie requirements

Because the frontend and backend are on different origins in production:
- Backend: `sameSite: 'none'`, `secure: true`, CORS `credentials: true`
- Frontend: every `fetch` call must include `credentials: 'include'`
- The `api.js` client wrapper already does this

## Known limitations

- **Presence state is in-memory.** The `presence` and `userStatus` Maps in `socket.js` live in the Node process. Multiple backend instances will have stale presence. Use Redis pub/sub to scale beyond one instance.
- **Rate limiting is in-memory.** Same issue — the `_rateMap` for message rate limiting is per-process.
- **Cloudinary unsigned uploads are disabled.** All chat attachment uploads use a signed flow (server generates a signature, browser uploads directly to Cloudinary) — this is intentional for security.
- **OAuth buttons are UI-only.** Google and Apple sign-in buttons are present in the UI but not wired up.
- **No horizontal scaling without Redis.** Single-instance deployment is production-ready; clustering requires extracting in-memory state to Redis.
