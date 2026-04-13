# AutoZap - Architecture Guide

## Overview
AutoZap is a multi-tenant WhatsApp CRM platform with flow automation, Google Calendar scheduling, campaign management, and multi-channel support (Gupshup + Evolution API).

## Monorepo Structure

```
autozap/
├── apps/
│   ├── frontend/          # Next.js (useautozap.app)
│   ├── auth-service/      # Authentication, JWT, 2FA (port 3001)
│   ├── tenant-service/    # Tenant management, billing, settings (port 3002)
│   ├── channel-service/   # WhatsApp adapters, webhooks (port 3003)
│   ├── message-service/   # Messages, flows, automations (port 3004)
│   ├── contact-service/   # CRM contacts, tags, import/export (port 3005)
│   ├── conversation-service/ # Inbox, conversations, pipeline (port 3006)
│   └── campaign-service/  # Mass messaging, scheduling (port 3007)
├── packages/
│   ├── utils/             # Shared: logger, db, crypto, middleware
│   ├── types/             # Shared TypeScript types
│   └── database/          # SQL migrations
```

## Shared Package (@autozap/utils)

All backend services import shared code from `@autozap/utils`:

```typescript
import { db, logger, requireAuth, requireRole, validate, errorHandler,
         encrypt, decrypt, encryptCredentials, decryptCredentials,
         ok, fail, AppError, generateId } from '@autozap/utils'
```

**Never create local lib/logger.ts, lib/db.ts, lib/crypto.ts, or middleware files in services.** Use the shared package.

## Channel Adapters

Two WhatsApp channel types supported:

| Feature | Gupshup (Official API) | Evolution (Unofficial API) |
|---------|----------------------|--------------------------|
| Buttons | Clickable buttons | Text with numbered options |
| Lists | Dropdown list | Text with numbered options |
| Media | Full support | Full support (via Supabase Storage) |
| Campaigns | curl templates | Direct message mode |
| Status | sent/delivered/read | sent/delivered/read |

The `EvolutionAdapter` automatically converts interactive messages to numbered text. The `GupshupAdapter` sends native WhatsApp buttons/lists.

## Flow Engine

Located at `apps/message-service/src/services/flow.engine.ts`. Handles:
- 20+ node types (send_message, condition, input, webhook, ai, schedule_appointment, etc.)
- Google Calendar integration (schedule, cancel, price tables)
- Evolution all-at-once mode (shows all days+times in one message)
- Number-to-title mapping (converts "1" → button title for Evolution)

## Database

- **Supabase** (PostgreSQL) for all data
- **Redis** (BullMQ) for job queues (campaigns, message sending, flow resume)
- **Supabase Storage** (bucket: `media`) for Evolution media files

## Environment Variables

Required in all backend services:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key
- `JWT_SECRET` - JWT signing secret
- `ENCRYPTION_KEY` - AES-256-GCM encryption key
- `REDIS_URL` - Redis connection URL

## Coding Standards

1. **Imports**: Always from `@autozap/utils`, never local duplicates
2. **Logging**: Use `logger` from utils, never `console.*`
3. **Errors**: Use `AppError` classes, handled by shared `errorHandler`
4. **Types**: Use `@autozap/types`, minimize `any` usage
5. **Responses**: Use `ok(data)` and `fail(code, message)` helpers
6. **i18n**: Translations in `apps/frontend/lib/i18n/` (pt-BR, en, es)

## Deploy

- **Railway** - All services deployed as Docker containers
- **Pusher** - Real-time updates
- **Sentry** - Error tracking
- Push to `main` triggers automatic deploy on all services
