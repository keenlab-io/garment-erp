import { Global, Module } from "@nestjs/common";
import { LineService } from "./line.service.js";

/**
 * Global LINE messaging module (M10 task 5.2) — the `QUEUES.line` producer every module that
 * sends a LINE update goes through, so the demo guardrail sits at the one egress seam.
 */
@Global()
@Module({
  providers: [LineService],
  exports: [LineService],
})
export class LineModule {}
