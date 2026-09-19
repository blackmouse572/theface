/**
 * Types for per-icon deep imports.
 *
 * `@tabler/icons-react` ships one barrel `.d.ts` and no `exports` map, so importing from
 * the package root makes Vite pre-bundle all ~5000 icons — 4.3 MB served to the browser
 * on every dev page load. Production tree-shakes it, development does not, and the
 * result is a browser that hangs on first paint.
 *
 * Deep imports avoid that but have no declarations of their own. This supplies them, so
 * every icon added later is typed without reintroducing the barrel.
 */
declare module "@tabler/icons-react/dist/esm/icons/*.mjs" {
  import type { Icon } from "@tabler/icons-react";
  const icon: Icon;
  export default icon;
}
