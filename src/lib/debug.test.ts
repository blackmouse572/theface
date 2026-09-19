import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { debug } from "./debug";

/**
 * A minimal in-memory `Storage`, since this suite runs under Vitest's `node`
 * environment (no DOM) — the rest of this project's client-side tests take the same
 * approach rather than pull in `jsdom` for one file.
 */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

/** Stubs a minimal `window` with the two surfaces `debug()` reads. */
function stubWindow(options: { search?: string; storage?: Storage } = {}) {
  const storage = options.storage ?? fakeStorage();
  vi.stubGlobal("window", {
    localStorage: storage,
    location: { search: options.search ?? "" },
  });
  return storage;
}

// `debug()` caches whether logging is enabled after its first read, so every test that
// changes the environment gets a fresh module instance rather than fighting that cache.
async function freshDebug() {
  vi.resetModules();
  return (await import("./debug")).debug;
}

describe("debug", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    debugSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("logs nothing with no window (server-side)", () => {
    debug("test").log("event");
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("logs nothing by default, with a window but no flag set", async () => {
    stubWindow();
    const fresh = await freshDebug();
    fresh("test").log("event");
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("logs once enabled via localStorage", async () => {
    const storage = stubWindow();
    storage.setItem("theface:debug", "1");
    const fresh = await freshDebug();

    fresh("test").log("event", { a: 1 });

    expect(debugSpy).toHaveBeenCalledTimes(2);
    expect(debugSpy.mock.calls[0]?.[0]).toBe("[theface] Debug enabled");
    expect(debugSpy.mock.calls[1]?.[0]).toContain("[theface:test]");
    expect(debugSpy.mock.calls[1]?.[0]).toContain("event");
    expect(debugSpy.mock.calls[1]?.[1]).toEqual({ a: 1 });
  });

  it('stays off for any value other than the exact string "1"', async () => {
    const storage = stubWindow();
    storage.setItem("theface:debug", "true");
    const fresh = await freshDebug();

    fresh("test").log("event");

    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("never throws when localStorage access throws", async () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("blocked");
      },
      location: { search: "" },
    });
    const fresh = await freshDebug();

    expect(() => fresh("test").log("event")).not.toThrow();
  });

  describe("?debug=1 in the URL", () => {
    it("turns logging on and persists it to localStorage", async () => {
      const storage = stubWindow({ search: "?debug=1" });
      const fresh = await freshDebug();

      fresh("test").log("event");

      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy.mock.calls[0]?.[0]).toBe("[theface] Debug enabled");
      expect(storage.getItem("theface:debug")).toBe("1");
    });
  });

  describe("time", () => {
    it("is a plain pass-through when disabled — no timer, no log", async () => {
      stubWindow();
      const fresh = await freshDebug();

      const result = await fresh("test").time("step", async () => 42);

      expect(result).toBe(42);
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it("logs a start and a done event with an elapsed duration when enabled", async () => {
      const storage = stubWindow();
      storage.setItem("theface:debug", "1");
      const fresh = await freshDebug();

      const result = await fresh("test").time("step", async () => "ok");

      expect(result).toBe("ok");
      expect(debugSpy).toHaveBeenCalledTimes(3);
      expect(debugSpy.mock.calls[0]?.[0]).toBe("[theface] Debug enabled");
      expect(debugSpy.mock.calls[1]?.[0]).toContain("step: start");
      expect(debugSpy.mock.calls[2]?.[0]).toContain("step: done");
      const payload = debugSpy.mock.calls[2]?.[1] as { ms: number };
      expect(payload.ms).toBeGreaterThanOrEqual(0);
    });

    it("logs a failed event and re-throws, rather than swallowing the error", async () => {
      const storage = stubWindow();
      storage.setItem("theface:debug", "1");
      const fresh = await freshDebug();
      const boom = new Error("boom");

      await expect(
        fresh("test").time("step", async () => {
          throw boom;
        }),
      ).rejects.toBe(boom);

      expect(debugSpy.mock.calls[2]?.[0]).toContain("step: failed");
      expect(debugSpy.mock.calls[2]?.[1]).toMatchObject({ error: "boom" });
    });
  });
});
