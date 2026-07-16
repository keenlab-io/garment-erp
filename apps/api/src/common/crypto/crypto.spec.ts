import { describe, expect, it } from "vitest";
import {
  decryptWithKey,
  encryptWithKey,
  parseEncryptionKey,
} from "./crypto.js";

// PII round-trips through AES-256-GCM (task 5.6). A fixed key keeps the test deterministic;
// the ciphertext must never equal the plaintext and must survive a round-trip.
const KEY = parseEncryptionKey(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);

describe("crypto (AES-256-GCM PII helper)", () => {
  it("round-trips ciphertext back to the original plaintext", () => {
    const plain = "1234567890123"; // a Thai national ID
    const blob = encryptWithKey(KEY, plain);
    expect(decryptWithKey(KEY, blob)).toBe(plain);
  });

  it("stores ciphertext, never the plaintext bytes", () => {
    const plain = "sensitive-pii";
    const blob = encryptWithKey(KEY, plain);
    expect(blob.toString("utf8")).not.toContain(plain);
  });

  it("produces a fresh IV each call (ciphertexts differ for equal input)", () => {
    const a = encryptWithKey(KEY, "same");
    const b = encryptWithKey(KEY, "same");
    expect(a.equals(b)).toBe(false);
  });

  it("rejects a tampered auth tag", () => {
    const blob = encryptWithKey(KEY, "value");
    const last = blob.length - 1;
    blob.writeUInt8(blob.readUInt8(last) ^ 0xff, last); // flip a ciphertext byte
    expect(() => decryptWithKey(KEY, blob)).toThrow();
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => parseEncryptionKey("abcd")).toThrow();
  });
});
