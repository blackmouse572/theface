/**
 * The Durable Object runtime is not needed to test any of this. `ctx.storage` is a small
 * in-memory fake, so these tests run under plain Vitest without a workerd instance.
 *
 * The fake throws on any statement it does not recognise, which makes it a check on the SQL
 * itself: change the shape of the upsert and the test says so rather than silently passing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `cloudflare:workers` only exists inside workerd. The base class contributes nothing but
// `this.ctx` and `this.env`, so a two-field stand-in is a faithful substitute.
vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    readonly ctx: unknown;
    readonly env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

import {
  DAILY_LIMIT,
  hashIp,
  nextUtcMidnight,
  RateLimiter,
  rateLimiterName,
  utcDayKey,
} from "./rate-limiter";

const DAY = 86_400_000;
const NOON = Date.parse("2026-09-18T12:00:00.000Z");
const NEXT_MIDNIGHT = Date.parse("2026-09-19T00:00:00.000Z");

/* ------------------------------------------------------------------ the fake */

function makeCursor<T>(rows: T[]) {
  return {
    one(): T {
      if (rows.length !== 1) throw new Error(`.one() expected 1 row, got ${rows.length}`);
      return rows[0] as T;
    },
    toArray: (): T[] => rows,
    [Symbol.iterator]: () => rows[Symbol.iterator](),
  };
}

const CREATE_TABLE = /^CREATE TABLE IF NOT EXISTS quota \(/i;
const UPSERT =
  /^INSERT INTO quota \(id, used\) VALUES \(1, 1\) ON CONFLICT\(id\) DO UPDATE SET used = used \+ 1 RETURNING used$/i;

function createFakeCtx() {
  const state = { used: null as number | null, alarm: null as number | null, hasTable: false };

  const exec = vi.fn((query: string, ...bindings: unknown[]) => {
    const sql = query.replace(/\s+/g, " ").trim();
    if (bindings.length > 0) throw new Error(`unexpected bindings: ${JSON.stringify(bindings)}`);

    if (CREATE_TABLE.test(sql)) {
      state.hasTable = true;
      return makeCursor<{ used: number }>([]);
    }
    if (UPSERT.test(sql)) {
      // SQLite would reject a write to a table that alarm() has dropped.
      if (!state.hasTable) throw new Error("no such table: quota");
      state.used = (state.used ?? 0) + 1;
      return makeCursor([{ used: state.used }]);
    }
    throw new Error(`unexpected SQL: ${sql}`);
  });

  const storage = {
    sql: { exec },
    getAlarm: vi.fn(async () => state.alarm),
    setAlarm: vi.fn(async (time: number) => {
      state.alarm = time;
    }),
    deleteAlarm: vi.fn(async () => {
      state.alarm = null;
    }),
    // Under this Worker's compatibility date, deleteAll() clears the alarm as well.
    deleteAll: vi.fn(async () => {
      state.used = null;
      state.hasTable = false;
      state.alarm = null;
    }),
  };

  return { ctx: { storage }, storage, exec, state };
}

// Taken from the constructor rather than named outright, so the test keeps compiling as
// `wrangler types` fills the generated Env in.
type Ctx = ConstructorParameters<typeof RateLimiter>[0];
type Env = ConstructorParameters<typeof RateLimiter>[1];

function createLimiter() {
  const fake = createFakeCtx();
  const limiter = new RateLimiter(fake.ctx as unknown as Ctx, {} as Env);
  return { ...fake, limiter };
}

/* ------------------------------------------------------------------ the hash */

describe("hashIp", () => {
  it("is stable for the same address on the same day", async () => {
    const a = await hashIp("203.0.113.7", "2026-09-18");
    const b = await hashIp("203.0.113.7", "2026-09-18");
    expect(a).toBe(b);
  });

  it("differs between addresses", async () => {
    const a = await hashIp("203.0.113.7", "2026-09-18");
    const b = await hashIp("203.0.113.8", "2026-09-18");
    expect(a).not.toBe(b);
  });

  it("rotates daily, so one day's digest cannot be linked to the next", async () => {
    const today = await hashIp("203.0.113.7", "2026-09-18");
    const tomorrow = await hashIp("203.0.113.7", "2026-09-19");
    expect(today).not.toBe(tomorrow);
  });

  it("changes with the salt", async () => {
    const unsalted = await hashIp("203.0.113.7", "2026-09-18");
    const salted = await hashIp("203.0.113.7", "2026-09-18", "a-secret");
    expect(salted).not.toBe(unsalted);
  });

  it("normalises whitespace and case, so one address is one counter", async () => {
    const plain = await hashIp("2001:DB8::1", "2026-09-18");
    const messy = await hashIp("  2001:db8::1  ", "2026-09-18");
    expect(messy).toBe(plain);
  });

  it("returns 128 bits of lowercase hex and never the address itself", async () => {
    const digest = await hashIp("203.0.113.7", "2026-09-18");
    expect(digest).toMatch(/^[0-9a-f]{32}$/);
    expect(digest).not.toContain("203");
  });
});

/* -------------------------------------------------------------------- the day */

describe("utcDayKey", () => {
  it("formats the UTC calendar day", () => {
    expect(utcDayKey(NOON)).toBe("2026-09-18");
  });

  it("accepts a Date as well as epoch milliseconds", () => {
    expect(utcDayKey(new Date(NOON))).toBe(utcDayKey(NOON));
  });

  it("rolls over at UTC midnight and not before", () => {
    expect(utcDayKey(Date.parse("2026-09-18T23:59:59.999Z"))).toBe("2026-09-18");
    expect(utcDayKey(Date.parse("2026-09-19T00:00:00.000Z"))).toBe("2026-09-19");
  });

  it("ignores the local timezone", () => {
    // 2026-09-19T00:30Z is still 2026-09-18 in New York. The key must follow UTC, because
    // two datacenters handling the same address must agree on the instance name.
    expect(utcDayKey(Date.parse("2026-09-19T00:30:00.000Z"))).toBe("2026-09-19");
  });

  it("covers a leap day and a year boundary", () => {
    expect(utcDayKey(Date.parse("2028-02-29T06:00:00.000Z"))).toBe("2028-02-29");
    expect(utcDayKey(Date.parse("2026-12-31T23:59:59.000Z"))).toBe("2026-12-31");
  });
});

describe("nextUtcMidnight", () => {
  it("returns the coming midnight", () => {
    expect(nextUtcMidnight(NOON)).toBe(NEXT_MIDNIGHT);
  });

  it("moves to the following day when called exactly at midnight", () => {
    expect(nextUtcMidnight(NEXT_MIDNIGHT)).toBe(NEXT_MIDNIGHT + DAY);
  });

  it("never sits more than a day away, so nothing outlives the 24-hour promise", () => {
    for (const offset of [0, 1, 3_600_000, DAY - 1]) {
      const at = NEXT_MIDNIGHT + offset;
      expect(nextUtcMidnight(at) - at).toBeGreaterThan(0);
      expect(nextUtcMidnight(at) - at).toBeLessThanOrEqual(DAY);
    }
  });
});

/* ------------------------------------------------------------------- the name */

describe("rateLimiterName", () => {
  it("is stable for the same address on the same day", async () => {
    const a = await rateLimiterName("203.0.113.7", { now: NOON });
    const b = await rateLimiterName("203.0.113.7", { now: NOON + 3_600_000 });
    expect(a).toBe(b);
  });

  it("differs between addresses on the same day", async () => {
    const a = await rateLimiterName("203.0.113.7", { now: NOON });
    const b = await rateLimiterName("198.51.100.4", { now: NOON });
    expect(a).not.toBe(b);
  });

  it("changes at the UTC rollover, giving each day a fresh instance", async () => {
    const before = await rateLimiterName("203.0.113.7", {
      now: Date.parse("2026-09-18T23:59:59.999Z"),
    });
    const after = await rateLimiterName("203.0.113.7", { now: NEXT_MIDNIGHT });

    expect(before).not.toBe(after);
    expect(before.startsWith("2026-09-18:")).toBe(true);
    expect(after.startsWith("2026-09-19:")).toBe(true);
  });

  it("is a readable day plus an opaque digest, and never the address", async () => {
    const name = await rateLimiterName("203.0.113.7", { now: NOON, salt: "a-secret" });
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}:[0-9a-f]{32}$/);
    expect(name).not.toContain("203.0.113.7");
  });

  it("defaults to the current time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOON);
    try {
      expect(await rateLimiterName("203.0.113.7")).toBe(
        await rateLimiterName("203.0.113.7", { now: NOON }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

/* --------------------------------------------------------------- the counting */

describe("RateLimiter.hit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOON);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates the table on construction", () => {
    const { state } = createLimiter();
    expect(state.hasTable).toBe(true);
  });

  it("allows the first request and reports one used", async () => {
    const { limiter } = createLimiter();
    const result = await limiter.hit(3);

    expect(result).toEqual({
      allowed: true,
      used: 1,
      limit: 3,
      remaining: 2,
      resetAt: NEXT_MIDNIGHT,
    });
  });

  it("allows every request up to the limit", async () => {
    const { limiter } = createLimiter();

    for (let n = 1; n <= 3; n++) {
      const result = await limiter.hit(3);
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(n);
      expect(result.remaining).toBe(3 - n);
    }
  });

  it("blocks the request after the limit", async () => {
    const { limiter } = createLimiter();
    for (let n = 0; n < 3; n++) await limiter.hit(3);

    const blocked = await limiter.hit(3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.used).toBe(4);
    expect(blocked.remaining).toBe(0);
  });

  it("keeps counting past the limit, so abuse stays visible", async () => {
    const { limiter } = createLimiter();
    let last = await limiter.hit(2);
    for (let n = 0; n < 5; n++) last = await limiter.hit(2);

    expect(last.used).toBe(6);
    expect(last.allowed).toBe(false);
    expect(last.remaining).toBe(0);
  });

  it("applies the generous default cap when called with no argument", async () => {
    const { limiter } = createLimiter();

    expect(DAILY_LIMIT).toBe(25);

    let result = await limiter.hit();
    for (let n = 1; n < DAILY_LIMIT; n++) result = await limiter.hit();

    expect(result.limit).toBe(DAILY_LIMIT);
    expect(result.used).toBe(DAILY_LIMIT);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);

    expect((await limiter.hit()).allowed).toBe(false);
  });

  it("falls back to the default cap rather than blocking everyone on a bad limit", async () => {
    const { limiter } = createLimiter();

    expect((await limiter.hit(0)).limit).toBe(DAILY_LIMIT);
    expect((await limiter.hit(-5)).limit).toBe(DAILY_LIMIT);
    expect((await limiter.hit(Number.NaN)).limit).toBe(DAILY_LIMIT);
  });

  it("counts every hit in a single statement", async () => {
    const { limiter, exec } = createLimiter();
    await limiter.hit(3);

    const upserts = exec.mock.calls.filter(([sql]) => UPSERT.test(sql.replace(/\s+/g, " ").trim()));
    expect(upserts).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ the alarm */

describe("RateLimiter expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOON);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("arms the alarm for the coming UTC midnight on the first hit", async () => {
    const { limiter, storage, state } = createLimiter();
    await limiter.hit(3);

    expect(storage.setAlarm).toHaveBeenCalledTimes(1);
    expect(storage.setAlarm).toHaveBeenCalledWith(NEXT_MIDNIGHT);
    expect(state.alarm).toBe(NEXT_MIDNIGHT);
  });

  it("leaves an alarm that is already set alone", async () => {
    const { limiter, storage } = createLimiter();
    await limiter.hit(3);
    await limiter.hit(3);
    await limiter.hit(3);

    expect(storage.setAlarm).toHaveBeenCalledTimes(1);
    expect(storage.getAlarm).toHaveBeenCalledTimes(3);
  });

  it("reports the same reset time on every hit of the day", async () => {
    const { limiter } = createLimiter();
    const first = await limiter.hit(3);

    vi.setSystemTime(Date.parse("2026-09-18T23:00:00.000Z"));
    const later = await limiter.hit(3);

    expect(later.resetAt).toBe(first.resetAt);
    expect(later.resetAt).toBe(NEXT_MIDNIGHT);
  });

  it("never schedules more than 24 hours out", async () => {
    const { limiter } = createLimiter();
    vi.setSystemTime(NOON + 1);

    const result = await limiter.hit(3);
    expect(result.resetAt - (NOON + 1)).toBeLessThanOrEqual(DAY);
    expect(result.resetAt).toBeGreaterThan(NOON + 1);
  });

  it("deletes everything when the alarm fires", async () => {
    const { limiter, storage, state } = createLimiter();
    await limiter.hit(3);
    await limiter.alarm();

    expect(storage.deleteAll).toHaveBeenCalledTimes(1);
    expect(state.used).toBeNull();
    expect(state.alarm).toBeNull();
  });

  it("starts from zero if the instance is reused after the alarm", async () => {
    const { limiter, state } = createLimiter();
    await limiter.hit(3);
    await limiter.hit(3);
    await limiter.alarm();

    // The instance can still be resident, so hit() must recreate the dropped table.
    const afterReset = await limiter.hit(3);
    expect(afterReset.used).toBe(1);
    expect(afterReset.allowed).toBe(true);
    expect(state.hasTable).toBe(true);
  });

  it("re-arms the alarm after a reset", async () => {
    const { limiter, storage } = createLimiter();
    await limiter.hit(3);
    await limiter.alarm();

    vi.setSystemTime(NEXT_MIDNIGHT + 1000);
    await limiter.hit(3);

    expect(storage.setAlarm).toHaveBeenCalledTimes(2);
    expect(storage.setAlarm).toHaveBeenLastCalledWith(NEXT_MIDNIGHT + DAY);
  });
});
