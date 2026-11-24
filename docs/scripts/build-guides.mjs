#!/usr/bin/env node
// Renders the Markdown guides to a static HTML site under docs/dist/guides/, which apps/web
// serves at /guides/ (vite plugin `guidesSite` in apps/web/vite.config.ts copies it into the
// SPA build; nginx serves it as plain files ahead of the SPA fallback).
//
//   docs/user-guide/*.md → /guides/user/      customer user guide (indexed, linked from the app)
//   docs/admin/*.md      → /guides/admin/     staff guides (noindex, linked from /platform)
//
// The build FAILS on a broken cross-page link or a missing #anchor, so a renamed heading is
// caught in CI rather than by a reader.
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml, pageNameFor, renderMarkdown } from "./render.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(here, "..");
const repoRoot = path.resolve(docsRoot, "..");
const outRoot = path.join(docsRoot, "dist", "guides");
const require = createRequire(import.meta.url);

export const GUIDES = [
  {
    id: "user",
    srcDir: "docs/user-guide",
    outDir: "user",
    title: "Garment ERP User Guide",
    audience: "For factory staff using Garment ERP",
    noindex: false,
  },
  {
    id: "admin",
    srcDir: "docs/admin",
    outDir: "admin",
    title: "Staff Administration Guides",
    audience: "Internal — vendor staff only",
    noindex: true,
  },
];

const THEME_BOOT = `(function(){try{var t=localStorage.getItem("erp.theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;
const THEME_TOGGLE = `document.addEventListener("click",function(e){var b=e.target.closest("[data-theme-toggle]");if(!b)return;var r=document.documentElement,n=r.getAttribute("data-theme")==="dark"?"light":"dark";r.setAttribute("data-theme",n);try{localStorage.setItem("erp.theme",n)}catch(_){}});`;

function layout({ title, guide, assetPrefix, nav, toc, body, pager }) {
  const robots = guide?.noindex ? '\n<meta name="robots" content="noindex, nofollow">' : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${robots}
<title>${escapeHtml(title)}${guide ? ` — ${escapeHtml(guide.title)}` : ""}</title>
<link rel="stylesheet" href="${assetPrefix}assets/tokens.css">
<link rel="stylesheet" href="${assetPrefix}assets/guides.css">
<script>${THEME_BOOT}</script>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="topbar">
  <a class="brand" href="${assetPrefix}index.html"><span class="brand-mark" aria-hidden="true"></span>Garment ERP</a>
  ${guide ? `<span class="topbar-guide">${escapeHtml(guide.title)}</span>` : ""}
  ${guide?.noindex ? '<span class="badge-internal">Internal</span>' : ""}
  <span class="spacer"></span>
  <a class="topbar-link" href="/">Open the app</a>
  <button type="button" class="theme-toggle" data-theme-toggle aria-label="Toggle dark mode"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg></button>
</header>
<div class="layout">
  ${nav ? `<nav class="sidebar" aria-label="Guide contents">${nav}</nav>` : ""}
  <main id="content" class="content">
    <article class="prose">
${body}
    </article>
    ${pager ?? ""}
  </main>
  ${toc ? `<aside class="toc" aria-label="On this page">${toc}</aside>` : ""}
</div>
<footer class="footer">Garment ERP documentation · generated from the repository</footer>
<script>${THEME_TOGGLE}</script>
</body>
</html>
`;
}

async function listMarkdown(dir) {
  const entries = await fs.readdir(path.join(repoRoot, dir));
  const md = entries.filter((f) => f.endsWith(".md"));
  const isIndex = (f) => f === "README.md" || f === "index.md";
  return [...md.filter(isIndex), ...md.filter((f) => !isIndex(f)).sort()];
}

export async function build() {
  await fs.rm(outRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(outRoot, "assets"), { recursive: true });

  // 1. Parse every page first, so links can be checked against all headings.
  const pages = new Map(); // srcRel → page
  for (const guide of GUIDES) {
    for (const file of await listMarkdown(guide.srcDir)) {
      const srcRel = `${guide.srcDir}/${file}`;
      const markdown = await fs.readFile(path.join(repoRoot, srcRel), "utf8");
      const rendered = renderMarkdown(markdown, { srcRel, guides: GUIDES });
      pages.set(srcRel, { guide, file, srcRel, out: pageNameFor(file), ...rendered });
    }
  }

  // 2. Link check — every cross-page target exists and every #anchor is a real heading.
  const broken = [];
  for (const page of pages.values()) {
    for (const link of page.links) {
      const target = pages.get(link.srcRel);
      if (!target) broken.push(`${page.srcRel}: missing page ${link.srcRel}`);
      else if (link.hash && !target.ids.has(link.hash)) {
        broken.push(`${page.srcRel}: missing anchor ${link.srcRel}#${link.hash}`);
      }
    }
    const sameDoc = [...page.html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    for (const id of sameDoc) {
      if (!page.ids.has(id)) broken.push(`${page.srcRel}: missing anchor #${id}`);
    }
  }
  if (broken.length) {
    console.error(`Broken guide links (${broken.length}):\n  ${broken.join("\n  ")}`);
    process.exitCode = 1;
    return;
  }

  // 3. Emit pages.
  for (const guide of GUIDES) {
    const guidePages = [...pages.values()].filter((p) => p.guide === guide);
    if (!guidePages.some((p) => p.out === "index.html")) {
      throw new Error(`${guide.srcDir} needs an index.md or README.md`);
    }
    await fs.mkdir(path.join(outRoot, guide.outDir), { recursive: true });

    for (const [i, page] of guidePages.entries()) {
      const nav = `<p class="nav-title">${escapeHtml(guide.title)}</p><p class="nav-audience">${escapeHtml(guide.audience)}</p><ol class="nav-list">${guidePages
        .map(
          (p) =>
            `<li><a href="${p.out}"${p === page ? ' aria-current="page"' : ""}>${escapeHtml(p.out === "index.html" ? "Overview" : p.title)}</a></li>`,
        )
        .join("")}</ol>`;
      const h2 = page.headings.filter((h) => h.depth === 2);
      const toc = h2.length
        ? `<p class="toc-title">On this page</p><ul>${h2.map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join("")}</ul>`
        : "";
      const prev = guidePages[i - 1];
      const next = guidePages[i + 1];
      const pager =
        prev || next
          ? `<nav class="pager" aria-label="Previous and next page">${prev ? `<a class="prev" href="${prev.out}"><span>Previous</span>${escapeHtml(prev.title)}</a>` : "<span></span>"}${next ? `<a class="next" href="${next.out}"><span>Next</span>${escapeHtml(next.title)}</a>` : ""}</nav>`
          : "";
      const html = layout({ title: page.title, guide, assetPrefix: "../", nav, toc, body: page.html, pager });
      await fs.writeFile(path.join(outRoot, guide.outDir, page.out), html);
    }
  }

  // 4. Hub page — lists only public guides; staff guides are reached from the platform console.
  const publicCards = GUIDES.filter((g) => !g.noindex)
    .map(
      (g) =>
        `<li class="card"><a href="${g.outDir}/index.html"><strong>${escapeHtml(g.title)}</strong><span>${escapeHtml(g.audience)}</span></a></li>`,
    )
    .join("");
  await fs.writeFile(
    path.join(outRoot, "index.html"),
    layout({
      title: "Documentation",
      guide: null,
      assetPrefix: "",
      body: `<h1>Garment ERP documentation</h1>\n<ul class="cards">${publicCards}</ul>`,
    }),
  );

  // 5. Assets — the design-system token CSS (single source of truth) + the guide stylesheet.
  await fs.copyFile(require.resolve("@erp/design-tokens/css"), path.join(outRoot, "assets", "tokens.css"));
  await fs.copyFile(path.join(docsRoot, "site", "guides.css"), path.join(outRoot, "assets", "guides.css"));

  console.log(`Guides built: ${pages.size} pages → ${path.relative(repoRoot, outRoot)}/`);
}

await build();
