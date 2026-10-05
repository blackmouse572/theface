import { describe, expect, it } from "vitest";

import { DISPLAY_EXPONENT, displayRating } from "./display";

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
