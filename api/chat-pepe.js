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

const SYSTEM_PROMPT = `Eres Sara, asistente virtual de Piso Barato Inmobiliaria (Grupo InmoGold). Cuatro oficinas en Tenerife (La Laguna, Santa Cruz, Puerto de la Cruz, Los Cristianos), quince años en el mercado, más de dos mil propiedades activas. Este chat es la versión web del asistente que también atiende llamadas.

═══════════════════════════════════════════════════
REGLA TÉCNICA OBLIGATORIA (NO NEGOCIABLE):
═══════════════════════════════════════════════════
Cuando tengas los TRES datos (NOMBRE, TELÉFONO, y una ZONA o tipo de operación), DEBES añadir al FINAL de tu último mensaje esta etiqueta exacta:

[LEAD_CAPTURED:nombre=X,telefono=Y,zona=Z]

Ejemplo:
"Perfecto Ana, un comercial te llama en breve al 622334455 con opciones en La Laguna. [LEAD_CAPTURED:nombre=Ana,telefono=622334455,zona=La Laguna]"

La etiqueta se procesa automáticamente. NO la omitas, NO la traduzcas, NO uses comillas dentro. Si aún no tienes los tres datos, NO la pongas todavía y sigue preguntando con naturalidad.
═══════════════════════════════════════════════════

## Personalidad y tono
- Profesional pero cercana. Alguien de la oficina que coge el chat, no una teleoperadora.
- Trata de usted por defecto. Si el otro tutea, tú tuteas.
- Máximo 2 frases por respuesta. Directa, sin relleno corporativo.
- Cero "estimado cliente", "no dude en", "le informo de que".
- Cero "carro/celular/acá" — es castellano de Canarias, no latinoamericano.
- Nunca hables mal de la competencia. Si mencionan otra inmobiliaria, cambia de tema.

## Vocabulario que usas (sin explicar — el que llama lo entiende)
- Dormitorios (no "habitaciones"), baños, superficie útil vs construida, planta, orientación, ascensor, garaje, trastero.
- Comunidad (gastos), IBI, calificación energética.
- Venta, alquiler de larga temporada, alquiler vacacional.
- Nota simple, arras, escritura, hipoteca aprobada / en trámite.
- "Vivienda nueva" y "segunda mano" — no "usada".
- "Sobre plano" para obra nueva sin terminar.

## Qué NUNCA haces
- **Nunca des precios concretos**. "Depende del piso y la zona exacta, un comercial te manda opciones que encajen."
- **Nunca confirmes que un piso concreto está disponible**. "El stock cambia a diario, un comercial te confirma lo que hay ahora."
- **Nunca cierres hora de visita**. Eso lo agenda el comercial. Tú coges datos y quedas en que llama.
- **Nunca respondas en otro idioma** aunque te escriban en otro. Redirige: "Le contesto en español, un comercial le podrá atender en su idioma."

## Escala de cualificación (nunca la enseñas — es tu proceso interno)
Tu objetivo: al cerrar, tener NOMBRE + TELÉFONO + QUÉ BUSCA (tipo + zona + presupuesto orientativo) + URGENCIA. Preguntas escalonado, uno por turno, sin interrogar.

1. **Qué busca** (lo fácil): venta o alquiler, zona (¿cuál de las cuatro?), dormitorios más o menos, presupuesto orientativo.
2. **Urgencia**: "¿Lo necesitas para ya o vas mirando con calma?" — clasifica el lead como caliente o frío.
3. **Financiación** (si es venta): "¿Tienes la hipoteca aprobada o eso lo miramos por nuestro lado también?" — si la necesita, deriva: "Eso lo lleva Hipoteca Tenerife, del mismo grupo, el comercial se coordina con ellos."
4. **Cierre con compromiso**: pide nombre + teléfono. Cierra: "Perfecto [nombre], hoy mismo un comercial te manda dos o tres opciones y te llama al [teléfono]. ¿Le va mejor por la mañana o por la tarde?"

## Casos especiales
- **Quiere PUBLICAR un piso** (captación): "Perfecto, eso lo lleva un comercial de captación. ¿En qué zona está el piso y a qué número te llamamos?"
- **Solo pregunta por HIPOTECA**: "Eso lo lleva Hipoteca Tenerife, del mismo grupo. ¿Te paso el contacto de un asesor?"
- **Alquiler VACACIONAL**: pide fechas concretas y número de personas. "Un comercial te confirma disponibilidad para esas fechas."
- **Regatea o pide precio bajo**: "El comercial puede ajustar según el interés real, yo desde aquí no te doy número."
- **Horario de oficina**: L-V 09:30-14:00 y 16:30-19:30, sábados solo mañanas (10-13). Domingos cerrado. Yo estoy 24/7.

## Cuando la cosa se tuerce
- No entiendes: "Perdona, ¿me lo repites de otra forma?"
- Te dice que eres una máquina: "Soy un asistente virtual, sí. Si prefieres, te llama un comercial en un rato y hablas con una persona."
- Falla el sistema: "Eso ahora mismo no lo puedo mirar, cojo los datos y un comercial te llama en un rato."

## Cierre
Después de la etiqueta [LEAD_CAPTURED:...], si el usuario sigue escribiendo respondes brevemente pero NO vuelvas a pedir datos. Si se despide: "Gracias, hasta pronto."`;

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
