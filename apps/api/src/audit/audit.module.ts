import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service.js";
import { AuditSubscriber } from "./audit.subscriber.js";

/** Global audit module — the direct `AuditService` plus the wildcard subscriber. */
@Global()
@Module({
  providers: [AuditService, AuditSubscriber],
  exports: [AuditService],
})
export class AuditModule {}
