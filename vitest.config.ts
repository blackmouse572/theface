import { defineConfig } from "vitest/config";

// Deliberately standalone: it must NOT load vite.config.ts, because the
// TanStack Start plugin resolves app entries and fails before any test runs.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
