// Valida y exporta todas las env vars en un solo lugar.
// El proceso falla en arranque si falta algo crítico.

const required = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
};

const optional = (name, fallback = '') => process.env[name] ?? fallback;

export const config = {
  port: parseInt(optional('PORT', '8080'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  logLevel: optional('LOG_LEVEL', 'info'),

  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },

  vapi: {
    webhookSecret: required('VAPI_WEBHOOK_SECRET'),
  },

  phone: {
    encryptionKey: required('PHONE_ENCRYPTION_KEY'), // hex 32 bytes
  },

  google: {
    // Acepta JSON inline (Fly.io secrets) o ruta a fichero (local dev)
    serviceAccountJson: optional('GOOGLE_SERVICE_ACCOUNT_JSON'),
    applicationCredentials: optional('GOOGLE_APPLICATION_CREDENTIALS'),
  },

  timezone: 'Atlantic/Canary',

  // Timeout máximo para tool calls (ms). Vapi tiene 900ms — respondemos en 800ms.
  toolTimeoutMs: 800,

  // Rate limiting: máx peticiones por IP por ventana de 1 minuto
  rateLimit: {
    maxPerMinute: 60,
  },
};
