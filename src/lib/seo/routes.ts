/**
 * The canonical list of indexable pages, and the robots.txt / sitemap.xml bodies built
 * from it.
 *
 * One list drives both files so they cannot disagree. A page that is `noindex` must be
 * absent from the sitemap AND disallowed in robots.txt; listing it in one while blocking
 * it in the other is the classic way to get a "blocked by robots.txt but indexed" warning.
 */

import { AESTHETIC_LABELS } from "../aesthetics";
import { absoluteUrl } from "./seo";

export interface SitemapEntry {
  readonly path: string;
  /** Relative importance within this site, 0..1. Not a ranking factor between sites. */
  readonly priority: number;
  readonly changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
}

/** Every page a crawler should hold. A results page is deliberately absent. */
export const INDEXABLE_PAGES: readonly SitemapEntry[] = [
  { path: "/", priority: 1, changefreq: "weekly" },
  { path: "/board", priority: 0.9, changefreq: "hourly" },
  ...AESTHETIC_LABELS.map((aesthetic) => ({
    path: `/board/${aesthetic.slug}`,
    priority: 0.7,
    changefreq: "hourly" as const,
  })),
  { path: "/privacy", priority: 0.3, changefreq: "yearly" },
];

/** Paths kept out of search results. Must match every `noindex` page. */
export const DISALLOWED_PATHS: readonly string[] = ["/results", "/api/"];

export function buildRobotsTxt(origin: string): string {
  const lines = [
    "User-agent: *",
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    "Allow: /",
    "",
    `Sitemap: ${absoluteUrl("/sitemap.xml", origin)}`,
    "",
  ];
  return lines.join("\n");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildSitemapXml(origin: string, lastmod: Date = new Date()): string {
  const stamp = lastmod.toISOString().slice(0, 10);
  const urls = INDEXABLE_PAGES.map((page) => {
    const loc = escapeXml(absoluteUrl(page.path, origin) ?? page.path);
    return [
      "  <url>",
      `    <loc>${loc}</loc>`,
      `    <lastmod>${stamp}</lastmod>`,
      `    <changefreq>${page.changefreq}</changefreq>`,
      `    <priority>${page.priority.toFixed(1)}</priority>`,
      "  </url>",
    ].join("\n");
  }).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

/** The deployment origin, taken from the request rather than hardcoded. */
export function originFromRequest(request: Request): string {
  return new URL(request.url).origin;
}
