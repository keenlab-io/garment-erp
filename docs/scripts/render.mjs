// Pure rendering helpers for the guides site — no filesystem access, so they are unit-testable
// (render.test.mjs). build-guides.mjs owns all IO.
import path from "node:path";
import { Marked } from "marked";

export const REPO_URL = "https://github.com/keenlab-io/garment-erp";

/**
 * GitHub-compatible heading slug, so `#anchor` links written against the Markdown on GitHub
 * resolve identically in the HTML. Unicode letters (Thai) are kept; punctuation is dropped.
 */
export function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** Strip inline Markdown (code, emphasis, links) from heading source to get its plain text. */
export function plainText(markdown) {
  return markdown
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .trim();
}

export function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Map a Markdown source file name to its output page name: `README.md`/`index.md` → `index.html`,
 * `foo.md` → `foo.html`.
 */
export function pageNameFor(file) {
  const base = path.posix.basename(file, ".md");
  return base === "README" || base === "index" ? "index.html" : `${base}.html`;
}

/**
 * Rewrite one href found in a guide page.
 *
 * - external (`http:`, `mailto:`) and same-page (`#x`) links pass through;
 * - a `.md` link into a published guide directory becomes the rendered page (`.html`), relative
 *   to the current page's output directory, and is recorded for link checking;
 * - any other repo-relative link points at the file on GitHub (staff-only content).
 *
 * @param href       the raw href from the Markdown
 * @param ctx.srcRel the current file, repo-relative (e.g. `docs/admin/foo.md`)
 * @param ctx.guides [{ srcDir: "docs/admin", outDir: "admin" }, …]
 * @returns {{ href: string, target?: { srcRel: string, hash: string } }}
 */
export function rewriteHref(href, ctx) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) {
    return { href };
  }
  const [rawPath, hash = ""] = href.split("#");
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(ctx.srcRel), rawPath));
  const from = ctx.guides.find((g) => ctx.srcRel.startsWith(`${g.srcDir}/`));
  const to = ctx.guides.find((g) => resolved.startsWith(`${g.srcDir}/`));

  if (to && resolved.endsWith(".md")) {
    const page = pageNameFor(resolved);
    const rel = from && from.outDir === to.outDir ? page : `../${to.outDir}/${page}`;
    return { href: hash ? `${rel}#${hash}` : rel, target: { srcRel: resolved, hash } };
  }
  const blob = rawPath.endsWith("/") ? "tree" : "blob";
  const url = `${REPO_URL}/${blob}/main/${resolved}`;
  return { href: hash ? `${url}#${hash}` : url };
}

/**
 * Render one guide page's Markdown body.
 * @returns {{ title: string, html: string, headings: {depth:number,text:string,id:string}[], ids: Set<string>, links: {srcRel:string,hash:string}[] }}
 */
export function renderMarkdown(markdown, ctx) {
  const headings = [];
  const ids = new Set();
  const links = [];
  const counts = new Map();

  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const label = plainText(text);
        let id = slugify(label);
        const n = counts.get(id) ?? 0;
        counts.set(id, n + 1);
        if (n > 0) id = `${id}-${n}`;
        ids.add(id);
        headings.push({ depth, text: label, id });
        const inner = this.parser.parseInline(tokens);
        const anchor = depth > 1 ? `<a class="anchor" href="#${id}" aria-hidden="true">#</a>` : "";
        return `<h${depth} id="${id}">${inner}${anchor}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const out = rewriteHref(href, ctx);
        if (out.target) links.push(out.target);
        const external = /^https?:/.test(out.href);
        const attrs = [
          `href="${escapeHtml(out.href)}"`,
          title ? `title="${escapeHtml(title)}"` : "",
          external ? 'rel="noopener"' : "",
        ].filter(Boolean);
        return `<a ${attrs.join(" ")}>${this.parser.parseInline(tokens)}</a>`;
      },
    },
  });

  let html = marked.parse(markdown);
  // `> **Note:** …` blockquotes become styled callouts.
  html = html.replace(
    /<blockquote>\s*<p><strong>(Note|Tip|Warning|Important):?<\/strong>:?/g,
    (_m, kind) => `<blockquote class="callout callout-${kind.toLowerCase()}">\n<p><strong>${kind}:</strong>`,
  );
  // Wide tables scroll inside their own box instead of widening the page.
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>");

  const h1 = headings.find((h) => h.depth === 1);
  return { title: h1 ? h1.text : "Untitled", html, headings, ids, links };
}
