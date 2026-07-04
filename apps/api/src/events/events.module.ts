import { Global, Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { EventBusService } from "./event-bus.service.js";

/**
 * Global event bus. EventEmitter2 dispatch is synchronous, so handlers fired via
 * `publishInTransaction` run in the same ALS frame and see the active tx. Wildcard
 * matching (`**`) with a `.` delimiter lets the audit subscriber listen to all
 * events (M0 design D3).
 */
@Global()
@Module({
  imports: [EventEmitterModule.forRoot({ wildcard: true, delimiter: "." })],
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventsModule {}
