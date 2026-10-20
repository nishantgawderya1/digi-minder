import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

const buildMarker = "__WARRANTLY_BUILD_ID__";
const publicFiles = [
  "sw.js",
  "offline.html",
  "manifest.webmanifest",
  "favicon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

/** Emit a release-specific worker, leaving public source files unchanged. */
export function pwaAssets(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "warrantly-pwa-assets",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    configResolved(resolved) {
      config = resolved;
    },
    generateBundle: {
      order: "post",
      async handler(options, bundle) {
        if (!config.publicDir) {
          throw new Error("The PWA build requires a public source directory.");
        }
        const hash = createHash("sha256");
        for (const filename of Object.keys(bundle).sort()) {
          const asset = bundle[filename];
          if (!asset) continue;
          hash.update(filename);
          hash.update(asset.type === "chunk" ? asset.code : asset.source);
        }
        for (const filename of publicFiles) {
          hash.update(filename);
          hash.update(await readFile(resolve(config.publicDir, filename)));
        }
        const buildId = hash.digest("hex").slice(0, 16);
        const worker = await readFile(
          resolve(config.publicDir, "sw.js"),
          "utf8",
        );
        if (!worker.includes(buildMarker)) {
          throw new Error("The PWA worker build marker is missing.");
        }
        // Nitro copies public files after client builds and keeps existing
        // output files. Emit now so that late public copy preserves the stamp.
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: worker.replaceAll(buildMarker, buildId),
        });
      },
    },
  };
}
