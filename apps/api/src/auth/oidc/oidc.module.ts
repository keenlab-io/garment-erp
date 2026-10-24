import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { IamModule } from "../../iam/iam.module.js";
import { OidcLoginService } from "./oidc-login.service.js";
import { OidcController } from "./oidc.controller.js";
import { OidcService } from "./oidc.service.js";

/**
 * Google OIDC sign-in (M10 §3). Reuses IAM's `AuthService` so every sign-in method lands in the
 * same session/token machinery; `TenantResolutionService`, `UnitOfWork`, `EntitlementsService`
 * and config come from the global modules. `DEMO_PROVISIONER` is optional — the demo module
 * (§4) binds it; unbound, a new demo-pool guest is refused.
 */
@Module({
  imports: [JwtModule.register({}), IamModule],
  controllers: [OidcController],
  providers: [OidcService, OidcLoginService],
  exports: [OidcService, OidcLoginService],
})
export class OidcModule {}
