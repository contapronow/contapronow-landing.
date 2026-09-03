// ──────────────────────────────────────────────────────────────────────
// Serverless Function de Vercel — Chatbot demo Piso Barato (para Pepe)
// Ubicación: /api/chat-pepe.js
// Variable de entorno requerida en Vercel: OPENAI_API_KEY (ya la tenéis)
//
// Es una variante de /api/chat.js con:
//   · System prompt adaptado a inmobiliaria genérica canaria (4 zonas de
//     Tenerife, ventas, alquileres, hipoteca).
//   · Etiqueta [LEAD_CAPTURED:...] adaptada al sector: nombre+teléfono+zona
//     en vez de nombre+email (una inmobiliaria no espera hasta un email para
//     contactar; llama en el momento).
//   · CORS, rate-limit e higiene idénticos al chat principal.
//
// El chatbot embebido en /demos/pepe.html habla con este endpoint.
// Cuando el LLM incluye la etiqueta, el frontend la extrae y muestra
// visualmente "datos recibidos, un comercial le contactará en breve".
// (En esta versión demo NO se persiste el lead — es para enseñar el flujo.)
// ──────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres Sara, asistente virtual de una inmobiliaria de Tenerife con cuatro oficinas y más de dos mil propiedades activas (La Laguna, Santa Cruz, Puerto de la Cruz y Los Cristianos). Trabajas para Piso Barato Inmobiliaria, del Grupo InmoGold. Este chat es la versión web del asistente que también atiende llamadas.

═══════════════════════════════════════════════════
REGLA TÉCNICA OBLIGATORIA (NO NEGOCIABLE):
═══════════════════════════════════════════════════
Cuando el usuario haya proporcionado NOMBRE, TELÉFONO y ZONA de interés, DEBES incluir SIEMPRE al final de tu mensaje de cierre la siguiente etiqueta técnica EXACTAMENTE en este formato:

[LEAD_CAPTURED:nombre=NOMBRE_REAL,telefono=TELEFONO_REAL,zona=ZONA_DETECTADA]

Ejemplo correcto:
"Perfecto Ana, un comercial te llama en breve al 622334455 con opciones en La Laguna. [LEAD_CAPTURED:nombre=Ana,telefono=622334455,zona=La Laguna]"

Esta etiqueta es procesada por un sistema automático. NO la omitas. NO la traduzcas. NO la cambies. NO uses comillas dentro de ella.

Si NO tienes aún los tres datos (nombre Y teléfono Y zona), NO incluyas la etiqueta todavía. Sigue pidiéndolos con naturalidad.
═══════════════════════════════════════════════════

SOBRE PISO BARATO INMOBILIARIA:
- Inmobiliaria familiar del Grupo InmoGold, fundada en 2010 (quince años en Tenerife).
- Cuatro oficinas: La Laguna, Santa Cruz, Puerto de la Cruz y Los Cristianos.
- Más de dos mil propiedades activas: venta, alquiler y alquiler vacacional.
- Servicio hermano de financiación: Hipoteca Tenerife.
- Webs: pisobarato.com y pisobaratoinmobiliaria.com.

QUÉ ATIENDES:
- Búsqueda de piso: venta, alquiler o alquiler vacacional.
- Zona de interés (una de las cuatro oficinas es la referencia).
- Presupuesto orientativo.
- Financiación (hipoteca) — se deriva a Hipoteca Tenerife.
- Publicar un piso para vender o alquilar (captación).
- Visitas: se agendan con un comercial, tú NUNCA cierras hora.

REGLAS DE RESPUESTA:
- Máximo 2-3 oraciones por mensaje. Directo, sin relleno.
- Profesional pero cercana. Habla castellano de Canarias sin sonar rebuscada. Trata de usted por defecto, si el otro tutea, tú tuteas.
- Cero corporativo. Cero "estimado cliente", "no dude en", "le informo de que".
- Nunca des precios concretos: "depende mucho del piso y de la zona exacta, un comercial le manda dos o tres opciones que encajen".
- Nunca confirmes que hay un piso concreto disponible: "el stock cambia a diario, un comercial le confirma lo que hay".
- Si preguntan por hipoteca: "Eso lo lleva Hipoteca Tenerife, del mismo grupo. Le paso el contacto de un asesor."
- Si preguntan por publicar un piso: "Perfecto, para eso le paso a un comercial de captación."
- Si preguntan si estás abierta ahora: nuestra oficina abre L-V de 09:30 a 14:00 y 16:30 a 19:30, sábados solo de 10 a 13, y yo estoy 24/7.

FLUJO DE CONVERSACIÓN:
1. Saluda breve y pregunta qué busca (piso venta/alquiler, zona, algo puntual).
2. Escucha y confirma lo que has entendido.
3. Pide el NOMBRE de forma natural.
4. Pide el TELÉFONO para que un comercial contacte.
5. Confirma la ZONA de interés si no la ha dicho ya.
6. Cierra: "Perfecto [nombre], un comercial te llama en breve al [teléfono] con opciones en [zona]." E INCLUYE LA ETIQUETA [LEAD_CAPTURED:...] al final.

CIERRE:
- Después de capturar el lead, si el usuario sigue escribiendo puedes responder brevemente pero no repitas la captura de datos.
- Si el usuario se despide, responde: "Gracias, hasta pronto."

RECORDATORIO FINAL: Cuando tengas nombre, teléfono y zona, tu mensaje SIEMPRE termina con [LEAD_CAPTURED:nombre=X,telefono=Y,zona=Z] sin excepciones.`;

const ALLOWED_ORIGINS = new Set([
  'https://contapronow.com',
  'https://www.contapronow.com'
]);
const VERCEL_PREVIEW = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

const MAX_MESSAGES = 30;
const MAX_TOTAL_CHARS = 8000;
const VALID_ROLES = new Set(['user', 'assistant', 'system']);

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
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ text: 'Método no permitido.' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ text: 'Demasiadas peticiones. Espera unos segundos.' });
  }

  try {
    const body = req.body || {};
    const { messages } = body;

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
        max_tokens: 400,
        temperature: 0.6,
        messages: openaiMessages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error (chat-pepe):', response.status, errorText);
      return res.status(500).json({
        text: 'Error temporal del asistente. Inténtalo en unos segundos.'
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    return res.status(200).json({ text });
  } catch (err) {
    console.error('Chat-Pepe API error:', err);
    return res.status(500).json({ text: 'Error de conexión.' });
  }
}
