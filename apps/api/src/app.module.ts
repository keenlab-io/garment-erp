import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";
import { InvoiceController } from "./invoice/invoice.controller.js";

@Module({
  controllers: [HealthController, InvoiceController],
})
export class AppModule {}
