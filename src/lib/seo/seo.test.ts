import { describe, expect, it } from "vitest";

import {
  absoluteUrl,
  boardSeo,
  DEFAULT_DESCRIPTION,
  homeSeo,
  MAX_DESCRIPTION,
  pageTitle,
  privacySeo,
  resultsSeo,
  seo,
  slug,
  truncate,
} from "./seo";
import type { HeadTags } from "./seo";

const ORIGIN = "https://theface.example";
// MetaDescriptor is a discriminated union, so reach into it through a record
// view rather than widening the module's types for the sake of the test.
const rows = (tags: HeadTags): Array<Record<string, string | undefined>> =>
  tags.meta as unknown as Array<Record<string, string | undefined>>;

const get = (tags: HeadTags, key: string, value: string) =>
  rows(tags).find((m) => m[key] === value)?.["content"];

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("short")).toBe("short");
  });
  it("collapses whitespace", () => {
    expect(truncate("a   b\n c")).toBe("a b c");
  });
  it("cuts on a word boundary and never exceeds the limit", () => {
    const long = "word ".repeat(80);
    const out = truncate(long);
    expect(out.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/ …$/);
  });
  it("still truncates a single unbroken word", () => {
    expect(truncate("x".repeat(400)).length).toBeLessThanOrEqual(MAX_DESCRIPTION);
  });
});

describe("pageTitle", () => {
  it("uses the tagline with no title", () => {
    expect(pageTitle()).toContain("TheFace");
  });
  it("appends the site name", () => {
    expect(pageTitle("Leaderboard")).toBe("Leaderboard · TheFace");
  });
});

describe("absoluteUrl", () => {
  it("resolves a root-relative path", () => {
    expect(absoluteUrl("/board", ORIGIN)).toBe("https://theface.example/board");
  });
  it("passes an absolute URL through", () => {
    expect(absoluteUrl("https://cdn.example/a.png", ORIGIN)).toBe("https://cdn.example/a.png");
  });
  it("does not double a slash", () => {
    expect(absoluteUrl("/x", "https://a.example/")).toBe("https://a.example/x");
  });
  it("returns undefined without an origin", () => {
    expect(absoluteUrl("/x", undefined)).toBeUndefined();
  });
});

describe("seo", () => {
  it("emits a title, description and Open Graph pair", () => {
    const tags = seo({ origin: ORIGIN, path: "/", title: "Hi", description: "There" });
    expect(rows(tags).find((m) => "title" in m)?.["title"]).toBe("Hi · TheFace");
    expect(get(tags, "name", "description")).toBe("There");
    expect(get(tags, "property", "og:title")).toBe("Hi · TheFace");
    expect(get(tags, "property", "og:description")).toBe("There");
  });

  it("falls back to the default description", () => {
    expect(get(seo({ origin: ORIGIN }), "name", "description")).toBe(DEFAULT_DESCRIPTION);
  });

  it("uses a large card only when there is an image", () => {
    expect(get(seo({ origin: ORIGIN }), "name", "twitter:card")).toBe("summary");
    expect(get(seo({ origin: ORIGIN, image: "/og.png" }), "name", "twitter:card")).toBe(
      "summary_large_image",
    );
  });

  it("adds a canonical link when indexable", () => {
    expect(seo({ origin: ORIGIN, path: "/board" }).links).toContainEqual({
      rel: "canonical",
      href: "https://theface.example/board",
    });
  });

  it("omits the canonical link when noindex", () => {
    expect(seo({ origin: ORIGIN, path: "/x", noindex: true }).links).toHaveLength(0);
  });

  it("truncates a long description everywhere it appears", () => {
    const tags = seo({ origin: ORIGIN, description: "word ".repeat(100) });
    for (const key of ["description", "og:description", "twitter:description"]) {
      expect(
        get(tags, key.startsWith("og") ? "property" : "name", key)!.length,
      ).toBeLessThanOrEqual(MAX_DESCRIPTION);
    }
  });
});

// PRIVACY.md promises a Visitor's photo is not kept. An indexed results page,
// or one carrying the face as a share image, would break that promise.
describe("a results page is never indexable and never carries a face", () => {
  const tags = resultsSeo(ORIGIN);

  it("is noindex, nofollow", () => {
    expect(get(tags, "name", "robots")).toBe("noindex, nofollow");
  });
  it("has no image of any kind", () => {
    expect(
      tags.meta.some((m) => m?.["property"] === "og:image" || m?.["name"] === "twitter:image"),
    ).toBe(false);
  });
  it("has no canonical link", () => {
    expect(tags.links).toHaveLength(0);
  });
  it("is the only page helper that is noindex", () => {
    for (const other of [homeSeo(ORIGIN), boardSeo({ origin: ORIGIN }), privacySeo(ORIGIN)]) {
      expect(get(other, "name", "robots")).toBeUndefined();
    }
  });
});

describe("boardSeo", () => {
  it("names the aesthetic and links its slug", () => {
    const tags = boardSeo({ aesthetic: "Old Hollywood", origin: ORIGIN });
    expect(get(tags, "property", "og:url")).toBe("https://theface.example/board/old-hollywood");
    expect(get(tags, "property", "og:title")).toContain("Old Hollywood");
  });
  it("falls back to the overall board", () => {
    expect(get(boardSeo({ origin: ORIGIN }), "property", "og:url")).toBe(
      "https://theface.example/board",
    );
  });
  it("never names a region or an origin label", () => {
    const tags = boardSeo({ aesthetic: "Old Hollywood", origin: ORIGIN });
    const text = JSON.stringify(tags).toLowerCase();
    for (const banned of ["anglo", "ethnic", "nationality", "race", "region"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("slug", () => {
  it.each([
    ["Old Hollywood", "old-hollywood"],
    ["K-beauty", "k-beauty"],
    ["Mediterranean classical", "mediterranean-classical"],
    ["  Spaced  Out  ", "spaced-out"],
  ])("%s → %s", (input, expected) => {
    expect(slug(input)).toBe(expected);
  });
});
