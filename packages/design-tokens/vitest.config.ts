import { defineConfig } from "vitest/config";

// Unit tests build the token output in-memory and assert the locked values are present.
// No framework/DOM needed — plain Node environment.
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
  },
});
