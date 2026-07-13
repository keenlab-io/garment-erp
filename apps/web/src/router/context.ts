import type { Session } from "../session/session-context";

/** Injected into the router so `beforeLoad` guards read the live session synchronously. */
export interface RouterContext {
  session: Session;
}
