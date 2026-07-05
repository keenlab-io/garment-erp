import { Global, Module } from "@nestjs/common";
import { PdfService } from "./pdf.service.js";

/** Global PDF-rendering module. */
@Global()
@Module({
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
