import { defineConfig } from "vitest/config";

// Deliberately standalone: it must NOT load vite.config.ts, because the
// TanStack Start plugin resolves app entries and fails before any test runs.
export default defineConfig({
  test: {
    environment: "node",
    // React component tests need a real DOM. Everything else — Screening, the
    // Durable Object, the Jev question set — fakes its browser/runtime inputs and
    // stays on the fast `node` environment on purpose, so this project does NOT set a
    // blanket jsdom environment. Vitest 5 dropped `environmentMatchGlobs`; a component
    // test instead opts in per-file with a docblock pragma as its first line:
    //   // @vitest-environment jsdom
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
