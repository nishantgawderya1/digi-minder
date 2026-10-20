import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pdfAssets } from "./scripts/pdf-assets";
import { pwaAssets } from "./scripts/pwa-assets";

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [
      ...pdfAssets(),
      pwaAssets(),
      tailwindcss(),
      tanstackStart({
        server: { entry: "server" },
      }),
      nitro({
        traceDeps: ["pdfjs-dist*", "tesseract.js*", "tesseract.js-core*"],
        hooks: {
          async compiled(nitro) {
            if (process.platform !== "win32") return;
            // Nitro already traces the native binary. Copy only its ICU data
            // after tracing, avoiding a second concurrent copy of the DLL.
            const packageName = `@napi-rs/canvas-win32-${process.arch}-msvc`;
            const require = createRequire(import.meta.url);
            const source = dirname(require.resolve(packageName));
            const destination = join(
              nitro.options.output.serverDir,
              "node_modules",
              packageName,
            );
            await mkdir(destination, { recursive: true });
            await copyFile(
              join(source, "icudtl.dat"),
              join(destination, "icudtl.dat"),
            );
          },
        },
        vercel: { functionRules: { "/api/inngest": { maxDuration: 300 } } },
      }),
      react(),
    ],
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: {
      exclude: ["@napi-rs/canvas"],
    },
  };
});
