import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, gt } from "drizzle-orm";
import { routingStep, routingTemplate, type Db } from "@erp/db";
import type {
  CreateRoutingTemplateRequest,
  RoutingTemplate as RoutingTemplateDto,
} from "@erp/contracts";
import { decodeCursor } from "@erp/utils";
import { NotFoundError } from "../common/errors/app-exception.js";
import { buildPage } from "../common/pagination/cursor.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";

/**
 * Routing templates and their ordered steps (task 4.1, spec §4.2). A template is the reusable
 * production recipe; work orders snapshot its steps at creation (design D1). Steps are unique
 * on `(template_id, seq)`, so a duplicate `seq` in the request surfaces as a DB conflict.
 */
@Injectable()
export class RoutingService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Create a template with its ordered steps; returns the template with steps. */
  async create(input: CreateRoutingTemplateRequest): Promise<RoutingTemplateDto> {
    const ex = currentExecutor(this.db);
    const [template] = await ex
      .insert(routingTemplate)
      .values({ name: input.name, productType: input.product_type })
      .returning();
    if (!template) throw new NotFoundError("Routing template creation failed");

    await ex.insert(routingStep).values(
      input.steps.map((s) => ({
        templateId: template.id,
        seq: s.seq,
        name: s.name,
        standardTimeMin: s.standard_time_min,
        departmentId: s.department_id ?? null,
      })),
    );

    return this.get(template.id);
  }

  /** Load a template with its ordered steps. */
  async get(id: string): Promise<RoutingTemplateDto> {
    const ex = currentExecutor(this.db);
    const [template] = await ex
      .select()
      .from(routingTemplate)
      .where(eq(routingTemplate.id, id))
      .limit(1);
    if (!template) throw new NotFoundError(`Routing template not found: ${id}`);

    const steps = await ex
      .select()
      .from(routingStep)
      .where(eq(routingStep.templateId, id))
      .orderBy(asc(routingStep.seq));

    return {
      id: template.id,
      name: template.name,
      product_type: template.productType,
      is_active: template.isActive,
      steps: steps.map((s) => ({
        id: s.id,
        template_id: s.templateId,
        seq: s.seq,
        name: s.name,
        standard_time_min: s.standardTimeMin,
        department_id: s.departmentId,
      })),
    };
  }

  /** Cursor-paginated template list (headers only; steps loaded via detail). */
  async list(query: { limit: number; cursor?: string }) {
    const ex = currentExecutor(this.db);
    const after = query.cursor ? (decodeCursor(query.cursor) as { id: string }) : null;
    const rows = await ex
      .select()
      .from(routingTemplate)
      .where(after ? gt(routingTemplate.id, after.id) : undefined)
      .orderBy(asc(routingTemplate.id))
      .limit(query.limit + 1);

    const templates = await Promise.all(rows.map((r) => this.get(r.id)));
    return buildPage(templates, query.limit, (t) => ({ id: t.id }));
  }
}
