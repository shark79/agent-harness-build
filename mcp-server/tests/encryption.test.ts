import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../src/storage/encryption.js";

const key = randomBytes(32);
const otherKey = randomBytes(32);

describe("encrypt/decrypt", () => {
  it("round-trips a plaintext token", () => {
    const plaintext = "AQXsome-linkedin-access-token-value";
    const encrypted = encrypt(plaintext, key);
    expect(decrypt(encrypted, key)).toBe(plaintext);
  });

  it("produces ciphertext that does not contain the plaintext", () => {
    const plaintext = "super-secret-token-value";
    const encrypted = encrypt(plaintext, key);
    expect(encrypted).not.toContain(plaintext);
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const plaintext = "same-token";
    const a = encrypt(plaintext, key);
    const b = encrypt(plaintext, key);
    expect(a).not.toBe(b);
  });

  it("throws when decrypting with the wrong key", () => {
    const encrypted = encrypt("a-token", key);
    expect(() => decrypt(encrypted, otherKey)).toThrow();
  });

  it("throws when the ciphertext has been tampered with", () => {
    const encrypted = encrypt("a-token-long-enough-to-flip-a-byte-in", key);
    const parts = encrypted.split(".");
    const ciphertextBytes = Buffer.from(parts[2], "base64");
    ciphertextBytes[0] ^= 0xff; // flip every bit of the first ciphertext byte
    const tampered = [parts[0], parts[1], ciphertextBytes.toString("base64")].join(".");
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it("throws on a malformed (non delimited) payload instead of returning garbage", () => {
    expect(() => decrypt("not-a-valid-payload", key)).toThrow();
  });
});
