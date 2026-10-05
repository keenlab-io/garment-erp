import { Global, Module } from "@nestjs/common";
import { EntitlementsService } from "./entitlements.service.js";
import { SeatService } from "./seat.service.js";

/**
 * Plan enforcement for the tenant side (M8 design D2/D3): `EntitlementsService` (module gating +
 * resolved flags) and `SeatService` (the seat cap). Global and mounted in BOTH deployment modes —
 * unlike the `/platform/*` surface, self-hosted still gates modules and enforces the `SELFHOSTED`
 * plan's seat cap — and consumed by the module controllers and the `iam/` services.
 */
@Global()
@Module({
  providers: [EntitlementsService, SeatService],
  exports: [EntitlementsService, SeatService],
})
export class EntitlementsModule {}
