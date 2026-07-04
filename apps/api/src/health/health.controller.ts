import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { contract } from "@erp/contracts";
import { Public } from "../auth/decorators/public.decorator.js";

// @Public at the CLASS level — the global JwtGuard's Reflector cannot see
// method-level metadata on ts-rest handlers (M0 design D7).
@Public()
@Controller()
export class HealthController {
  @TsRestHandler(contract.health)
  async handler() {
    return tsRestHandler(contract.health, {
      check: async () => ({
        status: 200,
        body: { status: "ok" as const, uptime: process.uptime() },
      }),
    });
  }
}
