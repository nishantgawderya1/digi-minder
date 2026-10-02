import { fileURLToPath } from "node:url";
import { normalizePath } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export function pdfAssets() {
  return viteStaticCopy({
    targets: ["wasm", "standard_fonts", "cmaps"].map((directory) => ({
      src: normalizePath(
        fileURLToPath(
          new URL(`../node_modules/pdfjs-dist/${directory}/*`, import.meta.url),
        ),
      ),
      dest: `pdf-assets/${directory}`,
      rename: { stripBase: true },
    })),
  });
}
