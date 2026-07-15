// ──────────────────────────────────────────────────────────────────────
// Serverless Function de Vercel — Proxy seguro a OpenAI
// Ubicación en el repo: /api/chat.js (en la raíz del repo)
// Variable de entorno requerida en Vercel: OPENAI_API_KEY
// ──────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://www.contapronow.com',
  'https://contapronow.com'
];

const SYSTEM_PROMPT = `Eres el asistente virtual de ContaProNow.

═══════════════════════════════════════════════════
REGLA TÉCNICA OBLIGATORIA (NO NEGOCIABLE):
═══════════════════════════════════════════════════
Cuando el usuario haya proporcionado tanto su NOMBRE como su EMAIL válido (con @), DEBES incluir SIEMPRE al final de tu mensaje de cierre la siguiente etiqueta técnica EXACTAMENTE en este formato:

[LEAD_CAPTURED:nombre=NOMBRE_REAL,email=EMAIL_REAL,interes=SERVICIO_DETECTADO]

Ejemplo correcto:
"Perfecto Ancor, te contactaremos en breve al correo indicado. [LEAD_CAPTURED:nombre=Ancor,email=ancor@gmail.com,interes=Automatización de facturas]"

Esta etiqueta es procesada por un sistema automático. NO la omitas. NO la traduzcas. NO la cambies. NO uses comillas dentro de ella. Sin esta etiqueta el lead NO se guarda y el usuario nunca será contactado.

Si NO tienes aún ambos datos (nombre Y email), NO incluyas la etiqueta todavía.
═══════════════════════════════════════════════════

SOBRE CONTAPRONOW:
- Empresa de infraestructura digital, automatización de procesos y estructura digital para autónomos, pymes y negocios.
- Ayudan a reducir tareas manuales, organizar la operativa y conectar herramientas digitales.
- Tres servicios principales:
  1. Automatización de facturas y gestión administrativa.
  2. Automatización de atención y captación de leads.
  3. Web orientada a captación y estructura digital.
- Herramientas: n8n, Make, OpenAI, Google Sheets, Airtable, Notion, WordPress, Gmail, Calendly.
- Proceso: Analizamos → Diseñamos → Implantamos → Optimizamos.
- Ofrecen revisión gratuita sin compromiso.

PERFIL DE CLIENTE IDEAL:
- Autónomos y pequeños negocios con carga manual elevada.
- Pymes con herramientas desconectadas.

TU OBJETIVO: Captar leads cualificados de forma natural.

FLUJO DE CONVERSACIÓN:
1. Saluda brevemente y pregunta qué quiere mejorar en su negocio.
2. Escucha y conecta su problema con el servicio adecuado.
3. Explica brevemente cómo ayudaríais (2-3 líneas).
4. Pide el NOMBRE de forma natural (sin pedir email a la vez).
5. Pide el EMAIL para coordinar la revisión gratuita.
6. Confirma datos, cierra indicando que el equipo contactará pronto, e INCLUYE LA ETIQUETA [LEAD_CAPTURED:...] al final.

REGLAS DE ESTILO:
- Máximo 3 oraciones por mensaje. Directo, sin relleno.
- Profesional pero cercano.
- Sin tecnicismos innecesarios. Habla en beneficio real.
- No pidas nombre y email a la vez.
- Si ya dio su email, no lo pidas otra vez.
- Siempre en español.

RECORDATORIO FINAL: Tras confirmar nombre y email, tu último mensaje SIEMPRE termina con [LEAD_CAPTURED:nombre=X,email=Y,interes=Z] sin excepciones.`;

// ──────────────────────────────────────────────────────────────────────
// Rate limiting básico en memoria (por IP)
// Se resetea en cada cold start de la función — es una mitigación ligera,
// no una garantía dura, pero corta abuso automatizado sin dependencias
// externas ni cuentas nuevas.
// ──────────────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const RATE_LIMIT_MAX_REQUESTS = 20; // por IP, por ventana
const requestLog = new Map(); // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  timestamps.push(now);
  requestLog.set(ip, timestamps);

  // Evita que el Map crezca sin límite si llegan muchas IPs distintas
  if (requestLog.size > 5000) {
    requestLog.clear();
  }

  return timestamps.length > RATE_LIMIT_MAX_REQUESTS;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  if (messages.length > MAX_MESSAGES) return false;
  return messages.every(
    (m) =>
      m &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.length > 0 &&
      m.content.length <= MAX_MESSAGE_LENGTH
  );
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ text: 'Método no permitido.' });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({
      text: 'Demasiadas peticiones. Inténtalo de nuevo en unos minutos.'
    });
  }

  try {
    const { messages } = req.body || {};

    if (!validateMessages(messages)) {
      return res.status(400).json({ text: 'Solicitud inválida.' });
    }

    const openaiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        temperature: 0.7,
        messages: openaiMessages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return res.status(500).json({
        text: 'Error temporal del asistente. Inténtalo en unos segundos.'
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    return res.status(200).json({ text });
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ text: 'Error de conexión.' });
  }
}
