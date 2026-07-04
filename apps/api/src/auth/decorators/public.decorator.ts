import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a controller (or handler) as reachable without authentication. On ts-rest
 * controllers this MUST be applied at the class level — the guard's Reflector
 * cannot see method-level metadata on ts-rest handlers (M0 design D7).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
