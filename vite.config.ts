import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
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
        traceDeps: [
          "pdfjs-dist*",
          "tesseract.js*",
          "tesseract.js-core*",
          // Windows canvas needs its ICU data beside the native binary.
          ...(process.platform === "win32"
            ? [`@napi-rs/canvas-win32-${process.arch}-msvc*`]
            : []),
        ],
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
