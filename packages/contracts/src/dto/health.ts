import { z } from "zod";
import { initContract } from "@ts-rest/core";

const c = initContract();

export const healthContract = c.router(
  {
    check: {
      method: "GET",
      path: "/health",
      responses: {
        200: z.object({ status: z.literal("ok"), uptime: z.number() }),
      },
      summary: "Liveness probe",
    },
  },
  { pathPrefix: "/api" },
);
