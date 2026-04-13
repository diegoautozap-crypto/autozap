# AutoZap - Architecture Guide

## Overview
AutoZap is a multi-tenant WhatsApp CRM platform with flow automation, Google Calendar scheduling, campaign management, and multi-channel support (Gupshup + Evolution API).

## Monorepo Structure

```
autozap/
├── apps/
│   ├── frontend/                    # Next.js 14+ App Router (port 3000)
│   ├── auth-service/                # Authentication, JWT, 2FA (port 3001)
│   ├── tenant-service/              # Tenant management, billing, settings (port 3002)
│   ├── channel-service/             # WhatsApp adapters, webhooks (port 3003)
│   ├── message-service/             # Messages, flows, automations (port 3004)
│   ├── contact-service/             # CRM contacts, tags, products (port 3005)
│   ├── conversation-service/        # Inbox, pipeline, scheduling (port 3006)
│   └── campaign-service/            # Mass messaging, templates (port 3007)
├── packages/
│   ├── utils/                       # Shared: logger, db, crypto, middleware
│   ├── types/                       # Shared TypeScript types & constants
│   └── database/                    # SQL migrations
```

## Shared Packages

### @autozap/utils

All backend services import shared code from `@autozap/utils`:

```typescript
import { db, logger, requireAuth, requireRole, validate, errorHandler,
         encrypt, decrypt, encryptCredentials, decryptCredentials,
         ok, fail, AppError, generateId, cachedGet, initSentry,
         rateLimit, paginationSchema } from '@autozap/utils'
```

| Module | Exports |
|--------|---------|
| `db.ts` | Supabase client singleton |
| `logger.ts` | Winston logger factory (`logger`, `createLogger`) |
| `crypto.ts` | AES-256-GCM (`encrypt`, `decrypt`, `encryptCredentials`, `decryptCredentials`) |
| `middleware.ts` | `requireAuth`, `requireRole`, `errorHandler`, `validate` |
| `redis-cache.ts` | `cachedGet`, `cacheInvalidate` |
| `sentry.ts` | `initSentry`, `captureError`, `Sentry` |
| `rate-limit.ts` | Express rate limiter wrapper |
| `index.ts` | Response helpers (`ok`, `fail`), error classes (`AppError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `PlanLimitError`), utility functions (`generateId`, `slugify`, `sleep`, `normalizePhone`, `normalizeBRPhone`), Zod schemas (`loginSchema`, `registerSchema`, `paginationSchema`) |

**Never create local lib/logger.ts, lib/db.ts, lib/crypto.ts, or middleware files in services.** Use the shared package.

### @autozap/types

```typescript
import { PLAN_LIMITS, type PlanSlug, type UserRole, type JwtPayload,
         type Tenant, type User, type ApiResponse } from '@autozap/types'
```

| Export | Description |
|--------|-------------|
| `PlanSlug` | `'pending' \| 'starter' \| 'pro' \| 'enterprise' \| 'unlimited'` |
| `UserRole` | `'owner' \| 'admin' \| 'agent' \| 'viewer'` |
| `PLAN_LIMITS` | Plan configuration (messages, channels, members, flows, contacts, AI, products, transcription, reports) |
| `Tenant` | Tenant entity with settings, metadata, webhook token |
| `User` | User entity with role, 2FA, email verification |
| `JwtPayload` | JWT claims (`sub`, `tid`, `role`, `email`) |
| `ApiResponse<T>` | Standard API response with success, data, error, meta |

**Plan Limits:**

| Feature | Starter | Pro | Enterprise | Unlimited |
|---------|---------|-----|------------|-----------|
| Messages/mês | 10K | 50K | 200K | Ilimitado |
| Canais | 3 | 10 | 30 | 999 |
| Membros | 3 | 10 | 30 | 999 |
| Flows | 5 | 20 | Ilimitado | Ilimitado |
| Contatos | 10K | 50K | 100K | Ilimitado |
| Respostas IA | 5K | 30K | 100K | Ilimitado |
| Produtos | 0 | 50 | 500 | Ilimitado |
| Transcrição | Nao | Sim | Sim | Sim |
| Relatórios | Nao | Sim | Sim | Sim |

---

## Services Detail

### auth-service (port 3001)

**Files:** 7 source files, ~1,200 lines

| File | Description |
|------|-------------|
| `routes/auth.routes.ts` | 20 endpoints: register, login, 2FA, team management, permissions |
| `services/auth.service.ts` | Business logic: JWT, password hashing, TOTP, team invites |
| `lib/jwt.ts` | JWT sign/verify helpers |
| `lib/totp.ts` | TOTP (2FA) setup and verification |
| `lib/email.ts` | Email templates via Resend (verification, reset, invite, notifications) |

**Route mount:** `app.use('/auth', authRoutes)`

**Key endpoints:**
- `POST /auth/register` — User registration with tenant creation
- `POST /auth/login` — Login with optional 2FA
- `POST /auth/2fa/setup|confirm|disable` — Two-factor authentication
- `GET /auth/team` — Team member management
- `PATCH /auth/team/:id/permissions` — Per-user channel/conversation permissions

---

### tenant-service (port 3002)

**Files:** 7 source files, ~1,580 lines

| File | Description |
|------|-------------|
| `routes/tenant.routes.ts` | Tenant CRUD, settings, billing, webhooks, analytics, users |
| `routes/google.routes.ts` | Google OAuth2 flow, Calendar list |
| `routes/admin.routes.ts` | Super admin: list tenants, stats, block/unblock, impersonate |
| `services/tenant.service.ts` | Business logic: Asaas billing, plan limits, analytics |
| `middleware/tenant.middleware.ts` | `requireSuperAdmin` middleware |

**Route mounts:**
- `app.use('/tenant', asaasWebhookRouter)` — Public billing webhook
- `app.use('/tenant', googleRoutes)` — Google OAuth (callback is public)
- `app.use('/tenant', tenantRoutes)` — Tenant operations (auth required)
- `app.use('/admin', adminRoutes)` — Super admin panel

**Key endpoints:**
- `PATCH /tenant/settings` — Update AI config, auto-reply, timezone
- `GET /tenant/usage` — Message usage with monthly reset
- `GET /tenant/analytics` — Dashboard analytics (conversations, messages, contacts, response time)
- `POST /tenant/billing/subscribe` — Asaas subscription
- `GET /tenant/integrations/google/auth-url` — Google OAuth start
- `GET /tenant/integrations/google/calendars` — List Google calendars
- `POST /admin/tenants/:id/impersonate` — Login as tenant owner

---

### channel-service (port 3003)

**Files:** 9 source files, ~1,954 lines

| File | Description |
|------|-------------|
| `routes/channel.routes.ts` | Channel CRUD, webhooks (Gupshup, Evolution, Meta), internal send |
| `services/channel.service.ts` | Channel creation with encrypted credentials |
| `adapters/GupshupAdapter.ts` | Official WhatsApp API (native buttons/lists) |
| `adapters/EvolutionAdapter.ts` | Unofficial API (text fallback for buttons, Supabase media proxy) |
| `adapters/InstagramAdapter.ts` | Instagram DM adapter |
| `adapters/MessengerAdapter.ts` | Facebook Messenger adapter |
| `adapters/ChannelRouter.ts` | Routes messages to correct adapter by channel type |
| `adapters/IChannelAdapter.ts` | Adapter interface contract |

**Route mount:** `app.use('/', channelRoutes)`

**Channel Adapters:**

| Feature | Gupshup (Official) | Evolution (Unofficial) |
|---------|---------------------|------------------------|
| Buttons | Native clickable | Text with numbered options |
| Lists | Native dropdown | Text with numbered options |
| Media | Direct URLs | Download via API → Supabase Storage → public URL |
| Status | sent/delivered/read | sent/delivered/read |
| Auth | API key | Instance name + API key |

**Key endpoints:**
- `POST /webhook/gupshup/:apikey` — Gupshup inbound webhook
- `POST /webhook/evolution/:instanceName` — Evolution inbound webhook
- `GET/POST /webhook/meta` — Instagram/Messenger webhooks
- `POST /internal/send` — Internal service-to-service message sending
- `GET /channels/:id/evolution/qrcode` — QR code for Evolution pairing

---

### message-service (port 3004)

**Files:** 20 source files, ~6,766 lines (largest service)

| File | Description |
|------|-------------|
| `routes/message.routes.ts` | Send messages, webhooks (lead/notify/flow), internal inbound |
| `routes/automation.routes.ts` | Automation CRUD (keyword triggers) |
| `routes/flow.routes.ts` | Flow CRUD, graph editor, manual execution, analytics |
| `services/message.service.ts` | Message processing, bot/human takeover, read receipts |
| `services/automation.service.ts` | Automation matching and execution |
| `services/flow.engine.ts` | **Main flow engine (2,346 lines)** — executes all node types |
| `services/contact.helper.ts` | Contact upsert helper |
| `workers/message.worker.ts` | BullMQ worker for async message processing |
| `workers/flow.worker.ts` | BullMQ worker for delayed flow nodes |
| `middleware/message.middleware.ts` | Internal secret validation (timing-safe) |

**Flow Engine Modules** (created alongside flow.engine.ts, not yet wired in):

```
services/flow/
├── types.ts          # FlowContext, FlowNodeData, NodeResult, ConditionRule
├── helpers.ts        # interpolate, sendMessage, evaluateCondition, cached, emitPusher
├── triggers.ts       # isOnCooldown, checkFlowTrigger, evaluateTrigger
└── nodes/
    ├── message.ts    # handleSendMessage, handleSendMedia
    ├── logic.ts      # handleWait, handleCondition, handleLoop*, handleSplitAB, handleEnd
    ├── integration.ts # handleTranscribeAudio, handleAi, handleWebhook
    ├── crm.ts        # handleCreateContact, handleTagContact, handleMovePipeline, handleAssignAgent
    └── schedule.ts   # executeGoogleCalendarNode, executeCancelAppointment
```

**Supported Node Types (20+):**
- **Message:** send_message, send_media, input
- **Logic:** wait, condition, loop_repeat, loop_retry, loop_while, split_ab, random_path, go_to, end
- **Integration:** transcribe_audio, ai, webhook
- **CRM:** create_contact, map_fields, tag_contact, update_contact, move_pipeline, assign_agent, create_task, send_notification
- **Scheduling:** schedule_appointment (Google Calendar with freebusy, pricing, cancellation)

**Key endpoints:**
- `POST /internal/inbound` — Process inbound message (triggers automations/flows)
- `POST /messages/send` — Send message (with bot/human mode check)
- `PUT /flows/:id/graph` — Save flow graph (nodes + edges)
- `POST /flows/:id/run` — Execute flow for specific contacts
- `POST /webhook/lead/:token` — External lead capture
- `POST /webhook/notify/:token` — External notification trigger
- `POST /webhook/flow/:flowId/:token` — External flow trigger

---

### contact-service (port 3005)

**Files:** 4 source files, ~889 lines

| File | Description |
|------|-------------|
| `routes/contact.routes.ts` | Contacts CRUD, tags, import/export, deal adjustments |
| `routes/product.routes.ts` | Products CRUD, purchases (single/batch), purchase summary |
| `services/contact.service.ts` | Contact business logic, CSV import/export |

**Route mount:** `app.use('/', contactRoutes)` + `app.use('/', productRoutes)`

**Key endpoints:**
- `POST /contacts/import` — CSV import (up to 10K contacts)
- `GET /contacts/export` — CSV export (plan-gated)
- `POST /purchases/batch` — Multi-product order with proportional discount/surcharge
- `GET /purchases/summary` — Product sales analytics (qty, revenue, avg ticket)

---

### conversation-service (port 3006)

**Files:** 5 source files, ~1,388 lines

| File | Description |
|------|-------------|
| `routes/conversation.routes.ts` | Conversations, notes, quick replies, tasks, bulk ops, labels |
| `routes/pipeline.routes.ts` | Pipeline CRUD, columns, cards (Kanban board) |
| `routes/scheduling.routes.ts` | Scheduling config, appointments, available slots |
| `services/conversation.service.ts` | Conversation business logic, inbox queries |

**Route mount:** `app.use('/', conversationRoutes)` + `app.use('/', pipelineRoutes)` + `app.use('/', schedulingRoutes)`

**Key endpoints:**
- `GET /conversations` — Inbox with filters (status, channel, assigned, search)
- `GET /conversations/counts` — Status counts for sidebar badges
- `GET /conversations/pipeline` — Pipeline/Kanban board view
- `POST /conversations/bulk/read|close|assign|labels` — Bulk operations
- `GET /pipeline-cards` — Independent deal cards (not tied to conversations)
- `GET /appointments/available-slots` — Available scheduling slots with break/conflict detection

---

### campaign-service (port 3007)

**Files:** 8 source files, ~1,575 lines

| File | Description |
|------|-------------|
| `routes/campaign.routes.ts` | Campaign CRUD, template management, contact import |
| `services/campaign.service.ts` | Campaign creation, contact management |
| `workers/campaign.worker.ts` | BullMQ worker for sending campaign messages |
| `workers/inbox.worker.ts` | Inbound message routing to conversations |
| `workers/reconciliation.worker.ts` | Message status reconciliation |
| `workers/scheduler.worker.ts` | Scheduled campaign execution |
| `lib/email.ts` | Campaign notification emails |

**Route mount:** `app.use('/', campaignRoutes)`

**Key endpoints:**
- `POST /campaigns/:id/start` — Start campaign (queues messages via BullMQ)
- `POST /campaigns/:id/contacts/import` — Import contacts from CSV
- `POST /campaigns/:id/contacts/by-tag` — Add contacts by tag filter

---

## Frontend (Next.js 14+)

**Stack:** Next.js App Router, shadcn/ui, Zustand, Pusher, Supabase

### Pages

```
app/
├── page.tsx                    # Landing page
├── login/                      # Authentication
├── register/
├── forgot-password/
├── reset-password/
├── verify-email/
├── admin/                      # Super admin panel
├── form/[token]/               # External form (lead capture)
└── dashboard/
    ├── page.tsx                # Dashboard home
    ├── inbox/                  # Conversation inbox
    ├── contacts/               # CRM contacts
    ├── products/               # Product catalog
    ├── flows/                  # Flow builder
    │   └── [id]/               # Visual flow editor
    ├── automations/            # Keyword automations
    ├── campaigns/              # Mass messaging
    ├── templates/              # Message templates
    ├── pipeline/               # Kanban board
    ├── scheduling/             # Appointment scheduling
    ├── tasks/                  # Task management
    ├── channels/               # Channel management
    ├── team/                   # Team members
    └── settings/               # Tenant settings
```

### Key Libraries

| Directory | Files | Description |
|-----------|-------|-------------|
| `components/ui/` | 13 | shadcn/ui primitives (button, card, input, etc.) |
| `components/layout/` | 2 | Sidebar, TrialBanner |
| `lib/api.ts` | 1 | API client (all service calls) |
| `lib/i18n/` | 4 | Translations: pt-BR, en, es |
| `lib/pusher.ts` | 1 | Real-time event listener |
| `store/` | 4 | Zustand stores (auth, permissions, theme, unread) |
| `hooks/` | 1 | useNotifications |

---

## Database

- **Supabase** (PostgreSQL) for all data
- **Redis** (BullMQ) for job queues (campaigns, message sending, flow resume)
- **Supabase Storage** (bucket: `media`) for Evolution media files

### Migrations

```
packages/database/src/migrations/
├── 001_base_schema.sql       # Core tables (tenants, users, contacts, conversations, messages)
├── 002_functions.sql         # Database functions
├── 003_channels_messages.sql # Channels and message tables
├── 004_campaigns.sql         # Campaign tables
├── 005_fixes.sql             # Schema corrections
└── 006_webhook_token.sql     # Webhook token support
```

---

## Environment Variables

Required in all backend services:
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Supabase service role key
- `JWT_SECRET` — JWT signing secret
- `ENCRYPTION_KEY` — AES-256-GCM encryption key (channel credentials)
- `REDIS_URL` — Redis connection URL
- `CORS_ORIGIN` — Comma-separated allowed origins
- `INTERNAL_SECRET` — Service-to-service auth token

Service-specific:
- `PUSHER_*` — Real-time updates (all services that emit events)
- `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` — Google Calendar (tenant-service)
- `ASAAS_WEBHOOK_TOKEN` — Billing webhook auth (tenant-service)
- `SENTRY_DSN` — Error tracking (all services)
- `MESSAGE_SERVICE_URL` — Internal URL for message sending (message-service)

---

## Coding Standards

1. **Imports**: Always from `@autozap/utils`, never local duplicates
2. **Logging**: Use `logger` from utils, never `console.*`
3. **Errors**: Use `AppError` classes, handled by shared `errorHandler`
4. **Types**: Use `@autozap/types`, minimize `any` usage
5. **Responses**: Use `ok(data)` and `fail(code, message)` helpers
6. **i18n**: Translations in `apps/frontend/lib/i18n/` (pt-BR, en, es)
7. **Security**: Zod validation on all inputs, tenant isolation on all queries, timing-safe comparison for secrets
8. **Rate Limiting**: All services use `express-rate-limit` (120 req/min default)

## Deploy

- **Railway** — All services deployed as Docker containers
- **Pusher** — Real-time updates
- **Sentry** — Error tracking
- Push to `main` triggers automatic deploy on all services

## Project Stats

| Metric | Value |
|--------|-------|
| Backend services | 7 |
| Frontend pages | 25 |
| Total source files | 70+ |
| Total lines of code | ~16,000 (backend) |
| API endpoints | 180+ |
| Flow node types | 20+ |
| Supported languages | 3 (pt-BR, en, es) |
| Channel adapters | 4 (Gupshup, Evolution, Instagram, Messenger) |
