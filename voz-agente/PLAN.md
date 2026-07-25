# voz-agente — Plan maestro

**Objetivo:** agente telefónico de voz IA multi-tenant listo para demo el lunes.
**Primer despliegue:** Gangas Gonzales (Tenerife). Segundo objetivo comercial: Felix Food & Wine.

## Arquitectura final

```
      Cliente marca número
              │
              ▼
   ┌──────────────────────┐
   │       Vapi           │  ← STT Deepgram Nova-3 multi
   │  (Assistant por      │  ← LLM GPT-4o mini
   │   negocio)           │  ← TTS ElevenLabs es-ES
   └──────────┬───────────┘
              │ HTTPS + HMAC
              ▼
   ┌──────────────────────┐
   │  Microservicio Node  │  Fly.io, warm, p95 <200ms
   │  Fastify             │
   │                      │
   │  /tools/get-info     │
   │  /tools/check-avail  │
   │  /tools/book         │
   │  /webhook/post-call  │
   └──┬──────────┬────────┘
      │          │
      ▼          ▼
 ┌────────┐  ┌────────────────┐
 │Supabase│  │ Google Calendar│
 │(multi- │  │  (por negocio) │
 │tenant) │  └────────────────┘
 └────┬───┘
      │ trigger on call insert
      ▼
 ┌──────────────────────────┐
 │  n8n (Railway existente) │
 │  voz-agente_post-call    │  → resumen, sentimiento
 │  voz-agente_cleanup-30d  │  → purga audios >30d
 └───────────┬──────────────┘
             │ 360dialog
             ▼
        WhatsApp al dueño
```

## Componentes

| Capa | Producto | Ubicación |
|---|---|---|
| Voz orquestador | Vapi | cuenta Vapi ContaProNow |
| Telefonía | Número Vapi (compra directa) | Vapi |
| STT | Deepgram Nova-3 `multi` | vía Vapi BYOK o managed |
| LLM en llamada | GPT-4o mini | vía Vapi BYOK con OpenAI key |
| TTS | ElevenLabs `eleven_flash_v2_5`, voz castellana real | vía Vapi BYOK |
| Microservicio tools | Node 20 + Fastify | Fly.io, región `mad` |
| Datos | Supabase existente `tvkdhjxatkehuryvnjmu` | tablas nuevas con prefijo `va_` |
| Post-call | n8n Railway existente | workflows prefijo `voz-agente_` |
| Notificaciones | 360dialog (WhatsApp) | reutiliza credenciales n8n |
| Calendarios | Google Calendar | cuenta `contapronoww@gmail.com` |

## Modelo multi-tenant

**Un microservicio, N assistants Vapi, N negocios en Supabase.**

- Cada assistant en Vapi lleva metadata `{ business_id: "uuid" }` fijado al crearlo.
- El microservicio recibe el `assistantId` en cada tool call de Vapi, resuelve `business_id`, carga config de la fila `va_businesses`, sirve respuesta.
- Añadir cliente = 1 fila SQL + 1 POST a Vapi para crear assistant. Cero código.

## Cobertura por sector

Sirve para PYME donde el trabajo del receptor es info + cita + transfer humano.

Encaja: restauración, comercio local, salud/estética, automoción, servicios profesionales, inmobiliaria.
No encaja: emergencias sanitarias, ventas B2B negociadas, soporte técnico con acceso a sistemas del cliente, cobros con tarjeta.

## Reglas duras heredadas

- Timezone: siempre `Atlantic/Canary`. Nunca `Europe/Madrid`, nunca `setHours()` sin zona.
- Idioma: español europeo primario, inglés fallback si Deepgram detecta EN en primer turno.
- Cifrado: teléfonos entrantes cifrados AES-GCM (no hasheados — necesitamos poder devolver la llamada).
- Grabaciones: TTL 30 días en Supabase Storage, purga por cron n8n.
- Transcripción: retención indefinida.
- HMAC SHA-256 obligatorio en todos los webhooks. Header `X-Vapi-Signature`.
- Timeout tool call: 800 ms hard en el microservicio, 900 ms configurado en Vapi.
- Idempotencia: cada `book_appointment` chequea `(vapi_call_id, business_id, start_time)` antes de crear.
- Kill switch: `va_businesses.active = false` → agente dice frase de cortesía y cuelga.

## Fases y timeline

- **Fase 0** — Cimientos (viernes noche, 2h) — este mensaje.
- **Fase 1** — Datos y microservicio (sábado, 6h).
- **Fase 2** — Vapi + n8n (sábado tarde/domingo, 4h).
- **Fase 3** — Pruebas + grabación demo (domingo, 3h).
- **Lunes** — demo con vídeo y llamada en vivo.

## Criterios de éxito para la demo del lunes

1. Llamada real entrante a un número real contestada en <2s.
2. Latencia percibida turno-turno <1s p50.
3. Cero silencios raros: filler words activos cuando tool tarda.
4. Registrar cita real en Google Calendar durante la demo.
5. WhatsApp con resumen llega al dueño en <30s tras colgar.
6. Vídeo demo de 90-120s grabado y editado.

## Fuera de scope hasta post-venta

- IP allowlist Vapi (no publican rangos estables).
- Rate limiting propio en n8n (queda en el microservicio + Cloudflare).
- Warm transfer humano con SIP REFER (v2, cuando cierre el primer cliente).
- Panel web multi-tenant para configurar sin SQL (v3).
- Portabilidad de números móviles españoles (LlamaYa/Yoigo no exponen SIP — no aplica).
