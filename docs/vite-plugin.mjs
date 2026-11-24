// Vite plugin that publishes the rendered guides (docs/dist/guides, built by `pnpm --filter
// @erp/docs build`) at /guides/ of the web app:
//   - dev:   serves the files directly (rebuild the docs package to see edits);
//   - build: copies them into the SPA's outDir, so the web image's nginx serves them.
// Lives here rather than in apps/web so the web app needs no Node fs/path typings.
import { promises as fs, createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const guidesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist", "guides");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8" };

/** @returns {import("vite").Plugin} */
export function guidesSite() {
  let outDir = "dist";
  return {
    name: "erp-guides-site",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (url !== "/guides" && !url.startsWith("/guides/")) return next();
        if (!existsSync(guidesDir)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Guides not built — run: pnpm --filter @erp/docs build");
          return;
        }
        if (url === "/guides") {
          res.statusCode = 301;
          res.setHeader("Location", "/guides/");
          res.end();
          return;
        }
        let file = path.normalize(path.join(guidesDir, decodeURIComponent(url.slice("/guides".length))));
        if (!file.startsWith(guidesDir)) return next();
        if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
        if (!existsSync(file)) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    async closeBundle() {
      if (!existsSync(guidesDir)) {
        this.warn("docs/dist/guides missing — /guides will 404 (is @erp/docs a built dependency?)");
        return;
      }
      await fs.cp(guidesDir, path.join(outDir, "guides"), { recursive: true });
    },
  };
}
