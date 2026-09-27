import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DEFAULT_TENANT_SLUG } from "@erp/db";
import { TenantProvisioningService } from "./tenant-provisioning.service.js";

/**
 * Self-hosted boot (M7 design D15): the deployment runs exactly one tenant, the
 * `DEFAULT_TENANT_SLUG` one. Ensure it exists on every boot — idempotent, provisioned through
 * the same `TenantProvisioningService` + `seedTenantDefaults` path the cloud control plane uses,
 * so self-hosted is the cloud deployment with N=1. Migration 0012 already inserts the `default`
 * tenant, so this only provisions when `DEFAULT_TENANT_SLUG` names another slug.
 */
@Injectable()
export class SelfHostedBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(SelfHostedBootstrap.name);

  constructor(
    private readonly provisioning: TenantProvisioningService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const slug = this.config.get<string>("DEFAULT_TENANT_SLUG") ?? DEFAULT_TENANT_SLUG;
    const tenant = await this.provisioning.ensureTenant(slug);
    this.logger.log(`self-hosted tenant "${tenant.slug}" (${tenant.id}) ready`);
  }
}
