import { Injectable } from "@nestjs/common";
import argon2 from "argon2";

/**
 * argon2id password hashing. Neither plaintext passwords nor hashes are ever
 * logged (M0 authentication spec).
 */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}
