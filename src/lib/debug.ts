/**
 * Opt-in debug logging. Off by default; enable with
 * `localStorage.setItem("theface:debug", "1")` or `?debug=1`.
 *
 * Never pass image bytes, data URLs, or raw detector output — metadata and timings only.
 */

const STORAGE_KEY = "theface:debug";

let cachedEnabled: boolean | null = null;

function isEnabled(): boolean {
  if (cachedEnabled !== null) return cachedEnabled;
  if (typeof window === "undefined") return (cachedEnabled = false);

  try {
    if (new URLSearchParams(window.location.search).get("debug") === "1") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
    cachedEnabled = window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    cachedEnabled = false;
  }
  // A visible confirmation the moment logging turns on, in case a Visitor's console
  // level filter is hiding something later and they're checking whether this ran at all.
  if (cachedEnabled) console.log("[theface] Debug enabled");
  return cachedEnabled;
}

export interface DebugLogger {
  readonly log: (event: string, data?: Record<string, unknown>) => void;
  readonly time: <T>(event: string, fn: () => Promise<T>) => Promise<T>;
}

const noop: DebugLogger = { log: () => {}, time: (_event, fn) => fn() };

export function debug(scope: string): DebugLogger {
  if (!isEnabled()) return noop;

  const prefix = `[theface:${scope}]`;

  function log(event: string, data?: Record<string, unknown>): void {
    const at = new Date().toISOString().slice(11, 23);
    // console.log, not console.debug: Chromium (Chrome, Edge) files "debug" under the
    // console's "Verbose" level, hidden by default unless a Visitor enables that filter.
    if (data) console.log(`${prefix} ${at} ${event}`, data);
    else console.log(`${prefix} ${at} ${event}`);
  }

  async function time<T>(event: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    log(`${event}: start`);
    try {
      const result = await fn();
      log(`${event}: done`, { ms: Math.round(performance.now() - start) });
      return result;
    } catch (error) {
      log(`${event}: failed`, {
        ms: Math.round(performance.now() - start),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  return { log, time };
}
