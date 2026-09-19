import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { portraitExpiryFrom, upsertEntry } from "@/db/queries";
import { account, leaderboardEntry } from "@/db/schema";
import type { NewLeaderboardEntry } from "@/db/schema";
import type { AestheticKey, Ratings } from "@/lib/jev/types";
import { auth } from "@/server/auth";
import { getDb } from "@/server/db";

import { debug } from "./debug";

const log = debug("claim");

const RATINGS_KEYS = [
  "eyes",
  "eyebrows",
  "nose",
  "lips",
  "jawline",
  "chin",
  "cheekbones",
  "forehead",
  "skin",
  "teeth",
  "hairAndHairline",
  "ears",
  "symmetry",
  "proportions",
  "approachability",
  "trustworthiness",
  "mainCharacterEnergy",
  "styleAndGrooming",
  "confidence",
] as const satisfies readonly (keyof Ratings)[];

const AESTHETIC_KEYS = [
  "kBeauty",
  "bollywoodGlamour",
  "nollywoodGlamour",
  "persianClassical",
  "oldHollywood",
  "nordicMinimalism",
  "mediterraneanClassical",
  "latinScreenSiren",
] as const satisfies readonly AestheticKey[];

const number0to100 = z.number().min(0).max(100);

/** Typed as a full key map before `z.object` sees it, so `data.ratings` infers as `Ratings`
 *  rather than the generic `{ [x: string]: number }` a plain `Object.fromEntries` would give. */
const ratingsShape = Object.fromEntries(RATINGS_KEYS.map((key) => [key, number0to100])) as Record<
  (typeof RATINGS_KEYS)[number],
  typeof number0to100
>;
const affinitiesShape = Object.fromEntries(
  AESTHETIC_KEYS.map((key) => [key, number0to100]),
) as Record<(typeof AESTHETIC_KEYS)[number], typeof number0to100>;

const ClaimInput = z.object({
  overall: number0to100,
  ratings: z.object(ratingsShape),
  affinities: z.object(affinitiesShape),
  /**
   * The Crop as a base64 data URL — the same value `scoreCrop` already received. Required
   * only when `portraitConsent` is true; a decline never needs it.
   */
  crop: z.string().min(1).optional(),
  /** ADR-0004: a separate, never pre-ticked box. This is that box's value, nothing implied. */
  portraitConsent: z.boolean(),
});

export type ClaimResult =
  | { readonly ok: false; readonly reason: "unauthenticated" | "error" }
  | { readonly ok: true; readonly handle: string };

/** The 19 `rating*` and 8 `affinity*` columns. Everything a Claim needs beyond identity and the Portrait. */
type ScoreColumns = Omit<
  NewLeaderboardEntry,
  | "xUserId"
  | "handle"
  | "displayName"
  | "overall"
  | "portraitKey"
  | "portraitConsent"
  | "portraitExpiresAt"
  | "createdAt"
  | "updatedAt"
>;

function scoreColumns(ratings: Ratings, affinities: Record<AestheticKey, number>): ScoreColumns {
  return {
    ratingEyes: Math.round(ratings.eyes),
    ratingEyebrows: Math.round(ratings.eyebrows),
    ratingNose: Math.round(ratings.nose),
    ratingLips: Math.round(ratings.lips),
    ratingJawline: Math.round(ratings.jawline),
    ratingChin: Math.round(ratings.chin),
    ratingCheekbones: Math.round(ratings.cheekbones),
    ratingForehead: Math.round(ratings.forehead),
    ratingSkin: Math.round(ratings.skin),
    ratingTeeth: Math.round(ratings.teeth),
    ratingHairAndHairline: Math.round(ratings.hairAndHairline),
    ratingEars: Math.round(ratings.ears),
    ratingSymmetry: Math.round(ratings.symmetry),
    ratingProportions: Math.round(ratings.proportions),
    ratingApproachability: Math.round(ratings.approachability),
    ratingTrustworthiness: Math.round(ratings.trustworthiness),
    ratingMainCharacterEnergy: Math.round(ratings.mainCharacterEnergy),
    ratingStyleAndGrooming: Math.round(ratings.styleAndGrooming),
    ratingConfidence: Math.round(ratings.confidence),
    affinityKBeauty: Math.round(affinities.kBeauty),
    affinityOldHollywood: Math.round(affinities.oldHollywood),
    affinityBollywoodGlamour: Math.round(affinities.bollywoodGlamour),
    affinityNordicMinimalism: Math.round(affinities.nordicMinimalism),
    affinityMediterraneanClassical: Math.round(affinities.mediterraneanClassical),
    affinityNollywoodGlamour: Math.round(affinities.nollywoodGlamour),
    affinityPersianClassical: Math.round(affinities.persianClassical),
    affinityLatinScreenSiren: Math.round(affinities.latinScreenSiren),
  };
}

/** Same origin every Portrait for one Contender lands at, so a re-Claim overwrites in place. */
function portraitKeyFor(xUserId: string): string {
  return `portraits/${xUserId}`;
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The Claim: signs the Overall, Ratings and Affinities a Visitor already has in hand to
 * their X identity, and stores a Portrait only under the separate, never-pre-ticked consent
 * this input carries. `SPEC.md`, "Claim flow".
 *
 * The X user id never comes from the client - `session.user` carries the handle and display
 * name, but the numeric id lives on the `account` row for the `twitter` provider, so this
 * reads it there rather than trust anything the caller could forge.
 */
export const claimRank = createServerFn({ method: "POST" })
  .validator(ClaimInput)
  .handler(async ({ data }): Promise<ClaimResult> => {
    log.log("start", { portraitConsent: data.portraitConsent });

    try {
      const session = await auth.api.getSession({ headers: getRequestHeaders() });
      if (!session) {
        log.log("rejected", { reason: "unauthenticated" });
        return { ok: false, reason: "unauthenticated" };
      }

      const db = getDb();
      const [twitterAccount] = await db
        .select({ accountId: account.accountId })
        .from(account)
        .where(and(eq(account.userId, session.user.id), eq(account.providerId, "twitter")));

      const handle = session.user.xUsername;
      if (!twitterAccount || !handle) {
        log.log("rejected", { reason: "unauthenticated" });
        return { ok: false, reason: "unauthenticated" };
      }
      const xUserId = twitterAccount.accountId;

      const [existing] = await db
        .select({ portraitKey: leaderboardEntry.portraitKey })
        .from(leaderboardEntry)
        .where(eq(leaderboardEntry.xUserId, xUserId));

      let portrait: Pick<
        NewLeaderboardEntry,
        "portraitKey" | "portraitConsent" | "portraitExpiresAt"
      >;

      if (data.portraitConsent && data.crop) {
        const key = portraitKeyFor(xUserId);
        const crop = data.crop;
        await log.time("portrait: put", () =>
          env.PORTRAITS.put(key, decodeDataUrl(crop), {
            httpMetadata: { contentType: "image/jpeg" },
          }),
        );
        portrait = {
          portraitKey: key,
          portraitConsent: true,
          portraitExpiresAt: portraitExpiryFrom(new Date()),
        };
      } else {
        // Declining leaves no Portrait behind. If one already existed - an earlier Claim
        // consented and this one does not - drop it from R2 too, not just the row.
        if (existing?.portraitKey) {
          const staleKey = existing.portraitKey;
          await log.time("portrait: delete", () => env.PORTRAITS.delete(staleKey));
        }
        portrait = { portraitKey: null, portraitConsent: false, portraitExpiresAt: null };
      }

      const entry: NewLeaderboardEntry = {
        xUserId,
        handle,
        displayName: session.user.name,
        overall: Math.round(data.overall),
        ...scoreColumns(data.ratings, data.affinities),
        ...portrait,
      };

      await log.time("upsert", () => upsertEntry(db, entry));
      log.log("claimed", { xUserId, portraitConsent: portrait.portraitConsent });

      return { ok: true, handle };
    } catch (error) {
      log.log("error", { error: error instanceof Error ? error.message : String(error) });
      return { ok: false, reason: "error" };
    }
  });
