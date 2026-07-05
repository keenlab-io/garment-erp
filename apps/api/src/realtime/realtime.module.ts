import { Global, Module } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway.js";

/** Global realtime module. `TokenService` comes from the global `AuthModule`. */
@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
