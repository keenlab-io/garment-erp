# Staff Administration Guides

Internal documentation for vendor staff who run Garment ERP: implementation consultants,
support engineers, platform administrators and on-call operators. Customers do not read these
guides; they have the [Garment ERP User Guide](../user-guide/index.md).

> **Warning:** These pages are internal but are served as static files without a login. They
> must never contain credentials, hostnames of private infrastructure, or customer data. Keep
> those in `infra/k8s/README.md` and the GitHub `production` environment secrets.

## Which guide do I need?

| You are… | Read |
|---|---|
| Setting up a new customer after provisioning, configuring roles/users/master data, or working inside a tenant during a support session | [Tenant Administration Guide](tenant-administration-guide.md) |
| Provisioning tenants, managing plans/seats/feature flags, billing, support sessions, the public demo, or keeping the system healthy | [Platform Operations Guide](platform-operations-guide.md) |
| Helping a customer with a day-to-day task (sales, stock, production, HR, reports) | [User Guide](../user-guide/index.md) |
| Deploying, rolling back, rotating secrets, bootstrapping a cluster | [`infra/k8s/README.md`](../../infra/k8s/README.md) |
| Running acceptance tests with a customer | [`docs/uat/`](../uat/README.md) |

## Maintaining these guides

The Markdown files in `docs/admin/` and `docs/user-guide/` are the source. `pnpm build`
renders them to HTML (`@erp/docs` → `docs/dist/guides/`) and the web app serves the result:

| Source | Served at | Linked from |
|---|---|---|
| `docs/user-guide/*.md` | `/guides/user/` | the account menu in the app (**User guide**) |
| `docs/admin/*.md` | `/guides/admin/` (not indexed by search engines) | the platform console header (**Staff guides**) |

The build fails on a broken link between pages or a link to a heading that does not exist, so
renaming a heading means updating the links to it. To preview locally, run
`pnpm --filter @erp/docs build`, then `pnpm dev` and open `http://localhost:5173/guides/`.
When a screen, label or rule changes, update the matching guide in the same pull request.
