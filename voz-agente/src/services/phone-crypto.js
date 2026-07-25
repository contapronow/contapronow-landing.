import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { config } from '../config.js';

const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(config.phone.encryptionKey, 'hex'); // 32 bytes

/**
 * Cifra un número de teléfono con AES-256-GCM.
 * Devuelve { ciphertext, iv, tag } todos en hex.
 */
export function encryptPhone(phone) {
  const iv = randomBytes(12); // 96 bits estándar GCM
  const cipher = createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Descifra un número de teléfono previamente cifrado.
 * Permite devolver la llamada o personalizar el seguimiento.
 */
export function decryptPhone(ciphertext, iv, tag) {
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
