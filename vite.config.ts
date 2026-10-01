import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [
      tailwindcss(),
      tanstackStart({
        server: { entry: "server" },
      }),
      react(),
    ],
    resolve: {
      tsconfigPaths: true,
    },
  };
});
