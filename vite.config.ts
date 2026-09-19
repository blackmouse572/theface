import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 3000 },
  // Mirrors the `paths` entry in tsconfig.json. Without it the types resolve but the
  // runtime import does not, which fails at request time rather than at build time.
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  optimizeDeps: {
    // Server-only packages. They reach the dependency scanner through server-function
    // and route-head imports, and pre-bundling them for the browser costs startup time
    // for code that is stripped from the client build anyway.
    exclude: ["drizzle-orm", "drizzle-orm/d1", "@typesafe-ai/sdk", "better-auth"],
  },
  // Plugin order matters: cloudflare() must precede tanstackStart().
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
  ],
});
