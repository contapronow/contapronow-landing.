/**
 * POST /webhook/post-call
 * Vapi llama aquí cuando termina una llamada (end-of-call-report).
 * El microservicio persiste los datos en Supabase y dispara el workflow n8n post-call.
 */

import { verifyVapiSignature } from '../services/hmac.js';
import { upsertCall, getBusinessByAssistantId } from '../services/supabase.js';
import { encryptPhone } from '../services/phone-crypto.js';
import { config } from '../config.js';

async function webhookRoutes(fastify) {
  fastify.post('/webhook/post-call', async (req, reply) => {
    // HMAC
    const sig = req.headers['x-vapi-signature'];
    if (!verifyVapiSignature(req.rawBody, sig)) {
      req.log.warn('invalid HMAC in post-call webhook');
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const payload = req.body?.message ?? req.body;

    // Ignorar eventos que no sean end-of-call-report (status-update, etc.)
    if (payload?.type && payload.type !== 'end-of-call-report') {
      return reply.send({ ok: true });
    }

    const callData = payload?.call ?? payload;

    try {
      const assistantId = callData?.assistantId;
      const business = assistantId
        ? await getBusinessByAssistantId(assistantId).catch(() => null)
        : null;

      // Sin negocio asociado no podemos persistir (business_id NOT NULL en DB)
      if (!business) {
        req.log.warn({ assistantId }, 'no business found for assistant — skipping persistence');
        return reply.send({ ok: true });
      }

      // Cifrar teléfono del llamante
      const rawPhone = callData?.customer?.number ?? '';
      let callerEncrypted = null;
      let callerIv = null;
      if (rawPhone) {
        const enc = encryptPhone(rawPhone);
        callerEncrypted = enc.ciphertext + ':' + enc.tag;
        callerIv = enc.iv;
      }

      const recordingPurgeAt = new Date();
      recordingPurgeAt.setDate(recordingPurgeAt.getDate() + 30);

      // Vapi puede enviar la URL en call.recordingUrl o en message.artifact.recordingUrl
      const recordingUrl = callData?.recordingUrl ?? payload?.artifact?.recordingUrl ?? null;

      // Duración: campo directo o calculado desde timestamps
      let durationSec = callData?.duration ?? null;
      if (durationSec == null && callData?.startedAt && callData?.endedAt) {
        durationSec = Math.round((new Date(callData.endedAt) - new Date(callData.startedAt)) / 1000);
      }

      const callRecord = {
        vapi_call_id:      callData?.id,
        vapi_assistant_id: assistantId,
        business_id:       business.id,
        caller_encrypted:  callerEncrypted,
        caller_iv:         callerIv,
        duration_sec:      durationSec,
        status:            callData?.endedReason ?? payload?.endedReason ?? 'completed',
        outcome:           null, // rellenado por n8n post-call
        language_detected: null,
        transcript:        extractTranscript(callData, payload),
        recording_url:     recordingUrl,
        recording_purge_at: recordingUrl ? recordingPurgeAt.toISOString() : null,
        started_at:        callData?.startedAt ?? null,
        ended_at:          callData?.endedAt ?? null,
      };

      const saved = await upsertCall(callRecord);

      // Disparar n8n post-call workflow de forma asíncrona (fire-and-forget)
      // No esperamos la respuesta para no bloquear el ACK a Vapi
      const n8nUrl = process.env.N8N_POST_CALL_WEBHOOK_URL;
      if (n8nUrl) {
        const n8nPayload = {
          call_db_id:    saved.id,
          vapi_call_id:  callData?.id,
          business_id:   business?.id,
          business_name: business?.name,
          transcript:    callRecord.transcript,
          duration_sec:  callRecord.duration_sec,
          transfer_whatsapp: business?.transfer_whatsapp,
        };
        fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(n8nPayload),
          signal: AbortSignal.timeout(5000),
        }).catch((err) => req.log.warn({ err }, 'n8n post-call webhook failed'));
      }

      req.log.info({ call_id: saved.id, vapi_call_id: callData?.id }, 'call persisted');
      return reply.send({ ok: true, call_id: saved.id });
    } catch (err) {
      req.log.error({ err }, 'post-call webhook error');
      // Siempre 200 a Vapi para que no reintente indefinidamente
      return reply.send({ ok: false, error: err.message });
    }
  });
}

function extractTranscript(callData, payload) {
  // Vapi puede poner los mensajes en call.messages o en message.artifact.transcript
  const messages =
    callData?.messages ??
    payload?.artifact?.messages ??
    callData?.transcript ??
    payload?.artifact?.transcript ??
    [];
  if (!Array.isArray(messages)) return typeof messages === 'string' ? messages : null;
  return messages
    .filter((m) => m.role && (m.message || m.content))
    .map((m) => `[${m.role.toUpperCase()}] ${m.message ?? m.content}`)
    .join('\n') || null;
}

export default webhookRoutes;
