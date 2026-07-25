-- =====================================================================
-- voz-agente: migración inicial multi-tenant
-- Proyecto Supabase: tvkdhjxatkehuryvnjmu
-- Ejecutar desde Supabase SQL Editor o psql con service_role
-- =====================================================================

-- Extensión para UUID
create extension if not exists "pgcrypto";

-- =====================================================================
-- va_accounts — organizaciones (ContaProNow es la única por ahora)
-- =====================================================================
create table if not exists va_accounts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null unique,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- va_businesses — un negocio por cliente
-- =====================================================================
create table if not exists va_businesses (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null references va_accounts(id) on delete cascade,

  -- Identificación
  name                  text not null,
  slug                  text not null unique,            -- ej: "gangas-gonzales"
  sector                text not null,                   -- "comercio","restauracion","salud","auto","profesional","inmobiliaria"

  -- Configuración Vapi
  vapi_assistant_id     text,                            -- se rellena tras crear el assistant
  phone_number          text,                            -- número Vapi asignado

  -- Datos del negocio (para el system prompt)
  description           text not null default '',       -- breve descripción del negocio
  address               text not null default '',
  phone_display         text not null default '',       -- número que mostrar al cliente (puede diferir del DID Vapi)
  website               text,
  whatsapp_display      text,                           -- número WhatsApp del negocio para info al cliente

  -- Contacto interno (notificaciones post-call)
  transfer_whatsapp     text,                           -- número WhatsApp del dueño para warm transfer y resúmenes
  transfer_phone        text,                           -- teléfono real para SIP REFER (v2)

  -- Google Calendar
  google_calendar_id    text,                           -- ej: "abc123@group.calendar.google.com"
  booking_provider      text not null default 'google_calendar', -- google_calendar | none | webhook_custom
  booking_webhook_url   text,                           -- si booking_provider=webhook_custom

  -- Configuración de citas
  slot_duration_min     integer not null default 30,
  advance_booking_days  integer not null default 14,   -- máximo días hacia adelante para reservar
  min_notice_hours      integer not null default 2,    -- mínimo horas de antelación

  -- Kill switch
  active                boolean not null default true,
  inactive_message      text not null default 'En este momento no podemos atenderle. Por favor, llame en horario de oficina o escríbanos por WhatsApp.',

  -- Idioma y timezone
  primary_language      text not null default 'es',
  secondary_language    text default 'en',
  timezone              text not null default 'Atlantic/Canary',

  -- Aviso RGPD (se lee al inicio de la llamada)
  gdpr_notice           text not null default 'Esta llamada puede ser grabada con fines de calidad y gestión. Sus datos serán tratados conforme al RGPD.',

  -- Metadatos
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_va_businesses_account on va_businesses(account_id);
create index if not exists idx_va_businesses_slug    on va_businesses(slug);
create index if not exists idx_va_businesses_vapi    on va_businesses(vapi_assistant_id);

-- =====================================================================
-- va_business_hours — horarios por día de semana
-- =====================================================================
create table if not exists va_business_hours (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references va_businesses(id) on delete cascade,
  day_of_week  smallint not null check (day_of_week between 0 and 6), -- 0=domingo
  open_time    time,                    -- null = cerrado ese día
  close_time   time,
  lunch_start  time,                    -- pausa de mediodía (opcional)
  lunch_end    time,
  unique(business_id, day_of_week)
);

create index if not exists idx_va_hours_business on va_business_hours(business_id);

-- =====================================================================
-- va_services — catálogo de servicios/productos del negocio
-- =====================================================================
create table if not exists va_services (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references va_businesses(id) on delete cascade,
  name         text not null,
  description  text,
  price_range  text,                    -- ej: "desde 15€", "consultar", "10–25€"
  duration_min integer,                 -- duración del servicio (para citas)
  bookable     boolean not null default true,
  sort_order   smallint not null default 0
);

create index if not exists idx_va_services_business on va_services(business_id);

-- =====================================================================
-- va_calls — log de cada llamada
-- =====================================================================
create table if not exists va_calls (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references va_businesses(id),

  -- Vapi metadata
  vapi_call_id     text not null unique,
  vapi_assistant_id text,

  -- Teléfono cifrado (AES-GCM, clave PHONE_ENCRYPTION_KEY en Fly.io)
  caller_encrypted text,               -- ciphertext hex
  caller_iv        text,               -- IV hex para AES-GCM

  -- Resultado de la llamada
  duration_sec     integer,
  status           text,               -- "completed", "no-answer", "busy", "failed"
  outcome          text,               -- "info_provided","booking_created","transfer","abandoned"
  language_detected text,

  -- Análisis post-call (rellenado por n8n tras colgar)
  transcript       text,
  summary          text,
  sentiment        text,               -- "positive","neutral","negative"
  sentiment_score  numeric(3,2),

  -- Grabación (Supabase Storage)
  recording_url    text,               -- path en storage, ej: "va-recordings/business_id/call_id.mp3"
  recording_purge_at timestamptz,      -- now() + 30 days

  -- Timestamps en timezone del negocio
  started_at       timestamptz,
  ended_at         timestamptz,
  post_processed_at timestamptz,

  created_at       timestamptz not null default now()
);

create index if not exists idx_va_calls_business    on va_calls(business_id);
create index if not exists idx_va_calls_vapi_id     on va_calls(vapi_call_id);
create index if not exists idx_va_calls_started     on va_calls(started_at desc);
create index if not exists idx_va_calls_purge       on va_calls(recording_purge_at) where recording_url is not null;

-- =====================================================================
-- va_bookings — reservas/citas creadas durante llamadas
-- =====================================================================
create table if not exists va_bookings (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references va_businesses(id),
  call_id           uuid references va_calls(id),

  -- Datos de la cita
  service_id        uuid references va_services(id),
  service_name      text,              -- snapshot del nombre en el momento de la reserva
  start_time        timestamptz not null,
  end_time          timestamptz not null,

  -- Datos del cliente
  client_name       text,
  client_phone_encrypted text,
  client_phone_iv   text,
  client_notes      text,

  -- Google Calendar
  google_event_id   text,             -- para poder cancelar/modificar
  google_calendar_id text,

  -- Idempotencia: (vapi_call_id, business_id, start_time) debe ser único
  vapi_call_id      text,

  -- Estado
  status            text not null default 'confirmed', -- confirmed | cancelled | completed

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Evitar doble-reserva por la misma llamada en el mismo slot
  unique(vapi_call_id, business_id, start_time)
);

create index if not exists idx_va_bookings_business on va_bookings(business_id);
create index if not exists idx_va_bookings_start    on va_bookings(start_time);
create index if not exists idx_va_bookings_call     on va_bookings(call_id);

-- =====================================================================
-- va_rate_limits — throttling por IP para el microservicio
-- (usado por la lógica interna de Fastify + Supabase)
-- =====================================================================
create table if not exists va_rate_limits (
  id          uuid primary key default gen_random_uuid(),
  ip_hash     text not null,           -- SHA-256 de la IP (datos no personales)
  window_key  text not null,           -- ej: "2024-01-15T10:00" (por minuto)
  count       integer not null default 1,
  created_at  timestamptz not null default now(),
  unique(ip_hash, window_key)
);

create index if not exists idx_va_rate_ip_window on va_rate_limits(ip_hash, window_key);

-- Limpieza automática de ventanas antiguas (más de 5 minutos)
create or replace function va_cleanup_rate_limits() returns void language sql as $$
  delete from va_rate_limits where created_at < now() - interval '5 minutes';
$$;

-- =====================================================================
-- RLS — Row Level Security
-- =====================================================================

-- Habilitar RLS en todas las tablas
alter table va_accounts     enable row level security;
alter table va_businesses   enable row level security;
alter table va_business_hours enable row level security;
alter table va_services     enable row level security;
alter table va_calls        enable row level security;
alter table va_bookings     enable row level security;
alter table va_rate_limits  enable row level security;

-- El microservicio usa service_role (bypasea RLS) — no necesita policies.
-- Las policies siguientes son para futura integración con JWT de usuarios del panel.

-- Política base: solo service_role puede hacer todo (resto bloqueado por defecto)
-- Si en el futuro añades un panel web con autenticación Supabase, añade policies
-- del tipo: using (account_id = auth.uid()) para cada tabla.

-- =====================================================================
-- Función de updated_at automático
-- =====================================================================
create or replace function va_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger va_businesses_updated_at
  before update on va_businesses
  for each row execute function va_set_updated_at();

create trigger va_bookings_updated_at
  before update on va_bookings
  for each row execute function va_set_updated_at();

-- =====================================================================
-- Función de purga de grabaciones vencidas (llamada por cron n8n)
-- =====================================================================
create or replace function va_purge_expired_recordings()
returns integer language plpgsql security definer as $$
declare
  purged integer;
begin
  update va_calls
  set    recording_url = null
  where  recording_purge_at < now()
    and  recording_url is not null;
  get diagnostics purged = row_count;
  return purged;
end;
$$;

-- =====================================================================
-- va_accounts: insertar cuenta ContaProNow (seed mínimo)
-- =====================================================================
insert into va_accounts (id, name, email)
values (
  '00000000-0000-0000-0000-000000000001',
  'ContaProNow',
  'contapronoww@gmail.com'
)
on conflict (email) do nothing;
