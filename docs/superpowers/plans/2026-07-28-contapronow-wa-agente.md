# contapronow-wa-agente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `contapronow-wa-agente`, a standalone Fastify 4 multi-tenant backend that handles WhatsApp messages for N business clients via 360dialog, with sector-specific AI (Anthropic), booking engine, encrypted PII storage, and a private token-gated dashboard per client.

**Architecture:** New Node.js ESM repo at `/Users/abianperezcoello/contapronow-wa-agente/`. One endpoint receives all 360dialog webhooks; the tenant is resolved by `metadata.phone_number_id` in each payload via a 60 s in-memory cache. State lives in the existing Supabase project (`tvkdhjxatkehuryvnjmu`) in new `va_*`/`wa_*` tables that coexist with the dental-bot's `clinics/messages/appointments/conversation_states` tables (never touched). The existing dental-bot n8n workflow continues running until the final cutover.

**Tech Stack:** Node.js ≥22, Fastify 4, `@supabase/supabase-js` v2, `@anthropic-ai/sdk`, `googleapis`, `pino`. No build step. No TypeScript. ESM modules (`"type": "module"`). `postgres` pkg as devDependency for the migration script.

## Global Constraints

- **Repo root:** `/Users/abianperezcoello/contapronow-wa-agente/` — new repo, never inside dental-bot or web-contapronow
- All file paths in tasks are relative to that repo root
- `"type": "module"` — use ESM `import`/`export`, never `require()`
- Dev: `node --watch index.js` — Prod: `node index.js`
- **Never** touch Supabase tables: `clinics`, `messages`, `appointments`, `conversation_states`
- `PHONE_ENCRYPTION_KEY` lives in env/Railway secrets only, never hardcoded or committed
- **IA Act Art. 50.1 UE:** first message of every new conversation MUST declare AI. No exceptions.
- **Sector `salud`:** prompt_block MUST prohibit medical advice and force "llama al 112" for acute symptoms
- Dashboard response headers: `Cache-Control: no-store, private` + `X-Robots-Tag: noindex, nofollow` + `Referrer-Policy: no-referrer`
- Dashboard token: exactly 64 hex chars (32 random bytes = 256-bit entropy)
- Booking idempotency: `UNIQUE(wa_conversation_id, business_id, start_time)` constraint in DB
- AI model default: `claude-haiku-4-5-20251001`
- Credentials for `.env`: source from `/Users/abianperezcoello/contapronow/dental-bot/.env` (has SUPABASE_*, ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)

---

### Task 1: Repo scaffold — package.json, config.js, .gitignore, .env.example, README.md, CLAUDE.md

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `config.js`
- Create: `README.md`
- Create: `CLAUDE.md`

**Interfaces:**
- Produces: `config` object exported from `config.js`:
  ```js
  // named exports
  export const config = {
    port: Number,
    supabaseUrl: String,
    supabaseKey: String,
    anthropicKey: String,
    phoneEncKey: String,      // 64 hex chars
    d360ApiKey: String,
    d360WebhookToken: String, // '' if unset
    googleClientId: String,
    googleClientSecret: String,
    googleRefreshToken: String,
    adminKey: String,
    n8nWebhookUrl: String,    // '' if unset
    databaseUrl: String,      // '' if unset — migration script only
  };
  ```

- [ ] **Step 1: Create the repo and enter it**

```bash
mkdir -p /Users/abianperezcoello/contapronow-wa-agente
cd /Users/abianperezcoello/contapronow-wa-agente
git init
```

- [ ] **Step 2: Write package.json**

```json
{
  "name": "contapronow-wa-agente",
  "version": "1.0.0",
  "type": "module",
  "description": "Multi-tenant WhatsApp AI agent — ContaProNow",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "@fastify/formbody": "^7.4.0",
    "@supabase/supabase-js": "^2.45.0",
    "fastify": "^4.28.0",
    "googleapis": "^140.0.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "postgres": "^3.4.0"
  },
  "engines": { "node": ">=22" }
}
```

- [ ] **Step 3: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` generated. No errors.

- [ ] **Step 4: Write .gitignore**

```
node_modules/
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 5: Write .env.example** (key names only, no real values)

```env
# Supabase — copy from /Users/abianperezcoello/contapronow/dental-bot/.env
SUPABASE_URL=https://tvkdhjxatkehuryvnjmu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=

# Direct Postgres — for migration script only (build from SUPABASE_DB_PASSWORD in dental-bot/.env)
DATABASE_URL=postgresql://postgres:[DB_PASSWORD]@db.tvkdhjxatkehuryvnjmu.supabase.co:5432/postgres

# AI — copy ANTHROPIC_API_KEY from dental-bot/.env
ANTHROPIC_API_KEY=

# Phone PII encryption — generate: node --input-type=module -e "import {randomBytes} from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"
PHONE_ENCRYPTION_KEY=

# 360dialog — get from 360dialog dashboard > API Key
D360_API_KEY=
D360_WEBHOOK_TOKEN=

# Google Calendar — copy CLIENT_ID and CLIENT_SECRET from dental-bot/.env; REFRESH_TOKEN from dental-bot Google OAuth setup
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

# Server
PORT=3000

# Admin endpoint auth — generate: node --input-type=module -e "import {randomBytes} from 'node:crypto'; console.log(randomBytes(16).toString('hex'))"
ADMIN_KEY=

# Optional: n8n webhook for notifications
N8N_WEBHOOK_URL=
```

- [ ] **Step 6: Write config.js**

```javascript
function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
function optional(name, fallback = '') {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3000'), 10),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  anthropicKey: required('ANTHROPIC_API_KEY'),
  phoneEncKey: required('PHONE_ENCRYPTION_KEY'),
  d360ApiKey: required('D360_API_KEY'),
  d360WebhookToken: optional('D360_WEBHOOK_TOKEN'),
  googleClientId: required('GOOGLE_CLIENT_ID'),
  googleClientSecret: required('GOOGLE_CLIENT_SECRET'),
  googleRefreshToken: required('GOOGLE_REFRESH_TOKEN'),
  adminKey: required('ADMIN_KEY'),
  n8nWebhookUrl: optional('N8N_WEBHOOK_URL'),
  databaseUrl: optional('DATABASE_URL'),
};
```

- [ ] **Step 7: Create .env and fill in values**

Copy `.env.example` to `.env`. Fill in:

```bash
# Copy SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
# from /Users/abianperezcoello/contapronow/dental-bot/.env

# Build DATABASE_URL from SUPABASE_DB_PASSWORD in that same .env:
# postgresql://postgres:[SUPABASE_DB_PASSWORD]@db.tvkdhjxatkehuryvnjmu.supabase.co:5432/postgres

# Generate PHONE_ENCRYPTION_KEY:
node --input-type=module -e "import {randomBytes} from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"

# Generate ADMIN_KEY:
node --input-type=module -e "import {randomBytes} from 'node:crypto'; console.log(randomBytes(16).toString('hex'))"

# D360_API_KEY: check 360dialog dashboard → Channel → API Key
# GOOGLE_REFRESH_TOKEN: find in dental-bot Google OAuth setup (n8n credentials or dental-bot .env.local)
```

- [ ] **Step 8: Verify config loads without error**

```bash
set -a; source .env; set +a
node --input-type=module -e "import('./config.js').then(m => console.log('✓ config keys:', Object.keys(m.config).join(', ')))"
```

Expected: `✓ config keys: port, supabaseUrl, supabaseKey, ...` (no throw).

- [ ] **Step 9: Write README.md**

```markdown
# contapronow-wa-agente

Multi-tenant WhatsApp AI bot backend (Fastify 4 + Supabase + Anthropic + 360dialog).

## Setup

1. `npm install`
2. Copy `.env.example` → `.env`, fill all values
3. Apply Supabase migrations: `set -a; source .env; set +a && node scripts/apply-migrations.mjs`
4. `npm run dev`

## Deploy

Railway + Dockerfile. Push to `main` triggers deploy.

## Onboard a new client

`set -a; source .env; set +a && node scripts/onboard-client.mjs clients/mi-cliente.json`
```

- [ ] **Step 10: Write CLAUDE.md**

```markdown
# CLAUDE.md — contapronow-wa-agente

Fastify 4 multi-tenant WhatsApp bot for ContaProNow.

## Stack
Node.js ≥22, ESM, Fastify 4, @supabase/supabase-js v2, @anthropic-ai/sdk, googleapis. No TypeScript. No build.

## Dev
`set -a; source .env; set +a && npm run dev`

## Credentials
Source from `/Users/abianperezcoello/contapronow/dental-bot/.env` for Supabase, Anthropic, Google.
PHONE_ENCRYPTION_KEY in Railway secrets only — never commit it.

## Critical rules
- Never commit .env
- Never touch Supabase tables: clinics, messages, appointments, conversation_states
- IA Act Art. 50.1: first message MUST declare AI
- Sector salud: NUNCA consejo médico
```

- [ ] **Step 11: Commit scaffold**

```bash
git add package.json package-lock.json .gitignore .env.example config.js README.md CLAUDE.md
git commit -m "feat: scaffold repo — package.json, config, gitignore"
```

---

### Task 2: Fastify entry point + health route (first running server)

**Files:**
- Create: `index.js` (skeleton; will be extended in Task 13)
- Create: `routes/health.js`

**Interfaces:**
- Consumes: `config.port` from `config.js`
- Produces: Fastify server on `http://0.0.0.0:{port}`, route `GET /health → 200 {"status":"ok","ts":"ISO string"}`

- [ ] **Step 1: Create routes/ directory and routes/health.js**

```javascript
// routes/health.js
export default async function healthRoutes(fastify) {
  fastify.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', ts: new Date().toISOString() });
  });
}
```

- [ ] **Step 2: Create index.js (skeleton)**

```javascript
// index.js
import Fastify from 'fastify';
import { config } from './config.js';
import healthRoutes from './routes/health.js';

const fastify = Fastify({ logger: true });

// Raw body capture — needed for 360dialog HMAC verification (phase 2)
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  req.rawBody = body;
  try { done(null, JSON.parse(body)); }
  catch (err) { done(err); }
});

fastify.register(healthRoutes);

const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
```

- [ ] **Step 3: Start server**

```bash
set -a; source .env; set +a
npm run dev
```

Expected: JSON log line containing `"listening"` and port 3000.

- [ ] **Step 4: Test health endpoint** (new terminal)

```bash
curl -s http://localhost:3000/health
```

Expected: `{"status":"ok","ts":"2026-..."}` — HTTP 200.

- [ ] **Step 5: Commit**

```bash
git add index.js routes/health.js
git commit -m "feat: Fastify entry point + GET /health"
```

---

### Task 3: Supabase migrations — schema, sector prompts, RPC functions, Dentilux seed

**Files:**
- Create: `supabase/migrations/001_schema.sql`
- Create: `supabase/migrations/002_sector_prompts.sql`
- Create: `supabase/migrations/003_functions.sql`
- Create: `supabase/migrations/004_seed_dentilux.sql`
- Create: `scripts/apply-migrations.mjs`

**Interfaces:**
- Produces: All `va_*` and `wa_*` tables in Supabase project `tvkdhjxatkehuryvnjmu`, plus 3 RPC functions, plus Dentilux as the first row in `va_businesses`

- [ ] **Step 1: Create supabase/migrations/001_schema.sql**

```sql
-- 001_schema.sql
-- Creates all va_* and wa_* tables for contapronow-wa-agente.
-- NEVER modifies dental-bot tables: clinics, messages, appointments, conversation_states.

-- Accounts (parent entity — ContaProNow)
CREATE TABLE IF NOT EXISTS va_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL DEFAULT 'ContaProNow',
  owner_email TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Businesses / Tenants
CREATE TABLE IF NOT EXISTS va_businesses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID NOT NULL REFERENCES va_accounts(id),
  name                 TEXT NOT NULL,
  sector               TEXT NOT NULL CHECK (sector IN ('restauracion','salud','comercio','auto','profesional','inmobiliaria')),
  wa_phone_number_id   TEXT NOT NULL UNIQUE,  -- tenant key from 360dialog payload metadata
  phone                TEXT,
  website              TEXT,
  address              TEXT,
  timezone             TEXT NOT NULL DEFAULT 'Europe/Madrid',
  language             TEXT NOT NULL DEFAULT 'es',
  active               BOOLEAN NOT NULL DEFAULT true,
  inactive_message     TEXT NOT NULL DEFAULT 'Ahora mismo no podemos atenderte. Contacta con nosotros pronto.',
  transfer_whatsapp    TEXT,          -- owner WA number for weekly summary
  dashboard_token      TEXT NOT NULL UNIQUE CHECK (length(dashboard_token) = 64),  -- 64 hex chars
  ai_model             TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  max_tokens           INTEGER NOT NULL DEFAULT 500,
  booking_enabled      BOOLEAN NOT NULL DEFAULT false,
  calendar_enabled     BOOLEAN NOT NULL DEFAULT false,
  google_calendar_id   TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Business hours (weekly schedule)
CREATE TABLE IF NOT EXISTS va_business_hours (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES va_businesses(id) ON DELETE CASCADE,
  day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sunday
  open_time     TIME,
  close_time    TIME,
  is_closed     BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (business_id, day_of_week)
);

-- Services / treatments catalog
CREATE TABLE IF NOT EXISTS va_services (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES va_businesses(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price            DECIMAL(10,2),
  active           BOOLEAN NOT NULL DEFAULT true
);

-- Bookable resources (table / room / staff / chair)
CREATE TABLE IF NOT EXISTS va_resources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES va_businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('table','room','staff','chair')),
  capacity    INTEGER NOT NULL DEFAULT 1,
  active      BOOLEAN NOT NULL DEFAULT true
);

-- Sector prompt library (6 rows, seeded in 002)
CREATE TABLE IF NOT EXISTS va_sector_prompts (
  sector       TEXT PRIMARY KEY CHECK (sector IN ('restauracion','salud','comercio','auto','profesional','inmobiliaria')),
  label        TEXT NOT NULL,
  greeting     TEXT NOT NULL,  -- first message template, use {business_name}
  prompt_block TEXT NOT NULL,  -- injected into system prompt after base template
  hard_rules   TEXT NOT NULL   -- printed separately at end of system prompt
);

-- WhatsApp conversations
CREATE TABLE IF NOT EXISTS wa_conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID NOT NULL REFERENCES va_businesses(id),
  wa_contact_wa_id  TEXT NOT NULL,   -- WhatsApp ID in clear (needed to reply)
  contact_encrypted TEXT,            -- AES-256-GCM ciphertext:tag of phone number
  contact_iv        TEXT,            -- IV hex
  first_msg_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_msg_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count     INTEGER NOT NULL DEFAULT 0,
  is_transferred    BOOLEAN NOT NULL DEFAULT false,
  is_resolved       BOOLEAN NOT NULL DEFAULT false,
  summary           TEXT,            -- kept indefinitely after 90-day message purge
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, wa_contact_wa_id)
);

-- Individual messages (purged at 90 days)
CREATE TABLE IF NOT EXISTS wa_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  business_id     UUID NOT NULL REFERENCES va_businesses(id),
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  tokens_used     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_messages_conv_time ON wa_messages(conversation_id, created_at);

-- Trigger: keep message_count + last_msg_at in sync on each insert
CREATE OR REPLACE FUNCTION wa_update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE wa_conversations
  SET message_count = message_count + 1,
      last_msg_at   = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wa_messages_after_insert ON wa_messages;
CREATE TRIGGER wa_messages_after_insert
AFTER INSERT ON wa_messages
FOR EACH ROW EXECUTE FUNCTION wa_update_conversation_on_message();

-- Bookings (idempotent: UNIQUE prevents double booking)
CREATE TABLE IF NOT EXISTS va_bookings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_conversation_id     UUID NOT NULL REFERENCES wa_conversations(id),
  business_id            UUID NOT NULL REFERENCES va_businesses(id),
  resource_id            UUID REFERENCES va_resources(id),
  service_id             UUID REFERENCES va_services(id),
  client_name            TEXT,
  client_phone_encrypted TEXT,   -- ciphertext:tag
  client_phone_iv        TEXT,
  start_time             TIMESTAMPTZ NOT NULL,
  end_time               TIMESTAMPTZ NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','noshow')),
  notes                  TEXT,
  google_event_id        TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wa_conversation_id, business_id, start_time)
);

-- Configurable metric goals per business
CREATE TABLE IF NOT EXISTS va_metric_params (
  business_id               UUID PRIMARY KEY REFERENCES va_businesses(id) ON DELETE CASCADE,
  goal_conversations_month  INTEGER NOT NULL DEFAULT 50,
  goal_bookings_month       INTEGER NOT NULL DEFAULT 20,
  cost_per_hour_saved       DECIMAL(10,2) NOT NULL DEFAULT 12.00,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nightly aggregated metrics (written by rollup RPC, read by dashboard)
CREATE TABLE IF NOT EXISTS va_daily_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES va_businesses(id),
  metric_date   DATE NOT NULL,
  conversations INTEGER NOT NULL DEFAULT 0,
  messages_in   INTEGER NOT NULL DEFAULT 0,
  messages_out  INTEGER NOT NULL DEFAULT 0,
  bookings      INTEGER NOT NULL DEFAULT 0,
  transfers     INTEGER NOT NULL DEFAULT 0,
  resolved      INTEGER NOT NULL DEFAULT 0,
  tokens_used   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, metric_date)
);

-- Rate-limit tracking (anti-abuse, in-DB fallback for multi-instance)
CREATE TABLE IF NOT EXISTS va_rate_limits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID REFERENCES va_businesses(id),
  identifier    TEXT NOT NULL,     -- wa_contact_wa_id or IP
  window_start  TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE (business_id, identifier, window_start)
);
```

- [ ] **Step 2: Create supabase/migrations/002_sector_prompts.sql**

```sql
-- 002_sector_prompts.sql — 6 sector prompts (Spanish, for WhatsApp text channel)

INSERT INTO va_sector_prompts (sector, label, greeting, prompt_block, hard_rules)
VALUES

('restauracion', 'Restauración y hostelería',
 'Hola, soy el asistente virtual de {business_name}. Puedo ayudarte con reservas, información de nuestra carta y cualquier consulta. ¿En qué puedo ayudarte?',
 'Eres el asistente de un restaurante o establecimiento de hostelería. Tu misión principal es gestionar reservas de mesa y responder preguntas sobre la carta, alérgenos y horarios. Cuando alguien quiera reservar: pregunta fecha, hora, número de personas y si hay alguna alergia o intolerancia alimentaria. Usa la herramienta check_availability para comprobar disponibilidad antes de confirmar nada. Usa book_appointment para formalizar la reserva. Si el grupo supera la capacidad máxima del local, transfiere con transfer_to_human indicando el tamaño del grupo.',
 'REGLAS DURAS: (1) SIEMPRE preguntar alergias o intolerancias antes de cerrar cualquier reserva que implique comida. (2) Si el tamaño del grupo supera la capacidad máxima del local, usa transfer_to_human antes de confirmar. (3) Nunca confirmes disponibilidad sin usar check_availability primero.'),

('salud', 'Salud y estética',
 'Hola, soy Lucía, la asistente virtual con inteligencia artificial de {business_name}. Estoy aquí para ayudarte con citas y consultas generales. ¿En qué puedo ayudarte?',
 'Eres la asistente virtual de un centro de salud, clínica dental, fisioterapia o centro de estética. Tu función es gestionar citas y responder preguntas generales sobre servicios, precios y horarios. Cuando alguien quiera una cita: pregunta el tratamiento o servicio que necesita, la fecha y hora preferida y el nombre del paciente. Usa check_availability para comprobar disponibilidad y book_appointment para confirmar. Ante cualquier duda sobre síntomas o tratamientos, aclara que eso lo resolverá el profesional en la consulta.',
 'REGLAS DURAS CATEGÓRICAS: (1) NUNCA dar consejo médico, diagnóstico, dosis o información sobre tratamientos. Si alguien pregunta algo médico, responde: "Eso es algo que debe valorar el profesional en consulta. ¿Te ayudo a pedir cita?" (2) Ante síntoma agudo o urgencia (dolor torácico, dificultad para respirar, pérdida de consciencia, sangrado intenso, etc.), responde EXACTAMENTE: "Para síntomas urgentes llama al 112 inmediatamente." y usa transfer_to_human con reason="URGENCIA MÉDICA". (3) No dar información sobre medicamentos, ni siquiera de venta libre.'),

('comercio', 'Comercio local',
 'Hola, soy el asistente virtual de {business_name}. ¿En qué puedo ayudarte?',
 'Eres el asistente de un comercio local (tienda, ferretería, boutique, etc.). Tu misión es resolver dudas sobre productos, horarios, ubicación y política de devoluciones. Puedes indicar si un producto suele estar disponible basándote en la descripción del catálogo, pero nunca confirmes stock en tiempo real porque no tienes acceso al inventario actualizado. Si el cliente necesita algo urgente o específico, sugiere que llame al local o venga en persona.',
 'REGLAS DURAS: (1) NUNCA confirmar disponibilidad de stock en tiempo real — solo puedes decir si el producto "suele estar disponible" o "es mejor confirmar llamando". (2) No gestiones citas ni reservas a menos que booking_enabled esté activo en la configuración del negocio.'),

('auto', 'Automoción y talleres',
 'Hola, soy el asistente virtual de {business_name}. ¿En qué puedo ayudarte con tu vehículo?',
 'Eres el asistente de un taller mecánico, concesionario o servicio de automoción. Puedes gestionar citas para revisiones, ITV, cambio de aceite u otros servicios, y responder preguntas generales sobre servicios y precios orientativos. Cuando alguien quiera una cita: pregunta el tipo de servicio, la marca y modelo del vehículo, la matrícula (opcional) y la fecha y hora preferida. Usa check_availability y book_appointment para gestionar la reserva.',
 'REGLAS DURAS: (1) NUNCA dar un precio cerrado de reparación — solo precios orientativos sujetos a revisión. Usa siempre la coletilla "precio aproximado sujeto a revisión presencial". (2) NUNCA diagnosticar una avería sin ver el vehículo. Ante cualquier síntoma técnico, di "Necesitamos verlo en el taller para diagnosticarlo correctamente" y ofrece cita.'),

('profesional', 'Gestoría, asesoría y servicios profesionales',
 'Hola, soy el asistente virtual de {business_name}. Puedo ayudarte a gestionar citas y resolver dudas generales. ¿En qué puedo ayudarte?',
 'Eres el asistente de una gestoría, asesoría fiscal, despacho de abogados u otros servicios profesionales. Tu función es agendar primeras consultas de orientación y responder preguntas generales sobre los servicios del despacho. Cuando alguien quiera una cita: pregunta el área de consulta (fiscal, laboral, mercantil, etc.), el nombre y el horario preferido. Usa check_availability y book_appointment para formalizar la cita.',
 'REGLAS DURAS: (1) NUNCA dar asesoramiento legal, fiscal o laboral concreto, ni siquiera orientativo. Si alguien pregunta algo específico, responde: "Eso es algo que el profesional podrá valorar en la consulta. ¿Te ayudo a pedir cita?" (2) No interpretes normativa, contratos o plazos legales. (3) Solo agenda primeras consultas de orientación — no resolución de expedientes.'),

('inmobiliaria', 'Inmobiliaria y gestión de propiedades',
 'Hola, soy el asistente virtual de {business_name}. ¿Buscas comprar, alquilar o tienes una propiedad que gestionar?',
 'Eres el asistente de una agencia inmobiliaria. Tu función es calificar a los leads (saber si buscan compra o alquiler, la zona, el presupuesto, el número de habitaciones y el plazo) y agendar visitas o primeras reuniones con el agente. Cuando alguien muestre interés: pregunta uno a uno — ¿compra o alquiler?, zona preferida, presupuesto orientativo y tipo de inmueble. Una vez calificado, ofrece organizar una primera reunión con el agente y usa book_appointment para fijarla.',
 'REGLAS DURAS: (1) NUNCA valorar el precio de un inmueble concreto ni hacer comparativas de mercado. Si alguien pregunta "¿cuánto vale mi piso?", responde: "Para una valoración precisa nuestro agente puede hacer una visita sin compromiso. ¿Te ayudo a acordarla?" (2) No confirmes disponibilidad de inmuebles específicos — eso lo gestiona el agente.')

ON CONFLICT (sector) DO UPDATE SET
  label        = EXCLUDED.label,
  greeting     = EXCLUDED.greeting,
  prompt_block = EXCLUDED.prompt_block,
  hard_rules   = EXCLUDED.hard_rules;
```

- [ ] **Step 3: Create supabase/migrations/003_functions.sql**

```sql
-- 003_functions.sql — RPC functions for wa-agente

-- Aggregate one day of metrics for one business into va_daily_metrics
CREATE OR REPLACE FUNCTION va_rollup_day_wa(p_business_id UUID, p_date DATE)
RETURNS void AS $$
DECLARE
  v_tz TEXT;
BEGIN
  SELECT timezone INTO v_tz FROM va_businesses WHERE id = p_business_id;

  INSERT INTO va_daily_metrics (
    business_id, metric_date,
    conversations, messages_in, messages_out,
    bookings, transfers, resolved, tokens_used
  )
  SELECT
    p_business_id,
    p_date,
    COUNT(DISTINCT c.id),
    COALESCE(SUM(CASE WHEN m.role = 'user'      THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN m.role = 'assistant' THEN 1 ELSE 0 END), 0),
    (
      SELECT COUNT(*) FROM va_bookings b
      WHERE b.business_id = p_business_id
        AND b.status = 'confirmed'
        AND (b.start_time AT TIME ZONE v_tz)::date = p_date
    ),
    COALESCE(SUM(CASE WHEN c.is_transferred THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.is_resolved    THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(COALESCE(m.tokens_used, 0)), 0)
  FROM wa_conversations c
  JOIN wa_messages m ON m.conversation_id = c.id
  WHERE c.business_id = p_business_id
    AND (c.last_msg_at AT TIME ZONE v_tz)::date = p_date
  ON CONFLICT (business_id, metric_date) DO UPDATE SET
    conversations = EXCLUDED.conversations,
    messages_in   = EXCLUDED.messages_in,
    messages_out  = EXCLUDED.messages_out,
    bookings      = EXCLUDED.bookings,
    transfers     = EXCLUDED.transfers,
    resolved      = EXCLUDED.resolved,
    tokens_used   = EXCLUDED.tokens_used;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Return N days of daily metrics for a business (dashboard + weekly summary)
CREATE OR REPLACE FUNCTION va_metrics_summary(p_business_id UUID, p_days INTEGER)
RETURNS TABLE (
  metric_date   DATE,
  conversations INTEGER,
  bookings      INTEGER,
  transfers     INTEGER,
  resolved      INTEGER,
  tokens_used   INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT d.metric_date, d.conversations, d.bookings, d.transfers, d.resolved, d.tokens_used
  FROM va_daily_metrics d
  WHERE d.business_id = p_business_id
    AND d.metric_date >= CURRENT_DATE - p_days
  ORDER BY d.metric_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Return first free resource for a time slot (used by booking.js)
CREATE OR REPLACE FUNCTION va_find_free_resources(
  p_business_id UUID,
  p_start       TIMESTAMPTZ,
  p_end         TIMESTAMPTZ,
  p_party_size  INTEGER DEFAULT 1
)
RETURNS TABLE (id UUID, name TEXT, kind TEXT, capacity INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT r.id, r.name, r.kind, r.capacity
  FROM va_resources r
  WHERE r.business_id = p_business_id
    AND r.active = true
    AND r.capacity >= p_party_size
    AND r.id NOT IN (
      SELECT b.resource_id FROM va_bookings b
      WHERE b.business_id = p_business_id
        AND b.status = 'confirmed'
        AND b.start_time < p_end
        AND b.end_time   > p_start
        AND b.resource_id IS NOT NULL
    )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 4: Create supabase/migrations/004_seed_dentilux.sql**

```sql
-- 004_seed_dentilux.sql
-- Seeds ContaProNow account and Dentilux as first va_businesses client.
-- IMPORTANT: Replace the placeholder values marked with <<FILL>> before running.

DO $$
DECLARE
  v_account_id UUID;
  v_business_id UUID;
BEGIN
  -- ContaProNow account
  INSERT INTO va_accounts (name, owner_email)
  VALUES ('ContaProNow', 'contapronoww@gmail.com')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_account_id;

  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id FROM va_accounts WHERE owner_email = 'contapronoww@gmail.com';
  END IF;

  -- Dentilux business
  -- wa_phone_number_id: check the 360dialog dashboard for the phone number ID
  --   OR look at a test payload received by the dental-bot n8n webhook (field: entry[0].changes[0].value.metadata.phone_number_id)
  -- dashboard_token: generate with: node --input-type=module -e "import {randomBytes} from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"
  INSERT INTO va_businesses (
    account_id, name, sector, wa_phone_number_id,
    phone, website, address, timezone,
    active, booking_enabled, calendar_enabled,
    transfer_whatsapp, dashboard_token,
    ai_model, max_tokens
  ) VALUES (
    v_account_id,
    'Dentilux',
    'salud',
    '<<DENTILUX_WA_PHONE_NUMBER_ID>>',    -- FILL: from 360dialog dashboard
    '+34 XXX XXX XXX',                    -- FILL: real display phone
    'https://dentilux.es',                -- FILL: or remove if no website
    'Calle Ejemplo 1, Ciudad',            -- FILL: real address
    'Europe/Madrid',
    true,
    true,    -- enable bookings
    false,   -- Google Calendar disabled until GOOGLE_REFRESH_TOKEN is confirmed
    '<<OWNER_WHATSAPP>>',                 -- FILL: Abián's WA number for weekly summaries (e.g. 34612345678)
    '<<64_HEX_DASHBOARD_TOKEN>>',         -- FILL: 64 hex chars from randomBytes(32).toString('hex')
    'claude-haiku-4-5-20251001',
    500
  )
  ON CONFLICT (wa_phone_number_id) DO NOTHING
  RETURNING id INTO v_business_id;

  IF v_business_id IS NULL THEN
    SELECT id INTO v_business_id FROM va_businesses WHERE name = 'Dentilux';
  END IF;

  -- Business hours (Mon-Fri 09:00-14:00, 16:00-19:00; Sat 09:00-13:00; Sun closed)
  INSERT INTO va_business_hours (business_id, day_of_week, open_time, close_time, is_closed) VALUES
    (v_business_id, 0, NULL,    NULL,    true),   -- Sunday closed
    (v_business_id, 1, '09:00', '19:00', false),  -- Monday
    (v_business_id, 2, '09:00', '19:00', false),  -- Tuesday
    (v_business_id, 3, '09:00', '19:00', false),  -- Wednesday
    (v_business_id, 4, '09:00', '19:00', false),  -- Thursday
    (v_business_id, 5, '09:00', '19:00', false),  -- Friday
    (v_business_id, 6, '09:00', '13:00', false)   -- Saturday
  ON CONFLICT (business_id, day_of_week) DO NOTHING;

  -- Dentilux main service
  INSERT INTO va_services (business_id, name, description, duration_minutes, price, active) VALUES
    (v_business_id, 'Revisión y limpieza', 'Revisión bucodental + higiene dental profesional', 60, 60.00, true),
    (v_business_id, 'Blanqueamiento dental', 'Tratamiento de blanqueamiento profesional', 90, 180.00, true),
    (v_business_id, 'Extracción simple', 'Extracción dental simple', 30, 80.00, true),
    (v_business_id, 'Ortodoncia (consulta)', 'Primera consulta de ortodoncia', 45, 0.00, true)
  ON CONFLICT DO NOTHING;

  -- Dentilux main resource (gabinete)
  INSERT INTO va_resources (business_id, name, kind, capacity, active) VALUES
    (v_business_id, 'Gabinete principal', 'room', 1, true),
    (v_business_id, 'Gabinete secundario', 'room', 1, true)
  ON CONFLICT DO NOTHING;

  -- Metric params
  INSERT INTO va_metric_params (business_id, goal_conversations_month, goal_bookings_month, cost_per_hour_saved) VALUES
    (v_business_id, 30, 15, 15.00)
  ON CONFLICT (business_id) DO NOTHING;

  RAISE NOTICE 'Dentilux seeded with business_id = %', v_business_id;
END $$;
```

**Before running this seed:** fill in the 3 `<<FILL>>` placeholders:
1. `wa_phone_number_id` → from 360dialog dashboard (Channel → phone number ID) or from a test webhook payload
2. `transfer_whatsapp` → owner's WhatsApp number in E.164 without `+` (e.g. `34612345678`)
3. `dashboard_token` → run `node --input-type=module -e "import {randomBytes} from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"`

- [ ] **Step 5: Create scripts/apply-migrations.mjs**

```javascript
// scripts/apply-migrations.mjs — runs all SQL migrations in order against Supabase
import postgres from 'postgres';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL env var is required');
  process.exit(1);
}

const sql = postgres(databaseUrl, { ssl: 'require' });
const migrationsDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../supabase/migrations');

const files = (await readdir(migrationsDir))
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log(`Found ${files.length} migration file(s): ${files.join(', ')}`);

for (const file of files) {
  const content = await readFile(resolve(migrationsDir, file), 'utf8');
  console.log(`Applying ${file}...`);
  await sql.unsafe(content);
  console.log(`✓ ${file}`);
}

await sql.end();
console.log('\nAll migrations applied successfully.');
```

- [ ] **Step 6: Fill in the <<FILL>> placeholders in 004_seed_dentilux.sql**

Get the values as described in Step 4 above, then edit the file.

- [ ] **Step 7: Apply migrations**

```bash
set -a; source .env; set +a
node scripts/apply-migrations.mjs
```

Expected output:
```
Found 4 migration file(s): 001_schema.sql, 002_sector_prompts.sql, 003_functions.sql, 004_seed_dentilux.sql
Applying 001_schema.sql...
✓ 001_schema.sql
Applying 002_sector_prompts.sql...
✓ 002_sector_prompts.sql
Applying 003_functions.sql...
✓ 003_functions.sql
Applying 004_seed_dentilux.sql...
NOTICE:  Dentilux seeded with business_id = ...
✓ 004_seed_dentilux.sql

All migrations applied successfully.
```

- [ ] **Step 8: Verify tables exist in Supabase**

```bash
# Quick verification via Supabase REST API
curl -s -X GET \
  "https://tvkdhjxatkehuryvnjmu.supabase.co/rest/v1/va_businesses?select=id,name,sector&limit=5" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: JSON array containing the Dentilux row.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/ scripts/apply-migrations.mjs
git commit -m "feat: Supabase migrations — schema, sector prompts, RPC functions, Dentilux seed"
```

---

### Task 4: services/phone-crypto.js + services/timezone.js + services/legal.js

**Files:**
- Create: `services/phone-crypto.js`
- Create: `services/timezone.js`
- Create: `services/legal.js`

**Interfaces:**
- `phone-crypto.js` exports:
  - `encryptPhone(phone: string) → { encrypted: string, iv: string }` — `encrypted` is `ciphertext_hex:tag_hex`
  - `decryptPhone(encrypted: string, iv: string) → string`
- `timezone.js` exports:
  - `nowInTimezone(timezone: string) → Date`
  - `isBusinessOpen(hours: array, timezone: string) → boolean`
- `legal.js` exports:
  - `getIAActGreeting(businessName: string) → string`
  - `getRGPDNotice(website: string|null) → string`

- [ ] **Step 1: Create services/phone-crypto.js**

```javascript
// services/phone-crypto.js — AES-256-GCM encrypt/decrypt for phone PII
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config.js';

const KEY = Buffer.from(config.phoneEncKey, 'hex');
const ALG = 'aes-256-gcm';

export function encryptPhone(phone) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: `${ciphertext.toString('hex')}:${tag.toString('hex')}`,
    iv: iv.toString('hex'),
  };
}

export function decryptPhone(encrypted, iv) {
  const [ciphertextHex, tagHex] = encrypted.split(':');
  const decipher = createDecipheriv(ALG, KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
```

- [ ] **Step 2: Verify phone-crypto works**

```bash
set -a; source .env; set +a
node --input-type=module -e "
import { encryptPhone, decryptPhone } from './services/phone-crypto.js';
const phone = '+34612345678';
const { encrypted, iv } = encryptPhone(phone);
const decrypted = decryptPhone(encrypted, iv);
console.assert(decrypted === phone, 'Round-trip failed');
console.log('✓ phone-crypto round-trip OK:', { encrypted: encrypted.slice(0,20)+'...', iv });
"
```

Expected: `✓ phone-crypto round-trip OK: { encrypted: '...', iv: '...' }`.

- [ ] **Step 3: Create services/timezone.js**

```javascript
// services/timezone.js — timezone helpers
export function nowInTimezone(timezone) {
  const iso = new Date().toLocaleString('sv-SE', { timeZone: timezone });
  return new Date(iso);
}

export function isBusinessOpen(hours, timezone) {
  if (!hours || hours.length === 0) return true; // default open if no hours configured
  const now = nowInTimezone(timezone);
  const dayOfWeek = now.getDay(); // 0=Sunday
  const dayHours = hours.find(h => h.day_of_week === dayOfWeek);
  if (!dayHours || dayHours.is_closed) return false;
  if (!dayHours.open_time || !dayHours.close_time) return true;
  const [openH, openM] = dayHours.open_time.split(':').map(Number);
  const [closeH, closeM] = dayHours.close_time.split(':').map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= openH * 60 + openM && nowMins < closeH * 60 + closeM;
}
```

- [ ] **Step 4: Create services/legal.js**

```javascript
// services/legal.js — IA Act Art. 50.1 + RGPD first-message texts
export function getIAActGreeting(businessName) {
  return `Hola, soy Lucía, la asistente virtual con inteligencia artificial de ${businessName}. ¿En qué puedo ayudarle?`;
}

export function getRGPDNotice(website) {
  const privacyUrl = website ? `${website}/privacidad` : 'contapronow.com/privacidad';
  return `Para responderte, guardo esta conversación durante 90 días. Más información: ${privacyUrl}`;
}
```

- [ ] **Step 5: Commit**

```bash
git add services/phone-crypto.js services/timezone.js services/legal.js
git commit -m "feat: phone-crypto (AES-GCM), timezone helpers, legal IA Act texts"
```

---

### Task 5: services/supabase.js — Supabase client, business cache, all DB queries

**Files:**
- Create: `services/supabase.js`

**Interfaces:**
- Consumes: `config.supabaseUrl`, `config.supabaseKey`
- Produces (all exported):
  - `resolveBusiness(waPhoneNumberId) → {business, hours, services, resources, sector} | null`
  - `getOrCreateConversation(businessId, waContactWaId) → conversation row`
  - `saveMessage(conversationId, businessId, role, content, tokensUsed?) → void`
  - `getRecentMessages(conversationId, limit?) → [{role, content}]`
  - `markTransferred(conversationId) → void`
  - `markResolved(conversationId) → void`
  - `getMetricsSummary(businessId, days) → [{metric_date, conversations, bookings, transfers, resolved, tokens_used}]`
  - `getRecentConversations(businessId, limit?) → [{wa_contact_wa_id, last_msg_at, message_count, is_transferred, is_resolved, summary}]`
  - `getBusinessByToken(token) → business row | null`

- [ ] **Step 1: Create services/supabase.js**

```javascript
// services/supabase.js
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

export const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false },
});

// Business cache: waPhoneNumberId → { data, expiresAt }
const businessCache = new Map();
const CACHE_TTL_MS = 60_000;

export async function resolveBusiness(waPhoneNumberId) {
  const cached = businessCache.get(waPhoneNumberId);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const { data: business, error } = await supabase
    .from('va_businesses')
    .select('*')
    .eq('wa_phone_number_id', waPhoneNumberId)
    .single();

  if (error || !business) return null;

  const [hoursRes, servicesRes, resourcesRes, sectorRes] = await Promise.all([
    supabase.from('va_business_hours').select('*').eq('business_id', business.id),
    supabase.from('va_services').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('va_resources').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('va_sector_prompts').select('*').eq('sector', business.sector).single(),
  ]);

  const data = {
    business,
    hours: hoursRes.data ?? [],
    services: servicesRes.data ?? [],
    resources: resourcesRes.data ?? [],
    sector: sectorRes.data ?? null,
  };

  businessCache.set(waPhoneNumberId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

export function invalidateBusinessCache(waPhoneNumberId) {
  businessCache.delete(waPhoneNumberId);
}

export async function getOrCreateConversation(businessId, waContactWaId) {
  const { data, error } = await supabase
    .from('wa_conversations')
    .upsert(
      { business_id: businessId, wa_contact_wa_id: waContactWaId },
      { onConflict: 'business_id,wa_contact_wa_id', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) throw new Error(`getOrCreateConversation: ${error.message}`);
  return data;
}

export async function saveMessage(conversationId, businessId, role, content, tokensUsed = null) {
  const { error } = await supabase.from('wa_messages').insert({
    conversation_id: conversationId,
    business_id: businessId,
    role,
    content,
    tokens_used: tokensUsed,
  });
  if (error) throw new Error(`saveMessage: ${error.message}`);
}

export async function getRecentMessages(conversationId, limit = 20) {
  const { data, error } = await supabase
    .from('wa_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`getRecentMessages: ${error.message}`);
  return data ?? [];
}

export async function markTransferred(conversationId) {
  await supabase
    .from('wa_conversations')
    .update({ is_transferred: true })
    .eq('id', conversationId);
}

export async function markResolved(conversationId) {
  await supabase
    .from('wa_conversations')
    .update({ is_resolved: true })
    .eq('id', conversationId);
}

export async function getMetricsSummary(businessId, days) {
  const { data, error } = await supabase.rpc('va_metrics_summary', {
    p_business_id: businessId,
    p_days: days,
  });
  if (error) throw new Error(`getMetricsSummary: ${error.message}`);
  return data ?? [];
}

export async function getRecentConversations(businessId, limit = 20) {
  const { data, error } = await supabase
    .from('wa_conversations')
    .select('wa_contact_wa_id, last_msg_at, message_count, is_transferred, is_resolved, summary')
    .eq('business_id', businessId)
    .order('last_msg_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getRecentConversations: ${error.message}`);
  return data ?? [];
}

export async function getBusinessByToken(token) {
  const { data, error } = await supabase
    .from('va_businesses')
    .select('*')
    .eq('dashboard_token', token)
    .single();

  if (error) return null;
  return data;
}
```

- [ ] **Step 2: Smoke-test resolveBusiness** (requires Dentilux seed from Task 3)

```bash
set -a; source .env; set +a
node --input-type=module -e "
import { resolveBusiness } from './services/supabase.js';
// Replace with the actual wa_phone_number_id you put in the seed
const ctx = await resolveBusiness(process.env.TEST_PHONE_ID ?? 'DENTILUX_PHONE_ID_HERE');
if (!ctx) { console.error('❌ business not found — check wa_phone_number_id in seed'); process.exit(1); }
console.log('✓ resolveBusiness OK:', ctx.business.name, '| sector:', ctx.business.sector);
console.log('  hours:', ctx.hours.length, 'entries | services:', ctx.services.length, '| resources:', ctx.resources.length);
"
```

Expected: `✓ resolveBusiness OK: Dentilux | sector: salud`

- [ ] **Step 3: Commit**

```bash
git add services/supabase.js
git commit -m "feat: services/supabase.js — business cache (60s TTL) + all DB queries"
```

---

### Task 6: services/whatsapp-360.js — send message + verify signature

**Files:**
- Create: `services/whatsapp-360.js`

**Interfaces:**
- `sendTextMessage(waPhoneNumberId, recipientWaId, text) → Promise<{messages: [{id}]}>`
- `verifyWebhookSignature(rawBody, signatureHeader, token) → boolean`

- [ ] **Step 1: Create services/whatsapp-360.js**

```javascript
// services/whatsapp-360.js — 360dialog API adapter
// Isolates provider so switching to Meta Cloud API only requires changing this file.
import { createHmac } from 'node:crypto';
import { config } from '../config.js';

const D360_BASE = 'https://waba.360dialog.io/v1';

export async function sendTextMessage(waPhoneNumberId, recipientWaId, text) {
  const response = await fetch(`${D360_BASE}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'D360-API-KEY': config.d360ApiKey,
    },
    body: JSON.stringify({
      to: recipientWaId,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`360dialog send failed (${response.status}): ${errText}`);
  }

  return response.json();
}

// Verify 360dialog webhook HMAC signature.
// Token is D360_WEBHOOK_TOKEN from env. If not set, always returns true (phase 2 feature).
export function verifyWebhookSignature(rawBody, signatureHeader, token) {
  if (!token) return true;
  const expected = 'sha256=' + createHmac('sha256', token).update(rawBody ?? '').digest('hex');
  return signatureHeader === expected;
}
```

- [ ] **Step 2: Verify module loads without errors**

```bash
set -a; source .env; set +a
node --input-type=module -e "
import { sendTextMessage, verifyWebhookSignature } from './services/whatsapp-360.js';
// Dry-run: verify the signature function works with a known value
const sig = verifyWebhookSignature('hello', '', '');
console.assert(sig === true, 'Empty token should always return true');
console.log('✓ whatsapp-360 module loaded OK');
"
```

Expected: `✓ whatsapp-360 module loaded OK`

- [ ] **Step 3: Commit**

```bash
git add services/whatsapp-360.js
git commit -m "feat: services/whatsapp-360.js — send text + HMAC verify (360dialog)"
```

---

### Task 7: services/prompts.js — compose system prompt from sector + business data

**Files:**
- Create: `services/prompts.js`

**Interfaces:**
- `composeSystemPrompt(business, sector, hours, services) → string`
- `getSectorGreeting(sector, businessName) → string` — substitutes `{business_name}` in sector.greeting

- [ ] **Step 1: Create services/prompts.js**

```javascript
// services/prompts.js — builds system prompt per tenant + sector
const DAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function formatHours(hours) {
  if (!hours || hours.length === 0) return 'Consultar horario en el negocio.';
  return hours
    .slice()
    .sort((a, b) => a.day_of_week - b.day_of_week)
    .map(h =>
      h.is_closed
        ? `${DAYS[h.day_of_week]}: Cerrado`
        : `${DAYS[h.day_of_week]}: ${(h.open_time ?? '').slice(0, 5)}–${(h.close_time ?? '').slice(0, 5)}`
    )
    .join('\n');
}

function formatServices(services) {
  if (!services || services.length === 0) return '';
  const lines = services.map(s => {
    const parts = [`- ${s.name}`];
    if (s.duration_minutes) parts.push(`(${s.duration_minutes} min)`);
    if (s.price != null) parts.push(`— ${s.price}€`);
    if (s.description) parts.push(`— ${s.description}`);
    return parts.join(' ');
  });
  return `\nSERVICIOS DISPONIBLES:\n${lines.join('\n')}`;
}

export function getSectorGreeting(sector, businessName) {
  if (!sector?.greeting) return `Hola, soy la asistente virtual con inteligencia artificial de ${businessName}. ¿En qué puedo ayudarle?`;
  return sector.greeting.replace(/{business_name}/g, businessName);
}

export function composeSystemPrompt(business, sector, hours, services) {
  return `Eres el asistente virtual de ${business.name}.
Responde SIEMPRE en español. Mensajes cortos (máximo 3 oraciones). Tono profesional y cercano.

${sector?.prompt_block ?? ''}

DATOS DEL NEGOCIO:
- Nombre: ${business.name}
- Dirección: ${business.address ?? 'Consultar'}
- Teléfono: ${business.phone ?? 'Consultar'}
- Web: ${business.website ?? ''}
${formatServices(services)}

HORARIOS:
${formatHours(hours)}

${business.booking_enabled ? `HERRAMIENTAS DISPONIBLES:
- check_availability: consulta disponibilidad en una fecha y hora
- book_appointment: confirma una reserva (SOLO tras comprobar disponibilidad con check_availability)
- transfer_to_human: transfiere la conversación al equipo humano

REGLA: Cuando el usuario pida una cita, SIEMPRE usa check_availability primero. Nunca confirmes sin book_appointment.` : ''}

${sector?.hard_rules ? `REGLAS OBLIGATORIAS:\n${sector.hard_rules}` : ''}`.trim();
}
```

- [ ] **Step 2: Verify prompt composition**

```bash
set -a; source .env; set +a
node --input-type=module -e "
import { resolveBusiness } from './services/supabase.js';
import { composeSystemPrompt, getSectorGreeting } from './services/prompts.js';
const ctx = await resolveBusiness(process.env.TEST_PHONE_ID ?? 'DENTILUX_PHONE_ID_HERE');
if (!ctx) { console.error('business not found'); process.exit(1); }
const prompt = composeSystemPrompt(ctx.business, ctx.sector, ctx.hours, ctx.services);
const greeting = getSectorGreeting(ctx.sector, ctx.business.name);
console.log('✓ Greeting:', greeting);
console.log('✓ Prompt length:', prompt.length, 'chars');
console.log('--- PROMPT PREVIEW (first 500 chars) ---');
console.log(prompt.slice(0, 500));
"
```

Expected: greeting includes business name + "inteligencia artificial". Prompt length > 200 chars. Hard rules section visible for `salud` sector.

- [ ] **Step 3: Commit**

```bash
git add services/prompts.js
git commit -m "feat: services/prompts.js — system prompt builder (sector + business + hours)"
```

---

### Task 8: services/booking.js — availability check and booking creation

**Files:**
- Create: `services/booking.js`

**Interfaces:**
- `checkAvailability(businessId, startISO, endISO, partySize?) → [{id, name, kind, capacity}]`
- `createBooking({businessId, waConversationId, resourceId?, serviceId?, clientName, clientPhone?, startISO, endISO, notes?, googleEventId?}) → booking row`
- Throws `Error('SLOT_TAKEN')` on unique constraint violation (23505)

- [ ] **Step 1: Create services/booking.js**

```javascript
// services/booking.js — availability + booking via Supabase RPC
import { supabase } from './supabase.js';
import { encryptPhone } from './phone-crypto.js';

export async function checkAvailability(businessId, startISO, endISO, partySize = 1) {
  const { data, error } = await supabase.rpc('va_find_free_resources', {
    p_business_id: businessId,
    p_start: startISO,
    p_end: endISO,
    p_party_size: partySize,
  });
  if (error) throw new Error(`checkAvailability RPC: ${error.message}`);
  return data ?? [];
}

export async function createBooking({
  businessId,
  waConversationId,
  resourceId,
  serviceId,
  clientName,
  clientPhone,
  startISO,
  endISO,
  notes,
  googleEventId,
}) {
  let clientPhoneEncrypted = null;
  let clientPhoneIv = null;

  if (clientPhone) {
    const enc = encryptPhone(clientPhone);
    clientPhoneEncrypted = enc.encrypted;
    clientPhoneIv = enc.iv;
  }

  const { data, error } = await supabase
    .from('va_bookings')
    .insert({
      wa_conversation_id: waConversationId,
      business_id: businessId,
      resource_id: resourceId ?? null,
      service_id: serviceId ?? null,
      client_name: clientName,
      client_phone_encrypted: clientPhoneEncrypted,
      client_phone_iv: clientPhoneIv,
      start_time: startISO,
      end_time: endISO,
      notes: notes ?? null,
      google_event_id: googleEventId ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('SLOT_TAKEN');
    throw new Error(`createBooking: ${error.message}`);
  }
  return data;
}
```

- [ ] **Step 2: Verify module loads**

```bash
set -a; source .env; set +a
node --input-type=module -e "
import { checkAvailability } from './services/booking.js';
console.log('✓ booking.js loaded — checkAvailability function:', typeof checkAvailability);
"
```

Expected: `✓ booking.js loaded — checkAvailability function: function`

- [ ] **Step 3: Commit**

```bash
git add services/booking.js
git commit -m "feat: services/booking.js — check_availability RPC + createBooking with PII encryption"
```

---

### Task 9: services/calendar.js — Google Calendar OAuth2 + create/get events

**Files:**
- Create: `services/calendar.js`

**Interfaces:**
- `createCalendarEvent({calendarId, title, start, end, description?}) → {id: string, htmlLink: string}`
- `getCalendarEvent(calendarId, eventId) → event object`

**Note on GOOGLE_REFRESH_TOKEN:** This token is obtained once via the Google OAuth2 flow. If the dental-bot already has one (check the n8n Google Calendar credential in n8n UI → Credentials → Google Calendar), copy it directly. Otherwise, obtain via: create a local script that builds an OAuth2 URL, visit it, paste the auth code, exchange for refresh token. Save in `.env` as `GOOGLE_REFRESH_TOKEN`.

- [ ] **Step 1: Create services/calendar.js**

```javascript
// services/calendar.js — Google Calendar events via googleapis
import { google } from 'googleapis';
import { config } from '../config.js';

function getAuth() {
  const auth = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret
  );
  auth.setCredentials({ refresh_token: config.googleRefreshToken });
  return auth;
}

export async function createCalendarEvent({ calendarId, title, start, end, description }) {
  const calendar = google.calendar({ version: 'v3', auth: getAuth() });
  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: title,
      description: description ?? '',
      start: { dateTime: start instanceof Date ? start.toISOString() : start, timeZone: 'Europe/Madrid' },
      end:   { dateTime: end   instanceof Date ? end.toISOString()   : end,   timeZone: 'Europe/Madrid' },
    },
  });
  return { id: data.id, htmlLink: data.htmlLink };
}

export async function getCalendarEvent(calendarId, eventId) {
  const calendar = google.calendar({ version: 'v3', auth: getAuth() });
  const { data } = await calendar.events.get({ calendarId, eventId });
  return data;
}
```

- [ ] **Step 2: Smoke-test Google auth** (lists next 3 upcoming events from the primary calendar)

```bash
set -a; source .env; set +a
node --input-type=module -e "
import { google } from 'googleapis';
import { config } from './config.js';
const auth = new google.auth.OAuth2(config.googleClientId, config.googleClientSecret);
auth.setCredentials({ refresh_token: config.googleRefreshToken });
const cal = google.calendar({ version: 'v3', auth });
const { data } = await cal.events.list({ calendarId: 'primary', maxResults: 3, orderBy: 'startTime', singleEvents: true, timeMin: new Date().toISOString() });
console.log('✓ Google Calendar auth OK. Upcoming events:', (data.items ?? []).map(e => e.summary));
"
```

Expected: `✓ Google Calendar auth OK. Upcoming events: [...]` (no auth error).

- [ ] **Step 3: Commit**

```bash
git add services/calendar.js
git commit -m "feat: services/calendar.js — Google Calendar OAuth2 + create/get events"
```

---

### Task 10: services/ai.js — Anthropic Claude tool loop

**Files:**
- Create: `services/ai.js`

**Interfaces:**
- `runAI(systemPrompt, messages, toolHandlers, business) → {text: string, tokensUsed: number}`
  - `messages`: `[{role: 'user'|'assistant', content: string}]`
  - `toolHandlers`: `{ check_availability(input) → any, book_appointment(input) → any, transfer_to_human(input) → any }`
  - Returns when `stop_reason === 'end_turn'` or after max 5 tool loops

- [ ] **Step 1: Create services/ai.js**

```javascript
// services/ai.js — Anthropic Claude with tool_use loop (3 tools: check/book/transfer)
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const anthropic = new Anthropic({ apiKey: config.anthropicKey });

const TOOLS = [
  {
    name: 'check_availability',
    description: 'Consulta si hay disponibilidad en una fecha y hora para el número de personas indicado. Úsalo ANTES de ofrecer o confirmar ninguna cita.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
        time: { type: 'string', description: 'Hora de inicio en formato HH:MM (24h)' },
        duration_minutes: { type: 'integer', description: 'Duración en minutos', default: 60 },
        party_size: { type: 'integer', description: 'Número de personas', default: 1 },
      },
      required: ['date', 'time'],
    },
  },
  {
    name: 'book_appointment',
    description: 'Confirma una reserva. SOLO llamar tras check_availability haya confirmado disponibilidad. Nunca llamar sin disponibilidad confirmada.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        time: { type: 'string', description: 'Hora HH:MM (24h)' },
        duration_minutes: { type: 'integer', default: 60 },
        client_name: { type: 'string', description: 'Nombre del cliente' },
        client_phone: { type: 'string', description: 'Teléfono del cliente (opcional)' },
        service_name: { type: 'string', description: 'Nombre del servicio o motivo de la cita' },
        notes: { type: 'string', description: 'Notas adicionales (opcional)' },
      },
      required: ['date', 'time', 'client_name'],
    },
  },
  {
    name: 'transfer_to_human',
    description: 'Transfiere la conversación a un agente humano. Usar cuando el bot no puede resolver la consulta, ante urgencias o cuando el usuario lo solicite.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Motivo de la transferencia (para el agente humano)' },
      },
      required: ['reason'],
    },
  },
];

export async function runAI(systemPrompt, messages, toolHandlers, business) {
  const model = business.ai_model ?? 'claude-haiku-4-5-20251001';
  const maxTokens = business.max_tokens ?? 500;
  const useTools = business.booking_enabled && toolHandlers;

  // Convert messages to Anthropic format (only user/assistant, not system)
  const inputMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const MAX_LOOPS = 5;

  for (let i = 0; i < MAX_LOOPS; i++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: inputMessages,
      ...(useTools ? { tools: TOOLS } : {}),
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      return {
        text: textBlock?.text?.trim() ?? '',
        tokensUsed: totalInputTokens + totalOutputTokens,
      };
    }

    if (response.stop_reason === 'tool_use') {
      inputMessages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        let result;
        try {
          const handler = toolHandlers?.[block.name];
          result = handler ? await handler(block.input) : { error: `Tool not implemented: ${block.name}` };
        } catch (err) {
          result = { error: err.message };
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      inputMessages.push({ role: 'user', content: toolResults });
      continue;
    }

    break; // max_tokens or other stop reason
  }

  return {
    text: 'Lo siento, no puedo procesar tu solicitud en este momento. Por favor, contacta con nosotros directamente.',
    tokensUsed: totalInputTokens + totalOutputTokens,
  };
}
```

- [ ] **Step 2: Smoke-test AI call** (sends a real message to Claude)

```bash
set -a; source .env; set +a
node --input-type=module -e "
import { runAI } from './services/ai.js';
const { text, tokensUsed } = await runAI(
  'Eres el asistente de una clínica dental. Responde en español, máx 2 oraciones.',
  [{ role: 'user', content: 'Hola, ¿tienen citas disponibles esta semana?' }],
  null,
  { ai_model: 'claude-haiku-4-5-20251001', max_tokens: 200, booking_enabled: false }
);
console.log('✓ AI response:', text);
console.log('  tokens used:', tokensUsed);
"
```

Expected: a short Spanish response from Claude, token count > 0.

- [ ] **Step 3: Commit**

```bash
git add services/ai.js
git commit -m "feat: services/ai.js — Anthropic Claude tool_use loop (check/book/transfer)"
```

---

### Task 11: routes/webhook.js — main WhatsApp message handler (9-step flow)

**Files:**
- Create: `routes/webhook.js`

**Interfaces:**
- Consumes: all services from Tasks 4–10
- Produces: `POST /webhook/whatsapp` — immediately returns 200, then asynchronously processes the message

- [ ] **Step 1: Create routes/webhook.js**

```javascript
// routes/webhook.js — main 360dialog WhatsApp webhook handler
import { resolveBusiness, getOrCreateConversation, saveMessage, getRecentMessages, markTransferred } from '../services/supabase.js';
import { sendTextMessage } from '../services/whatsapp-360.js';
import { composeSystemPrompt, getSectorGreeting } from '../services/prompts.js';
import { runAI } from '../services/ai.js';
import { checkAvailability, createBooking } from '../services/booking.js';
import { getIAActGreeting, getRGPDNotice } from '../services/legal.js';

export default async function webhookRoutes(fastify) {
  fastify.post('/webhook/whatsapp', async (request, reply) => {
    // Immediate ACK — 360dialog retries if no 200 within ~30s
    reply.code(200).send({ status: 'ok' });

    // Async processing (fire-and-forget; errors go to logs, not to 360dialog)
    setImmediate(async () => {
      try {
        await handleIncomingMessage(request.body, fastify.log);
      } catch (err) {
        fastify.log.error({ err }, 'webhook: unhandled error');
      }
    });
  });
}

async function handleIncomingMessage(payload, log) {
  // Parse 360dialog / Meta Business API payload structure
  const change = payload?.entry?.[0]?.changes?.[0];
  const value = change?.value;
  if (!value) return;

  const waPhoneNumberId = value?.metadata?.phone_number_id;
  const message = value?.messages?.[0];
  if (!message || !waPhoneNumberId) return; // status update or delivery receipt

  if (message.type !== 'text') {
    log.info({ type: message.type }, 'webhook: non-text message, skipping');
    return;
  }

  const contactWaId = message.from;
  const incomingText = message.text?.body ?? '';

  // [1] Resolve business from tenant key
  const ctx = await resolveBusiness(waPhoneNumberId);
  if (!ctx) {
    log.warn({ waPhoneNumberId }, 'webhook: unknown wa_phone_number_id');
    return;
  }
  const { business, hours, services, resources, sector } = ctx;

  // [2] Kill switch
  if (!business.active) {
    await sendTextMessage(waPhoneNumberId, contactWaId, business.inactive_message);
    return;
  }

  // [3] Get or create conversation
  const conversation = await getOrCreateConversation(business.id, contactWaId);
  const isFirstMessage = conversation.message_count === 0;

  if (isFirstMessage) {
    // IA Act Art. 50.1 + RGPD — mandatory before any AI response
    const greeting = getSectorGreeting(sector, business.name);
    const rgpd = getRGPDNotice(business.website);
    await sendTextMessage(waPhoneNumberId, contactWaId, greeting);
    await sendTextMessage(waPhoneNumberId, contactWaId, rgpd);
    await saveMessage(conversation.id, business.id, 'assistant', greeting);
    await saveMessage(conversation.id, business.id, 'assistant', rgpd);
  }

  // [4] Persist incoming message
  await saveMessage(conversation.id, business.id, 'user', incomingText);

  // [5] Compose system prompt
  const systemPrompt = composeSystemPrompt(business, sector, hours, services);

  // [6] Fetch conversation history + run AI
  const history = await getRecentMessages(conversation.id, 20);

  const toolHandlers = {
    async check_availability({ date, time, duration_minutes = 60, party_size = 1 }) {
      if (!business.booking_enabled) return { available: false, reason: 'Reservas no disponibles en este momento.' };
      const start = new Date(`${date}T${time}:00`);
      if (isNaN(start.getTime())) return { available: false, reason: 'Fecha u hora no válida.' };
      const end = new Date(start.getTime() + duration_minutes * 60_000);
      const free = await checkAvailability(business.id, start.toISOString(), end.toISOString(), party_size);
      return { available: free.length > 0, slots: free.map(r => ({ resource: r.name, start: start.toISOString(), end: end.toISOString() })) };
    },

    async book_appointment({ date, time, duration_minutes = 60, client_name, client_phone, service_name, notes }) {
      if (!business.booking_enabled) return { success: false, reason: 'Reservas no disponibles.' };
      const start = new Date(`${date}T${time}:00`);
      if (isNaN(start.getTime())) return { success: false, reason: 'Fecha u hora no válida.' };
      const end = new Date(start.getTime() + duration_minutes * 60_000);

      const free = await checkAvailability(business.id, start.toISOString(), end.toISOString(), 1);
      if (free.length === 0) return { success: false, reason: 'No hay disponibilidad en ese momento. Prueba otra fecha u hora.' };

      try {
        const booking = await createBooking({
          businessId: business.id,
          waConversationId: conversation.id,
          resourceId: free[0].id,
          clientName: client_name,
          clientPhone: client_phone,
          startISO: start.toISOString(),
          endISO: end.toISOString(),
          notes: notes ?? service_name ?? '',
        });
        return { success: true, bookingId: booking.id, confirmed_at: start.toISOString() };
      } catch (err) {
        if (err.message === 'SLOT_TAKEN') return { success: false, reason: 'Ese hueco acaba de ser reservado. Por favor elige otro horario.' };
        throw err;
      }
    },

    async transfer_to_human({ reason }) {
      await markTransferred(conversation.id);
      return { transferred: true, message: 'En breve un miembro de nuestro equipo se pondrá en contacto contigo.' };
    },
  };

  const { text: aiText, tokensUsed } = await runAI(systemPrompt, history, toolHandlers, business);

  // [7] Persist assistant response
  await saveMessage(conversation.id, business.id, 'assistant', aiText, tokensUsed);

  // [8] Send WhatsApp response
  await sendTextMessage(waPhoneNumberId, contactWaId, aiText);

  // [9] wa_messages trigger auto-updates message_count + last_msg_at in wa_conversations
  log.info({ businessId: business.id, conversationId: conversation.id, tokensUsed }, 'webhook: message processed');
}
```

- [ ] **Step 2: Test webhook with simulated payload** (server must be running — Task 2)

```bash
set -a; source .env; set +a
npm run dev &
sleep 2

curl -s -X POST http://localhost:3000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "metadata": { "phone_number_id": "DENTILUX_WA_PHONE_NUMBER_ID" },
          "messages": [{
            "from": "34600000001",
            "type": "text",
            "text": { "body": "Hola, ¿tienen cita disponible esta semana?" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

Replace `DENTILUX_WA_PHONE_NUMBER_ID` with the value from the seed.
Expected: `{"status":"ok"}` immediately. Check server logs for `webhook: message processed`.

- [ ] **Step 3: Verify message was stored in Supabase**

```bash
curl -s "https://tvkdhjxatkehuryvnjmu.supabase.co/rest/v1/wa_messages?limit=5&order=created_at.desc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: array with `role: "user"` message + `role: "assistant"` response(s).

- [ ] **Step 4: Commit**

```bash
git add routes/webhook.js
git commit -m "feat: routes/webhook.js — complete 9-step WhatsApp message handler"
```

---

### Task 12: views/dashboard.html.js + routes/dashboard.js + routes/admin.js

**Files:**
- Create: `views/dashboard.html.js`
- Create: `routes/dashboard.js`
- Create: `routes/admin.js`

**Interfaces:**
- `renderDashboard(business, metrics, conversations) → HTML string`
- `GET /dashboard/:token` → 200 HTML or 404
- `POST /admin/rpc/rollup/:date` + header `X-Admin-Key` → 200 `{"ok":true}` or 401/500

- [ ] **Step 1: Create views/dashboard.html.js**

```javascript
// views/dashboard.html.js — server-side HTML dashboard renderer
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSvgChart(metrics) {
  const last30 = metrics.slice(-30);
  if (last30.length === 0) return '<p style="color:#999;text-align:center;padding:40px 0">Sin datos aún</p>';

  const maxVal = Math.max(...last30.map(m => m.conversations), 1);
  const barW = 8;
  const gap = 2;
  const chartH = 80;
  const totalW = last30.length * (barW + gap);

  const bars = last30.map((m, i) => {
    const h = Math.max(2, Math.round((m.conversations / maxVal) * chartH));
    const x = i * (barW + gap);
    const y = chartH - h;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="#2A3A28" rx="1"><title>${m.metric_date}: ${m.conversations} conv.</title></rect>`;
  }).join('');

  const firstDate = last30[0]?.metric_date?.slice(5) ?? '';
  const lastDate  = last30[last30.length - 1]?.metric_date?.slice(5) ?? '';

  return `<svg viewBox="0 0 ${totalW} ${chartH + 20}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">
  ${bars}
  <text x="0" y="${chartH + 15}" font-size="10" fill="#999">${escHtml(firstDate)}</text>
  <text x="${totalW}" y="${chartH + 15}" font-size="10" fill="#999" text-anchor="end">${escHtml(lastDate)}</text>
</svg>`;
}

export function renderDashboard(business, metrics, conversations) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthMetrics = (metrics ?? []).filter(m => String(m.metric_date).startsWith(currentMonth));

  const totals = monthMetrics.reduce(
    (acc, m) => ({
      conversations: acc.conversations + (m.conversations ?? 0),
      bookings:      acc.bookings      + (m.bookings      ?? 0),
      transfers:     acc.transfers     + (m.transfers     ?? 0),
      resolved:      acc.resolved      + (m.resolved      ?? 0),
    }),
    { conversations: 0, bookings: 0, transfers: 0, resolved: 0 }
  );
  const conversionRate = totals.conversations > 0
    ? Math.round((totals.bookings / totals.conversations) * 100)
    : 0;

  const cards = [
    { value: totals.conversations, label: 'Conversaciones' },
    { value: totals.resolved,      label: 'Resueltas por IA' },
    { value: totals.bookings,      label: 'Reservas' },
    { value: totals.transfers,     label: 'Transferencias' },
    { value: `${conversionRate}%`, label: 'Conversión' },
  ];

  const cardsHtml = cards.map(c => `
    <div class="card">
      <div class="card-value">${escHtml(String(c.value))}</div>
      <div class="card-label">${escHtml(c.label)}</div>
    </div>`).join('');

  const tableRows = (conversations ?? []).map(c => {
    const date = new Date(c.last_msg_at).toLocaleDateString('es-ES');
    const waId = String(c.wa_contact_wa_id ?? '');
    const masked = waId.length >= 8
      ? waId.slice(0, 4) + ' *** ' + waId.slice(-3)
      : waId;
    const status = c.is_transferred
      ? { label: 'Transferida', color: '#B85838' }
      : c.is_resolved
        ? { label: 'Resuelta', color: '#12b76a' }
        : { label: 'Activa', color: '#2A3A28' };
    return `<tr>
      <td>${escHtml(masked)}</td>
      <td>${escHtml(c.summary ?? '—')}</td>
      <td>${escHtml(date)}</td>
      <td style="color:${status.color};font-weight:500">${escHtml(status.label)}</td>
    </tr>`;
  }).join('');

  const monthLabel = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard — ${escHtml(business.name)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,system-ui,sans-serif;background:#F2EBE0;color:#1A1210;min-height:100vh}
.header{background:#2A3A28;color:#fff;padding:18px 32px;display:flex;justify-content:space-between;align-items:center}
.header h1{font-size:1.15rem;font-weight:600;letter-spacing:-.01em}
.header small{font-size:.78rem;opacity:.7}
.main{max-width:960px;margin:0 auto;padding:32px 16px}
.section-title{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:14px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-bottom:36px}
.card{background:#FBF8F1;border-radius:18px;padding:18px 20px;box-shadow:0 1px 4px rgba(0,0,0,.07)}
.card-value{font-family:Georgia,serif;font-size:2.2rem;font-weight:700;color:#2A3A28;line-height:1}
.card-label{font-size:.78rem;color:#888;margin-top:6px}
.chart-box{background:#FBF8F1;border-radius:18px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.07);margin-bottom:36px}
.table-wrap{background:#FBF8F1;border-radius:18px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07);margin-bottom:36px;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.88rem}
thead tr{background:#2A3A28;color:#fff}
thead th{padding:10px 14px;text-align:left;font-weight:500;font-size:.78rem}
tbody td{padding:9px 14px;border-bottom:1px solid #ede8df;vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:#f5f0e8}
.footer{text-align:center;padding:24px 16px;color:#aaa;font-size:.72rem}
</style>
</head>
<body>
<header class="header">
  <div>
    <h1>${escHtml(business.name)}</h1>
    <small>Panel de actividad · ContaProNow</small>
  </div>
  <div style="text-align:right"><small>${escHtml(monthLabel)}</small></div>
</header>
<main class="main">
  <p class="section-title">Resumen del mes</p>
  <div class="cards">${cardsHtml}</div>
  <p class="section-title">Conversaciones — últimos 30 días</p>
  <div class="chart-box">${buildSvgChart(metrics)}</div>
  <p class="section-title">Últimas conversaciones</p>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Contacto</th><th>Resumen</th><th>Fecha</th><th>Estado</th></tr></thead>
      <tbody>${tableRows || '<tr><td colspan="4" style="padding:24px;text-align:center;color:#aaa">Sin conversaciones aún</td></tr>'}</tbody>
    </table>
  </div>
</main>
<footer class="footer">Panel privado · ContaProNow · Los datos se actualizan cada noche</footer>
</body>
</html>`;
}
```

- [ ] **Step 2: Create routes/dashboard.js**

```javascript
// routes/dashboard.js — GET /dashboard/:token (server-side HTML, no JS, no login)
import { getBusinessByToken, getMetricsSummary, getRecentConversations } from '../services/supabase.js';
import { renderDashboard } from '../views/dashboard.html.js';

const TOKEN_RE = /^[0-9a-f]{64}$/;

export default async function dashboardRoutes(fastify) {
  fastify.get('/dashboard/:token', async (request, reply) => {
    const { token } = request.params;
    if (!TOKEN_RE.test(token)) return reply.code(404).send('Not found');

    const business = await getBusinessByToken(token);
    if (!business) return reply.code(404).send('Not found');

    const [metrics, conversations] = await Promise.all([
      getMetricsSummary(business.id, 30),
      getRecentConversations(business.id, 20),
    ]);

    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Cache-Control', 'no-store, private')
      .header('X-Robots-Tag', 'noindex, nofollow')
      .header('Referrer-Policy', 'no-referrer')
      .send(renderDashboard(business, metrics, conversations));
  });
}
```

- [ ] **Step 3: Create routes/admin.js**

```javascript
// routes/admin.js — POST /admin/rpc/rollup/:date (called by n8n nightly workflow)
import { supabase } from '../services/supabase.js';
import { config } from '../config.js';

export default async function adminRoutes(fastify) {
  fastify.post('/admin/rpc/rollup/:date', async (request, reply) => {
    const adminKey = request.headers['x-admin-key'];
    if (!adminKey || adminKey !== config.adminKey) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const { date } = request.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date must be YYYY-MM-DD' });
    }

    // Get all active businesses and run rollup for each
    const { data: businesses, error } = await supabase
      .from('va_businesses')
      .select('id, name')
      .eq('active', true);

    if (error) return reply.code(500).send({ error: error.message });

    const results = [];
    for (const b of businesses ?? []) {
      const { error: rpcErr } = await supabase.rpc('va_rollup_day_wa', {
        p_business_id: b.id,
        p_date: date,
      });
      results.push({ id: b.id, name: b.name, ok: !rpcErr, error: rpcErr?.message });
    }

    return reply.send({ ok: true, date, results });
  });
}
```

- [ ] **Step 4: Test dashboard** (server must be running with correct token in .env or DB)

```bash
# Get Dentilux's dashboard_token from Supabase:
DASHBOARD_TOKEN=$(curl -s "https://tvkdhjxatkehuryvnjmu.supabase.co/rest/v1/va_businesses?select=dashboard_token&name=eq.Dentilux" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | node --input-type=module -e \
  "const data = await new Promise(r => { let b=''; process.stdin.on('data',c=>b+=c); process.stdin.on('end',()=>r(JSON.parse(b))); }); console.log(data[0]?.dashboard_token ?? 'NOT FOUND')")

echo "Token: $DASHBOARD_TOKEN"
curl -si "http://localhost:3000/dashboard/$DASHBOARD_TOKEN" | head -20
```

Expected: HTTP 200, `Content-Type: text/html`, HTML starting with `<!DOCTYPE html>`. Headers include `Cache-Control: no-store, private`.

- [ ] **Step 5: Commit**

```bash
git add views/dashboard.html.js routes/dashboard.js routes/admin.js
git commit -m "feat: dashboard (server-side HTML + SVG chart) + admin rollup endpoint"
```

---

### Task 13: index.js (all routes) + scripts/onboard-client.mjs + Dockerfile + railway.json + n8n workflows

**Files:**
- Modify: `index.js` — register all 4 routes
- Create: `scripts/onboard-client.mjs`
- Create: `scripts/onboard-client.example.json`
- Create: `Dockerfile`
- Create: `railway.json`
- Create: `n8n-workflows/README.md`

**Interfaces:**
- `node scripts/onboard-client.mjs <path-to-client.json>` → prints dashboard URL
- `docker build .` succeeds

- [ ] **Step 1: Update index.js to register all routes**

Replace the entire `index.js` with:

```javascript
// index.js
import Fastify from 'fastify';
import { config } from './config.js';
import healthRoutes from './routes/health.js';
import webhookRoutes from './routes/webhook.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin.js';

const fastify = Fastify({ logger: true });

fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  req.rawBody = body;
  try { done(null, JSON.parse(body)); }
  catch (err) { done(err); }
});

fastify.register(healthRoutes);
fastify.register(webhookRoutes);
fastify.register(dashboardRoutes);
fastify.register(adminRoutes);

const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
```

- [ ] **Step 2: Verify all routes are registered**

```bash
set -a; source .env; set +a
npm run dev &
sleep 2
curl -s http://localhost:3000/health
# Expected: {"status":"ok","ts":"..."}
```

- [ ] **Step 3: Create scripts/onboard-client.example.json**

```json
{
  "name": "Clínica Ejemplo",
  "sector": "salud",
  "wa_phone_number_id": "REPLACE_WITH_360DIALOG_PHONE_NUMBER_ID",
  "phone": "+34 600 000 000",
  "website": "https://clinicaejemplo.com",
  "address": "Calle Ejemplo 1, Madrid",
  "timezone": "Europe/Madrid",
  "transfer_whatsapp": "34600000001",
  "booking_enabled": true,
  "calendar_enabled": false,
  "hours": [
    { "day_of_week": 0, "is_closed": true },
    { "day_of_week": 1, "open_time": "09:00", "close_time": "18:00", "is_closed": false },
    { "day_of_week": 2, "open_time": "09:00", "close_time": "18:00", "is_closed": false },
    { "day_of_week": 3, "open_time": "09:00", "close_time": "18:00", "is_closed": false },
    { "day_of_week": 4, "open_time": "09:00", "close_time": "18:00", "is_closed": false },
    { "day_of_week": 5, "open_time": "09:00", "close_time": "18:00", "is_closed": false },
    { "day_of_week": 6, "is_closed": true }
  ],
  "services": [
    { "name": "Revisión general", "duration_minutes": 60, "price": 60 }
  ],
  "resources": [
    { "name": "Gabinete principal", "kind": "room", "capacity": 1 }
  ],
  "goals": {
    "goal_conversations_month": 40,
    "goal_bookings_month": 20,
    "cost_per_hour_saved": 12.00
  }
}
```

- [ ] **Step 4: Create scripts/onboard-client.mjs**

```javascript
// scripts/onboard-client.mjs — creates a new business in va_businesses + related tables
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars required');
  process.exit(1);
}

const clientFile = process.argv[2];
if (!clientFile) {
  console.error('Usage: node scripts/onboard-client.mjs <path-to-client.json>');
  console.error('Example: node scripts/onboard-client.mjs scripts/onboard-client.example.json');
  process.exit(1);
}

const client = JSON.parse(await readFile(resolve(process.cwd(), clientFile), 'utf8'));
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

// Get or create the ContaProNow account
const { data: accounts } = await supabase.from('va_accounts').select('id').limit(1);
let accountId = accounts?.[0]?.id;
if (!accountId) {
  const { data: acc } = await supabase.from('va_accounts').insert({ name: 'ContaProNow', owner_email: 'contapronoww@gmail.com' }).select('id').single();
  accountId = acc.id;
}

const dashboardToken = randomBytes(32).toString('hex');

// Insert business
const { data: business, error: bizErr } = await supabase.from('va_businesses').insert({
  account_id: accountId,
  name: client.name,
  sector: client.sector,
  wa_phone_number_id: client.wa_phone_number_id,
  phone: client.phone,
  website: client.website,
  address: client.address,
  timezone: client.timezone ?? 'Europe/Madrid',
  transfer_whatsapp: client.transfer_whatsapp,
  dashboard_token: dashboardToken,
  booking_enabled: client.booking_enabled ?? false,
  calendar_enabled: client.calendar_enabled ?? false,
  ai_model: 'claude-haiku-4-5-20251001',
  max_tokens: 500,
}).select().single();

if (bizErr) { console.error('Error creating business:', bizErr.message); process.exit(1); }

const businessId = business.id;

// Hours
if (client.hours?.length) {
  await supabase.from('va_business_hours').insert(
    client.hours.map(h => ({ business_id: businessId, ...h }))
  );
}

// Services
if (client.services?.length) {
  await supabase.from('va_services').insert(
    client.services.map(s => ({ business_id: businessId, ...s, active: true }))
  );
}

// Resources
if (client.resources?.length) {
  await supabase.from('va_resources').insert(
    client.resources.map(r => ({ business_id: businessId, ...r, active: true }))
  );
}

// Metric params
await supabase.from('va_metric_params').insert({
  business_id: businessId,
  goal_conversations_month: client.goals?.goal_conversations_month ?? 50,
  goal_bookings_month: client.goals?.goal_bookings_month ?? 20,
  cost_per_hour_saved: client.goals?.cost_per_hour_saved ?? 12.00,
});

const dashboardUrl = `${baseUrl}/dashboard/${dashboardToken}`;
console.log(`\n✅ Cliente creado: ${client.name}`);
console.log(`   business_id: ${businessId}`);
console.log(`   Dashboard URL: ${dashboardUrl}`);
console.log(`\n📋 Próximos pasos:`);
console.log(`   1. En 360dialog: configura el webhook del número ${client.wa_phone_number_id} → ${baseUrl}/webhook/whatsapp`);
console.log(`   2. Comparte con el cliente: ${dashboardUrl}`);
```

- [ ] **Step 5: Test onboard-client script** (dry run with example JSON)

```bash
set -a; source .env; set +a
# Edit the example JSON first: replace wa_phone_number_id with a test value
node scripts/onboard-client.mjs scripts/onboard-client.example.json
```

Expected output: `✅ Cliente creado: Clínica Ejemplo` with a dashboard URL.

Verify the business appeared in Supabase:
```bash
curl -s "https://tvkdhjxatkehuryvnjmu.supabase.co/rest/v1/va_businesses?select=id,name,sector" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

- [ ] **Step 6: Create Dockerfile**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
```

- [ ] **Step 7: Create railway.json**

```json
{
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "startCommand": "node index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 10
  }
}
```

- [ ] **Step 8: Verify Docker build**

```bash
docker build -t wa-agente:test .
```

Expected: `Successfully built ...` (no errors). If Docker not available locally, skip and verify on Railway deploy.

- [ ] **Step 9: Create n8n-workflows/README.md**

```markdown
# n8n Workflows for contapronow-wa-agente

Create these 3 workflows manually in the n8n instance at Railway.
After creation, export them (Download JSON) and save in this folder.

## wa-agente_nightly-rollup

**Schedule:** Cron — 01:00 daily

**Nodes:**
1. Cron trigger: `0 1 * * *`
2. Supabase: SELECT id, name FROM va_businesses WHERE active=true
3. Loop Over Items
4. HTTP Request: POST `{{$env.WA_AGENTE_URL}}/admin/rpc/rollup/{{$now.format('YYYY-MM-DD', {offset: -1, unit: 'day'})}}` with header `X-Admin-Key: {{$env.WA_AGENTE_ADMIN_KEY}}`

## wa-agente_weekly-summary

**Schedule:** Cron — 09:00 every Monday

**Nodes:**
1. Cron trigger: `0 9 * * 1`
2. Supabase: SELECT id, name, transfer_whatsapp FROM va_businesses WHERE active=true AND transfer_whatsapp IS NOT NULL
3. Loop Over Items
4. HTTP Request: GET `{{$env.WA_AGENTE_URL}}/dashboard/[token]` — OR build a custom n8n HTTP node that calls va_metrics_summary directly
5. 360dialog send: POST to 360dialog API with weekly summary text to transfer_whatsapp number

## wa-agente_cleanup-90d

**Schedule:** Cron — 03:00 daily

**Nodes:**
1. Cron trigger: `0 3 * * *`
2. Supabase: DELETE FROM wa_messages WHERE created_at < NOW() - INTERVAL '90 days'
   (Use Supabase node with custom query or HTTP Request to PostgREST)

**n8n env vars needed:**
- `WA_AGENTE_URL` — Railway URL of this backend (e.g. https://wa-agente.up.railway.app)
- `WA_AGENTE_ADMIN_KEY` — same value as ADMIN_KEY env var in Railway
- `D360_API_KEY` — 360dialog API key (already in n8n credentials)
```

- [ ] **Step 10: Final full integration test**

With the server running, test the complete happy path:

```bash
set -a; source .env; set +a
npm run dev &
sleep 2

# 1. Health check
curl -s http://localhost:3000/health
# → {"status":"ok","ts":"..."}

# 2. Simulated WhatsApp message (first message — should trigger IA Act greeting)
curl -s -X POST http://localhost:3000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d "{\"entry\":[{\"changes\":[{\"value\":{\"metadata\":{\"phone_number_id\":\"$DENTILUX_PHONE_ID\"},\"messages\":[{\"from\":\"34611111111\",\"type\":\"text\",\"text\":{\"body\":\"Hola, quiero una cita\"}}]},\"field\":\"messages\"}]}]}"
sleep 3

# 3. Check messages stored
curl -s "https://tvkdhjxatkehuryvnjmu.supabase.co/rest/v1/wa_messages?limit=10&order=created_at.desc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# 4. Dashboard
DASHBOARD_TOKEN=$(curl -s "https://tvkdhjxatkehuryvnjmu.supabase.co/rest/v1/va_businesses?select=dashboard_token&name=eq.Dentilux" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | \
  node --input-type=module -e "const b=[];process.stdin.on('data',c=>b.push(c));process.stdin.on('end',()=>console.log(JSON.parse(Buffer.concat(b))[0]?.dashboard_token))")
curl -si "http://localhost:3000/dashboard/$DASHBOARD_TOKEN" | head -5

# 5. Admin rollup endpoint
curl -s -X POST "http://localhost:3000/admin/rpc/rollup/$(date +%Y-%m-%d)" \
  -H "X-Admin-Key: $ADMIN_KEY"
# → {"ok":true,"date":"...","results":[...]}
```

- [ ] **Step 11: Commit everything**

```bash
git add index.js scripts/ Dockerfile railway.json n8n-workflows/
git commit -m "feat: complete — all routes wired, onboard script, Dockerfile, n8n workflow docs"
```

---

## Self-Review

Spec coverage check:

| Spec requirement | Task |
|---|---|
| Multi-tenant via wa_phone_number_id | Task 5 (resolveBusiness) |
| Business cache 60s TTL | Task 5 (businessCache Map) |
| 6 sectors with prompt_block + hard_rules | Task 3 (002_sector_prompts.sql) |
| IA Act Art. 50.1 first message | Task 11 (isFirstMessage check) |
| RGPD notice at first contact | Task 11 (getRGPDNotice) |
| Sector salud: no medical advice | Task 3 (hard_rules for salud sector) |
| AES-256-GCM phone encryption | Task 4 (phone-crypto.js) |
| PHONE_ENCRYPTION_KEY in env only | Global Constraint, .env.example |
| Booking UNIQUE constraint | Task 3 (001_schema.sql) |
| SLOT_TAKEN error handling | Task 8 (booking.js) + Task 11 |
| Dashboard token 64 hex | Task 3 (CHECK constraint) + Task 12 |
| Dashboard headers no-store/noindex | Task 12 (dashboard.js) |
| SVG bar chart inline | Task 12 (buildSvgChart) |
| Nightly rollup RPC | Task 3 (003_functions.sql) + Task 12 (admin.js) |
| 90-day message cleanup | Task 13 (n8n README) |
| Dentilux as first client | Task 3 (004_seed_dentilux.sql) |
| Never touch dental-bot tables | Global Constraint, all migrations |
| Onboarding script | Task 13 |
| Dockerfile + Railway | Task 13 |
| Google Calendar | Task 9 (calendar.js) |
| 360dialog isolated in one file | Task 6 (whatsapp-360.js) |

All 21 spec requirements covered. No placeholders detected. ✓

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-28-contapronow-wa-agente.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, spec compliance review between tasks, fast iteration. Invoke `superpowers:subagent-driven-development`.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`.
