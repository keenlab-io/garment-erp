import { Inject, Injectable } from "@nestjs/common";
import { and, desc, ilike, or, sql } from "drizzle-orm";
import { customer, type Db } from "@erp/db";
import { tryDecodeCursor } from "@erp/utils";
import type {
  CreateCustomerRequest,
  Customer,
  CustomersQuery,
} from "@erp/contracts";
import type { AuthUser } from "../auth/auth-user.js";
import { StateConflictError } from "../common/errors/app-exception.js";
import { buildPage } from "../common/pagination/cursor.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { toCustomerDto } from "./sales.util.js";

interface CustomerCursor {
  createdAt: string;
  id: string;
}

/**
 * Customer master (task 5.1, spec §5.2). Create plus a keyset-paginated autocomplete search
 * matching `name` or `tax_id` — the client uses it to fill in the billing address/branch.
 */
@Injectable()
export class CustomerService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(input: CreateCustomerRequest, actor: AuthUser): Promise<Customer> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .insert(customer)
      .values({
        name: input.name,
        taxId: input.tax_id ?? null,
        branchCode: input.branch_code ?? null,
        addresses: input.addresses,
        creditTermsDays: input.credit_terms_days,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning();
    if (!row) throw new StateConflictError("Customer could not be created");
    return toCustomerDto(row);
  }

  async list(query: CustomersQuery): Promise<{ data: Customer[]; next_cursor: string | null }> {
    const ex = currentExecutor(this.db);
    const decoded = query.cursor
      ? (tryDecodeCursor(query.cursor) as CustomerCursor | null)
      : null;
    const search = query.search?.trim();

    const filters = [
      search
        ? or(ilike(customer.name, `%${search}%`), ilike(customer.taxId, `%${search}%`))
        : undefined,
      decoded
        ? sql`(${customer.createdAt}, ${customer.id}) < (${new Date(decoded.createdAt)}, ${decoded.id})`
        : undefined,
    ].filter(Boolean);

    const rows = await ex
      .select()
      .from(customer)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(customer.createdAt), desc(customer.id))
      .limit(query.limit + 1);

    const page = buildPage(rows, query.limit, (r) => ({
      createdAt: r.createdAt.toISOString(),
      id: r.id,
    }));
    return { data: page.data.map(toCustomerDto), next_cursor: page.next_cursor };
  }
}
