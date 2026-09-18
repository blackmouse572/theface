import { and, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import type * as schema from "./schema";
import type { Aesthetic, NewLeaderboardEntry } from "./schema";
import {
  affinityColumns,
  leaderboardEntry,
  MIN_TALLY_FOR_PERCENTILE,
  PORTRAIT_TTL_MS,
  RATING_MAX,
  RATING_MIN,
  tally,
  TALLY_BUCKETS,
} from "./schema";

export type Db = DrizzleD1Database<typeof schema>;

/* -------------------------------------------------------------------------------------- */
/* Boards                                                                                   */
/* -------------------------------------------------------------------------------------- */

export const DEFAULT_BOARD_LIMIT = 50;

/** The hard ceiling on a Board page. A Board must never be able to scan the whole table. */
export const MAX_BOARD_LIMIT = 100;

/** Coerces any caller-supplied limit into `1 .. MAX_BOARD_LIMIT`. */
export function clampBoardLimit(limit: number = DEFAULT_BOARD_LIMIT): number {
  if (!Number.isFinite(limit)) return DEFAULT_BOARD_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_BOARD_LIMIT);
}

/**
 * What a Board row shows. Portraits travel separately: this returns the key, and the browser
 * fetches each Portrait from the Worker's own route.
 */
const boardRow = {
  xUserId: leaderboardEntry.xUserId,
  handle: leaderboardEntry.handle,
  displayName: leaderboardEntry.displayName,
  overall: leaderboardEntry.overall,
  portraitKey: leaderboardEntry.portraitKey,
};

/**
 * The Board that ranks the Overall.
 *
 * Served by `leaderboard_entry_overall_idx`. SQLite walks a single-column index backwards
 * for a `DESC` order at the same cost as forwards, so the index needs no `DESC` of its own.
 * Rows scanned: the limit.
 */
export function selectOverallBoard(db: Db, limit?: number) {
  return db
    .select(boardRow)
    .from(leaderboardEntry)
    .orderBy(desc(leaderboardEntry.overall))
    .limit(clampBoardLimit(limit));
}

/**
 * One of the eight per-Aesthetic Boards, ranked on that Aesthetic's Affinity.
 *
 * Each Affinity column carries its own index, so this costs the same as the Overall Board.
 */
export function selectAestheticBoard(db: Db, aesthetic: Aesthetic, limit?: number) {
  const affinity = affinityColumns[aesthetic];
  return db
    .select({ ...boardRow, affinity })
    .from(leaderboardEntry)
    .orderBy(desc(affinity))
    .limit(clampBoardLimit(limit));
}

/* -------------------------------------------------------------------------------------- */
/* A single Leaderboard Entry                                                               */
/* -------------------------------------------------------------------------------------- */

/** One Entry by its X user id. A primary-key lookup: one row scanned. */
export function selectEntry(db: Db, xUserId: string) {
  return db.select().from(leaderboardEntry).where(eq(leaderboardEntry.xUserId, xUserId)).limit(1);
}

/**
 * The Claim. A second Claim by the same Contender replaces the Ratings rather than adding a
 * row, because `x_user_id` is the primary key.
 */
export function upsertEntry(db: Db, entry: NewLeaderboardEntry) {
  const { xUserId: _xUserId, createdAt: _createdAt, ...refreshed } = entry;
  return db
    .insert(leaderboardEntry)
    .values(entry)
    .onConflictDoUpdate({ target: leaderboardEntry.xUserId, set: refreshed });
}

/**
 * Deletes an Entry and hands back the Portrait key it held.
 *
 * `RETURNING` on a `DELETE` yields the deleted row, so the key survives exactly long enough
 * for the caller to delete the R2 object. Deleting the row is what removes the key from the
 * database; **the R2 object is the caller's responsibility** and `PRIVACY.md` promises it
 * stops being served within the hour that the edge cache runs for.
 */
export function deleteEntry(db: Db, xUserId: string) {
  return db
    .delete(leaderboardEntry)
    .where(eq(leaderboardEntry.xUserId, xUserId))
    .returning({ portraitKey: leaderboardEntry.portraitKey });
}

/* -------------------------------------------------------------------------------------- */
/* Portraits                                                                                */
/* -------------------------------------------------------------------------------------- */

/** When a Portrait stored now expires. ADR-0004 / `PRIVACY.md`: 90 days. */
export function portraitExpiryFrom(storedAt: Date): Date {
  return new Date(storedAt.getTime() + PORTRAIT_TTL_MS);
}

/**
 * The state an Entry falls back to when it has no Portrait: a null key means the Board shows
 * an Avatar. The consent clears with the Portrait it authorised, so storing a new Portrait
 * needs the box ticked again.
 */
const noPortrait = {
  portraitKey: null,
  portraitConsent: false,
  portraitExpiresAt: null,
} as const;

/**
 * The Portrait key for one Entry.
 *
 * SQLite's `RETURNING` on an `UPDATE` yields the **new** values, so a caller that is about to
 * clear a Portrait must read the key with this first, then delete the R2 object, then call
 * `clearPortrait`. `deleteEntry` needs no such dance, because a `DELETE ... RETURNING` yields
 * the row as it was.
 */
export function selectPortraitKey(db: Db, xUserId: string) {
  return db
    .select({ portraitKey: leaderboardEntry.portraitKey })
    .from(leaderboardEntry)
    .where(eq(leaderboardEntry.xUserId, xUserId))
    .limit(1);
}

/** Drops one Contender's Portrait and keeps the Entry. The Entry falls back to an Avatar. */
export function clearPortrait(db: Db, xUserId: string) {
  return db.update(leaderboardEntry).set(noPortrait).where(eq(leaderboardEntry.xUserId, xUserId));
}

/** Entries whose Portrait has passed its 90 days. Read these keys before expiring them. */
export function selectExpiredPortraits(db: Db, now: Date) {
  return db
    .select({ xUserId: leaderboardEntry.xUserId, portraitKey: leaderboardEntry.portraitKey })
    .from(leaderboardEntry)
    .where(expiredPortrait(now));
}

/**
 * Expires every Portrait past 90 days. Served by the partial index
 * `leaderboard_entry_portrait_expires_at_idx`, whose `where portrait_key is not null` matches
 * the predicate below, so the sweep never touches an Entry that has no Portrait.
 */
export function expirePortraits(db: Db, now: Date) {
  return db.update(leaderboardEntry).set(noPortrait).where(expiredPortrait(now));
}

function expiredPortrait(now: Date) {
  return and(isNotNull(leaderboardEntry.portraitKey), lte(leaderboardEntry.portraitExpiresAt, now));
}

/* -------------------------------------------------------------------------------------- */
/* The Tally                                                                                */
/* -------------------------------------------------------------------------------------- */

/**
 * Records one Overall. This is the only write TheFace makes for a Visitor who does not
 * Claim, and it carries no identifier and no timestamp - ADR-0006.
 *
 * An upsert, so the 101 buckets need no seeding: a bucket appears the first time an Overall
 * lands in it, and a missing bucket reads as zero.
 */
export function incrementTally(db: Db, overall: number) {
  assertOverall(overall);
  return db
    .insert(tally)
    .values({ overall, count: 1 })
    .onConflictDoUpdate({
      target: tally.overall,
      set: { count: sql`${tally.count} + 1` },
    });
}

/** The whole Tally: at most 101 rows, whatever the number of Visitors behind them. */
export function selectTallyCounts(db: Db) {
  return db.select({ overall: tally.overall, count: tally.count }).from(tally);
}

/** Spreads the Tally's rows into a dense 101-bucket array, absent buckets counting zero. */
export function tallyRowsToCounts(rows: readonly { overall: number; count: number }[]): number[] {
  const counts = Array.from<number>({ length: TALLY_BUCKETS }).fill(0);
  for (const row of rows) {
    if (row.overall < RATING_MIN || row.overall > RATING_MAX) continue;
    counts[row.overall] = row.count;
  }
  return counts;
}

/** How many Overalls the Tally has recorded. */
export function tallyTotal(counts: readonly number[]): number {
  let total = 0;
  for (let bucket = 0; bucket < counts.length; bucket += 1) total += counts[bucket] ?? 0;
  return total;
}

/**
 * `SPEC.md`: Percentile stays hidden until the Tally holds about 200 Overalls, because a
 * Percentile drawn from a handful of Visitors is noise and a synthetic prior would collide
 * with real data later.
 */
export function isPercentileReady(total: number): boolean {
  return total >= MIN_TALLY_FOR_PERCENTILE;
}

/**
 * Percentile: the share of recorded Overalls that this Overall exceeds, as 0–100.
 *
 * Summing 101 counters is O(101) at any scale. This is the whole of ADR-0006's billing
 * argument, and the reason nothing here reads `leaderboard_entry`.
 *
 * Returns `null` for an empty Tally, where the question has no answer. Callers should also
 * check `isPercentileReady` before showing the number.
 */
export function percentileFromTally(counts: readonly number[], overall: number): number | null {
  if (counts.length !== TALLY_BUCKETS) {
    throw new RangeError(`The Tally holds ${TALLY_BUCKETS} buckets, received ${counts.length}`);
  }
  assertOverall(overall);

  let below = 0;
  let total = 0;
  for (let bucket = 0; bucket < TALLY_BUCKETS; bucket += 1) {
    const count = counts[bucket] ?? 0;
    total += count;
    if (bucket < overall) below += count;
  }

  if (total === 0) return null;
  return (below / total) * 100;
}

function assertOverall(overall: number): void {
  if (!Number.isInteger(overall) || overall < RATING_MIN || overall > RATING_MAX) {
    throw new RangeError(
      `An Overall is an integer ${RATING_MIN}–${RATING_MAX}, received ${overall}`,
    );
  }
}
