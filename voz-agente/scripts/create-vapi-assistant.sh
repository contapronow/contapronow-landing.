#!/usr/bin/env bash
# =============================================================================
# create-vapi-assistant.sh
# Crea (o actualiza) un assistant en Vapi para un negocio dado.
# Uso:
#   export VAPI_API_KEY=tu_key
#   export MICROSERVICE_URL=https://voz-agente-tools.fly.dev
#   export VAPI_WEBHOOK_SECRET=tu_secreto_hmac
#   export ELEVENLABS_VOICE_ID=id_de_voz_castellana
#
#   bash scripts/create-vapi-assistant.sh <BUSINESS_ID> "<NOMBRE_NEGOCIO>"
#
# Imprime el ASSISTANT_ID al final — guárdalo y actualiza va_businesses.vapi_assistant_id
# =============================================================================

set -euo pipefail

BUSINESS_ID="${1:?Falta BUSINESS_ID como primer argumento}"
BUSINESS_NAME="${2:?Falta NOMBRE_NEGOCIO como segundo argumento}"

: "${VAPI_API_KEY:?Necesitas VAPI_API_KEY en el entorno}"
: "${MICROSERVICE_URL:?Necesitas MICROSERVICE_URL en el entorno}"
: "${VAPI_WEBHOOK_SECRET:?Necesitas VAPI_WEBHOOK_SECRET en el entorno}"
: "${ELEVENLABS_VOICE_ID:?Necesitas ELEVENLABS_VOICE_ID en el entorno}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/../vapi"
PROMPT_TEMPLATE="$TEMPLATE_DIR/system-prompt-template.txt"
ASSISTANT_TEMPLATE="$TEMPLATE_DIR/assistant.json"

# Leer system prompt y sustituir variables básicas
SYSTEM_PROMPT=$(cat "$PROMPT_TEMPLATE" | \
  sed "s|{{BUSINESS_NAME}}|${BUSINESS_NAME}|g" | \
  sed "s|{{BUSINESS_SECTOR}}|comercio local|g" | \
  sed "s|{{BUSINESS_ADDRESS}}|Consultar con el negocio|g" | \
  sed "s|{{BUSINESS_PHONE}}|Consultar con el negocio|g"
)

FIRST_MESSAGE="Gracias por llamar a ${BUSINESS_NAME}, le atiendo enseguida. ¿En qué puedo ayudarle?"

# Construir JSON del assistant usando jq (asegurar que está instalado)
if ! command -v jq &> /dev/null; then
  echo "ERROR: jq no está instalado. Instálalo con: brew install jq  (Mac) o apt install jq (Linux)"
  exit 1
fi

ASSISTANT_JSON=$(jq -n \
  --arg name "${BUSINESS_NAME} — Agente de voz" \
  --arg system_prompt "$SYSTEM_PROMPT" \
  --arg voice_id "$ELEVENLABS_VOICE_ID" \
  --arg first_msg "$FIRST_MESSAGE" \
  --arg micro_url "$MICROSERVICE_URL" \
  --arg webhook_secret "$VAPI_WEBHOOK_SECRET" \
  --arg business_id "$BUSINESS_ID" \
  '{
    name: $name,
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 300,
      messages: [{ role: "system", content: $system_prompt }]
    },
    voice: {
      provider: "11labs",
      voiceId: $voice_id,
      model: "eleven_flash_v2_5",
      stability: 0.5,
      similarityBoost: 0.75,
      language: "es"
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-3",
      language: "multi",
      smartFormat: true,
      endpointing: 550
    },
    firstMessage: $first_msg,
    firstMessageMode: "assistant-speaks-first",
    endCallMessage: ("Muchas gracias por llamar a " + $name + ". ¡Hasta pronto!"),
    endCallPhrases: ["adiós","hasta luego","hasta pronto","bye","goodbye","gracias y adiós"],
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 600,
    backgroundSound: "office",
    backchannelingEnabled: true,
    backgroundDenoisingEnabled: true,
    server: {
      url: ($micro_url + "/tools"),
      secret: $webhook_secret,
      timeoutSeconds: 0.9
    },
    analysisPlan: {
      summaryPrompt: "Resume esta llamada en 2 frases: qué quería el cliente y qué resultado tuvo.",
      structuredDataPrompt: "Extrae: intent (info|booking|transfer|abandoned), language_detected (es|en|other), sentiment (positive|neutral|negative).",
      structuredDataSchema: {
        type: "object",
        properties: {
          intent: { type: "string" },
          language_detected: { type: "string" },
          sentiment: { type: "string" }
        }
      }
    },
    artifactPlan: {
      recordingEnabled: true,
      transcriptPlan: { enabled: true }
    },
    metadata: {
      business_id: $business_id,
      account_id: "00000000-0000-0000-0000-000000000001",
      managed_by: "ContaProNow"
    },
    tools: [
      {
        type: "function",
        function: {
          name: "get_info",
          description: "Obtiene información del negocio: horarios, dirección, teléfono, servicios. Llámala cuando el cliente pregunte por horarios, ubicación, servicios o precios.",
          parameters: {
            type: "object",
            properties: {
              query_type: {
                type: "string",
                enum: ["hours","services","address","general"],
                description: "Tipo de información. Usa general si no sabes."
              }
            },
            required: ["query_type"]
          }
        },
        server: { url: ($micro_url + "/tools/get-info"), secret: $webhook_secret, timeoutSeconds: 0.9 },
        messages: [
          { type: "request-start", content: "Un momento, déjame consultar eso." },
          { type: "request-failed", content: "Lo siento, ahora mismo no puedo acceder a esa información." }
        ]
      },
      {
        type: "function",
        function: {
          name: "check_availability",
          description: "Consulta huecos disponibles para cita. Llámala cuando el cliente quiera reservar.",
          parameters: {
            type: "object",
            properties: {
              date: { type: "string", description: "Fecha YYYY-MM-DD" }
            }
          }
        },
        server: { url: ($micro_url + "/tools/check-availability"), secret: $webhook_secret, timeoutSeconds: 0.9 },
        messages: [
          { type: "request-start", content: "Déjame revisar la disponibilidad, un momento." },
          { type: "request-failed", content: "No he podido consultar la disponibilidad. Le recomiendo llamarnos directamente." }
        ]
      },
      {
        type: "function",
        function: {
          name: "book_appointment",
          description: "Reserva una cita confirmada. Solo llámala cuando el cliente haya confirmado horario y nombre explícitamente.",
          parameters: {
            type: "object",
            properties: {
              start_time: { type: "string", description: "ISO 8601 con timezone" },
              end_time: { type: "string" },
              client_name: { type: "string" },
              service_name: { type: "string" },
              client_notes: { type: "string" }
            },
            required: ["start_time","client_name"]
          }
        },
        server: { url: ($micro_url + "/tools/book"), secret: $webhook_secret, timeoutSeconds: 0.9 },
        messages: [
          { type: "request-start", content: "Perfecto, estoy registrando su cita ahora mismo." },
          { type: "request-failed", content: "Lo siento, ha habido un problema al registrar la cita. Por favor, llámenos directamente." }
        ]
      }
    ]
  }'
)

echo "Creando assistant en Vapi..."
RESPONSE=$(curl -s -X POST "https://api.vapi.ai/assistant" \
  -H "Authorization: Bearer ${VAPI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$ASSISTANT_JSON"
)

ASSISTANT_ID=$(echo "$RESPONSE" | jq -r '.id // empty')

if [[ -z "$ASSISTANT_ID" ]]; then
  echo "ERROR: No se pudo crear el assistant."
  echo "Respuesta de Vapi:"
  echo "$RESPONSE" | jq .
  exit 1
fi

echo ""
echo "✓ Assistant creado con éxito"
echo "  ASSISTANT_ID: $ASSISTANT_ID"
echo ""
echo "Próximo paso: actualiza va_businesses en Supabase:"
echo "  UPDATE va_businesses SET vapi_assistant_id = '${ASSISTANT_ID}' WHERE id = '${BUSINESS_ID}';"
echo ""
echo "Luego en el dashboard Vapi: Phone Numbers → tu número → Assistant → ${BUSINESS_NAME} — Agente de voz"
