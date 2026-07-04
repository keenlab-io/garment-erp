import { defineConfig } from "drizzle-kit";

// drizzle-kit's loader can't resolve our `.js` ESM import specifiers against `.ts`
// source, so `schema` points at the COMPILED output — `db:generate` runs
// `tsc --build` first. Migrations are emitted to `tooling/drizzle` at the repo
// root and committed. `casing` must match the runtime client (see client.ts).
// M0-foundation plan §3 (drizzle-kit gotcha, ✔ verified).
export default defineConfig({
  dialect: "postgresql",
  schema: "./dist/schema/index.js",
  out: "../../tooling/drizzle",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://erp:erp@localhost:5432/erp",
  },
});
