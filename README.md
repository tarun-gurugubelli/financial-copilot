# Financial Copilot

An AI-powered personal finance platform that connects to your email inbox, automatically extracts credit card transactions using GPT-4o, categorizes your spending, and delivers a real-time analytics dashboard — all self-hosted, all open source infrastructure.

---

## What it does

1. **Connects to your email** (Yahoo, Gmail, or Outlook) via IMAP using an App Password — no OAuth, no third-party data sharing
2. **Reads bank alert emails** and runs them through a 5-stage AI pipeline to extract transaction details (amount, merchant, card, date)
3. **Categorizes every transaction** automatically (Food, Travel, Shopping, etc.)
4. **Pushes live updates** to your dashboard via Socket.IO — new transactions appear instantly without a page refresh
5. **Generates AI insights** nightly — spending summaries, trends, and recommendations written by GPT-4o

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 21, Tailwind CSS, NgRx Signal Store |
| Backend | NestJS 11, TypeScript |
| Database | MongoDB 7 (Mongoose) |
| Queue | BullMQ + Redis 7 |
| AI | OpenAI GPT-4o + GPT-4o-mini |
| Realtime | Socket.IO |
| Email | node-imap + mailparser |
| Logging | Winston (colored dev / JSON prod) |
| Containers | Docker + Docker Compose |

> The only paid external dependency is the **OpenAI API**. Everything else is open source and self-hosted.

---

## Architecture

```
Email Inbox (Yahoo / Gmail / Outlook — IMAP TLS)
        │
        ▼
  IMAP Sync Service          @Cron every 5 min, one BullMQ job per user
        │
        ▼
  AI Pipeline (BullMQ + Redis)

  ┌──────────────────────────────────────────────────────────────┐
  │  classification  →  extraction  →  categorization            │
  │  (GPT-4o-mini)      (GPT-4o)       (GPT-4o-mini)            │
  │       │                                    │                 │
  │  non-transaction                      fraud check            │
  │  exits here                          (passthrough)           │
  │                                           │                  │
  │                                   notification worker        │
  └──────────────────────────────────────────────────────────────┘
        │
        ▼
  MongoDB  ←  all queries scoped by userId
        │
        ▼
  NestJS REST API + Socket.IO Gateway
        │
        ▼
  Angular 21 Dashboard  (live updates via WebSocket)
```

---

## Project Structure

```
financial-copilot/
├── frontend/                        # Angular 21 SPA
│   ├── src/app/
│   │   ├── features/
│   │   │   ├── dashboard/
│   │   │   ├── transactions/        # date filters, search, pagination
│   │   │   ├── cards/               # card list with total spent
│   │   │   ├── insights/            # nightly AI summaries
│   │   │   ├── analytics/
│   │   │   ├── notifications/       # full notification timeline
│   │   │   ├── settings/            # IMAP accounts, reprocess pipeline
│   │   │   └── onboarding/          # first-login IMAP setup wizard
│   │   ├── layout/shell/            # sidebar, navbar, toast overlay, reconnect banner
│   │   ├── services/
│   │   │   ├── api.service.ts       # all REST calls
│   │   │   ├── socket.service.ts    # Socket.IO client
│   │   │   └── toast.service.ts     # in-app toast notifications
│   │   ├── state/auth.store.ts      # NgRx Signal Store
│   │   └── models/                  # TypeScript interfaces
│   └── nginx.conf                   # serves SPA + proxies /api/ and /socket.io/
│
├── backend/                         # NestJS API + AI workers
│   ├── src/
│   │   ├── modules/                 # auth, users, cards, transactions, imap, notifications, insights
│   │   ├── workers/                 # one file per BullMQ queue
│   │   │   ├── classification.worker.ts
│   │   │   ├── extraction.worker.ts
│   │   │   ├── categorization.worker.ts
│   │   │   ├── fraud.worker.ts      # passthrough until Phase 4
│   │   │   ├── notification.worker.ts
│   │   │   └── insights.worker.ts
│   │   ├── common/
│   │   │   ├── gateway/             # Socket.IO gateway + WsGuard
│   │   │   ├── middleware/          # audit logging
│   │   │   ├── logger/              # Winston module
│   │   │   └── crypto/              # AES-256-GCM for IMAP credentials
│   │   ├── database/schemas/        # all Mongoose schemas
│   │   ├── queues/                  # BullMQ queue definitions + JobPayload interface
│   │   └── config/env.validation.ts # Joi schema — app refuses to start if vars missing
│   └── Dockerfile
│
├── docker-compose.yml               # mongo, redis, backend, frontend
├── .env.example
└── PROGRESS.md                      # phase-by-phase development tracker
```

---

## Running Locally

### Option A — Docker Compose (recommended)

Everything runs in containers. No local Node.js required beyond Docker.

```bash
git clone https://github.com/<you>/financial-copilot.git
cd financial-copilot

# 1. Copy and fill in secrets
cp .env.example .env

# 2. Build and start all services
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:4200 |
| Backend API | http://localhost:3000/api |
| MongoDB | localhost:27017 |
| Redis | localhost:6379 |

```bash
# Stop containers
docker compose down

# Stop and wipe all data (volumes)
docker compose down -v

# Rebuild after code changes
docker compose up --build backend frontend
```

---

### Option B — Manual (hot reload for development)

**Prerequisites:** Node.js 20+, MongoDB 7 running locally, Redis 7 running locally.

**1. Start infrastructure only**
```bash
docker compose up mongo redis -d
```

**2. Backend** (hot reload)
```bash
cd backend
npm install
cp ../.env.example .env   # edit with your values
npm run start:dev
```

**3. Frontend** (live reload)
```bash
cd frontend
npm install
npm run start             # http://localhost:4200
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
# ── Server ────────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:4200      # CORS origin — never use * in production

# ── Database ──────────────────────────────────────────────────────────────
MONGO_URI=mongodb://localhost:27017/financial-copilot

# ── Redis ─────────────────────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379

# ── Auth ──────────────────────────────────────────────────────────────────
JWT_SECRET=                             # min 32 chars, random string
JWT_REFRESH_SECRET=                     # different from JWT_SECRET, min 32 chars
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
BCRYPT_SALT_ROUNDS=12

# ── Encryption ────────────────────────────────────────────────────────────
# AES-256-GCM key for IMAP credentials stored at rest
# Generate: openssl rand -hex 32
AES_SECRET_KEY=                         # exactly 64 hex characters (32 bytes)

# ── OpenAI ────────────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-...

# ── Queue ─────────────────────────────────────────────────────────────────
BULLMQ_CONCURRENCY=2                    # parallel workers per queue
IMAP_FETCH_INTERVAL=*/5 * * * *         # cron expression for IMAP polling
```

### Generating secrets

```bash
# JWT secrets (use different values for each)
openssl rand -base64 48

# AES key — must be exactly 64 hex characters
openssl rand -hex 32
```

> **Note:** Your email address and App Password are **not** env vars. Each user enters their own credentials through the in-app onboarding wizard. They are stored AES-256-GCM encrypted in MongoDB, per user — never in plaintext, never shared.

---

## First-Time Setup

1. Open http://localhost:4200 and **Register** an account
2. The **Onboarding Wizard** walks you through connecting an email:

   | Provider | Where to get an App Password |
   |---|---|
   | Yahoo | security.yahoo.com → Generate app password |
   | Gmail | myaccount.google.com/apppasswords (requires 2FA) |
   | Outlook | account.microsoft.com/security → Advanced security |

3. The app tests the IMAP connection before saving anything
4. Initial sync starts immediately — fetches the last 90 days of bank emails
5. Transactions appear on the dashboard as each email is processed (a few seconds per email)

> The app uses App Passwords and IMAP read-only access. It never sends, deletes, or modifies emails.

---

## AI Pipeline

| Stage | Model | What happens |
|---|---|---|
| **Classification** | GPT-4o-mini | Labels the email: `transaction` / `otp` / `statement` / `reward` / `spam`. Non-transactions exit here. |
| **Extraction** | GPT-4o | Extracts: amount, merchant, card last 4 digits, date, transaction type. Returns a confidence score. |
| **Validation** | Deterministic | Rejects if confidence < 0.7 or amount ≤ 0. Rejected emails surface as a warning notification. |
| **Categorization** | GPT-4o-mini | Assigns a category (Food, Travel, Shopping…) and subcategory. |
| **Notification** | — | Persists to MongoDB + emits `transaction.new` via Socket.IO to the user's browser in real time. |

A separate **Insights Agent** (GPT-4o) runs nightly at 02:00 UTC and generates a spending summary for the current month. It uses upsert so it is always safe to re-run.

---

## Supported Banks

The pre-filter recognizes emails from Indian banks including:

HDFC Bank · Axis Bank · ICICI Bank · IDFC First Bank · Yes Bank · Kotak Mahindra · SBI · IndusInd Bank · Punjab National Bank · Bank of Baroda · Federal Bank · RBL Bank

Any bank sending standard Indian transaction alert emails (amount debited, card used, UPI transaction) will also be detected.

---

## Realtime Features

After login the frontend opens a Socket.IO connection authenticated via the existing HttpOnly JWT cookie — no extra token handling.

| Event | When it fires | UI effect |
|---|---|---|
| `transaction.new` | New transaction extracted | Green toast in top-right corner |
| `notification.new` | Any new notification | Bell icon badge increments |
| `extraction.failed` | AI confidence too low | Warning toast |
| `disconnect` | Connection lost | Yellow "Reconnecting…" banner in header |

---

## Security

| Concern | Implementation |
|---|---|
| Passwords | bcrypt cost 12, `passwordHash` field only, never returned in API responses |
| IMAP credentials | AES-256-GCM encrypted at rest; per-user IV and auth tag stored alongside ciphertext |
| JWT access token | 15-min expiry, HttpOnly + Secure + SameSite=Strict cookie |
| Refresh token | SHA-256 hash stored in Redis Set with 7-day TTL; atomically rotated and revoked on every use |
| Socket.IO auth | JWT validated from HttpOnly cookie on connection; each user in their own room |
| Rate limiting | Per-IP on public routes, per-userId on authenticated routes |
| Input validation | `class-validator` DTOs on every endpoint; unknown fields stripped |
| AI prompt safety | Injection filter strips control patterns from all email content before any OpenAI call |
| Data isolation | `ScopedRepository<T>` makes it structurally impossible to run a query without a `userId` |
| Audit log | Every auth event and data mutation written to `audit_log` with userId, IP, action, result |

---

## Re-processing Emails

If transactions look wrong (wrong merchant, missed cards), go to **Settings → Reset & Re-process**. This:

1. Deletes all extracted transactions and cards for your account
2. Resets every stored email to unprocessed
3. Re-queues all emails through the full AI pipeline

A progress bar shows real-time pipeline status. The page remembers state across refreshes via localStorage in case you navigate away.

---

## Deployment on AWS

The entire stack runs on a single **EC2 t3.small** (2 vCPU, 2 GB RAM) using the existing `docker-compose.yml`.

```bash
# Amazon Linux 2023
sudo dnf install -y docker git
sudo systemctl start docker
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/bin/docker-compose && sudo chmod +x /usr/local/bin/docker-compose

git clone https://github.com/<you>/financial-copilot.git
cd financial-copilot
cp .env.example .env
# Set FRONTEND_URL=https://yourdomain.com

docker compose up -d
```

For HTTPS, put **Caddy** in front (auto-provisions Let's Encrypt):

```
# /etc/caddy/Caddyfile
yourdomain.com {
    reverse_proxy localhost:4200
}
```

**Cost estimate:** ~$17/month (t3.small + 30 GB EBS). Swap the MongoDB container for **MongoDB Atlas M0 free tier** to save ~300 MB RAM and keep the same price.

---

## Development Phases

| Phase | Name | Status |
|---|---|---|
| 1 | MVP — Foundation | ✅ Complete |
| 2 | AI Integration | ✅ Complete |
| 3 | Realtime + Security Hardening | ✅ Complete |
| 4 | Advanced Intelligence | 🔲 Planned |
| 5 | Conversational AI | 🔲 Planned |

**Phase 4** — Real fraud detection with GPT-4o reasoning, subscription tracker, 30-day spending forecasts, credit utilization gauges, full analytics page.

**Phase 5** — Chat interface powered by RAG. Ask "What did I spend on food last month?" and get an answer grounded in your actual transaction data.

See [PROGRESS.md](./PROGRESS.md) for detailed task-level tracking.

---

## License

MIT
