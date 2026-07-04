import { Global, Module } from "@nestjs/common";
import { SequenceService } from "./sequence.service.js";

/** Global document-numbering module. */
@Global()
@Module({
  providers: [SequenceService],
  exports: [SequenceService],
})
export class SequenceModule {}
