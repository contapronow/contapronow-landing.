// ──────────────────────────────────────────────────────────────────────
// Serverless Function de Vercel — Proxy seguro de captación de leads
// Ubicación en el repo: /api/lead.js (en la raíz del repo)
//
// Motivo: antes el cliente hacía POST directo al webhook de n8n, lo que
// exponía su URL en el JS público y permitía inyectar leads falsos sin
// límite. Ahora el navegador llama a /api/lead (mismo origen) y es el
// servidor quien reenvía a n8n. Beneficios:
//  - La URL de n8n desaparece del bundle del cliente.
//  - Validación de entrada y rate-limiting antes de tocar n8n.
//  - Se puede quitar n8n de connect-src en la CSP.
//
// (Opcional a futuro: mover N8N_WEBHOOK_URL a una variable de entorno de
//  Vercel. Se deja como constante para que funcione sin config extra.)
// ──────────────────────────────────────────────────────────────────────

const N8N_WEBHOOK_URL = 'https://n8n-production-2fd6c.up.railway.app/webhook/lead-chatbot';

const ALLOWED_ORIGINS = new Set([
  'https://contapronow.com',
  'https://www.contapronow.com'
]);
const VERCEL_PREVIEW = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

// Límites de campos.
const MAX_NOMBRE = 200;
const MAX_EMAIL = 254;
const MAX_INTERES = 200;

// Rate-limit best-effort en memoria (frena ráfagas contra una instancia
// caliente; se reinicia en cold starts, sin dependencias externas).
const RATE = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

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

function isValidEmail(email) {
  return typeof email === 'string' &&
    email.length > 0 &&
    email.length <= MAX_EMAIL &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false });
  }

  try {
    const body = req.body || {};
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const interes = typeof body.interes === 'string' ? body.interes.trim() : '';

    // Validación: nombre y email obligatorios y con formato válido.
    if (!nombre || nombre.length > MAX_NOMBRE || !isValidEmail(email)) {
      return res.status(400).json({ ok: false });
    }

    const payload = {
      nombre,
      email,
      interes: (interes || 'No especificado').slice(0, MAX_INTERES)
    };

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('n8n webhook error:', response.status);
      return res.status(502).json({ ok: false });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Lead API error:', err);
    return res.status(500).json({ ok: false });
  }
}
