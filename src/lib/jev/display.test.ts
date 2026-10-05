import { describe, expect, it } from "vitest";

import { DISPLAY_EXPONENT, displayOverall, displayRating } from "./display";

describe("displayRating", () => {
  it("keeps both ends of the scale fixed", () => {
    expect(displayRating(0)).toBe(0);
    expect(displayRating(100)).toBe(100);
  });

  it("lifts the middle of the scale, where real Overalls cluster", () => {
    expect(Math.round(displayRating(30))).toBe(62);
    expect(Math.round(displayRating(50))).toBe(76);
    expect(Math.round(displayRating(60))).toBe(82);
    expect(Math.round(displayRating(75))).toBe(89);
  });

  it("never changes an order, so Boards and Percentiles are untouched", () => {
    for (let raw = 0; raw < 100; raw += 0.25) {
      expect(displayRating(raw + 0.25)).toBeGreaterThan(displayRating(raw));
    }
  });

  it("clamps what it cannot show", () => {
    expect(displayRating(-5)).toBe(0);
    expect(displayRating(140)).toBe(100);
    expect(displayRating(Number.NaN)).toBe(0);
  });

  it("uses the agreed exponent", () => {
    expect(DISPLAY_EXPONENT).toBe(0.4);
  });
});

describe("displayOverall", () => {
  it("shows the number the Board will show, which curves the stored integer", () => {
    // A Claim stores Math.round(raw), so the results page must curve that same integer.
    expect(displayOverall(59.6)).toBe(82);
    for (let step = 0; step <= 2000; step += 1) {
      const raw = step / 20;
      expect(displayOverall(raw)).toBe(displayOverall(Math.round(raw)));
    }
  });

  it("is a whole number", () => {
    expect(Number.isInteger(displayOverall(73.37))).toBe(true);
  });
});
