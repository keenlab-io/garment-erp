import { z } from "zod";
import { initContract } from "@ts-rest/core";
import { API_PREFIX, withErrors } from "./_shared.js";

const c = initContract();

export const healthContract = c.router(
  {
    check: {
      method: "GET",
      path: "/health",
      responses: withErrors({
        200: z.object({ status: z.literal("ok"), uptime: z.number() }),
      }),
      summary: "Liveness probe",
    },
  },
  { pathPrefix: API_PREFIX },
);
