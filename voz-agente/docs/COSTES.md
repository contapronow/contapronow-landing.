# COSTES.md — Desglose de coste por minuto

**Rellenar tras las primeras 100 llamadas de prueba real.**

## Estimación pre-datos

| Capa | Coste estimado /min | Base |
|---|---|---|
| Vapi platform fee | $0.05 | Tarifa base +BYOK |
| Deepgram Nova-3 `multi` | $0.0059 | $0.0059/min streaming |
| OpenAI GPT-4o mini (en llamada) | ~$0.04 | ~800 tokens/turno × 4 turnos/min |
| ElevenLabs Flash v2.5 | ~$0.03 | ~150 chars/turno × 4 turnos/min |
| Twilio / Vapi número USA | $0.013 | $0.013/min inbound |
| Fly.io microservicio (prorrateado) | ~$0.002 | Hobby plan 3$/mes / ~1500 min demo |
| Supabase Storage (grabaciones) | ~$0.001 | $0.021/GB, ~500KB/min audio |
| n8n post-call (Railway, prorrateado) | ~$0.002 | plan existente |
| **TOTAL estimado** | **~$0.14–$0.18/min** | — |
| GPT-4o mini post-call (resumen) | ~$0.001/llamada | fuera del tiempo de llamada |

**Nota:** el brief original cita $0.23–$0.30/min con stack similar. La diferencia está en que usamos `eleven_flash_v2_5` (más barato que `turbo`) y BYOK en Vapi (sin surcharge de su managed tier). Actualizar con datos reales.

## Datos reales (completar)

| Semana | Llamadas | Minutos | Coste total | $/min |
|---|---|---|---|---|
| — | — | — | — | — |

## Alertas de coste

Configurar en Vapi dashboard un budget alert a $50/mes para la fase de demo.
Configurar en OpenAI usage limits a $30/mes para la API key dedicada de voz.
