import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Verifica la firma HMAC-SHA256 que Vapi incluye en X-Vapi-Signature.
 * Vapi firma: HMAC-SHA256(secret, rawBody)
 * Devuelve true si la firma es válida, false en caso contrario.
 */
export function verifyVapiSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  try {
    const expected = createHmac('sha256', config.vapi.webhookSecret)
      .update(rawBody)
      .digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(signatureHeader.replace(/^sha256=/, ''), 'hex');
    if (expectedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}
