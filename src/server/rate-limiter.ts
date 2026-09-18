/**
 * The daily cap - layer 3 of the abuse control described in `SPEC.md`.
 *
 * Turnstile stops bots and the Workers rate-limit binding absorbs bursts. Neither can
 * express "25 a day". The rate-limit binding's period must be exactly 10 or 60 seconds, it
 * counts per datacenter, and its own documentation states that it is "intentionally designed
 * to not be used as an accurate accounting system". WAF rate limiting is not on the free plan
 * and caps at one minute below Business.
 *
 * A Durable Object is the remaining primitive that can hold a real daily number: it is
 * strongly consistent, it runs on the free plan, and one instance per `hash(IP) + UTC date`
 * keeps every counter independent, so there is no global singleton to serialise behind.
 *
 * The caller derives the instance name with `rateLimiterName()` and reaches the instance with
 * `env.RATE_LIMIT.getByName(name)`. This class only counts.
 */

import { DurableObject } from "cloudflare:workers";

/**
 * Twenty-five scorings per address per UTC day.
 *
 * Deliberately generous. Cloudflare advises against keying a limit on IP at all, because
 * mobile carriers place many subscribers behind one address - a whole phone network, campus
 * or café can arrive as a single `CF-Connecting-IP`. A cap of 3 would stop abuse and would
 * also lock out every second person on a shared network, a failure nobody reports because
 * they simply leave. 25 sits far above what one curious Visitor does in a day, and far below
 * the volume at which scripted abuse is worth anyone's time. It is the cap that stops abuse
 * without blocking a shared network.
 *
 * SPEC.md calls for 20–30. Recalibrate against real traffic, not against intuition.
 */
export const DAILY_LIMIT = 25;

/** What one `hit()` reports back to the Worker. */
export interface RateLimitResult {
  /** False once the cap is exceeded. The Worker should answer 429 and spend nothing. */
  allowed: boolean;
  /** Scorings counted against this address today, including the current one. */
  used: number;
  /** The cap that was applied. */
  limit: number;
  /** `limit - used`, floored at zero. Safe to show a Visitor. */
  remaining: number;
  /** Next UTC midnight as epoch milliseconds - when the counter is deleted. */
  resetAt: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * The UTC calendar day as `YYYY-MM-DD`.
 *
 * UTC, never local time: the instance name must be the same string for every datacenter that
 * handles a request from the same address, and datacenters do not share a timezone.
 */
export function utcDayKey(now: number | Date = Date.now()): string {
  const at = typeof now === "number" ? new Date(now) : now;
  return at.toISOString().slice(0, 10);
}

/**
 * The next UTC midnight after `now`, as epoch milliseconds.
 *
 * Exactly midnight, with no grace period. `PRIVACY.md` promises the scrambled address is
 * "deleted automatically within 24 hours", and any padding past midnight would let an
 * instance created just after midnight outlive that promise.
 */
export function nextUtcMidnight(now: number | Date = Date.now()): number {
  const at = typeof now === "number" ? now : now.getTime();
  return Math.floor(at / MS_PER_DAY) * MS_PER_DAY + MS_PER_DAY;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * A non-reversible digest of an address, rotated daily.
 *
 * The UTC day is part of the hashed input, so the same address produces a different digest
 * tomorrow. That is deliberate: it means nothing in the system can link one day's counter to
 * the next, which is what `PRIVACY.md` describes as scrambling the address into an unreadable
 * value. The raw address is never returned, never stored and never leaves this function.
 *
 * Pass `salt` a secret from the environment where one exists. SHA-256 alone is not enough to
 * make an address unrecoverable - IPv4 is only 2^32 values, so an attacker holding the digest
 * could enumerate the whole space. Only a secret salt closes that, and the daily rotation
 * means even a leaked salt exposes one day.
 *
 * 128 bits of the digest is kept. That is far past any collision concern for this use, and a
 * collision would only mean two addresses sharing one generous daily counter.
 */
export async function hashIp(ip: string, dayKey: string, salt = ""): Promise<string> {
  const input = `theface:rate-limit:v1:${dayKey}:${salt}:${ip.trim().toLowerCase()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest).slice(0, 32);
}

/**
 * The Durable Object instance name for one address on one UTC day.
 *
 * ```ts
 * const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
 * const stub = env.RATE_LIMIT.getByName(await rateLimiterName(ip, { salt: env.RATE_LIMIT_SALT }));
 * const quota = await stub.hit(DAILY_LIMIT);
 * ```
 *
 * The day is also kept in clear at the front of the name, so an instance can be recognised
 * and reasoned about without being traced back to anybody.
 */
export async function rateLimiterName(
  ip: string,
  options: { now?: number | Date; salt?: string } = {},
): Promise<string> {
  const dayKey = utcDayKey(options.now ?? Date.now());
  return `${dayKey}:${await hashIp(ip, dayKey, options.salt)}`;
}

/**
 * One counter, one address, one UTC day.
 *
 * Storage is the SQLite backend (`ctx.storage.sql`), declared in `wrangler.jsonc` as
 * `"exports": { "RateLimiter": { "type": "durable-object", "storage": "sqlite" } }`.
 */
export class RateLimiter extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.#ensureSchema();
  }

  /**
   * One row, holding one integer. `sql.exec` is synchronous, so this is safe in a constructor
   * and cheap enough to repeat before a write - `alarm()` drops the database, and an instance
   * that is still resident afterwards would otherwise write to a table that no longer exists.
   */
  #ensureSchema(): void {
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS quota (id INTEGER PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0)`,
    );
  }

  /**
   * Count one scoring against this address and report whether it is allowed.
   *
   * Every call increments, including calls that are already over the cap. A blocked caller
   * therefore keeps climbing, which makes the size of an abuse attempt visible instead of
   * pinning it at the limit. The upsert and its `RETURNING` are a single statement, so the
   * read and the write cannot be interleaved.
   */
  async hit(limit: number = DAILY_LIMIT): Promise<RateLimitResult> {
    this.#ensureSchema();

    const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DAILY_LIMIT;

    const { used } = this.ctx.storage.sql
      .exec<{ used: number }>(
        `INSERT INTO quota (id, used) VALUES (1, 1)
         ON CONFLICT(id) DO UPDATE SET used = used + 1
         RETURNING used`,
      )
      .one();

    const resetAt = await this.#scheduleReset();

    return {
      allowed: used <= cap,
      used,
      limit: cap,
      remaining: Math.max(0, cap - used),
      resetAt,
    };
  }

  /**
   * Arm the expiry on the first hit of the day. Later hits find the alarm already set and
   * leave it alone, because every hit on this instance computes the same midnight.
   */
  async #scheduleReset(): Promise<number> {
    const existing = await this.ctx.storage.getAlarm();
    if (existing !== null) return existing;

    const resetAt = nextUtcMidnight();
    await this.ctx.storage.setAlarm(resetAt);
    return resetAt;
  }

  /**
   * Midnight. Delete everything.
   *
   * Without this, every address that ever visited would leave an instance holding a stale
   * counter forever. `deleteAll()` drops the whole private SQLite database atomically, which
   * leaves nothing behind to evict - and under this Worker's compatibility date (2026-09-18,
   * past the 2026-02-24 change) it clears the alarm too, so no `deleteAlarm()` is needed.
   */
  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
