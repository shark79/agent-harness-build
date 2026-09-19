/**
 * AES-256-GCM encryption for tokens at rest.
 *
 * Storage format: `{ivBase64}.{authTagBase64}.{ciphertextBase64}` - a single
 * delimited string that's convenient to store as one SQLite TEXT column.
 *
 * The key always comes from TOKEN_ENCRYPTION_KEY (see config.ts) - never derived
 * from the LinkedIn client secret. Decrypt only immediately before making a
 * LinkedIn API call; never put the result into a log line, tool response, or
 * error message.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended nonce length for GCM

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ".",
  );
}

export function decrypt(payload: string, key: Buffer): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted payload: expected iv.authTag.ciphertext");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  if (iv.byteLength !== IV_LENGTH) {
    throw new Error("Malformed encrypted payload: invalid IV length");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  // Throws if the key is wrong or the ciphertext/authTag was tampered with -
  // never silently returns garbage.
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
