import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

/**
 * Encrypts a plaintext string (e.g. an OAuth access/refresh token) using
 * AES-256-GCM. The output encodes iv + authTag + ciphertext (hex, `:`-joined)
 * so it can be stored as a single opaque string column.
 *
 * @param plainText the secret value to encrypt
 * @param keyHex a 32-byte key encoded as a 64-character hex string
 *   (e.g. generated with `openssl rand -hex 32`)
 */
export function encryptToken(plainText: string, keyHex: string): string {
  const key = resolveKey(keyHex);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypts a value previously produced by {@link encryptToken}.
 */
export function decryptToken(payload: string, keyHex: string): string {
  const [ivHex, authTagHex, dataHex] = payload.split(':');
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error('Malformed encrypted token payload');
  }

  const key = resolveKey(keyHex);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function resolveKey(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error(
      'GOOGLE_TOKEN_ENCRYPTION_KEY must be a 32-byte value encoded as 64 hex characters',
    );
  }
  return key;
}
