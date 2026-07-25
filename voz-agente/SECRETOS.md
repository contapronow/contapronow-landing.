# SECRETOS.md — Variables de entorno y cuentas

**Regla dura:** este documento describe QUÉ variables existen y DÓNDE se configuran. NUNCA contiene valores. Los valores viven solo en los gestores de secretos de cada servicio.

## Cuentas necesarias

| Servicio | ¿Ya existe? | Notas |
|---|---|---|
| Vapi | crear si falta | https://vapi.ai — cuenta ContaProNow |
| ElevenLabs | crear si falta | plan Starter ($5/mes) mínimo para clonación / voz castellana Pro |
| Deepgram | crear si falta | plan Growth por si Vapi managed no llega |
| OpenAI | ya existe | reutilizar API key de la landing |
| Anthropic | ya existe | reutilizar |
| Supabase | ya existe | proyecto `tvkdhjxatkehuryvnjmu` |
| n8n Railway | ya existe | añadir workflows nuevos |
| Google Calendar | ya existe (`contapronoww@gmail.com`) | crear un calendario dedicado por negocio (ej. "Gangas Gonzales — reservas") |
| Fly.io | crear si falta | plan Hobby, región `mad` |
| GitHub | ya existe | repo `contapronow/contapronow-landing`, rama `claude/voice-agent-pymes-p2yacd` |

## Variables por servicio

### Microservicio Node en Fly.io (`fly secrets set`)

| Variable | Origen | Nota |
|---|---|---|
| `NODE_ENV` | `production` | — |
| `PORT` | `8080` | Fly.io interno |
| `SUPABASE_URL` | Supabase dashboard | `https://tvkdhjxatkehuryvnjmu.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API | ⚠️ bypasea RLS, protéjala |
| `VAPI_WEBHOOK_SECRET` | tú lo generas: `openssl rand -hex 32` | mismo valor en Vapi assistant `server.secret` |
| `PHONE_ENCRYPTION_KEY` | tú lo generas: `openssl rand -hex 32` | 256 bits para AES-GCM |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud Console → IAM → Service Accounts → key JSON | pegar JSON entero como string; el service account debe tener acceso a los calendarios de los negocios |
| `LOG_LEVEL` | `info` | `debug` en primeros días |

### Vapi (dashboard → Assistant settings o via API)

| Variable | Origen |
|---|---|
| BYOK OpenAI API key | OpenAI dashboard |
| BYOK ElevenLabs API key | ElevenLabs → Profile → API |
| BYOK Deepgram API key | Deepgram dashboard |
| Server URL | https://voz-agente-tools.fly.dev/tools |
| Server secret | mismo valor que `VAPI_WEBHOOK_SECRET` arriba |
| End-of-call webhook URL | https://voz-agente-tools.fly.dev/webhook/post-call |

### n8n (credenciales en la instancia Railway existente)

Reutilizar:
- Supabase — ya conectado
- Google Calendar OAuth2 — ya conectado
- 360dialog WhatsApp — ya conectado

Crear nuevas (prefijo `voz_`):
- `voz_openai` — OpenAI key para resumen/sentimiento en post-call
- `voz_supabase_service_role` — service role para bypass RLS al limpiar audios

Variables de entorno n8n (dashboard Railway):
| Variable | Nota |
|---|---|
| `VAPI_WEBHOOK_SECRET` | mismo valor que microservicio, para validar HMAC en post-call si usamos n8n como receptor directo (por defecto no, el micro reenvía) |

### GitHub Actions (si mañana automatizamos deploy)

- `FLY_API_TOKEN` — Fly.io deploy
- `SUPABASE_ACCESS_TOKEN` — para correr migraciones desde CI

## Rotación

Rotar trimestralmente:
- `VAPI_WEBHOOK_SECRET`
- `PHONE_ENCRYPTION_KEY` (con re-cifrado de datos; script separado — no rotar sin plan)

Rotar inmediatamente si:
- Cambio de empleado con acceso.
- Sospecha de fuga.
- Cambio de proveedor.

## Cómo te paso los valores yo (tú)

Tú (Abián) me pegas en el chat solo lo mínimo necesario para que yo pueda escribir código o llamar APIs por ti:

- `SUPABASE_URL` (público, ya está en README)
- `SUPABASE_SERVICE_ROLE_KEY` (para correr migraciones desde aquí si hace falta)
- `VAPI_API_KEY` (para crear assistants via API desde aquí)
- URL del webhook n8n para post-call (cuando lo crees)

**No me pegues** (los metes tú directo donde toque):
- OpenAI, Anthropic, ElevenLabs, Deepgram, Twilio keys
- `PHONE_ENCRYPTION_KEY` (lo generas y pegas en Fly.io, yo nunca lo necesito)
- `VAPI_WEBHOOK_SECRET` (idem)
- Google service account JSON (lo pegas en Fly.io directo)
