import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import {
  DefaultPermissionResolver,
  DefaultSessionLookup,
  DefaultUserLookup,
} from "./auth.defaults.js";
import {
  PERMISSION_RESOLVER,
  SESSION_LOOKUP,
  USER_LOOKUP,
} from "./auth.tokens.js";
import { JwtGuard } from "./jwt.guard.js";
import { PasswordService } from "./password.service.js";
import { PermissionsGuard } from "./permissions.guard.js";
import { TokenService } from "./token.service.js";

/**
 * Global auth module. Provides the password/token services, both guards, and the
 * three DI seams (`USER_LOOKUP`, `SESSION_LOOKUP`, `PERMISSION_RESOLVER`) bound to
 * their M0 defaults. M1 rebinds `PERMISSION_RESOLVER` without touching M0 code
 * (design D6). Secrets are passed per-call by `TokenService`, so `JwtModule` is
 * registered empty. Guards are exported for global registration in `app.module`.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [
    PasswordService,
    TokenService,
    JwtGuard,
    PermissionsGuard,
    { provide: USER_LOOKUP, useClass: DefaultUserLookup },
    { provide: SESSION_LOOKUP, useClass: DefaultSessionLookup },
    { provide: PERMISSION_RESOLVER, useClass: DefaultPermissionResolver },
  ],
  exports: [
    PasswordService,
    TokenService,
    JwtGuard,
    PermissionsGuard,
    // Exported so the global `APP_GUARD` JwtGuard (instantiated in AppModule) can
    // inject the seams. M1 rebinds PERMISSION_RESOLVER by re-providing this token.
    USER_LOOKUP,
    SESSION_LOOKUP,
    PERMISSION_RESOLVER,
  ],
})
export class AuthModule {}
