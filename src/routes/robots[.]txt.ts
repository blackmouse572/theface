import { createFileRoute } from "@tanstack/react-router";

import { buildRobotsTxt, originFromRequest } from "@/lib/seo";

/**
 * Served dynamically rather than kept in `public/`, so the `Sitemap:` line carries the
 * origin the request actually arrived on. A hardcoded origin would point a preview
 * deployment's robots.txt at production.
 */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) =>
        new Response(buildRobotsTxt(originFromRequest(request)), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
