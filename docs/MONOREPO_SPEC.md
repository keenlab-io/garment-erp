# Monorepo Specification — Integrated Manufacturing & Sales ERP
### ข้อกำหนดโครงสร้าง Monorepo (Implementation-Ready)

| Field | Value |
|---|---|
| Document | Monorepo Architecture & Conventions Spec |
| Version | 1.0 (Draft for review) |
| Status | Proposed — extends main spec ADR-007 |
| Scope | Source layout, workspace tooling, shared contracts, build/CI, dependency boundaries |
| Stack assumed | React + TypeScript (web) · NestJS + TypeScript (api) · PostgreSQL · pnpm + Turborepo |

> **หมายเหตุ:** เอกสารนี้กำหนด *โครงสร้างซอร์สโค้ด* (source layout) เท่านั้น ไม่ใช่การ deploy — api และ web ยังคง build/deploy เป็น artifact แยกกัน และไม่ขัดกับการตัดสินใจ Modular Monolith (นั่นเป็นเรื่อง runtime ฝั่ง backend, อันนี้เป็นเรื่อง repo) ทั้งสองเป็นคนละแกนกัน (orthogonal)

---

## 1. Decision & Rationale

**Decision:** ใช้ **monorepo เดียว** สำหรับทั้ง backend, frontend และโค้ดที่ใช้ร่วมกัน บริหารด้วย **pnpm workspaces + Turborepo**

**เหตุผลหลัก (เฉพาะโปรเจกต์นี้):** ทั้งสองฝั่งเป็น TypeScript จึงสามารถมี *แหล่งความจริงเดียว* (single source of truth) สำหรับ contract ที่ต้องตรงกันทั้งสองฝั่ง ซึ่งใน ERP ที่ contract-heavy แบบนี้สำคัญมาก:

- Permission catalog strings (`inventory.product.create`, `sales.invoice.approve`)
- State-machine enums (routing statuses, `Pending | InProgress | Completed | Delayed`)
- Document-type codes (`QV` / `QNV`), numbering formats
- Money/quantity types (`NUMERIC(18,4)` / `NUMERIC(18,6)` → branded TS types)
- DTO / request-response shapes

ในแบบ monorepo สิ่งเหล่านี้นิยามครั้งเดียวใน `packages/contracts` แล้ว import ได้ทั้ง api และ web — เปลี่ยนชื่อ field หนึ่งครั้ง TypeScript จะ flag ทุกจุดที่ใช้ทั้งสองฝั่งใน PR เดียว และทำให้ cross-cutting change เป็น atomic commit เดียว

**Trade-offs ที่ยอมรับ:** ต้องมี workspace tool และ CI ที่ build เฉพาะส่วนที่เปลี่ยน (affected-only) มิฉะนั้น build จะช้า — เป็นต้นทุนที่คุ้มสำหรับทีมเดียว

**จะทบทวนใหม่เมื่อ:** ต้องเปิด API ให้ third-party ภายนอก, outsource frontend ให้เวนเดอร์อื่น, หรือมีหลาย frontend อิสระต่อ backend เดียว — กรณีเหล่านี้ separate repos จะเหมาะกว่า

---

## 2. Goals / Non-Goals

### Goals
- Type-safe API contract แบบ end-to-end จากนิยามเดียว
- Atomic cross-stack changes (endpoint + caller ใน commit เดียว)
- Incremental, cached builds (build/test เฉพาะ package ที่ได้รับผลกระทบ)
- Dependency boundaries ที่บังคับใช้ได้ (web ห้าม import จาก api โดยตรง ฯลฯ)
- Onboarding ครั้งเดียว: `git clone` + `pnpm install` แล้วรันได้ทั้งระบบ

### Non-Goals
- ไม่รวม deployment ของ api และ web เข้าด้วยกัน (ยังแยก artifact/container)
- ไม่ publish package ขึ้น public npm registry (ทุกอย่าง internal/private)
- ไม่ครอบคลุม infra-as-code / k8s manifests (อยู่ใน repo/spec แยก — ดู Open Questions)

---

## 3. Repository Layout

```
erp/
├── apps/
│   ├── api/                  # NestJS — Modular Monolith (M1–M6 modules)
│   │   ├── src/
│   │   ├── test/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                  # React + Ant Design PWA
│       ├── src/
│       ├── public/
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── contracts/            # ★ Source of truth: zod schemas + ts-rest contracts + enums
│   │   ├── src/
│   │   │   ├── permissions/  # permission catalog (M1)
│   │   │   ├── enums/        # routing status, doc types, employment status...
│   │   │   ├── money/        # branded NUMERIC types + helpers
│   │   │   ├── dto/          # request/response zod schemas per module
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── ui/                   # (optional) shared React components/design tokens
│   ├── config/              # shared tsconfig, eslint, prettier presets
│   │   ├── tsconfig.base.json
│   │   ├── eslint-preset.js
│   │   └── package.json
│   └── utils/               # framework-agnostic helpers (date, currency fmt, ...)
│
├── tooling/                 # scripts: db migrate, codegen, seed
├── .github/workflows/       # CI pipelines
├── pnpm-workspace.yaml
├── turbo.json
├── package.json             # root — scripts + devDeps only, private:true
├── tsconfig.json            # root references
└── .npmrc
```

**กฎการตั้งชื่อ package:** scope เดียว `@erp/*` เช่น `@erp/contracts`, `@erp/config`, `@erp/ui`, `@erp/utils`

---

## 4. Workspace Tooling

### 4.1 Why pnpm + Turborepo (ไม่ใช่ Nx)
- **pnpm** — content-addressable store, strict node_modules (กัน phantom dependencies), workspace protocol ในตัว
- **Turborepo** — task orchestration + local/remote caching + affected-graph แบบ config น้อย เหมาะกับทีมขนาดนี้
- เลือก **Nx แทน** เฉพาะเมื่อต้องการ code generators และ affected tooling ที่ครบกว่า และยอมรับ framework ที่หนักกว่า

### 4.2 `pnpm-workspace.yaml`
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 4.3 `.npmrc`
```ini
# กัน phantom deps — package ต้องประกาศ dependency ของตัวเองให้ครบ
shamefully-hoist=false
strict-peer-dependencies=false
auto-install-peers=true
```

### 4.4 Root `package.json` (สาระสำคัญ)
```jsonc
{
  "name": "erp",
  "private": true,
  "packageManager": "pnpm@9.x",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "db:migrate": "pnpm --filter @erp/api db:migrate"
  },
  "devDependencies": {
    "turbo": "^2.x",
    "typescript": "^5.x"
  }
}
```

---

## 5. The Contracts Package (หัวใจของ monorepo)

`@erp/contracts` คือเหตุผลหลักที่เลือก monorepo — ทุก contract นิยามที่นี่ครั้งเดียว

### 5.1 แนวทาง: zod + ts-rest
- นิยาม schema ด้วย **zod** → ได้ทั้ง runtime validation (ฝั่ง api) และ static type (ฝั่ง web) จากแหล่งเดียว
- ห่อด้วย **ts-rest** เพื่อให้ได้ REST endpoints (สอดคล้องกับ API conventions §9 ของ spec หลัก) พร้อม type-safety แบบ end-to-end
- เลี่ยง OpenAPI codegen ที่นี่ เพราะจะเพิ่มขั้น generate/sync ที่ monorepo กำจัดไปแล้ว (ถ้าต้องการ OpenAPI doc ให้ *generate ออกจาก* ts-rest contract แทน)

### 5.2 ตัวอย่าง — enum + permission เป็น source of truth
```typescript
// packages/contracts/src/enums/routing-status.ts
export const RoutingStatus = {
  Pending: "Pending",
  InProgress: "InProgress",
  Completed: "Completed",
  Delayed: "Delayed",
} as const;
export type RoutingStatus = (typeof RoutingStatus)[keyof typeof RoutingStatus];

// packages/contracts/src/permissions/catalog.ts
export const PERMISSIONS = [
  "inventory.product.create",
  "inventory.cost.view",
  "sales.invoice.approve",
  "iam.user.force_logout",
  // ...
] as const;
export type Permission = (typeof PERMISSIONS)[number];
```

### 5.3 ตัวอย่าง — contract ของ endpoint (ts-rest)
```typescript
// packages/contracts/src/dto/invoice.ts
import { z } from "zod";
import { initContract } from "@ts-rest/core";
const c = initContract();

export const InvoiceCreate = z.object({
  customerId: z.string().uuid(),
  vatMode: z.enum(["VatNai", "VatNok"]),      // include / exclude
  lines: z.array(z.object({
    sku: z.string(),
    qty: z.string(),                          // NUMERIC(18,6) as string — ห้าม float
    unitPrice: z.string(),                    // NUMERIC(18,4) as string
  })).min(1),
});

export const invoiceContract = c.router({
  create: {
    method: "POST",
    path: "/invoices",
    body: InvoiceCreate,
    responses: { 201: z.object({ id: z.string().uuid(), number: z.string() }) },
  },
});
```
ฝั่ง api implement contract นี้ (validate อัตโนมัติ) และฝั่ง web ได้ client ที่ type ครบจาก contract เดียวกัน — แก้ contract แล้วทั้งสองฝั่ง fail compile ทันทีถ้าไม่ตรง

> **กฎเรื่องเงิน:** จำนวนเงิน/ปริมาณส่งผ่าน wire เป็น **string** เสมอ (กัน float precision loss) แล้วแปลงด้วย decimal lib ฝั่ง server — ดู `@erp/contracts/money`

---

## 6. Dependency Boundaries (บังคับใช้ได้)

ทิศทาง dependency ที่อนุญาต (ลูกศร = "ขึ้นกับ"):

```
apps/web  ─┐
           ├─► packages/contracts ─► packages/utils
apps/api  ─┘                          ▲
apps/web  ─► packages/ui ─────────────┘
apps/api  ─► packages/config
apps/web  ─► packages/config
```

**กฎเหล็ก:**
1. `apps/web` **ห้าม** import จาก `apps/api` และกลับกัน — สื่อสารผ่าน `@erp/contracts` เท่านั้น
2. `packages/contracts` ต้อง framework-agnostic — ห้าม import React หรือ NestJS (มีได้แค่ zod / ts-rest / utils)
3. `packages/ui` ขึ้นกับ React ได้ แต่ห้ามขึ้นกับ api/contracts business logic
4. ไม่มี circular dependency ระหว่าง packages

บังคับด้วย ESLint rule `import/no-restricted-paths` (หรือ `eslint-plugin-boundaries`) ใน `packages/config/eslint-preset.js` และ fail ใน CI

---

## 7. TypeScript Strategy

- **Project references** เปิดทุก package (`composite: true`) เพื่อ incremental typecheck
- Base config อยู่ใน `@erp/config/tsconfig.base.json`, แต่ละ package `extends` แล้ว override เฉพาะที่ต่าง
- `strict: true` ทั้ง repo; web ใช้ `jsx`, api ใช้ `emitDecoratorMetadata`/`experimentalDecorators` (NestJS)

```jsonc
// packages/config/tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "composite": true,
    "declaration": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  }
}
```

```jsonc
// tsconfig.json (root) — references สำหรับ build ทั้ง graph
{
  "files": [],
  "references": [
    { "path": "apps/api" },
    { "path": "apps/web" },
    { "path": "packages/contracts" },
    { "path": "packages/config" }
  ]
}
```

---

## 8. Build / Task Pipeline (`turbo.json`)

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],          // build deps ก่อน (เช่น contracts ก่อน api/web)
      "outputs": ["dist/**", ".next/**", "build/**"]
    },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": {},
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

- `^build` = build dependencies ก่อน → `@erp/contracts` ถูก build ก่อน `api`/`web` เสมอ
- Caching: รัน `turbo run build` ซ้ำโดยไม่มีการเปลี่ยนแปลง = cache hit (instant)
- Affected-only ใน CI: `turbo run build test --filter=...[origin/main]` build เฉพาะที่เปลี่ยนเทียบกับ main

---

## 9. Versioning & Releases

- Internal packages ใช้ **workspace protocol**: `"@erp/contracts": "workspace:*"` — ไม่ต้อง publish, ไม่ต้อง bump version ภายใน
- ไม่ใช้ semver ภายใน (ทุกอย่าง deploy พร้อมกันจาก commit เดียว = single version line ของระบบ)
- ติด tag release ที่ระดับ repo (`v1.0.0`) ไม่ใช่ราย package
- ถ้าอนาคตต้อง publish `@erp/contracts` ให้ผู้บริโภคภายนอก → เพิ่ม **changesets** ตอนนั้น (ไม่ใช่ตอนนี้)

---

## 10. CI/CD

### 10.1 Pull Request pipeline
```yaml
# .github/workflows/ci.yml (สาระสำคัญ)
jobs:
  verify:
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }       # ต้องมี history สำหรับ affected diff
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run lint typecheck test build --filter=...[origin/main]
```

### 10.2 Deploy (artifact แยก)
- api และ web build แยก image แล้ว push คนละ registry path:
  `erp-api:<sha>` และ `erp-web:<sha>`
- Deploy แยกได้ แต่ระบบควร deploy จาก commit SHA เดียวกันเพื่อให้ contract ตรงกัน (lockstep deploy ของ api+web)
- เปิด **Turborepo remote cache** (self-hosted หรือ Vercel) เพื่อแชร์ cache ระหว่าง CI runs

---

## 11. Local Dev Workflow

```bash
# ครั้งแรก
pnpm install

# รันทั้งระบบ (api + web + watch contracts)
pnpm dev

# เฉพาะ workspace เดียว
pnpm --filter @erp/api dev
pnpm --filter @erp/web dev

# เพิ่ม dependency ให้ workspace ใดworkspace หนึ่ง
pnpm --filter @erp/api add @nestjs/bullmq
pnpm --filter @erp/web add antd

# migration / seed
pnpm db:migrate
```

- แก้ `@erp/contracts` → tsc watch rebuild → api/web hot-reload เห็น type ใหม่ทันที (ไม่ต้อง publish/relink)

---

## 12. Setup / Migration Steps (จาก zero)

1. `pnpm init` ที่ root, ตั้ง `private: true`, `packageManager`
2. เพิ่ม `pnpm-workspace.yaml`, `.npmrc`, `turbo.json`
3. สร้าง `packages/config` (tsconfig base + eslint preset) ก่อน — ทุกอย่างพึ่งมัน
4. สร้าง `packages/contracts` ย้าย enums/permissions/DTO ที่กระจัดกระจายมารวมที่นี่
5. Scaffold `apps/api` (NestJS) และ `apps/web` (Vite + React) ให้ import `@erp/contracts`
6. ติด ESLint boundary rules + เปิดใน CI
7. ตั้ง CI workflow (lint/typecheck/test/build แบบ affected)
8. เปิด remote cache

---

## 13. Conventions & Guardrails (สรุป)

| หัวข้อ | กฎ |
|---|---|
| Package scope | `@erp/*` ทั้งหมด, `private: true` |
| Cross-app import | ห้าม web↔api ตรง ๆ — ผ่าน `@erp/contracts` เท่านั้น |
| Contracts purity | framework-agnostic, zod/ts-rest เท่านั้น |
| Money/qty | string ผ่าน wire, แปลงด้วย decimal lib (ห้าม float) |
| Internal versioning | `workspace:*`, ไม่ publish, ไม่ bump |
| Build order | บังคับผ่าน `dependsOn: ["^build"]` |
| CI scope | affected-only เทียบ `origin/main` |
| Deploy | artifact แยก แต่ deploy จาก SHA เดียวกัน |

---

## 14. Open Questions

- **MR-Q1:** ต้องการ remote cache แบบ self-hosted หรือใช้ Vercel Remote Cache? (กระทบต้นทุน/ความเร็ว CI)
- **MR-Q2:** จะมี `packages/ui` (shared component library) ตั้งแต่ต้นหรือเริ่มจาก web อย่างเดียวก่อน?
- **MR-Q3:** Infra/IaC (Docker compose, k8s) อยู่ใน monorepo นี้หรือ repo แยก?
- **MR-Q4:** มีแผนเปิด `@erp/contracts` ให้ระบบ/ทีมภายนอกใช้ในอนาคตหรือไม่? (ถ้าใช่ → เตรียม changesets)

---

*เอกสารนี้เป็นส่วนขยายของ ERP Implementation Spec — ควรผนวกการตัดสินใจหลักเข้าเป็น ADR-007 (Repository Strategy) ในเอกสารหลัก*
