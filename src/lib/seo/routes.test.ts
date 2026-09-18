import { describe, expect, it } from "vitest";

import { AESTHETICS } from "../jev/questions";
import {
  buildRobotsTxt,
  buildSitemapXml,
  DISALLOWED_PATHS,
  INDEXABLE_PAGES,
  originFromRequest,
} from "./routes";
import { slug } from "./seo";

const ORIGIN = "https://theface.example";

describe("INDEXABLE_PAGES", () => {
  it("covers home, the overall board, every Aesthetic board and privacy", () => {
    const paths = INDEXABLE_PAGES.map((p) => p.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/board");
    expect(paths).toContain("/privacy");
    for (const aesthetic of Object.values(AESTHETICS)) {
      expect(paths).toContain(`/board/${slug(aesthetic.name)}`);
    }
  });

  it("has one board per Aesthetic and no more", () => {
    const boards = INDEXABLE_PAGES.filter((p) => p.path.startsWith("/board/"));
    expect(boards).toHaveLength(Object.keys(AESTHETICS).length);
  });

  it("holds no duplicate path", () => {
    const paths = INDEXABLE_PAGES.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("uses a priority inside the range crawlers accept", () => {
    for (const page of INDEXABLE_PAGES) {
      expect(page.priority).toBeGreaterThan(0);
      expect(page.priority).toBeLessThanOrEqual(1);
    }
  });
});

// Listing a page in the sitemap while blocking it in robots.txt is what produces
// "blocked by robots.txt but indexed". One list drives both files to prevent it.
describe("robots.txt and the sitemap agree", () => {
  it("lists no page that robots.txt disallows", () => {
    for (const page of INDEXABLE_PAGES) {
      for (const blocked of DISALLOWED_PATHS) {
        expect(page.path.startsWith(blocked)).toBe(false);
      }
    }
  });

  it("keeps the results page out of both the sitemap and the index", () => {
    expect(INDEXABLE_PAGES.some((p) => p.path.startsWith("/results"))).toBe(false);
    expect(DISALLOWED_PATHS).toContain("/results");
  });
});

describe("buildRobotsTxt", () => {
  const txt = buildRobotsTxt(ORIGIN);

  it("declares a user-agent and every disallowed path", () => {
    expect(txt).toContain("User-agent: *");
    for (const path of DISALLOWED_PATHS) expect(txt).toContain(`Disallow: ${path}`);
  });

  it("points at an absolute sitemap URL on the same origin", () => {
    expect(txt).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it("ends with a newline", () => {
    expect(txt.endsWith("\n")).toBe(true);
  });
});

describe("buildSitemapXml", () => {
  const xml = buildSitemapXml(ORIGIN, new Date("2026-09-18T12:00:00Z"));

  it("is a well-formed urlset", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("emits one url per indexable page, all absolute", () => {
    expect(xml.match(/<url>/g)).toHaveLength(INDEXABLE_PAGES.length);
    expect(xml.match(new RegExp(`<loc>${ORIGIN}`, "g"))).toHaveLength(INDEXABLE_PAGES.length);
  });

  it("uses an ISO date for lastmod", () => {
    expect(xml).toContain("<lastmod>2026-09-18</lastmod>");
  });

  it("names no results page", () => {
    expect(xml).not.toContain("/results");
  });

  it("escapes XML-significant characters in the origin", () => {
    expect(buildSitemapXml("https://x.example/?a=1&b=2")).toContain("&amp;");
  });
});

describe("originFromRequest", () => {
  it("takes the origin from the request, not a hardcoded value", () => {
    expect(originFromRequest(new Request("https://preview.example/sitemap.xml"))).toBe(
      "https://preview.example",
    );
    expect(originFromRequest(new Request("http://localhost:3000/robots.txt"))).toBe(
      "http://localhost:3000",
    );
  });
});
