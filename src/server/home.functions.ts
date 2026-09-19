import { createServerFn } from "@tanstack/react-start";
import { max } from "drizzle-orm";

import { selectOverallBoard } from "@/db/queries";
import { AESTHETICS, affinityColumns, leaderboardEntry } from "@/db/schema";
import { AESTHETICS as AESTHETIC_DEFS } from "@/lib/jev/questions";
import { slug } from "@/lib/seo";

import { getDb } from "./db";

/**
 * Everything the home page shows above the fold, in one round trip.
 *
 * A server function, not a route loader: a loader is isomorphic and re-runs in the
 * browser, where `env.DB` does not exist. See the build checklist in SPEC.md.
 */
export const getHomeData = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();

  // One query for the Board, one for the eight column maxima. The maxima are an
  // aggregate over the whole table, which is a single scan rather than eight.
  const [rows, peaks] = await Promise.all([
    selectOverallBoard(db, 5),
    db
      .select(
        Object.fromEntries(AESTHETICS.map((key) => [key, max(affinityColumns[key])])) as {
          [K in (typeof AESTHETICS)[number]]: ReturnType<typeof max>;
        },
      )
      .from(leaderboardEntry)
      .get(),
  ]);

  return {
    board: rows.map((row, index) => ({
      rank: index + 1,
      handle: row.handle,
      displayName: row.displayName,
      overall: row.overall,
      imageUrl: avatarUrl(row.handle),
    })),
    aesthetics: AESTHETICS.map((key) => ({
      name: AESTHETIC_DEFS[key].name,
      slug: slug(AESTHETIC_DEFS[key].name),
      affinity: Number(peaks?.[key] ?? 0),
    })),
  };
});

/**
 * A generated Avatar, drawn from the handle. Not a picture of anyone.
 * A Portrait replaces it only where the Contender consented to one.
 */
function avatarUrl(handle: string): string {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(handle)}`;
}
