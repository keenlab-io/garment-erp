import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import { invoice, type Db } from "@erp/db";
import { toDecimal } from "@erp/utils";
import type { PromptPayQr } from "@erp/contracts";
import {
  BusinessRuleError,
  NotFoundError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";

/**
 * PromptPay QR (task 5.6, design D9). Builds the EMVCo Merchant-Presented payload from the
 * configured `PROMPTPAY_ID` and the invoice's net transfer amount (`grand − wht`) via
 * `promptpay-qr`, then renders it to a PNG (`qrcode`). `GET /invoices/{id}/promptpay-qr`
 * returns `{ payload, png_base64 }`; a missing `PROMPTPAY_ID` is a 422.
 */
@Injectable()
export class PromptPayService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: ConfigService,
  ) {}

  async qr(invoiceId: string): Promise<PromptPayQr> {
    const promptpayId = this.config.get<string>("PROMPTPAY_ID");
    if (!promptpayId) {
      throw new BusinessRuleError("PromptPay is not configured (PROMPTPAY_ID unset)");
    }

    const ex = currentExecutor(this.db);
    const [inv] = await ex
      .select({ grandTotal: invoice.grandTotal, whtAmount: invoice.whtAmount })
      .from(invoice)
      .where(eq(invoice.id, invoiceId))
      .limit(1);
    if (!inv) throw new NotFoundError(`Invoice not found: ${invoiceId}`);

    const amount = toDecimal(inv.grandTotal).minus(toDecimal(inv.whtAmount)).toNumber();
    const payload = generatePayload(promptpayId, { amount });
    const png = await QRCode.toBuffer(payload, { type: "png" });
    return { payload, png_base64: png.toString("base64") };
  }
}
