import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { contract } from "@erp/contracts";

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
