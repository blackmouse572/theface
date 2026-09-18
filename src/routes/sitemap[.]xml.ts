import { createFileRoute } from "@tanstack/react-router";

import { buildSitemapXml, originFromRequest } from "@/lib/seo";

/**
 * Built from `INDEXABLE_PAGES`, the same list robots.txt uses, so the two can never
 * disagree about which pages a crawler should hold.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) =>
        new Response(buildSitemapXml(originFromRequest(request)), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
