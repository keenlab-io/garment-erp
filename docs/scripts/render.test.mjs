import assert from "node:assert/strict";
import { test } from "node:test";
import { REPO_URL, pageNameFor, renderMarkdown, rewriteHref, slugify } from "./render.mjs";

const guides = [
  { srcDir: "docs/user-guide", outDir: "user" },
  { srcDir: "docs/admin", outDir: "admin" },
];

test("slugify matches GitHub anchors, keeping Thai letters", () => {
  assert.equal(slugify("Roles & permissions"), "roles--permissions");
  assert.equal(slugify("Step 3: Approve (re-auth)"), "step-3-approve-re-auth");
  assert.equal(slugify("การขาย เอกสาร"), "การขาย-เอกสาร");
});

test("pageNameFor maps README/index to index.html", () => {
  assert.equal(pageNameFor("README.md"), "index.html");
  assert.equal(pageNameFor("index.md"), "index.html");
  assert.equal(pageNameFor("01-sales.md"), "01-sales.html");
});

test("rewriteHref: same-guide, cross-guide, repo and external links", () => {
  const ctx = { srcRel: "docs/admin/tenant-administration-guide.md", guides };
  assert.deepEqual(rewriteHref("platform-operations-guide.md#support-sessions", ctx), {
    href: "platform-operations-guide.html#support-sessions",
    target: { srcRel: "docs/admin/platform-operations-guide.md", hash: "support-sessions" },
  });
  assert.equal(rewriteHref("../user-guide/index.md", ctx).href, "../user/index.html");
  assert.equal(rewriteHref("../../infra/k8s/README.md#rollback", ctx).href, `${REPO_URL}/blob/main/infra/k8s/README.md#rollback`);
  assert.equal(rewriteHref("https://example.com/x", ctx).href, "https://example.com/x");
  assert.equal(rewriteHref("#local", ctx).href, "#local");
});

test("renderMarkdown: heading ids (deduped), callouts, table wrap, title", () => {
  const md = "# Guide\n\n## Setup\n\n## Setup\n\n> **Warning:** careful\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
  const out = renderMarkdown(md, { srcRel: "docs/user-guide/x.md", guides });
  assert.equal(out.title, "Guide");
  assert.deepEqual([...out.ids], ["guide", "setup", "setup-1"]);
  assert.match(out.html, /<blockquote class="callout callout-warning">/);
  assert.match(out.html, /<div class="table-wrap"><table>/);
});
