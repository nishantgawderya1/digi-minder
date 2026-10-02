import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { pdfAssets } from "../../scripts/pdf-assets";

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: local("."),
  cacheDir: local("../../node_modules/.vite-browser-tests"),
  envDir: false,
  plugins: [
    ...pdfAssets(),
    {
      name: "test-only-service-boundaries",
      enforce: "pre",
      resolveId(source) {
        if (source.endsWith("/assistant-functions"))
          return local("./assistant.ts");
        if (source.endsWith("/bill-functions") || source === "./bill-functions")
          return local("./services.ts");
        if (source.endsWith("/route-auth")) return local("./auth.ts");
        if (source.endsWith("/tesseract-client"))
          return local("./tesseract.ts");
        return undefined;
      },
    },
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      "@clerk/tanstack-react-start": local("./clerk.tsx"),
      "@": local("../../src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4175,
    strictPort: true,
    fs: { allow: [local("../..")] },
  },
});
