import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { pdfAssets } from "./scripts/pdf-assets";

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [
      ...pdfAssets(),
      tailwindcss(),
      tanstackStart({
        server: { entry: "server" },
      }),
      nitro({
        traceDeps: ["pdfjs-dist*", "tesseract.js*", "tesseract.js-core*"],
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
