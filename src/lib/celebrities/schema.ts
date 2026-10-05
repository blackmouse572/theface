/**
 * The shapes of the Roster: the Celebrities a Compliment can name.
 *
 * No data lives here. `roster.ts` loads the data, server-side only. The seed scripts and the
 * client's `import type`s use these shapes without pulling the Roster, and its numbers, in.
 */
import { z } from "zod";

/**
 * Which Visitors see a Celebrity. It records who knows the Celebrity. It is never a claim
 * about anyone's origin (ADR-0003). A Visitor's Audience comes from the request's country,
 * never from the face (`src/server/audience.ts`).
 */
export const AUDIENCES = ["global", "vn"] as const;
export type Audience = (typeof AUDIENCES)[number];

/** CC0, public domain, CC BY and CC BY-SA, any version. Nothing NonCommercial or NoDerivatives. */
export function isFreeLicence(shortName: string): boolean {
  const licence = shortName.trim().toLowerCase();
  if (/\b(nc|nd)\b/.test(licence)) return false;
  return (
    licence.startsWith("cc0") ||
    licence.startsWith("public domain") ||
    licence === "pd" ||
    /^cc by(-sa)? \d/.test(licence)
  );
}

/** A Commons photo's credit, shown under the photo as its licence requires. */
export const CreditSchema = z.object({
  author: z.string().min(1),
  licence: z.string().refine(isFreeLicence, "not CC0, public domain, CC BY or CC BY-SA"),
  licenceUrl: z.url().nullable(),
  sourceUrl: z.url(),
});
export type Credit = z.infer<typeof CreditSchema>;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CelebritySchema = z
  .object({
    slug: z.string().regex(SLUG_PATTERN),
    /** Display name, with diacritics: "Trấn Thành". */
    name: z.string().min(1),
    audience: z.enum(AUDIENCES),
    /** RAW Overall. Server-only: never sent to a browser (ADR-0009). */
    overall: z.number().min(0).max(100),
    /** A Commons photo under `public/`, or null for an initials badge. */
    photo: z
      .string()
      .regex(/^\/celebrities\/[a-z0-9-]+\.webp$/)
      .nullable(),
    credit: CreditSchema.nullable(),
  })
  .refine(
    (celebrity) => (celebrity.photo === null) === (celebrity.credit === null),
    "a photo needs a credit, and a credit needs a photo",
  );
export type Celebrity = z.infer<typeof CelebritySchema>;

export const RosterSchema = z
  .array(CelebritySchema)
  .refine(
    (roster) => new Set(roster.map((celebrity) => celebrity.slug)).size === roster.length,
    "slugs must be unique",
  );
