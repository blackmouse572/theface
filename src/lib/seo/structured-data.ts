/**
 * JSON-LD structured data.
 *
 * TanStack Start emits this through the `scripts` array a route's `head` returns, as
 * `{ type: "application/ld+json", children: JSON.stringify(...) }`.
 *
 * Structured data is how a crawler learns that TheFace is one site with named sections,
 * rather than a set of unrelated pages. It is also where an authoritative outbound link
 * belongs: `sameAs` ties this site to the profiles that represent it, which is the signal
 * an unlinked mention cannot carry.
 *
 * A results page gets NO structured data. It is `noindex`, so describing it to a crawler
 * would only invite the crawl we are refusing.
 */

import type { AnyRouteMatch } from "@tanstack/react-router";

import { SITE_NAME, SITE_TAGLINE, DEFAULT_DESCRIPTION, absoluteUrl, slug } from "./seo";

export type HeadScripts = NonNullable<AnyRouteMatch["headScripts"]>;

/** Wraps any JSON-LD object in the script tag TanStack Start expects. */
export function jsonLd(data: Record<string, unknown>): HeadScripts {
  return [{ type: "application/ld+json", children: JSON.stringify(data) }];
}

export interface SiteIdentity {
  readonly origin: string;
  /** Profiles that represent this site, e.g. its X account. Emitted as `sameAs`. */
  readonly sameAs?: readonly string[];
}

/** The site itself. Belongs on the home page only, so a crawler sees it declared once. */
export function websiteJsonLd({ origin, sameAs }: SiteIdentity): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: SITE_TAGLINE,
    url: origin,
    description: DEFAULT_DESCRIPTION,
    ...(sameAs?.length ? { sameAs: [...sameAs] } : {}),
  };
}

/** A Board, as an ordered list. Gives a crawler the ranking's shape without the faces. */
export function boardJsonLd(options: {
  readonly origin: string;
  readonly aesthetic?: string;
  readonly entries?: ReadonlyArray<{ readonly handle: string; readonly overall: number }>;
}): Record<string, unknown> {
  const { origin, aesthetic, entries = [] } = options;
  const path = aesthetic ? `/board/${slug(aesthetic)}` : "/board";
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: aesthetic ? `${aesthetic} leaderboard` : `${SITE_NAME} leaderboard`,
    url: absoluteUrl(path, origin),
    numberOfItems: entries.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: `@${entry.handle}`,
    })),
  };
}

/** Breadcrumbs, so a crawler shows the section rather than a bare URL. */
export function breadcrumbJsonLd(
  origin: string,
  trail: ReadonlyArray<{ readonly name: string; readonly path: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path, origin),
    })),
  };
}
