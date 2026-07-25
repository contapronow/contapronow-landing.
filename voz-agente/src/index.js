import Fastify from 'fastify';
import { config } from './config.js';
import toolsRoutes from './routes/tools.js';
import webhookRoutes from './routes/webhook.js';

const fastify = Fastify({
  logger: {
    level: config.logLevel,
    serializers: {
      req(req) {
        return { method: req.method, url: req.url, ip: req.ip };
      },
    },
  },
});

// Capturar rawBody para validación HMAC antes de parsear JSON
fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
  try {
    req.rawBody = body.toString('utf8');
    done(null, JSON.parse(req.rawBody));
  } catch (err) {
    done(err);
  }
});

// Rutas
await fastify.register(toolsRoutes);
await fastify.register(webhookRoutes);

// Health check (Fly.io lo usa para determinar si el contenedor está listo)
fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

// Arranque
try {
  await fastify.listen({ port: config.port, host: '0.0.0.0' });
  fastify.log.info(`voz-agente-tools arrancado en puerto ${config.port}`);
} catch (err) {
  fastify.log.fatal(err);
  process.exit(1);
}
