# AutoZap — Developer Guide

> Multi-tenant WhatsApp CRM with flow automation, Google Calendar scheduling, campaigns, and multi-channel support.

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/diegoautozap-crypto/autozap.git
cd autozap
npm install

# 2. Copy env files (each service needs its own .env)
cp apps/auth-service/.env.example apps/auth-service/.env
# repeat for each service...

# 3. Run all services
npm run dev          # or start each service individually
```

**Required env vars** (all services):

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | `eyJ...` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `random-64-char-string` |
| `ENCRYPTION_KEY` | AES-256-GCM key for credentials | `32-byte-hex-string` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |
| `CORS_ORIGIN` | Allowed origins (comma-separated) | `https://useautozap.app` |
| `INTERNAL_SECRET` | Service-to-service auth token | `random-secret` |

**Service-specific:**

| Variable | Service | Description |
|----------|---------|-------------|
| `PUSHER_APP_ID/KEY/SECRET/CLUSTER` | All | Real-time events |
| `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | tenant-service | Google Calendar OAuth |
| `ASAAS_WEBHOOK_TOKEN` | tenant-service | Billing webhook auth |
| `SENTRY_DSN` | All | Error tracking |
| `MESSAGE_SERVICE_URL` | message-service | Internal URL for sending |
| `OPENAI_API_KEY` | message-service | AI responses (or per-tenant in metadata) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js 14+)                         │
│                        useautozap.app — port 3000                      │
│   Pages: inbox, contacts, flows, pipeline, campaigns, scheduling...    │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ API calls (JWT in header)
        ┌──────────┬───────────┼───────────┬──────────┬──────────┐
        ▼          ▼           ▼           ▼          ▼          ▼
  ┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐
  │  AUTH     ││ TENANT   ││ CHANNEL  ││ MESSAGE  ││ CONTACT  ││CONVERSA- │
  │ :3001    ││ :3002    ││ :3003    ││ :3004    ││ :3005    ││TION :3006│
  │          ││          ││          ││          ││          ││          │
  │ Login    ││ Settings ││ WhatsApp ││ Flows    ││ CRM      ││ Inbox    │
  │ 2FA      ││ Billing  ││ Gupshup  ││ AI       ││ Tags     ││ Pipeline │
  │ Team     ││ Google   ││ Evolution││ Webhooks ││ Products ││ Tasks    │
  │ Perms    ││ Admin    ││ Meta     ││ Workers  ││ Purchases││ Schedule │
  └──────────┘└──────────┘└──────────┘└──────────┘└──────────┘└──────────┘
        │          │           │           │          │          │
        └──────────┴───────────┴─────┬─────┴──────────┴──────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
              ┌──────────┐   ┌──────────┐   ┌──────────────┐
              │ Supabase │   │  Redis   │   │   CAMPAIGN   │
              │ Postgres │   │ BullMQ   │   │   :3007      │
              │ Storage  │   │ Queues   │   │              │
              └──────────┘   └──────────┘   │ Templates    │
                                            │ Mass send    │
                                            │ Scheduler    │
                                            └──────────────┘
```

---

## Monorepo Structure

```
autozap/
├── apps/
│   ├── frontend/                 # Next.js 14+ App Router
│   ├── auth-service/             # port 3001 — Authentication
│   ├── tenant-service/           # port 3002 — Tenant management
│   ├── channel-service/          # port 3003 — WhatsApp adapters
│   ├── message-service/          # port 3004 — Messages & flows
│   ├── contact-service/          # port 3005 — CRM contacts
│   ├── conversation-service/     # port 3006 — Inbox & pipeline
│   └── campaign-service/         # port 3007 — Mass messaging
│
├── packages/
│   ├── utils/                    # Shared code (ALL services import from here)
│   │   └── src/
│   │       ├── index.ts          # ok(), fail(), AppError, generateId, schemas
│   │       ├── db.ts             # Supabase client singleton
│   │       ├── logger.ts         # Winston logger factory
│   │       ├── crypto.ts         # AES-256-GCM encrypt/decrypt
│   │       ├── middleware.ts     # requireAuth, requireRole, errorHandler, validate
│   │       ├── redis-cache.ts    # cachedGet, cacheInvalidate
│   │       ├── sentry.ts         # initSentry, captureError
│   │       └── rate-limit.ts     # Express rate limiter
│   │
│   ├── types/                    # Shared TypeScript types
│   │   └── src/index.ts          # PlanSlug, UserRole, PLAN_LIMITS, Tenant, User, JwtPayload
│   │
│   └── database/                 # SQL migrations
│       └── src/migrations/       # 001 through 006
│
└── ARCHITECTURE.md               # This file
```

---

## Shared Package Rules

```typescript
// ALWAYS import from the shared package:
import { db, logger, requireAuth, requireRole, validate, errorHandler,
         encrypt, decrypt, encryptCredentials, decryptCredentials,
         ok, fail, AppError, generateId, cachedGet, initSentry,
         rateLimit, paginationSchema } from '@autozap/utils'

import { PLAN_LIMITS, type PlanSlug, type UserRole, type JwtPayload } from '@autozap/types'
```

**NEVER create local `lib/logger.ts`, `lib/db.ts`, `lib/crypto.ts`, or middleware files inside services.** Everything shared lives in `packages/utils`.

---

## Services — Detailed Reference

### auth-service (port 3001)

**What it does:** User registration, login, JWT tokens, 2FA, team management, permissions.

**Files:**

| File | Lines | What |
|------|-------|------|
| `routes/auth.routes.ts` | ~340 | 20 endpoints |
| `services/auth.service.ts` | ~378 | Business logic |
| `lib/jwt.ts` | ~57 | JWT sign/verify (HS256 explicit) |
| `lib/totp.ts` | ~50 | TOTP 2FA with otplib |
| `lib/email.ts` | ~184 | Resend email templates |

**Route mount:** `app.use('/auth', authRoutes)`

**All endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Create account + tenant |
| POST | `/auth/login` | No | Login (2FA optional). 5 fails = 15min lockout |
| POST | `/auth/refresh` | No | Refresh JWT token |
| POST | `/auth/logout` | Yes | Revoke current session |
| POST | `/auth/logout-all` | Yes | Revoke all sessions |
| POST | `/auth/forgot-password` | No | Send reset email (token hashed in DB) |
| POST | `/auth/reset-password` | No | Reset with token |
| POST | `/auth/verify-email` | No | Verify email (token hashed in DB) |
| POST | `/auth/resend-verification` | No | Resend verification email |
| GET | `/auth/me` | Yes | Current user + permissions |
| POST | `/auth/2fa/setup` | Yes | Get QR code for authenticator |
| POST | `/auth/2fa/confirm` | Yes | Confirm 2FA with code |
| POST | `/auth/2fa/disable` | Yes | Disable 2FA |
| GET | `/auth/team` | Yes | List team members |
| POST | `/auth/team/invite` | Admin | Invite team member |
| PATCH | `/auth/team/:id` | Admin | Update member (role, active) |
| DELETE | `/auth/team/:id` | Admin | Remove member |
| POST | `/auth/team/:id/reset-password` | Admin | Reset member password (128-bit temp) |
| GET | `/auth/team/:id/permissions` | Admin | Get member permissions |
| PATCH | `/auth/team/:id/permissions` | Admin | Update permissions (channels, conversations) |

**Security features:**
- Passwords hashed with bcrypt
- Refresh token rotation with family tracking + reuse detection
- Password reset & email verify tokens hashed (SHA256) before DB storage
- Account lockout after 5 failed login attempts (15 min)
- Failed logins logged with IP for brute force detection
- JWT algorithm explicitly HS256 (sign + verify)
- Generic error message on register (no email enumeration)
- Refresh tokens expire in 14 days

---

### tenant-service (port 3002)

**What it does:** Tenant settings, billing (Asaas), webhooks, analytics, Google Calendar OAuth, super admin panel.

**Files:**

| File | Lines | What |
|------|-------|------|
| `routes/tenant.routes.ts` | ~700 | Tenant CRUD, settings, billing, webhooks, analytics, users |
| `routes/google.routes.ts` | ~130 | Google OAuth2 flow + Calendar list |
| `routes/admin.routes.ts` | ~155 | Super admin panel |
| `services/tenant.service.ts` | ~500 | Business logic |
| `middleware/tenant.middleware.ts` | ~36 | `requireSuperAdmin` |

**Route mounts:**
```
app.use('/tenant', asaasWebhookRouter)   // Public: billing webhook
app.use('/tenant', googleRoutes)          // Public: Google OAuth callback
app.use('/tenant', tenantRoutes)          // Protected: tenant operations
app.use('/admin', adminRoutes)            // Super admin only
```

**Key endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/tenant/` | Yes | Get tenant info |
| PATCH | `/tenant/settings` | Admin | AI config, auto-reply, timezone |
| GET | `/tenant/usage` | Yes | Message usage with monthly reset |
| GET | `/tenant/analytics` | Yes | Dashboard stats |
| POST | `/tenant/webhook-token` | Admin | Generate webhook token |
| GET | `/tenant/integrations/google/auth-url` | Admin | Start Google OAuth |
| GET | `/tenant/integrations/google/callback` | No | Google OAuth callback |
| GET | `/tenant/integrations/google/calendars` | Admin | List Google calendars |
| DELETE | `/tenant/integrations/google` | Admin | Disconnect Google |
| POST | `/tenant/billing/subscribe` | Yes | Subscribe via Asaas |
| POST | `/tenant/billing/webhook/asaas` | No | Asaas payment webhook |
| POST | `/admin/tenants/:id/impersonate` | SuperAdmin | Login as tenant owner |

---

### channel-service (port 3003)

**What it does:** Multi-channel message routing. Adapters for WhatsApp (Gupshup + Evolution), Instagram, Messenger.

**Files:**

| File | Lines | What |
|------|-------|------|
| `routes/channel.routes.ts` | ~523 | CRUD, webhooks, internal send |
| `services/channel.service.ts` | ~273 | Channel creation with encrypted creds |
| `adapters/GupshupAdapter.ts` | ~300 | Official WhatsApp API |
| `adapters/EvolutionAdapter.ts` | ~297 | Unofficial WhatsApp API |
| `adapters/InstagramAdapter.ts` | ~190 | Instagram DM |
| `adapters/MessengerAdapter.ts` | ~186 | Facebook Messenger |
| `adapters/ChannelRouter.ts` | ~43 | Routes to correct adapter |
| `adapters/IChannelAdapter.ts` | ~108 | Adapter interface |

**How channel adapters work:**

```
Inbound message arrives
  → POST /webhook/gupshup/:apikey   (or /evolution/:instance, /meta)
  → channelRouter.resolve(channel.type)
  → adapter.normalizeInbound(payload)
  → POST /internal/inbound → message-service

Outbound message
  → message-service calls POST /internal/send
  → channelRouter.resolve(channel.type)
  → adapter.send(to, message)
```

**Gupshup vs Evolution:**

| Feature | Gupshup (Official) | Evolution (Unofficial) |
|---------|---------------------|------------------------|
| Buttons | Native WhatsApp clickable buttons | Auto-converted to numbered text |
| Lists | Native dropdown | Auto-converted to numbered text |
| Media receive | Direct CDN URLs | Download via API → upload to Supabase Storage |
| Number mapping | Not needed | "1" → maps to button title |
| Auth | API key in URL | Instance name + API key |

**Why Evolution needs special handling:**
WhatsApp blocks buttons/lists from unofficial APIs. The `EvolutionAdapter` automatically converts interactive messages to numbered text format (`1️⃣ Option A`, `2️⃣ Option B`). When the user replies "1", the flow engine maps it back to the original button title.

---

### message-service (port 3004)

**What it does:** Core message processing, flow engine (20+ node types), automations, AI responses, webhooks.

**This is the largest and most complex service (~6,700 lines).**

**Files:**

| File | Lines | What |
|------|-------|------|
| `routes/message.routes.ts` | ~320 | Send, webhooks (lead/notify/flow), inbound |
| `routes/automation.routes.ts` | ~188 | Automation CRUD |
| `routes/flow.routes.ts` | ~352 | Flow CRUD, graph editor, run |
| `services/message.service.ts` | ~638 | Message processing, bot takeover |
| `services/automation.service.ts` | ~274 | Keyword matching |
| `services/flow.engine.ts` | ~2,346 | **Main flow engine** |
| `services/contact.helper.ts` | ~103 | Contact/conversation upsert |
| `workers/message.worker.ts` | ~357 | Async message processing |
| `workers/flow.worker.ts` | ~159 | Delayed flow nodes |
| `middleware/message.middleware.ts` | ~32 | Internal secret (timing-safe) |

**Flow engine modular files** (created alongside, not yet wired in):

```
services/flow/
├── types.ts           # FlowContext, FlowNodeData, NodeResult
├── helpers.ts         # interpolate, sendMessage, evaluateCondition
├── triggers.ts        # isOnCooldown, checkFlowTrigger
└── nodes/
    ├── message.ts     # send_message, send_media
    ├── logic.ts       # wait, condition, loops, split_ab, end
    ├── integration.ts # transcribe_audio, ai, webhook
    ├── crm.ts         # contacts, tags, pipeline, assign, tasks
    └── schedule.ts    # Google Calendar scheduling
```

**All supported flow node types:**

| Category | Nodes | Description |
|----------|-------|-------------|
| Message | `send_message`, `send_media`, `input` | Text, buttons, lists, images, audio, video |
| Logic | `wait`, `condition`, `loop_repeat`, `loop_retry`, `loop_while`, `split_ab`, `random_path`, `go_to`, `end` | Delays (inline ≤5min, BullMQ >5min), branching, A/B testing |
| Integration | `transcribe_audio`, `ai`, `webhook` | Whisper transcription, OpenAI (4 modes), HTTP requests |
| CRM | `create_contact`, `map_fields`, `tag_contact`, `update_contact`, `move_pipeline`, `assign_agent`, `create_task`, `send_notification` | Contact operations, agent assignment (round-robin) |
| Scheduling | `schedule_appointment` | Google Calendar freebusy, pricing tables, cancellation |

**Bot pause/resume:**
- **From CRM:** "Assumir" button pauses bot, "Liberar bot" reactivates
- **From phone:** Replying from WhatsApp does NOT pause bot (cooldown controls it). Send `#pausar` to pause manually, `#bot` to reactivate
- **From flow:** `assign_agent` and `end` nodes can pause the bot
- Controlled by `conversations.bot_active` column + flow cooldown (24h/once/always)

**Webhook endpoints (public, token-based):**

| Endpoint | What it does | Body |
|----------|-------------|------|
| `POST /webhook/lead/:token` | Captures lead → creates contact + conversation | `{ phone, name, email, source, message }` |
| `POST /webhook/notify/:token` | Sends message to a number | `{ phone, message, channelId?, name? }` |
| `POST /webhook/flow/:flowId/:token` | Triggers a specific flow | `{ phone, name, message, ...custom }` |

All three use the same `webhook_token` from the tenant (generated in Settings).

---

### contact-service (port 3005)

**What it does:** CRM contacts, tags, CSV import/export, products catalog, purchases (single/batch), sales analytics.

**Files:**

| File | Lines | What |
|------|-------|------|
| `routes/contact.routes.ts` | ~238 | Contacts CRUD, tags, import/export |
| `routes/product.routes.ts` | ~304 | Products CRUD, purchases, summary |
| `services/contact.service.ts` | ~312 | Business logic, CSV handling |

**Route mount:** Both at `/`

**Key endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/contacts` | List with pagination, search, filters |
| POST | `/contacts` | Create (plan limit checked) |
| POST | `/contacts/import` | CSV import (max 10K rows, Zod validated) |
| GET | `/contacts/export` | CSV export (plan-gated: Pro+) |
| DELETE | `/contacts/all` | Delete all (admin/owner only) |
| GET | `/products` | List active products |
| POST | `/products` | Create (plan limit checked) |
| POST | `/purchases/batch` | Multi-product order with proportional discount |
| GET | `/purchases/summary` | Sales analytics (qty, revenue, avg ticket) |

---

### conversation-service (port 3006)

**What it does:** Inbox, conversations, notes, quick replies, tasks, pipeline (Kanban), scheduling/appointments.

**Files:**

| File | Lines | What |
|------|-------|------|
| `routes/conversation.routes.ts` | ~563 | Inbox, notes, tasks, bulk ops, labels |
| `routes/pipeline.routes.ts` | ~218 | Pipeline CRUD, columns, cards |
| `routes/scheduling.routes.ts` | ~345 | Scheduling config, appointments |
| `services/conversation.service.ts` | ~226 | Business logic |

**Route mount:** All three at `/`

**Key endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/conversations` | Inbox with filters (status, channel, assigned, search) |
| GET | `/conversations/counts` | Status counts for sidebar badges |
| GET | `/conversations/pipeline` | Pipeline/Kanban board view |
| POST | `/conversations/bulk/read\|close\|assign\|labels` | Bulk operations (Zod validated) |
| GET | `/pipelines` | List pipelines |
| POST | `/pipeline-cards` | Create deal card (Zod validated) |
| GET | `/appointments/available-slots` | Available slots with break/conflict detection |
| POST | `/appointments` | Create appointment (conflict check) |

---

### campaign-service (port 3007)

**What it does:** Mass messaging campaigns, message templates, scheduled sending, contact import.

**Files:**

| File | Lines | What |
|------|-------|------|
| `routes/campaign.routes.ts` | ~291 | Campaign CRUD, templates, contacts |
| `services/campaign.service.ts` | ~344 | Campaign logic |
| `workers/campaign.worker.ts` | ~459 | BullMQ: sends messages with throttling |
| `workers/inbox.worker.ts` | ~131 | Routes inbound to conversations |
| `workers/reconciliation.worker.ts` | ~103 | Reconciles message status |
| `workers/scheduler.worker.ts` | ~99 | Scheduled campaign execution |
| `lib/email.ts` | ~96 | Campaign notification emails |

**How campaigns work:**
1. Create campaign → add contacts (by CSV, tag, or filter)
2. Start campaign → jobs queued in BullMQ
3. `campaign.worker` sends messages with throttling per channel
4. Status tracked: pending → sent → delivered → read
5. `reconciliation.worker` syncs statuses periodically

---

## Frontend (Next.js 14+)

**Stack:** Next.js App Router, shadcn/ui, Zustand, Pusher (real-time), Supabase

### All Pages

```
app/
├── page.tsx                     # Landing page (public)
├── login/                       # Login form
├── register/                    # Registration form
├── forgot-password/             # Password recovery
├── reset-password/              # Password reset
├── verify-email/                # Email verification
├── admin/                       # Super admin panel
├── form/[token]/                # External lead capture form (public)
│
└── dashboard/
    ├── page.tsx                 # Dashboard home (stats)
    ├── inbox/                   # Conversation inbox (real-time)
    ├── contacts/                # CRM contact list
    ├── products/                # Product catalog
    ├── flows/                   # Flow list
    │   └── [id]/                # Visual flow editor (drag & drop)
    ├── automations/             # Keyword automations
    ├── campaigns/               # Mass messaging campaigns
    ├── templates/               # Message templates
    ├── pipeline/                # Kanban deal board
    ├── scheduling/              # Appointment scheduling
    ├── tasks/                   # Task management
    ├── channels/                # Channel management (connect WhatsApp)
    ├── team/                    # Team members & invites
    └── settings/                # Tenant settings, webhooks, billing, Google
```

### Key Frontend Files

| Path | What |
|------|------|
| `lib/api.ts` | Axios API client — all backend calls go through here |
| `lib/i18n/` | Translations: `pt-BR.ts`, `en.ts`, `es.ts` |
| `lib/pusher.ts` | Pusher event listener for real-time updates |
| `lib/supabase.ts` | Supabase client (frontend) |
| `store/auth.store.ts` | Zustand — user session, login state |
| `store/permissions.store.ts` | Zustand — role-based UI permissions |
| `store/theme.store.ts` | Zustand — dark/light theme |
| `store/unread.store.ts` | Zustand — unread message counts |
| `components/ui/` | 13 shadcn/ui primitives (button, card, input, etc.) |
| `components/layout/` | Sidebar, TrialBanner |

---

## Database

### Storage

| System | Purpose |
|--------|---------|
| **Supabase (PostgreSQL)** | All relational data (tenants, users, contacts, conversations, messages, flows, campaigns) |
| **Redis (BullMQ)** | Job queues (campaign sending, delayed flow nodes, message processing, auto-reply) |
| **Supabase Storage** | `media` bucket — Evolution media files (images, audio, video) |

### Migrations

```
packages/database/src/migrations/
├── 001_base_schema.sql        # tenants, users, contacts, conversations, messages
├── 002_functions.sql          # Database functions (increment_unread, etc.)
├── 003_channels_messages.sql  # channels, message status tracking
├── 004_campaigns.sql          # campaigns, campaign_contacts, templates
├── 005_fixes.sql              # Schema corrections and indexes
└── 006_webhook_token.sql      # webhook_token column on tenants
```

### Key Tables

| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenant root. Has `plan_slug`, `settings`, `metadata`, `webhook_token` |
| `users` | Users belong to a tenant. Has `role`, `2FA`, `email_verified` |
| `contacts` | CRM contacts. Has `phone`, `metadata`, `deal_adjustments` |
| `conversations` | Chat threads. Has `bot_active`, `status`, `pipeline_stage`, `labels` |
| `messages` | Individual messages. Has `direction`, `content_type`, `external_id` |
| `channels` | WhatsApp/Meta connections. `credentials` encrypted with AES-256-GCM |
| `flows` | Flow automations. Graph stored as `nodes[]` + `edges[]` |
| `flow_states` | Running flow state per conversation (variables, current node, waiting input) |
| `products` | Product catalog with `price`, `sku`, `category` |
| `purchases` | Purchase records with `order_id`, discount, surcharge, shipping |
| `pipelines` | Multiple pipeline boards per tenant |
| `pipeline_columns` | Kanban columns (key, label, color, sort_order) |
| `pipeline_cards` | Deal cards on the Kanban board |
| `scheduling_config` | Appointment scheduling settings (hours, days, slot duration) |
| `appointments` | Booked appointments (date, time, status, conflict checking) |
| `tasks` | Tasks/follow-ups with due dates and assignment |
| `campaigns` | Mass messaging campaigns with status tracking |

---

## Plans & Limits

| Feature | Starter | Pro | Enterprise | Unlimited |
|---------|---------|-----|------------|-----------|
| Messages/month | 10,000 | 50,000 | 200,000 | Unlimited |
| Channels | 3 | 10 | 30 | 999 |
| Team members | 3 | 10 | 30 | 999 |
| Flows | 5 | 20 | Unlimited | Unlimited |
| Contacts | 10,000 | 50,000 | 100,000 | Unlimited |
| AI responses | 5,000 | 30,000 | 100,000 | Unlimited |
| Products | 0 | 50 | 500 | Unlimited |
| Transcription | No | Yes | Yes | Yes |
| Reports/Export | No | Yes | Yes | Yes |

Plan limits are enforced server-side via `PLAN_LIMITS` constant from `@autozap/types`. Every create operation checks the tenant's plan before proceeding.

---

## Security

### Authentication & Authorization

| Layer | How |
|-------|-----|
| JWT | HS256 explicit, 1h access token, 14-day refresh token |
| Refresh tokens | Hashed (SHA256) in DB, family rotation, reuse detection |
| Password reset tokens | Hashed (SHA256) before storage |
| Email verify tokens | Hashed (SHA256) before storage |
| Password hashing | bcrypt |
| 2FA | TOTP via otplib (Google Authenticator compatible) |
| Account lockout | 5 failed logins = 15-minute lockout |
| Temp passwords | 128-bit random (16 bytes hex) |
| Role hierarchy | viewer(0) < agent(1) < admin(2) < owner(3) |
| Super admin | Requires `is_superadmin` in DB + `ADMIN_SECRET` header |

### API Security

| Protection | Implementation |
|------------|----------------|
| Input validation | Zod schemas on all POST/PATCH/PUT endpoints |
| Tenant isolation | `.eq('tenant_id', req.auth.tid)` on every query |
| Rate limiting | `express-rate-limit` on all 7 services (120 req/min default) |
| CORS | Whitelist from `CORS_ORIGIN` env var, rejects all if unset |
| Helmet | Security headers on all services |
| Internal auth | `INTERNAL_SECRET` with `crypto.timingSafeEqual` |
| Webhook auth | Per-tenant `webhook_token` (48 hex chars) |
| Credentials | Channel API keys encrypted with AES-256-GCM |
| Error handling | No stack traces leaked; generic "Internal server error" in production |

---

## Coding Standards

### Rules for all backend code:

1. **Imports** — Always from `@autozap/utils`, never create local duplicates
2. **Logging** — Use `logger` from utils, never `console.*`
3. **Errors** — Use `AppError` classes, caught by shared `errorHandler`
4. **Types** — Use `@autozap/types`, minimize `any` usage
5. **Responses** — `ok(data)` for success, `fail(code, message)` for errors
6. **Validation** — Every POST/PATCH/PUT endpoint must use `validate(zodSchema)`
7. **Tenant isolation** — Every DB query must include `.eq('tenant_id', req.auth.tid)`
8. **Secrets** — Use `crypto.timingSafeEqual` for constant-time comparison
9. **Rate limiting** — Every service must have rate limiting in `index.ts`
10. **i18n** — All user-facing strings in `apps/frontend/lib/i18n/` (pt-BR, en, es)

### Adding a new endpoint:

```typescript
// 1. Define Zod schema
const mySchema = z.object({
  name: z.string().min(1).max(255),
  value: z.number().optional(),
})

// 2. Use validate middleware + tenant isolation
router.post('/my-endpoint', validate(mySchema), async (req, res, next) => {
  try {
    const { name, value } = req.body
    const { data, error } = await db
      .from('my_table')
      .insert({ tenant_id: req.auth.tid, name, value })  // Always include tenant_id
      .select()
      .single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})
```

### Adding a new service:

1. Create `apps/my-service/` with `src/index.ts`, `src/routes/`, `package.json`
2. Import `helmet`, `cors`, `express-rate-limit`, `cookieParser` from deps
3. Import `errorHandler`, `logger`, `initSentry` from `@autozap/utils`
4. Add `CORS_ORIGIN?.split(',') || false` (never undefined)
5. Add rate limiting: `app.use(rateLimit({ windowMs: 60_000, max: 120 }))`
6. Add health check at `GET /health`
7. Mount routes, then `app.use(errorHandler)` last

---

## Deploy

| Service | Platform | Region | URL |
|---------|----------|--------|-----|
| auth-service | **Fly.io** | GRU (Sao Paulo) | autozap-auth.fly.dev |
| tenant-service | **Fly.io** | GRU (Sao Paulo) | autozap-tenant.fly.dev |
| channel-service | **Fly.io** | GRU (Sao Paulo) | autozap-channel.fly.dev |
| message-service | **Fly.io** | GRU (Sao Paulo) | autozap-message.fly.dev |
| contact-service | **Fly.io** | GRU (Sao Paulo) | autozap-contact.fly.dev |
| conversation-service | **Fly.io** | GRU (Sao Paulo) | autozap-conversation.fly.dev |
| campaign-service | **Fly.io** | GRU (Sao Paulo) | autozap-campaign.fly.dev |
| frontend | **Fly.io** | GRU (Sao Paulo) | autozap-frontend.fly.dev → useautozap.app |
| Database | **Supabase** | sa-east-1 (Sao Paulo) | Managed PostgreSQL |
| Cache/Queues | **Redis** (Railway) | US East | BullMQ job queues |
| Real-time | **Pusher** | sa1 | Managed WebSocket |
| Error tracking | **Sentry** | Cloud | All services send errors |
| Emails | **Resend** | Cloud | Transactional emails |
| Billing | **Asaas** | Brazil | Brazilian payment gateway |

**Deploy manual:**
```bash
# Deploy um servico
flyctl deploy . --config apps/auth-service/fly.toml --dockerfile apps/auth-service/Dockerfile --app autozap-auth

# Deploy todos
for svc in auth tenant channel message contact conversation campaign; do
  flyctl deploy . --config apps/$svc-service/fly.toml --dockerfile apps/$svc-service/Dockerfile --app autozap-$svc --detach
done

# Frontend
flyctl deploy . --config apps/frontend/fly.toml --dockerfile apps/frontend/Dockerfile --app autozap-frontend
```

**Escalar replicas:**
```toml
# No fly.toml do servico
min_machines_running = 4  # aumentar replicas
```

**Infraestrutura atual:**
- 16 maquinas (2 replicas x 8 servicos) em Sao Paulo
- ~50 msg/segundo de capacidade
- ~2-3 milhoes de mensagens/dia
- Suporta ate ~200 clientes simultaneos

---

## Project Stats

| Metric | Value |
|--------|-------|
| Backend services | 7 |
| Frontend pages | 25 |
| Source files | 70+ |
| Lines of code (backend) | ~16,000 |
| API endpoints | 180+ |
| Flow node types | 20+ |
| Languages | 3 (pt-BR, en, es) |
| Channel adapters | 4 (Gupshup, Evolution, Instagram, Messenger) |
| Security audits | 15 fixes applied (OWASP Top 10) |
