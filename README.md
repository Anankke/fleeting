# PELD Online

Fleet combat analytics for EVE Online — self-hosted, real-time, with full history.

## Overview

PELD Online is a web-based fleet analytics platform inspired by [PELD](https://github.com/ArtificialQualia/PELD).  
Pilots read their local game logs in-browser (no install required), upload DPS snapshots to a fleet server, and fleet commanders get a live aggregated view across all fleet members.

### Features

- **No client install** — uses the [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) to read EVE combat logs directly in the browser
- **Real-time fleet view** — per-pilot DPS streamed via SSE (Nchan)
- **War Commander mode** — aggregate view across multiple simultaneous fleets
- **Full history** — every combat event stored, 5-second DPS snapshots, 30-second pilot timeline entries
- **Participation analysis** — distinguishes active pilots, partial participants, and non-participants (logistics, support, non-combat ships)
- **Percentile charts** — p50/p90/p95/p99 per pilot over the course of a fleet
- **Configurable retention** — rolling retention per data tier, default 30/90/365 days

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 + Rsbuild (multi-page), PrimeVue v4, uPlot |
| Backend | Fastify v4, Node 22 |
| Database | PostgreSQL 16 (partitioned `combat_events`) |
| Cache | Memcached 1.6 |
| SSE / Push | Nginx + Nchan module |
| Auth | In-house OIDC (EVE SSO proxy) |
| Infrastructure | Docker Compose |

---

## Getting Started

### Prerequisites

- Docker + Docker Compose v2
- An EVE SSO application registered at <https://developers.eveonline.com/>
- An OIDC provider (or use EVE SSO directly — configure `OIDC_*` env vars)

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in all required values
```

Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | 32+ character random string |
| `OIDC_ISSUER` | OIDC provider base URL |
| `OIDC_CLIENT_ID` | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | OAuth2 client secret |
| `OIDC_REDIRECT_URI` | Must match `https://yourdomain/auth/callback` |
| `MEMCACHED_SERVERS` | e.g. `cache:11211` |
| `NCHAN_PUB_URL` | Internal Nginx publisher URL (default `http://nchan/pub`) |

### 2. Run the database migrations

```bash
docker compose up db -d
docker compose exec db psql -U postgres -d peld < server/db/migrations/001_users.sql
# ... repeat for 002–010, or use a migration runner
```

### 3. Start everything

```bash
docker compose up --build
```

Services:
- `http://localhost` — application (Nginx + Nchan)
- `http://localhost:3000` — Fastify API (dev only, not exposed in prod)

### 4. Build the frontend (development)

```bash
cd client
npm install
node scripts/fetchSDE.mjs   # pre-fetch ship type data from ESI
npm run dev                  # Rsbuild dev server on :8080 with proxy to :3000
```

### 5. Build the frontend (production)

```bash
cd client
npm run build               # Output in client/dist/
```

The `docker-compose.yml` bind-mounts `client/dist` into the Nginx container.

---

## Architecture

```
Browser
  │
  ├─ File System Access API ──► Log Reader (useLogReader.ts)
  │                                   │
  │                             DPS Engine (useDpsEngine.ts)
  │                                   │
  │                    POST /api/pilot/data every 2s
  │                                   │
  ▼                               Fastify (server/)
Nginx ◄── SSE /sub/fleet/:id ─── Nchan
              │
        Memcached (pilot snapshots, fleet aggregates)
              │
        PostgreSQL
          ├─ combat_events (partitioned, per-fleet)
          ├─ pilot_snapshots (5s buckets, 30-day retention)
          └─ pilot_timeline  (30s buckets, 90-day retention)
```

### Write path

1. **Raw events** — every log line parsed client-side → batch inserted into `combat_events_{fleetId}`
2. **5-second snapshot** — throttled by Memcached key; inserts p50/p90/p95/p99/avg into `pilot_snapshots`
3. **30-second timeline** — rolling average buffer flushed to `pilot_timeline` (used for history scrubber)

### Participation classification

A pilot is classified as:

- **participant** — ≥1 combat event or ≥1 snapshot on a combat ship
- **partial** — some combat activity but also significant time in non-combat ships / systems
- **non-participant** — exclusively in non-combat ship groups (logistics, haulers, support, etc.)

Ship group IDs mirror the `NON_COMBAT_GROUP_IDS` constant in `client/src/lib/nonCombatGroups.ts`.

---

## Pages

| Path | Description |
|------|-------------|
| `/login.html` | Login via EVE SSO |
| `/pilot.html` | Pilot DPS dashboard (reads local logs) |
| `/commander.html` | Fleet / War Commander live view |
| `/history.html` | Past fleet browser + replay |

---

## Roles

Roles are issued by the OIDC provider in the `roles` claim of the id_token.

| Role | Access |
|------|--------|
| `pilot` | Pilot dashboard only |
| `fc` | Pilot dashboard + fleet management + history |
| `war_commander` | All of the above + war aggregate view + multi-fleet history |

---

## Retention

Default retention periods (configurable via `retention_config` table):

| Tier | Default |
|------|---------|
| Raw combat events | 30 days |
| 5s pilot snapshots | 90 days |
| 30s pilot timeline | 365 days (forever by default) |

The retention job runs daily (first run 60 seconds after startup).

---

## Development

```
peld-online/
├── client/               # Rsbuild / Vue 3 frontend
│   ├── src/
│   │   ├── api/          # HTTP client
│   │   ├── composables/  # useLogReader, useDpsEngine, useFleetSSE, useParticipation
│   │   ├── lib/          # Log parsing, hit quality, ship types
│   │   ├── components/   # Reusable Vue components
│   │   └── pages/        # Multi-page entries (pilot, commander, history, login)
│   └── scripts/          # fetchSDE.mjs
├── server/               # Fastify backend
│   ├── db/
│   │   ├── migrations/   # SQL migration files (001–010)
│   │   └── queries/      # SQL query modules
│   ├── lib/              # auth, esi, aggregate, historyWriter, memberTracker, …
│   ├── routes/           # auth, pilot, fleet, war, history
│   └── store/            # memcached, snapshotStore
├── nginx/                # Dockerfile + nginx.conf with Nchan
└── docker-compose.yml
```

---

## License

MIT
