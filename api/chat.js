// ──────────────────────────────────────────────────────────────────────
// Serverless Function de Vercel — Proxy seguro a OpenAI
// Ubicación en el repo: /api/chat.js (en la raíz del repo)
// Variable de entorno requerida en Vercel: OPENAI_API_KEY
//
// Endurecimiento de seguridad:
//  - CORS restringido al dominio de producción (+ previews de Vercel).
//  - El system prompt vive AQUÍ (servidor). Se ignora cualquier `system`
//    enviado por el cliente → el endpoint no puede reutilizarse como un
//    LLM de propósito general a cargo de nuestra cuenta de OpenAI.
//  - Validación estricta de entrada (forma, número y tamaño de mensajes).
//  - Rate-limiting best-effort por IP (en memoria; mitiga ráfagas).
// ──────────────────────────────────────────────────────────────────────

// Fuente ÚNICA del system prompt (antes estaba en el cliente y era editable
// por cualquiera). El chatbot ya no lo envía; el servidor lo impone siempre.
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

// Orígenes autorizados a llamar por CORS (peticiones cross-origin desde el
// navegador). El propio sitio llama a /api/chat en el mismo origen, así que
// esto no afecta al chatbot; solo bloquea a terceros.
const ALLOWED_ORIGINS = new Set([
  'https://contapronow.com',
  'https://www.contapronow.com'
]);
// Previews de Vercel del propio proyecto (subdominios *.vercel.app).
const VERCEL_PREVIEW = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

// Límites de entrada.
const MAX_MESSAGES = 30;
const MAX_TOTAL_CHARS = 8000;
const VALID_ROLES = new Set(['user', 'assistant', 'system']);

// Rate-limit best-effort en memoria (se reinicia en cold starts; no sustituye
// a un KV, pero frena ráfagas contra una instancia caliente sin dependencias).
const RATE = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

function isRateLimited(ip) {
  const now = Date.now();
  const rec = RATE.get(ip);
  if (!rec || now > rec.resetAt) {
    RATE.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_MAX;
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.has(origin) || VERCEL_PREVIEW.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ text: 'Método no permitido.' });
  }

  // Rate-limiting por IP (primer salto de x-forwarded-for).
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ text: 'Demasiadas peticiones. Espera unos segundos.' });
  }

  try {
    const body = req.body || {};
    const { messages } = body;

    // Validación de forma, número y tamaño.
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
      return res.status(400).json({ text: 'Petición no válida.' });
    }

    let totalChars = 0;
    for (const m of messages) {
      if (!m || typeof m.role !== 'string' || typeof m.content !== 'string' || !VALID_ROLES.has(m.role)) {
        return res.status(400).json({ text: 'Petición no válida.' });
      }
      totalChars += m.content.length;
    }
    if (totalChars > MAX_TOTAL_CHARS) {
      return res.status(400).json({ text: 'Mensaje demasiado largo.' });
    }

    // Se descarta cualquier system del cliente: el prompt lo impone el servidor.
    const conversation = messages.filter((m) => m.role !== 'system');
    const openaiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversation
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
