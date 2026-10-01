import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations/generated",
  dbCredentials: {
    url: process.env["DATABASE_URL"]!,
  },
});
