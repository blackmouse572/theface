import { describe, expect, it } from "vitest";

import { COMPLIMENT_LANGS, COMPLIMENT_TIERS, LINES, NAME_SLOT } from "./lines";

const ALL = COMPLIMENT_LANGS.flatMap((lang) =>
  COMPLIMENT_TIERS.flatMap((tier) => LINES[lang][tier].map((line) => ({ lang, tier, line }))),
);

describe("LINES", () => {
  it("has four to six lines for every tier in every language", () => {
    for (const lang of COMPLIMENT_LANGS) {
      for (const tier of COMPLIMENT_TIERS) {
        expect(LINES[lang][tier].length).toBeGreaterThanOrEqual(4);
        expect(LINES[lang][tier].length).toBeLessThanOrEqual(6);
      }
    }
  });

  it.each(ALL)("$lang/$tier names exactly one Celebrity: $line", ({ line }) => {
    expect(line.split(NAME_SLOT)).toHaveLength(2);
  });

  it.each(ALL)("$lang/$tier never ranks the Visitor below anyone: $line", ({ line }) => {
    expect(line).not.toMatch(/\b(worse|uglier|less|lower|below|behind)\b/i);
    expect(line).not.toMatch(/kém|xấu|thua/i);
  });

  it.each(ALL)("$lang/$tier never quotes a score: $line", ({ line }) => {
    expect(line).not.toMatch(/\d{2,}/);
  });

  it.each(ALL)("$lang/$tier never claims a resemblance: $line", ({ line }) => {
    expect(line).not.toMatch(/looks? like|resembl|giống/i);
  });
});
