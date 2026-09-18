/**
 * These tests run without a database. They cover the two things that can be wrong in a way
 * that D1 would happily bill for: the SQL each query builds, and the Percentile arithmetic.
 */

import { drizzle } from "drizzle-orm/d1";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import {
  clampBoardLimit,
  clearPortrait,
  DEFAULT_BOARD_LIMIT,
  deleteEntry,
  expirePortraits,
  incrementTally,
  isPercentileReady,
  MAX_BOARD_LIMIT,
  percentileFromTally,
  selectAestheticBoard,
  selectEntry,
  selectExpiredPortraits,
  selectOverallBoard,
  selectPortraitKey,
  selectTallyCounts,
  tallyRowsToCounts,
  tallyTotal,
} from "./queries";
import type { Db } from "./queries";
import {
  account,
  AESTHETICS,
  affinityColumns,
  leaderboardEntry,
  MIN_TALLY_FOR_PERCENTILE,
  session,
  TALLY_BUCKETS,
  tally,
  user,
  verification,
} from "./schema";

/**
 * The D1 driver builds SQL without ever touching the binding, so an empty object is enough
 * to read `.toSQL()` off any query.
 */
const db = drizzle({} as never) as Db;

/** A 101-bucket Tally with every counter at zero. */
function emptyTally(): number[] {
  return Array.from<number>({ length: TALLY_BUCKETS }).fill(0);
}

/** A Tally built from `{ overall: count }` pairs. */
function tallyOf(buckets: Record<number, number>): number[] {
  const counts = emptyTally();
  for (const [overall, count] of Object.entries(buckets)) counts[Number(overall)] = count;
  return counts;
}

describe("Percentile, from the Tally", () => {
  it("returns null for an empty Tally, because the question has no answer yet", () => {
    expect(percentileFromTally(emptyTally(), 50)).toBeNull();
    expect(percentileFromTally(emptyTally(), 0)).toBeNull();
    expect(percentileFromTally(emptyTally(), 100)).toBeNull();
  });

  it("puts an Overall at 0 when every recorded Overall sits in the same bucket", () => {
    const counts = tallyOf({ 60: 50 });
    // A Percentile is the share it exceeds. It exceeds nobody, including its own bucket.
    expect(percentileFromTally(counts, 60)).toBe(0);
  });

  it("puts an Overall at 100 when the whole mass sits strictly beneath it", () => {
    expect(percentileFromTally(tallyOf({ 60: 50 }), 61)).toBe(100);
    expect(percentileFromTally(tallyOf({ 0: 7 }), 100)).toBe(100);
  });

  it("returns 0 for an Overall of 0, which can exceed nothing", () => {
    expect(percentileFromTally(tallyOf({ 0: 10, 50: 10, 100: 10 }), 0)).toBe(0);
    expect(percentileFromTally(tallyOf({ 100: 1 }), 0)).toBe(0);
  });

  it("counts everything beneath 100 for an Overall of 100, but not 100 itself", () => {
    const counts = tallyOf({ 40: 30, 100: 10 });
    expect(percentileFromTally(counts, 100)).toBe(75);
  });

  it("computes the share strictly beneath the Overall", () => {
    const counts = tallyOf({ 10: 1, 20: 2, 30: 3, 40: 4 });
    // 10 recorded Overalls; 6 of them are beneath 40.
    expect(percentileFromTally(counts, 40)).toBe(60);
    expect(percentileFromTally(counts, 30)).toBe(30);
    expect(percentileFromTally(counts, 10)).toBe(0);
    expect(percentileFromTally(counts, 41)).toBe(100);
  });

  it("is exact for a single recorded Overall", () => {
    expect(percentileFromTally(tallyOf({ 73: 1 }), 73)).toBe(0);
    expect(percentileFromTally(tallyOf({ 73: 1 }), 74)).toBe(100);
  });

  it("rejects a Tally that is not 101 buckets", () => {
    expect(() => percentileFromTally(Array.from<number>({ length: 100 }).fill(0), 50)).toThrow(
      RangeError,
    );
    expect(() => percentileFromTally(Array.from<number>({ length: 102 }).fill(0), 50)).toThrow(
      RangeError,
    );
    expect(() => percentileFromTally([], 50)).toThrow(RangeError);
  });

  it("rejects an Overall outside 0–100 or not a whole number", () => {
    expect(() => percentileFromTally(emptyTally(), -1)).toThrow(RangeError);
    expect(() => percentileFromTally(emptyTally(), 101)).toThrow(RangeError);
    expect(() => percentileFromTally(emptyTally(), 50.5)).toThrow(RangeError);
    expect(() => percentileFromTally(emptyTally(), Number.NaN)).toThrow(RangeError);
  });
});

describe("Tally helpers", () => {
  it("spreads rows into 101 dense buckets and reads a missing bucket as zero", () => {
    const counts = tallyRowsToCounts([
      { overall: 0, count: 3 },
      { overall: 73, count: 9 },
      { overall: 100, count: 1 },
    ]);
    expect(counts).toHaveLength(TALLY_BUCKETS);
    expect(counts[0]).toBe(3);
    expect(counts[72]).toBe(0);
    expect(counts[73]).toBe(9);
    expect(counts[100]).toBe(1);
    expect(tallyTotal(counts)).toBe(13);
  });

  it("ignores a row outside 0–100 rather than growing the array", () => {
    const counts = tallyRowsToCounts([
      { overall: 101, count: 5 },
      { overall: -1, count: 5 },
    ]);
    expect(counts).toHaveLength(TALLY_BUCKETS);
    expect(tallyTotal(counts)).toBe(0);
  });

  it("totals an empty Tally as zero", () => {
    expect(tallyTotal(emptyTally())).toBe(0);
  });

  it("hides Percentile until the Tally holds about 200 Overalls", () => {
    expect(isPercentileReady(MIN_TALLY_FOR_PERCENTILE - 1)).toBe(false);
    expect(isPercentileReady(MIN_TALLY_FOR_PERCENTILE)).toBe(true);
    expect(isPercentileReady(0)).toBe(false);
  });
});

describe("Boards", () => {
  it("ranks the Overall with an ordered limit, never a sort over the table", () => {
    const { sql, params } = selectOverallBoard(db, 25).toSQL();
    expect(sql).toContain('from "leaderboard_entry"');
    expect(sql).toContain('order by "leaderboard_entry"."overall" desc');
    expect(sql).toContain("limit ?");
    expect(params).toContain(25);
  });

  it("gives every Aesthetic a Board that ranks on its own Affinity column", () => {
    for (const aesthetic of AESTHETICS) {
      const column = getTableConfig(leaderboardEntry).columns.find(
        (candidate) => candidate.name === affinityColumns[aesthetic].name,
      );
      expect(column).toBeDefined();

      const { sql } = selectAestheticBoard(db, aesthetic, 10).toSQL();
      expect(sql).toContain(
        `order by "leaderboard_entry"."${affinityColumns[aesthetic].name}" desc`,
      );
      expect(sql).toContain("limit ?");
    }
  });

  it("gives nine Boards in all: the Overall and one per Aesthetic", () => {
    expect(AESTHETICS).toHaveLength(8);
    expect(new Set(AESTHETICS).size).toBe(8);
  });

  it("clamps a caller's limit so no Board can scan the table", () => {
    expect(clampBoardLimit(undefined)).toBe(DEFAULT_BOARD_LIMIT);
    expect(clampBoardLimit(10)).toBe(10);
    expect(clampBoardLimit(0)).toBe(1);
    expect(clampBoardLimit(-5)).toBe(1);
    expect(clampBoardLimit(10_000)).toBe(MAX_BOARD_LIMIT);
    expect(clampBoardLimit(12.7)).toBe(12);
    expect(clampBoardLimit(Number.NaN)).toBe(DEFAULT_BOARD_LIMIT);
    expect(selectOverallBoard(db, 10_000).toSQL().params).toContain(MAX_BOARD_LIMIT);
  });

  it("reads one Entry by its primary key", () => {
    const { sql, params } = selectEntry(db, "1523456789012345678").toSQL();
    expect(sql).toContain('where "leaderboard_entry"."x_user_id" = ?');
    expect(sql).toContain("limit ?");
    expect(params).toContain("1523456789012345678");
  });
});

describe("The Tally is the only source of Percentile", () => {
  it("reads the Tally, and nothing else, to answer Percentile", () => {
    const { sql } = selectTallyCounts(db).toSQL();
    expect(sql).toContain('from "tally"');
    expect(sql).not.toContain("leaderboard_entry");
    expect(sql).not.toContain("count(");
  });

  it("increments one bucket as an upsert, so the 101 buckets need no seeding", () => {
    const { sql, params } = incrementTally(db, 73).toSQL();
    expect(sql).toContain('insert into "tally"');
    expect(sql).toContain('on conflict ("tally"."overall") do update set');
    expect(sql).toContain('"count" = "tally"."count" + 1');
    expect(params).toEqual([73, 1]);
  });

  it("refuses an Overall the Tally has no bucket for", () => {
    expect(() => incrementTally(db, 101)).toThrow(RangeError);
    expect(() => incrementTally(db, -1)).toThrow(RangeError);
    expect(() => incrementTally(db, 12.5)).toThrow(RangeError);
  });
});

describe("Portraits", () => {
  it("hands the Portrait key back when it deletes an Entry, so the caller can clear R2", () => {
    const { sql, params } = deleteEntry(db, "42").toSQL();
    expect(sql).toContain('delete from "leaderboard_entry"');
    expect(sql).toContain('where "leaderboard_entry"."x_user_id" = ?');
    expect(sql).toContain('returning "portrait_key"');
    expect(params).toEqual(["42"]);
  });

  it("reads the key before clearing it, because RETURNING on an UPDATE gives the new value", () => {
    const { sql } = selectPortraitKey(db, "42").toSQL();
    expect(sql).toContain('select "portrait_key" from "leaderboard_entry"');
    expect(sql).toContain('where "leaderboard_entry"."x_user_id" = ?');
  });

  it("clears one Contender's Portrait and keeps the Entry", () => {
    const { sql, params } = clearPortrait(db, "42").toSQL();
    expect(sql).toContain('update "leaderboard_entry" set');
    expect(sql).toContain('where "leaderboard_entry"."x_user_id" = ?');
    expect(params.slice(0, 3)).toEqual([null, 0, null]);
    expect(params.at(-1)).toBe("42");
  });

  it("finds expired Portraits with the predicate the partial index carries", () => {
    const now = new Date(1_700_000_000_000);
    const { sql, params } = selectExpiredPortraits(db, now).toSQL();
    expect(sql).toContain('"leaderboard_entry"."portrait_key" is not null');
    expect(sql).toContain('"leaderboard_entry"."portrait_expires_at" <= ?');
    expect(params).toEqual([now.getTime()]);
  });

  it("expires a Portrait to the Avatar fallback: no key, no consent, no expiry", () => {
    const now = new Date(1_700_000_000_000);
    const { sql, params } = expirePortraits(db, now).toSQL();
    expect(sql).toContain('update "leaderboard_entry" set');
    expect(sql).toContain('"portrait_key" = ?');
    expect(sql).toContain('"portrait_consent" = ?');
    expect(sql).toContain('"portrait_expires_at" = ?');
    expect(sql).toContain('"leaderboard_entry"."portrait_key" is not null');
    // null key, consent false, null expiry, the `$onUpdate` stamp, then the cutoff.
    expect(sql).toContain('"updated_at" = ?');
    expect(params.slice(0, 3)).toEqual([null, 0, null]);
    expect(params.at(-1)).toBe(now.getTime());
  });
});

describe("What the schema is not allowed to hold", () => {
  const tables = [leaderboardEntry, tally, user, session, account, verification];

  it("names no people anywhere: ADR-0003", () => {
    const forbidden = ["region", "ethnicity", "nationality", "race"];
    for (const table of tables) {
      const config = getTableConfig(table);
      const names = [config.name, ...config.columns.map((column) => column.name)];
      for (const name of names) {
        for (const word of forbidden) {
          expect(name.toLowerCase()).not.toContain(word);
        }
      }
    }
  });

  it("keeps the Tally anonymous: counters only, no identifier and no timestamp", () => {
    const config = getTableConfig(tally);
    expect(config.columns.map((column) => column.name).sort()).toEqual(["count", "overall"]);
    expect(config.foreignKeys).toHaveLength(0);
  });

  it("stores the X user id as text, because X returns it as a string", () => {
    const config = getTableConfig(leaderboardEntry);
    const key = config.columns.find((column) => column.name === "x_user_id");
    expect(key?.getSQLType()).toBe("text");
    expect(key?.primary).toBe(true);
  });

  it("stores no Craft Rating, because the Overall excludes Craft: ADR-0007", () => {
    const names = getTableConfig(leaderboardEntry).columns.map((column) => column.name);
    for (const craft of ["lighting", "angle", "framing", "background", "camera"]) {
      expect(names.some((name) => name.includes(craft))).toBe(false);
    }
  });

  it("stays well inside D1's 100-column limit", () => {
    expect(getTableConfig(leaderboardEntry).columns.length).toBeLessThan(100);
  });

  it("indexes exactly the nine Boards plus the Portrait expiry sweep", () => {
    const indexNames = getTableConfig(leaderboardEntry).indexes.map((entry) => entry.config.name);
    expect(indexNames).toHaveLength(10);
    expect(indexNames).toContain("leaderboard_entry_overall_idx");
    expect(indexNames).toContain("leaderboard_entry_portrait_expires_at_idx");
    for (const aesthetic of AESTHETICS) {
      expect(indexNames).toContain(`leaderboard_entry_${affinityColumns[aesthetic].name}_idx`);
    }
  });

  it("gives the Tally no index beyond its rowid primary key", () => {
    expect(getTableConfig(tally).indexes).toHaveLength(0);
  });
});

describe("better-auth core tables", () => {
  it("names each column the way the Drizzle adapter looks it up", () => {
    // The adapter resolves a field with `schemaModel[field]`, so the TS keys are the contract.
    expect(Object.keys(user)).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "email",
        "emailVerified",
        "image",
        "xUsername",
        "createdAt",
        "updatedAt",
      ]),
    );
    expect(Object.keys(session)).toEqual(
      expect.arrayContaining([
        "id",
        "expiresAt",
        "token",
        "createdAt",
        "updatedAt",
        "ipAddress",
        "userAgent",
        "userId",
      ]),
    );
    expect(Object.keys(account)).toEqual(
      expect.arrayContaining([
        "id",
        "accountId",
        "providerId",
        "userId",
        "accessToken",
        "refreshToken",
        "idToken",
        "accessTokenExpiresAt",
        "refreshTokenExpiresAt",
        "scope",
        "password",
        "createdAt",
        "updatedAt",
      ]),
    );
    expect(Object.keys(verification)).toEqual(
      expect.arrayContaining(["id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"]),
    );
  });

  it("carries xUsername, the one additional field TheFace adds", () => {
    const names = getTableConfig(user).columns.map((column) => column.name);
    expect(names).toContain("x_username");
  });
});

// Guard against the drift that actually happened: the DB schema and the Jev
// question set each held their own list of Aesthetics, and they diverged.
// The Jev module is the source of truth, because its keys name the questions
// that produce the Affinities these columns store.
describe("aesthetic keys match the Jev question set", () => {
  it("is the same set, in the same order", async () => {
    const { AESTHETIC_KEYS } = await import("../lib/jev/questions");
    expect([...AESTHETICS]).toEqual([...AESTHETIC_KEYS]);
  });

  it("has one affinity column per Aesthetic", () => {
    expect(Object.keys(affinityColumns).sort()).toEqual([...AESTHETICS].sort());
  });
});
