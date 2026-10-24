import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { session, type Db } from "@erp/db";
import type { AuthUser } from "../auth/auth-user.js";
import { BusinessRuleError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import type { LogoutHook } from "../iam/logout-hook.js";
import { DemoGuardService } from "./demo-guard.service.js";
import { DemoPurgeService } from "./demo-purge.service.js";

/**
 * The sandbox sign-out path (M10 task 4.6, `demo-sandbox-purge` "Explicit sign-out purges the
 * sandbox"). `POST /demo/end` — and, via `LOGOUT_HOOK`, any `POST /auth/logout` on a sandbox
 * session — revokes every session of the sandbox, flips it to PURGING and enqueues `demo.purge`
 * after the request transaction commits (so the job exists only if the state change did). From
 * then on `TenantStatusGuard` refuses every request carrying the sandbox's `tid`, and the OIDC
 * layer only resumes ACTIVE sandboxes — a returning guest gets a fresh one.
 */
@Injectable()
export class DemoSessionService implements LogoutHook {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly guard: DemoGuardService,
    private readonly purge: DemoPurgeService,
  ) {}

  /** `POST /demo/end`: only a sandbox session can be ended this way (422 otherwise). */
  async end(user: AuthUser): Promise<void> {
    if (!(await this.isGuestSession(user))) {
      throw new BusinessRuleError("Only a demo sandbox session can be ended");
    }
    await this.endSandbox(user.tenantId);
  }

  /** After a plain logout: a sandbox guest signing out ends (and purges) the sandbox. */
  async afterLogout(user: AuthUser): Promise<void> {
    if (await this.isGuestSession(user)) await this.endSandbox(user.tenantId);
  }

  /** A sandbox session of the guest themself — a platform support session never ends the demo. */
  private async isGuestSession(user: AuthUser): Promise<boolean> {
    return (
      user.supportSessionId === undefined &&
      (await this.guard.kindOf(user.tenantId)) === "DEMO_SANDBOX"
    );
  }

  private async endSandbox(tenantId: string): Promise<void> {
    await currentExecutor(this.db)
      .update(session)
      .set({ revokedAt: new Date() })
      .where(and(eq(session.tenantId, tenantId), isNull(session.revokedAt)));
    await this.purge.beginPurge(tenantId, "SIGN_OUT");
  }
}
