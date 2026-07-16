import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM symmetric encryption for PII at rest (design D1). The stored `bytea` is
 * `iv‖authTag‖ciphertext` — a self-describing blob that carries everything `decrypt`
 * needs besides the key. Pure functions (key passed in) so they unit-test without any
 * Nest wiring; `CryptoService` binds the key from `ENCRYPTION_KEY`.
 */

const IV_LENGTH = 12; // GCM standard nonce length (bytes)
const TAG_LENGTH = 16; // GCM auth tag length (bytes)

/** Parse the 64-hex-char `ENCRYPTION_KEY` into its 32-byte buffer. */
export function parseEncryptionKey(hex: string): Buffer {
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

/** Encrypt UTF-8 `plain` under `key`; returns `iv‖tag‖ciphertext`. */
export function encryptWithKey(key: Buffer, plain: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

/** Decrypt an `iv‖tag‖ciphertext` blob under `key`; throws if the tag fails. */
export function decryptWithKey(key: Buffer, blob: Buffer): string {
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
