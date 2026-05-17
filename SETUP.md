# Airport Investment Radar — Setup Guide

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- API keys (see below)
- A PostgreSQL database (e.g. [Prisma Postgres](https://www.prisma.io/postgres), Supabase, Neon, or any hosted Postgres)

---

## Step 1 — Create the environment file

Create the file `server/.env` (copy from the example):

```bash
cp server/.env.example server/.env
```

Then open `server/.env` and fill in the values:

```env
# Anthropic — get your key at https://console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-...

# Claude model to use (leave as-is unless you want to change the model)
CLAUDE_MODEL=claude-haiku-4-5-20251001

# AeroDataBox via RapidAPI — get your key at https://rapidapi.com/aedbx-aedbx/api/aerodatabox
AERODATABOX_API_KEY=...

# Port the server listens on inside Docker (do not change)
PORT=3000

# The URL the browser uses to reach the client — keep as localhost:4200 for local Docker
ALLOWED_ORIGIN=http://localhost:4200

# PostgreSQL connection string — get this from your database provider
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
```

> **Never commit `server/.env` to git.** It is already listed in `.gitignore`.

---

## Step 2 — Run with Docker

From the **root folder** of the project:

```bash
docker compose up --build
```

This builds and starts both containers:

| Container | URL                   | Description              |
|-----------|-----------------------|--------------------------|
| Client    | http://localhost:4200 | Angular frontend (nginx) |
| Server    | http://localhost:3000 | NestJS API               |

The first build takes ~1–2 minutes. Subsequent runs are faster because Docker caches the layers.

---

## Step 3 — Verify it's working

Open your browser at **http://localhost:4200**.

To check the server directly:

```bash
curl http://localhost:3000/alive
```

Expected response: `{ "status": "ok" }`

---

## Stopping the app

```bash
docker compose down
```

To also remove the built images:

```bash
docker compose down --rmi all
```

---

## Rebuilding after code changes

If you change server or client code, rebuild the images:

```bash
docker compose up --build
```

---

## Troubleshooting

**Port 3000 or 4200 already in use:**
```bash
lsof -ti:3000 | xargs kill -9
lsof -ti:4200 | xargs kill -9
```

**Server crashes on startup — check logs:**
```bash
docker compose logs server
```

**Database connection error:**
Make sure your `DATABASE_URL` in `server/.env` is correct and the database is reachable from your machine. If using a cloud database, ensure SSL is enabled (`sslmode=require`).

**Environment variable not found:**
Make sure `server/.env` exists and all required keys are filled in. The server will throw on startup if `ANTHROPIC_API_KEY`, `AERODATABOX_API_KEY`, or `DATABASE_URL` are missing.
