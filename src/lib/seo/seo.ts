import type { AnyRouteMatch } from "@tanstack/react-router";

/**
 * Meta tags for TanStack Router `head`.
 *
 * One rule shapes this module: a results page must never be indexed. A Rating
 * attached to a face is not something a search engine should hold, and a
 * Visitor who does not Claim has no stored state to index in the first place.
 * `resultsSeo` therefore forces `noindex` and omits the image, and a test
 * asserts it. See `PRIVACY.md`.
 */

export const SITE_NAME = "TheFace";
export const SITE_TAGLINE = "Find out what your face says";
export const DEFAULT_DESCRIPTION =
  "Upload a selfie and get it rated across features, first impressions and eight beauty aesthetics. Your photo stays on your device unless you choose to share it.";

/** Longest description a crawler will show. Longer text is cut on a word boundary. */
export const MAX_DESCRIPTION = 160;

export interface SeoInput {
  /** Page title, without the site name. Omit on the home page. */
  readonly title?: string;
  readonly description?: string;
  /** Absolute or root-relative URL of the share image. */
  readonly image?: string;
  /** Root-relative path of this page, used for the canonical URL. */
  readonly path?: string;
  /** Origin of the deployment, for absolute URLs. */
  readonly origin?: string;
  /** Keep this page out of search results. */
  readonly noindex?: boolean;
}

/**
 * Exactly what a route's `head` function returns, taken from the router rather
 * than described again here. `RouteOptions["head"]` resolves to
 * `{ meta?: AnyRouteMatch["meta"]; links?: AnyRouteMatch["links"]; ... }`, so
 * deriving from `AnyRouteMatch` keeps this in step with the router: if its head
 * shape changes, this becomes a compile error instead of a runtime surprise.
 */
export type HeadMeta = NonNullable<AnyRouteMatch["meta"]>;
export type HeadLinks = NonNullable<AnyRouteMatch["links"]>;

export interface HeadTags {
  readonly meta: HeadMeta;
  readonly links: HeadLinks;
}

/** Cuts to `max` characters on a word boundary, adding an ellipsis. */
export function truncate(text: string, max: number = MAX_DESCRIPTION): string {
  const clean = text.replaceAll(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** `"Leaderboard"` becomes `"Leaderboard · TheFace"`. No title becomes the tagline. */
export function pageTitle(title?: string): string {
  if (!title) return `${SITE_NAME} - ${SITE_TAGLINE}`;
  return `${title} · ${SITE_NAME}`;
}

/** Open Graph needs absolute URLs; a root-relative path is resolved against the origin. */
export function absoluteUrl(
  path: string | undefined,
  origin: string | undefined,
): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  if (!origin) return undefined;
  return `${origin.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export function seo(input: SeoInput = {}): HeadTags {
  const title = pageTitle(input.title);
  const description = truncate(input.description ?? DEFAULT_DESCRIPTION);
  const canonical = absoluteUrl(input.path ?? "/", input.origin);
  const image = absoluteUrl(input.image, input.origin);

  const meta: HeadMeta = [
    { title },
    { name: "description", content: description },

    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: description },

    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];

  if (canonical) meta.push({ property: "og:url", content: canonical });
  if (image) {
    meta.push({ property: "og:image", content: image });
    meta.push({ name: "twitter:image", content: image });
  }
  if (input.noindex) meta.push({ name: "robots", content: "noindex, nofollow" });

  const links: HeadLinks = [];
  if (canonical && !input.noindex) links.push({ rel: "canonical", href: canonical });

  return { meta, links };
}

/* ── Page helpers ─────────────────────────────────────────────────────── */

export function homeSeo(origin?: string): HeadTags {
  return seo({ origin, path: "/" });
}

/**
 * A results page is never indexed and never carries a share image, because the
 * image would be the Visitor's own face on a page a crawler could keep.
 * A Visitor who wants to share a result shares a screenshot they chose to take.
 */
export function resultsSeo(origin?: string): HeadTags {
  return seo({
    origin,
    path: "/results",
    title: "Your result",
    description: "Your Ratings across features, first impressions and eight aesthetics.",
    noindex: true,
  });
}

export function boardSeo(
  options: { readonly aesthetic?: string; readonly origin?: string } = {},
): HeadTags {
  const { aesthetic, origin } = options;
  return aesthetic
    ? seo({
        origin,
        path: `/board/${slug(aesthetic)}`,
        title: `${aesthetic} leaderboard`,
        description: `Who scores highest against the ${aesthetic} aesthetic on ${SITE_NAME}.`,
      })
    : seo({
        origin,
        path: "/board",
        title: "Leaderboard",
        description: `The highest Overalls on ${SITE_NAME}, plus a board for each of the eight aesthetics.`,
      });
}

export function privacySeo(origin?: string): HeadTags {
  return seo({
    origin,
    path: "/privacy",
    title: "Privacy",
    description: "What happens to your photo, what we store, and how to delete it.",
  });
}

/** `"Old Hollywood"` becomes `"old-hollywood"`. */
export function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}
