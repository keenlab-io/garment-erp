import { randomUUID } from "node:crypto";
import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { asMoney, contract, type Invoice } from "@erp/contracts";
import { lineTotal, sumMoney } from "@erp/utils";

/**
 * In-memory demo store — proves the contract end-to-end. Replace with a real
 * repository + DB once an ORM/migrations are wired (db:migrate is a stub for now).
 */
const invoices: Invoice[] = [];
let seq = 1;

@Controller()
export class InvoiceController {
  @TsRestHandler(contract.invoices)
  async handler() {
    return tsRestHandler(contract.invoices, {
      create: async ({ body }) => {
        // body is already validated against InvoiceCreate by ts-rest.
        const total = sumMoney(
          body.lines.map((l) => lineTotal(l.qty, l.unitPrice)),
        );
        const invoice: Invoice = {
          id: randomUUID(),
          number: `INV-${String(seq++).padStart(5, "0")}`,
          customerId: body.customerId,
          vatMode: body.vatMode,
          total: asMoney(total),
        };
        invoices.push(invoice);
        return {
          status: 201,
          body: { id: invoice.id, number: invoice.number },
        };
      },
      list: async () => ({
        status: 200,
        body: { items: invoices },
      }),
    });
  }
}
