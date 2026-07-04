import { z } from "zod";
import { initContract } from "@ts-rest/core";
import { moneyString, qtyString } from "../money/index.js";
import { VatMode } from "../enums/index.js";
import { API_PREFIX, withErrors } from "./_shared.js";

const c = initContract();

export const InvoiceLine = z.object({
  sku: z.string().min(1),
  qty: qtyString, // NUMERIC(18,6) as string — ห้าม float
  unitPrice: moneyString, // NUMERIC(18,4) as string
});
export type InvoiceLine = z.infer<typeof InvoiceLine>;

export const InvoiceCreate = z.object({
  customerId: z.string().uuid(),
  vatMode: z.nativeEnum(VatMode),
  lines: z.array(InvoiceLine).min(1),
});
export type InvoiceCreate = z.infer<typeof InvoiceCreate>;

export const Invoice = z.object({
  id: z.string().uuid(),
  number: z.string(),
  customerId: z.string().uuid(),
  vatMode: z.nativeEnum(VatMode),
  total: moneyString,
});
export type Invoice = z.infer<typeof Invoice>;

export const invoiceContract = c.router(
  {
    create: {
      method: "POST",
      path: "/invoices",
      body: InvoiceCreate,
      responses: withErrors({
        201: z.object({ id: z.string().uuid(), number: z.string() }),
      }),
      summary: "Create an invoice",
    },
    list: {
      method: "GET",
      path: "/invoices",
      responses: withErrors({
        200: z.object({ items: z.array(Invoice) }),
      }),
      summary: "List invoices",
    },
  },
  { pathPrefix: API_PREFIX },
);
