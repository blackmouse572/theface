import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { debug } from "./debug";

describe("server debug", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("logs unconditionally — no opt-in flag, unlike the client logger", () => {
    debug("test").log("event");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("prefixes with the scope", () => {
    debug("score").log("event");
    expect(logSpy.mock.calls[0]?.[0]).toBe("[theface:score]");
  });

  describe("time", () => {
    it("logs start and done with an elapsed duration", async () => {
      const result = await debug("test").time("step", async () => "ok");

      expect(result).toBe("ok");
      expect(logSpy).toHaveBeenCalledTimes(2);
      expect(logSpy.mock.calls[0]?.[1]).toBe("step: start");
      expect(logSpy.mock.calls[1]?.[1]).toBe("step: done");
      const payload = logSpy.mock.calls[1]?.[2] as { ms: number };
      expect(payload.ms).toBeGreaterThanOrEqual(0);
    });

    it("logs a failed event and re-throws, rather than swallowing the error", async () => {
      const boom = new Error("boom");

      await expect(
        debug("test").time("step", async () => {
          throw boom;
        }),
      ).rejects.toBe(boom);

      expect(logSpy.mock.calls[1]?.[1]).toBe("step: failed");
      expect(logSpy.mock.calls[1]?.[2]).toMatchObject({ error: "boom" });
    });
  });
});
