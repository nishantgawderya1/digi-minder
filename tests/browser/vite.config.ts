import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: local("."),
  envDir: false,
  plugins: [
    {
      name: "test-only-service-boundaries",
      enforce: "pre",
      resolveId(source) {
        if (source.endsWith("/bill-functions") || source === "./bill-functions")
          return local("./services.ts");
        if (source.endsWith("/route-auth")) return local("./auth.ts");
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
