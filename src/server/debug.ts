/**
 * Server-side debug logging. Always on, unlike `src/lib/debug.ts` — a Worker's console
 * only reaches `wrangler tail`/Cloudflare's Observability, never a Visitor's browser, so
 * there is no reason to gate it behind an opt-in flag the way client logging is.
 *
 * Same rule as the client logger: never log a photo or raw bytes. An Observation is fine
 * to log in full — it is already neutral structured facts, never pixels (see ADR-0001).
 */

export interface DebugLogger {
  readonly log: (event: string, data?: Record<string, unknown>) => void;
  readonly time: <T>(event: string, fn: () => Promise<T>) => Promise<T>;
}

export function debug(scope: string): DebugLogger {
  const prefix = `[theface:${scope}]`;

  function log(event: string, data?: Record<string, unknown>): void {
    if (data) console.log(prefix, event, data);
    else console.log(prefix, event);
  }

  async function time<T>(event: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    log(`${event}: start`);
    try {
      const result = await fn();
      log(`${event}: done`, { ms: Date.now() - start });
      return result;
    } catch (error) {
      log(`${event}: failed`, {
        ms: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  return { log, time };
}
