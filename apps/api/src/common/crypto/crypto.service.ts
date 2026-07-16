import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { decryptWithKey, encryptWithKey, parseEncryptionKey } from "./crypto.js";

/**
 * Service-layer PII encryption (design D1). Binds the 32-byte key from the fail-fast
 * `ENCRYPTION_KEY` env var once and exposes `encrypt`/`decrypt` so callers never touch the
 * key. The wire and the DB only ever see ciphertext (`iv‖tag‖ct`).
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = parseEncryptionKey(config.getOrThrow<string>("ENCRYPTION_KEY"));
  }

  /** Encrypt plaintext PII into an `iv‖tag‖ciphertext` buffer for a `bytea` column. */
  encrypt(plain: string): Buffer {
    return encryptWithKey(this.key, plain);
  }

  /** Decrypt an `iv‖tag‖ciphertext` buffer back to plaintext. */
  decrypt(blob: Buffer): string {
    return decryptWithKey(this.key, blob);
  }
}
