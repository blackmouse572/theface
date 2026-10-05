/**
 * Pure helpers for seeding the Roster. No network and no file system: those live in
 * `fetch.ts` and `score.ts`, so everything here is unit tested.
 *
 * See docs/superpowers/specs/2026-10-05-celebrity-compliments-design.md, "Seeding the Roster".
 */
import { z } from "zod";

import { AUDIENCES, isFreeLicence, SLUG_PATTERN, type Credit } from "@/lib/celebrities/schema";

export const SEED_DIR = "seed/celebrities";
/** Full-size downloads and owner-supplied photos. Gitignored. */
export const ORIGINALS_DIR = `${SEED_DIR}/originals`;
/** 512px face crops, the Celebrity equivalent of a Crop. Gitignored. */
export const CROPS_DIR = `${SEED_DIR}/crops`;
export const OBSERVATIONS_DIR = `${SEED_DIR}/observations`;
export const CANDIDATES_FILE = `${SEED_DIR}/candidates.json`;
export const CREDITS_FILE = `${SEED_DIR}/credits.json`;
/** The shipped 256px Commons photos. */
export const PUBLIC_DIR = "public/celebrities";
export const ROSTER_FILE = "src/lib/celebrities/roster.json";

/** A hand-set face square: `left` and `size` are fractions of the width, `top` of the height. */
export const CropBoxSchema = z.object({
  left: z.number().min(0).max(1),
  top: z.number().min(0).max(1),
  size: z.number().gt(0).max(1),
});
export type CropBox = z.infer<typeof CropBoxSchema>;

export const CandidateSchema = z
  .object({
    slug: z.string().regex(SLUG_PATTERN),
    name: z.string().min(1),
    audience: z.enum(AUDIENCES),
    /** "File:Trấn Thành.jpg": a Commons photo, shipped with its credit. */
    commonsFile: z.string().startsWith("File:").nullable(),
    /** An owner-supplied photo under ORIGINALS_DIR: observed only, never shipped. */
    localPhoto: z.string().nullable(),
    crop: CropBoxSchema.optional(),
  })
  .refine(
    (candidate) => (candidate.commonsFile === null) !== (candidate.localPhoto === null),
    "exactly one of commonsFile and localPhoto",
  );
export type Candidate = z.infer<typeof CandidateSchema>;
export const CandidatesSchema = z.array(CandidateSchema);

const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/** Commons metadata arrives as HTML. The credit shows plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The face square in pixels. Without a hand-set box: the full width from the top of a
 * portrait image, or the centred square of a landscape one. A box that would run off the
 * image is shrunk to fit.
 */
export function resolveCrop(
  width: number,
  height: number,
  crop?: CropBox,
): { left: number; top: number; size: number } {
  const side = Math.min(width, height);
  if (!crop) {
    return { left: width > height ? Math.round((width - side) / 2) : 0, top: 0, size: side };
  }
  const left = Math.round(crop.left * width);
  const top = Math.round(crop.top * height);
  const size = Math.max(1, Math.min(Math.round(crop.size * width), width - left, height - top));
  return { left, top, size };
}

/**
 * Wikimedia's standard thumbnail widths (https://w.wiki/GHai). Commons throttles downloads of
 * originals and of any other width, and answers them with 429.
 */
export const STANDARD_THUMB_WIDTHS = [
  20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840,
] as const;

/**
 * The thumbnail width to ask Commons for: the largest standard width below the original's,
 * capped at 1920. Asking for a width at or above the original makes the API hand back the
 * original itself, which is the throttled download.
 */
export function thumbWidthFor(originalWidth: number): number {
  const below = STANDARD_THUMB_WIDTHS.filter((width) => width <= 1920 && width < originalWidth);
  return below.at(-1) ?? STANDARD_THUMB_WIDTHS[0];
}

/** One page of a Commons `prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=…&formatversion=2` response. */
export interface CommonsPage {
  title: string;
  imageinfo?: Array<{
    width?: number;
    url?: string;
    /** Present when the request asked for `iiurlwidth`: a scaled copy, lighter on Commons. */
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: unknown }>;
  }>;
}

/** The download URL and the credit, or a throw naming the file and the reason. */
export function parseImageInfo(page: CommonsPage): { url: string; credit: Credit } {
  const info = page.imageinfo?.[0];
  if (!info?.url || !info.descriptionurl) {
    throw new Error(`${page.title}: Commons returned no file URL`);
  }
  const meta = info.extmetadata ?? {};
  const text = (key: string): string => {
    const value = meta[key]?.value;
    return typeof value === "string" ? stripHtml(value) : "";
  };
  const licence = text("LicenseShortName");
  if (!isFreeLicence(licence)) {
    throw new Error(
      `${page.title}: licence "${licence || "unknown"}" is not CC0, public domain, CC BY or CC BY-SA`,
    );
  }
  return {
    url: info.thumburl ?? info.url,
    credit: {
      author: text("Artist") || "Unknown author",
      licence,
      licenceUrl: text("LicenseUrl") || null,
      sourceUrl: info.descriptionurl,
    },
  };
}
