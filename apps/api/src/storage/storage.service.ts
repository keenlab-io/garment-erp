import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BusinessRuleError } from "../common/errors/app-exception.js";
import { currentTenantId } from "../tenancy/tenant-context.js";

/**
 * A control-plane object key, minted only by `StorageService.platformKey` — the explicit escape
 * hatch from the tenant prefix (M7 design D13). No tenant code path uses it.
 */
export interface PlatformObjectKey {
  readonly platformKey: string;
}

/** A caller key: relative to the caller-tenant's prefix, or an explicit platform key. */
export type ObjectKey = string | PlatformObjectKey;

/** The key-space prefix of one tenant's objects. Tenant purge deletes exactly this prefix. */
export const tenantPrefix = (tenantId: string): string => `tenants/${tenantId}/`;

const PLATFORM_PREFIX = "platform/";

/**
 * Object storage over S3 v3 (`forcePathStyle` for MinIO). A region is required
 * even for MinIO (M0 design Risks). Closes the client on shutdown.
 *
 * Tenancy (M7 design D13): the service is the enforcement point for the tenant key space.
 * Callers keep passing (and persisting) relative keys — `payslips/…`, `reports/…` — and every
 * operation resolves them under `tenants/{currentTenantId()}/`; outside a tenant scope it
 * refuses. `getSignedUrl` re-checks the resolved key carries the caller-tenant's prefix before
 * presigning, because a presigned URL is a bearer capability that outlives the request.
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>("S3_ENDPOINT"),
      region: config.getOrThrow<string>("S3_REGION"),
      forcePathStyle: config.get<boolean>("S3_FORCE_PATH_STYLE") ?? true,
      credentials: {
        accessKeyId: config.getOrThrow<string>("S3_ACCESS_KEY"),
        secretAccessKey: config.getOrThrow<string>("S3_SECRET_KEY"),
      },
    });
  }

  async put(
    key: ObjectKey,
    body: Buffer | Uint8Array | string,
    contentType?: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.resolveKey(key),
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Fetch a stored object's bytes — used to attach a rendered report to a digest email. */
  async get(key: ObjectKey): Promise<Buffer> {
    const out: GetObjectCommandOutput = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.resolveKey(key) }),
    );
    const bytes = await out.Body?.transformToByteArray();
    return Buffer.from(bytes ?? new Uint8Array());
  }

  async getSignedUrl(key: ObjectKey, expiresInSeconds = 900): Promise<string> {
    const resolved = this.resolveKey(key);
    if (typeof key === "string") {
      const tenantId = currentTenantId();
      if (tenantId === null || !resolved.startsWith(tenantPrefix(tenantId))) {
        throw new BusinessRuleError("Refusing to presign an object outside the caller's tenant");
      }
    }
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: resolved }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(key: ObjectKey): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.resolveKey(key) }),
    );
  }

  /**
   * The escape hatch for control-plane objects (M7 design D13): a key under `platform/` that
   * bypasses the tenant prefix. Reserved for platform code — no tenant code path calls it.
   */
  platformKey(key: string): PlatformObjectKey {
    return { platformKey: `${PLATFORM_PREFIX}${assertRelativeKey(key)}` };
  }

  /**
   * The full S3 key for `key`: a relative key lands under the caller-tenant's prefix; a
   * platform key is used verbatim. Throws outside a tenant scope (never an unprefixed key).
   */
  private resolveKey(key: ObjectKey): string {
    if (typeof key !== "string") return key.platformKey;
    const tenantId = currentTenantId();
    if (tenantId === null) {
      throw new BusinessRuleError("Object storage requires a tenant scope");
    }
    return `${tenantPrefix(tenantId)}${assertRelativeKey(key)}`;
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}

/**
 * Reject keys that could escape their prefix once a proxy or client normalizes the path —
 * absolute keys, empty keys, and `.`/`..` segments.
 */
function assertRelativeKey(key: string): string {
  const segments = key.split("/");
  if (!key || key.startsWith("/") || segments.some((s) => s === "." || s === "..")) {
    throw new BusinessRuleError(`Invalid object key: "${key}"`);
  }
  return key;
}
