# voz-agente — Agente telefónico IA para PYMEs

Agente de voz IA multi-tenant para ContaProNow. Demo en producción: Gangas Gonzales (Tenerife).

## Stack

- **Vapi** — orquestador de voz (STT Deepgram Nova-3, LLM GPT-4o mini, TTS ElevenLabs es-ES)
- **Microservicio Node/Fastify** — tools en tiempo real, desplegado en Fly.io región `mad`
- **Supabase** — persistencia multi-tenant
- **n8n Railway** — lógica post-call (resumen, WhatsApp, limpieza)
- **Google Calendar** — reservas/citas por negocio

---

## Setup rápido (sábado mañana)

### 1. Prerrequisitos — cuentas y claves

Antes de correr nada, necesitas tener creadas estas cuentas y sus claves:

| Servicio | Acción |
|---|---|
| [Vapi](https://vapi.ai) | Crear cuenta → Dashboard → API Keys → copiar |
| [ElevenLabs](https://elevenlabs.io) | Crear cuenta (plan Starter+) → Profile → API Key |
| [Deepgram](https://deepgram.com) | Crear cuenta → API Keys |
| Google Cloud | Crear Service Account con Google Calendar API activada → exportar JSON |
| [Fly.io](https://fly.io) | `curl -L https://fly.io/install.sh | sh` → `fly auth login` |

### 2. Comprar número en Vapi

1. Dashboard Vapi → **Phone Numbers** → **Buy Number**.
2. Seleccionar país España (si disponible) o USA.
3. El número quedará sin assistant asignado hasta que corras el script de creación.

### 3. Supabase — correr migración

```bash
# Instalar Supabase CLI si no tienes
npm install -g supabase

# Aplicar migración (necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno)
export SUPABASE_URL=https://tvkdhjxatkehuryvnjmu.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=TU_KEY

psql "$SUPABASE_URL" -f supabase/migrations/001_initial.sql
# O desde el dashboard Supabase → SQL Editor → pegar el contenido del fichero
```

### 4. Seed Gangas Gonzales

```bash
psql "$SUPABASE_URL" -f seeds/gangas-gonzales.sql
# Actualiza el campo google_calendar_id con el ID real del calendario
```

### 5. Microservicio — local

```bash
cd src
cp ../.env.example .env
# Edita .env con tus valores reales
npm install
npm run dev
```

### 6. Microservicio — deploy Fly.io

```bash
cd src
fly launch --name voz-agente-tools --region mad --no-deploy
fly secrets set \
  SUPABASE_URL="https://tvkdhjxatkehuryvnjmu.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="TU_KEY" \
  VAPI_WEBHOOK_SECRET="$(openssl rand -hex 32)" \
  PHONE_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  NODE_ENV="production" \
  LOG_LEVEL="info"

# El GOOGLE_SERVICE_ACCOUNT_JSON es largo — pégalo desde fichero:
fly secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(cat secrets/google-sa.json)"

fly deploy
fly status
```

La URL pública será `https://voz-agente-tools.fly.dev`.

### 7. Crear assistant Vapi

```bash
# Necesita VAPI_API_KEY en el entorno y el microservicio ya desplegado
export VAPI_API_KEY=TU_VAPI_KEY
export MICROSERVICE_URL=https://voz-agente-tools.fly.dev
export VAPI_WEBHOOK_SECRET=EL_QUE_PUSISTE_EN_FLY

bash scripts/create-vapi-assistant.sh
# Devuelve ASSISTANT_ID — guárdalo, lo necesitas en el seed SQL
```

### 8. Asignar número Vapi al assistant

Desde el dashboard Vapi → Phone Numbers → tu número → Assistant → seleccionar el que acabas de crear.

### 9. Importar workflows n8n

1. n8n dashboard → **Workflows** → **Import from file**
2. Importar `n8n/voz-agente_post-call.json`
3. Importar `n8n/voz-agente_cleanup-30d.json`
4. En cada workflow, configurar credenciales (Supabase, 360dialog, OpenAI `voz_openai`).
5. Activar ambos workflows.
6. Copiar la URL del webhook `voz-agente_post-call` → pegar en `scripts/create-vapi-assistant.sh` como `END_OF_CALL_WEBHOOK_URL` y re-ejecutar, o actualizar el assistant desde el dashboard Vapi.

### 10. Test de humo

```bash
# Llama al número desde tu móvil
# Prueba: "Hola, ¿qué horario tenéis?"
# Prueba: "Quiero reservar para el sábado a las 11"
# Comprueba: Google Calendar tiene el evento
# Comprueba: WhatsApp recibiste el resumen en <30s

# Ver logs del microservicio en tiempo real:
fly logs -a voz-agente-tools
```

---

## Estructura del repo

```
voz-agente/
├── src/                    # Microservicio Fastify
│   ├── index.js            # Entrada, servidor
│   ├── config.js           # Env vars validadas
│   ├── routes/
│   │   ├── tools.js        # POST /tools/get-info|check-availability|book
│   │   └── webhook.js      # POST /webhook/post-call
│   └── services/
│       ├── supabase.js     # Cliente Supabase + helpers
│       ├── calendar.js     # Google Calendar — check + create event
│       ├── phone-crypto.js # AES-GCM cifrado/descifrado teléfono
│       └── hmac.js         # Validación HMAC Vapi
├── supabase/
│   └── migrations/
│       └── 001_initial.sql
├── seeds/
│   └── gangas-gonzales.sql
├── vapi/
│   └── assistant.json      # Plantilla assistant (sin secretos)
├── n8n/
│   ├── voz-agente_post-call.json
│   └── voz-agente_cleanup-30d.json
├── scripts/
│   └── create-vapi-assistant.sh
├── docs/
│   └── COSTES.md           # Rellenar tras primeras 100 llamadas
├── .env.example
├── .gitignore
├── PLAN.md
├── SECRETOS.md
└── README.md
```

---

## Añadir un nuevo negocio (30 min)

1. Insertar fila en `va_businesses` con sus datos, horarios, servicios, `google_calendar_id`.
2. Crear un calendario en Google Calendar y compartirlo con el service account.
3. Ejecutar `scripts/create-vapi-assistant.sh BUSINESS_ID NOMBRE` para crear el assistant.
4. Asignar número de teléfono al assistant en dashboard Vapi.
5. Listo.

---

## Multi-tenant: sectores compatibles

| Sector | Tipo de acción IA | Notas |
|---|---|---|
| Comercio local | Info + transfer | Sin calendar si no hay cita |
| Restauración | Info + reserva mesa | Google Calendar o webhook TheFork (v2) |
| Salud/estética | Cita + info | Google Calendar |
| Automoción/talleres | Cita revisión + presupuesto orientativo | Orientativo = rango de precio en datos negocio |
| Servicios profesionales | Cita consulta inicial | |
| Inmobiliaria | Info + visita | |

No compatible: emergencias sanitarias, ventas B2B negociadas, soporte con acceso a sistemas cliente, cobros PCI.
