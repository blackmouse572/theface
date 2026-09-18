import "../styles/globals.css";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { homeSeo, jsonLd, websiteJsonLd } from "@/lib/seo";

/** Set once here so canonical URLs, JSON-LD and share cards cannot disagree. */
const SITE_ORIGIN = import.meta.env["VITE_SITE_ORIGIN"] ?? "http://localhost:3000";

/** Profiles that represent TheFace. Emitted as `sameAs` - the authoritative outbound link. */
const SITE_PROFILES: readonly string[] = [];

export const Route = createRootRoute({
  head: () => {
    const { meta, links } = homeSeo(SITE_ORIGIN);
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        ...meta,
      ],
      links: [...links],
      // Declared once, on the root, so a crawler sees one WebSite for the site.
      scripts: jsonLd(websiteJsonLd({ origin: SITE_ORIGIN, sameAs: SITE_PROFILES })),
    };
  },
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export default function RootComponent() {
  return <Outlet />;
}
