import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { contract } from "@erp/contracts";
import { Public } from "../auth/decorators/public.decorator.js";
import { AuthService } from "./auth.service.js";

/**
 * Public authentication endpoints. `@Public()` is applied at the class level because
 * the guard's Reflector cannot see method-level metadata on ts-rest handlers (M0
 * design D7) — so login/refresh live in their own controller, separate from the
 * authenticated IAM surface.
 */
@Public()
@Controller()
export class IamAuthController {
  constructor(private readonly auth: AuthService) {}

  @TsRestHandler(contract.iam.login)
  login() {
    return tsRestHandler(contract.iam.login, async ({ body }) => ({
      status: 200,
      body: await this.auth.login(body.username, body.password),
    }));
  }

  @TsRestHandler(contract.iam.refresh)
  refresh() {
    return tsRestHandler(contract.iam.refresh, async ({ body }) => ({
      status: 200,
      body: await this.auth.refresh(body.refresh_token),
    }));
  }
}
