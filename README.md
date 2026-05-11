# Financial Copilot — AI Credit Card Intelligence Platform

An AI-powered financial intelligence platform that monitors Yahoo Mail for credit card transaction emails, extracts transaction details using OpenAI agents, categorizes spending intelligently, and delivers a professional real-time analytics dashboard — all in a single monorepo.

---

## Architecture Overview

```
Yahoo Mail (IMAP — imap.mail.yahoo.com:993 TLS)
      ↓
IMAP Sync Service  (NestJS @Cron → dispatches per-user BullMQ jobs)
      ↓
BullMQ + Redis  (7-queue pipeline with explicit job chaining)
      ↓
LangGraph AI Agent Pipeline  (OpenAI GPT-4o / GPT-4o-mini)
      ↓
MongoDB  (all queries scoped by userId)
      ↓
NestJS REST + Socket.IO API
      ↓
Angular 19 Dashboard  (Tailwind CSS, dark professional theme)
```

---

## Monorepo Structure

```
financial-copilot/
├── frontend/                    # Angular 19 SPA
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/            # singletons: auth, http, error handling
│   │   │   ├── shared/          # reusable components, pipes, directives
│   │   │   ├── layout/          # shell, sidebar, navbar
│   │   │   ├── features/        # lazy-loaded route modules
│   │   │   │   ├── onboarding/  # IMAP setup wizard (first login)
│   │   │   │   ├── dashboard/
│   │   │   │   ├── transactions/
│   │   │   │   ├── insights/
│   │   │   │   ├── cards/
│   │   │   │   ├── analytics/
│   │   │   │   ├── notifications/
│   │   │   │   └── settings/
│   │   │   ├── state/           # NgRx Signal Store slices
│   │   │   ├── services/        # API + WebSocket clients
│   │   │   ├── guards/
│   │   │   ├── interceptors/    # JWT attach, 401 refresh, global error
│   │   │   └── models/          # TypeScript interfaces
│   │   └── environments/
│   ├── tailwind.config.js
│   └── package.json
│
├── backend/                     # NestJS API + AI workers
│   ├── src/
│   │   ├── modules/             # domain modules (auth, transactions, cards…)
│   │   ├── agents/              # LangGraph agent nodes
│   │   ├── queues/              # BullMQ queue definitions + JobPayload types
│   │   ├── workers/             # BullMQ processors (one file per queue)
│   │   ├── common/              # guards, filters, decorators, pipes
│   │   ├── config/              # env validation (Joi schema)
│   │   └── database/            # Mongoose schemas + ScopedRepository base
│   └── package.json
│
├── docker-compose.yml           # All local services (see table below)
├── .env.example                 # All required env vars with placeholders
├── .gitignore
├── .github/
│   └── workflows/
├── PROGRESS.md                  # Phase-by-phase development tracker
├── development_plan.md
├── product_design.md
└── README.md
```

---

## Tech Stack

| Layer | Technology | License |
|---|---|---|
| Frontend | Angular 19+ | MIT |
| UI Framework | Tailwind CSS | MIT |
| State Management | NgRx Signal Store | MIT |
| Charts | Apache ECharts (ngx-echarts) | Apache 2.0 |
| Backend | NestJS | MIT |
| Database | MongoDB (self-hosted or Atlas free tier) | SSPL / free tier |
| Queue | BullMQ + Redis | MIT |
| AI Workflow | LangGraph.js | MIT |
| AI Provider | OpenAI API (GPT-4o / GPT-4o-mini) | — |
| Realtime | Socket.IO | MIT |
| Email | node-imap + mailparser | MIT |
| Vector DB (Phase 5) | Pinecone (managed cloud) | — |
| Deployment | Docker + Docker Compose | Apache 2.0 |
| CI/CD | GitHub Actions | — |
| Logging | Winston | MIT |
| Monitoring | Prometheus + Grafana (self-hosted) | Apache 2.0 |
| Error Tracking | Sentry (self-hosted or free cloud tier) | — |

> All infrastructure dependencies are open source. The only external paid dependency is the OpenAI API.

---

## Product Workflow

```
1.  @Cron fires          →  one email-fetch job enqueued per user in BullMQ
2.  IMAP connect         →  imap.mail.yahoo.com:993 TLS (per-user credentials)
3.  Fetch unseen emails  →  dedup by Message-ID (upsert on email_raw)
4.  Classification       →  transaction / OTP / statement / reward / spam
5.  Non-transaction      →  marked in email_raw, pipeline exits — no Extraction
6.  Extraction           →  GPT-4o structured JSON (amount, merchant, card, etc.)
7.  Validation           →  schema + confidence ≥ 0.7; else → needs_review path
8.  Categorization       →  GPT-4o-mini (category + subcategory)
9.  Fraud check          →  passthrough in Phase 2, real GPT-4o agent in Phase 4
10. MongoDB persist      →  transaction inserted, card.currentBalance updated via $inc
11. Socket.IO broadcast  →  transaction.new pushed to user's room
12. Insights Agent       →  nightly cron, upsert ai_insights for current period
```

---

## AI Agent Pipeline

```
New Email (BullMQ job with JobPayload)
    ↓
[Classification Agent]   — GPT-4o-mini
    ├── non-transaction → mark email_raw.emailType, set processed=true, EXIT
    └── transaction ──────────────────────────────────────┐
                                                          ↓
                                           [Extraction Agent]   — GPT-4o
                                               structured JSON output
                                                          ↓
                                           [Validation Layer]   — deterministic
                                               ├── confidence < 0.7
                                               │     → email_raw.status = 'low_confidence'
                                               │     → enqueue notification job
                                               │     → EXIT (no transaction created)
                                               └── confidence ≥ 0.7
                                                         ↓
                                           [Categorization Agent] — GPT-4o-mini
                                                         ↓
                                           [Fraud Queue Worker]
                                               Phase 2: passthrough (fraudScore=0)
                                               Phase 4: GPT-4o fraud agent
                                                         ↓
                                           [MongoDB Persist]
                                               transaction.insert()
                                               card.currentBalance $inc
                                                         ↓
                                           [Notification Worker]
                                               Socket.IO → transaction.new
                                               if fraudScore > 0.7 → fraud_alert

[Insights Agent] — separate cron, GPT-4o
    Trigger: nightly at 02:00 UTC
    Guard: upsert on { userId, period } — idempotent
```

---

## Queue Architecture

Seven queues; each queue worker explicitly enqueues the next queue on success.
All workers share a typed `JobPayload` interface (accumulates state across queues).

```
email-fetch-queue       (IMAP ingest, one job per user per cron tick)
      ↓
classification-queue    (GPT-4o-mini; exits early for non-transactions)
      ↓
extraction-queue        (GPT-4o; rate-limited: 10 jobs/min)
      ↓
categorization-queue    (GPT-4o-mini)
      ↓
fraud-queue             (passthrough Phase 2 → real agent Phase 4)
      ↓
notification-queue      (Socket.IO push + in-app notification write)
      ↓
insights-queue          (cron-triggered, separate from per-email pipeline)
```

Each queue has: `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`, dead-letter queue on final failure.

---

## Database Collections

| Collection | Purpose |
|---|---|
| `users` | Auth, profile, encrypted IMAP credentials, sync state |
| `cards` | Card metadata + denormalized `currentBalance` (updated via `$inc`) |
| `transactions` | Extracted, categorized, fraud-scored transactions |
| `ai_insights` | Nightly AI summaries; unique index on `{ userId, period }` |
| `email_raw` | Raw email metadata; unique index on `{ userId, messageId }` |
| `notifications` | In-app alert log |
| `audit_log` | Every auth event and data mutation (userId, IP, action, result) |
| `conversations` | Phase 5 chat sessions |

All repositories extend `ScopedRepository<T>` which enforces `userId` on every query — it is structurally impossible to query without a user scope.

---

## Local Setup

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Git

### Quick Start (Docker)

```bash
git clone https://github.com/<your-org>/financial-copilot.git
cd financial-copilot
cp .env.example .env        # fill in secrets (see table below)
docker-compose up --build
```

| Service | URL | Notes |
|---|---|---|
| Angular Frontend | http://localhost:4200 | |
| NestJS Backend | http://localhost:3000 | |
| MongoDB | localhost:27017 | data persisted in named volume |
| Redis | localhost:6379 | data persisted in named volume |
| Prometheus | http://localhost:9090 | scrapes /metrics |
| Grafana | http://localhost:3001 | pre-configured dashboards |

Docker Compose services: `frontend`, `backend`, `mongo`, `redis`, `prometheus`, `grafana`.
Phase 5 uses Pinecone (managed cloud) — no additional Docker service needed.

### Manual Setup

**Backend**

```bash
cd backend
npm install
cp ../.env.example .env
npm run start:dev
```

**Frontend**

```bash
cd frontend
npm install
npm run start
```

### Environment Variables

```env
# Runtime
NODE_ENV=development

# Server
PORT=3000
FRONTEND_URL=http://localhost:4200    # used for CORS whitelist

# Database
MONGO_URI=mongodb://localhost:27017/financial-copilot

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Auth
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Passwords
BCRYPT_SALT_ROUNDS=12

# Encryption (IMAP credentials at rest)
AES_SECRET_KEY=                       # 32-byte hex string (256-bit)

# OpenAI
OPENAI_API_KEY=
OPENAI_MAX_TOKENS_EXTRACTION=1000
OPENAI_MAX_TOKENS_INSIGHTS=2000
OPENAI_TEMPERATURE=0.2

# BullMQ
BULLMQ_CONCURRENCY=2                  # workers per queue
IMAP_FETCH_INTERVAL=*/5 * * * *       # cron expression

# Monitoring / Error tracking
SENTRY_DSN=                           # optional

# Phase 5 only
PINECONE_API_KEY=                     # Phase 5 only
PINECONE_INDEX=financial-copilot      # Phase 5 only
```

> `YAHOO_EMAIL` and `YAHOO_APP_PASSWORD` are **not** global env vars — they are per-user data stored encrypted in MongoDB and entered via the onboarding wizard.

---

## Security

| Concern | Implementation |
|---|---|
| User passwords | bcrypt (cost factor 12) — `passwordHash` stored, raw password never persisted |
| IMAP credentials | AES-256-GCM encrypted at rest from day 1 (Phase 1 prerequisite) |
| Refresh tokens | SHA-256 hash stored in Redis with 7-day TTL; deleted on rotation and logout |
| JWT access tokens | 15-minute expiry; HttpOnly + Secure + SameSite=Strict cookie |
| Socket.IO auth | JWT passed in `handshake.auth.token`; `WsGuard` validates and joins user room |
| HTTP security | Helmet headers, CORS from `FRONTEND_URL` env var, HTTPS-only in prod |
| Rate limiting | Throttler per IP (unauthenticated) + per userId (authenticated) |
| Input validation | `class-validator` DTOs on all endpoints |
| AI prompt safety | Prompt injection filter layer before every OpenAI call |
| Data isolation | `ScopedRepository<T>` enforces `userId` filter on every DB query |
| Audit logging | `audit_log` collection: every auth event + data mutation with userId + IP |

---

## Development Phases

See [PROGRESS.md](./PROGRESS.md) for live checkbox tracking.

| Phase | Scope | Status |
|---|---|---|
| 1 — MVP | Auth, encryption utility, IMAP sync, dedup, regex extraction scaffold, basic dashboard | Not started |
| 2 — AI Integration | LangGraph 7-queue pipeline, GPT agents, non-transaction routing, DLQ | Not started |
| 3 — Realtime + Security | Socket.IO with auth, Redis refresh revocation, audit log, monitoring | Not started |
| 4 — Advanced Intelligence | Real fraud agent, forecasting, subscription tracking | Not started |
| 5 — Conversational AI | RAG, Pinecone, tool-calling agent, SSE streaming | Not started |

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| IMAP credentials stored before encryption ready | AES-256-GCM utility is a Phase 1 prerequisite — no credential write without it |
| Duplicate transactions from re-synced emails | Unique index on `{ userId, messageId }` in `email_raw`; BullMQ job ID = messageId |
| node-imap connection drops silently | Error/end event handlers with exponential backoff; sync status exposed via Redis |
| Same email processed twice on worker retry | `findOneAndUpdate + upsert` on `email_raw.messageId` — write is idempotent |
| Non-transaction emails entering Extraction Agent | Classification graph exits early for non-transactions before Extraction queue |
| Low-confidence extractions silently lost | `needs_review` path: email_raw flagged, user notified, never silently dropped |
| OpenAI 429 rate limits on large backlogs | BullMQ rate limiter (10 jobs/min on extraction queue) + exponential backoff retry |
| Stolen refresh token reuse | Token hash stored in Redis; rotation deletes old hash atomically |
| Cross-user data leakage | `ScopedRepository<T>` makes userId-less queries structurally impossible |
| In-flight jobs lost on container restart | `OnApplicationShutdown` drains workers before NestJS exits; Docker `stop_grace_period: 30s` |
| Duplicate AI insights on cron double-fire | Unique index on `{ userId, period }` + upsert in Insights Agent |
| CORS misconfiguration in production | CORS origin = `FRONTEND_URL` env var; never hardcoded |
| Flash of wrong theme on page load | Inline `<script>` in index.html reads localStorage before Angular bootstraps |

---

## Monitoring (Self-Hosted)

- **Prometheus** — scrapes `/metrics` from NestJS; tracks queue depth, extraction success rate, AI token usage per model, agent latency
- **Grafana** — pre-configured dashboards for queue health, API latency, OpenAI cost
- **Winston** — structured JSON logs (stdout in Docker, aggregated by Compose log driver)
- **Sentry** — error tracking (self-hosted or free cloud tier via `SENTRY_DSN`)

---

## Deployment

| Component | Recommendation |
|---|---|
| Frontend | GitHub Pages |
| Backend | Render |
| MongoDB | MongoDB Atlas (free M0) or self-hosted |
| Redis | Upstash (free tier) or self-hosted |
| Pinecone (Phase 5) | Pinecone free tier (serverless index) |

---

## Branching Strategy

```
main          ← stable production
develop       ← integration branch
feature/*     ← new features
hotfix/*      ← urgent production fixes
release/*     ← pre-release staging
```

---

## License

Internal Portfolio / Educational Use
