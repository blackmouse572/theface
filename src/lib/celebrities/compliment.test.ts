import { describe, expect, it } from "vitest";

import { MATCH_MARGIN, pickCompliment, VN_POOL_SHARE } from "./compliment";
import type { Celebrity } from "./schema";

function celeb(
  slug: string,
  name: string,
  audience: Celebrity["audience"],
  overall: number,
): Celebrity {
  return { slug, name, audience, overall, photo: null, credit: null };
}

const ROSTER: Celebrity[] = [
  celeb("alpha", "Alpha", "global", 50),
  celeb("bravo", "Bravo", "global", 55),
  celeb("charlie", "Charlie", "global", 60),
  celeb("delta", "Delta", "global", 65),
  celeb("echo", "Echo", "global", 70),
  celeb("lan", "Lan", "vn", 52),
  celeb("minh", "Minh", "vn", 58),
  celeb("ngoc", "Ngoc", "vn", 63),
  celeb("phuong", "Phuong", "vn", 68),
];
const GLOBAL_NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
const VN_NAMES = ["Lan", "Minh", "Ngoc", "Phuong"];

function containsNumber(value: unknown): boolean {
  if (typeof value === "number") return true;
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(containsNumber);
  }
  return false;
}

describe("pickCompliment", () => {
  it("puts a Visitor who beats the whole pool in the top tier, naming one of its top three", () => {
    const compliment = pickCompliment(70, "global", ROSTER);
    expect(compliment?.tier).toBe("top");
    expect(["Charlie", "Delta", "Echo"]).toContain(compliment?.celebrity.name);
  });

  it("counts a Celebrity as beaten within MATCH_MARGIN", () => {
    expect(pickCompliment(70 - MATCH_MARGIN, "global", ROSTER)?.tier).toBe("top");
    expect(pickCompliment(70 - MATCH_MARGIN - 0.01, "global", ROSTER)?.tier).toBe("above");
  });

  it("names one of the three highest Celebrities the Visitor beats", () => {
    // 57 + MATCH_MARGIN beats 50, 55 and 60, and not 65.
    const compliment = pickCompliment(57, "global", ROSTER);
    expect(compliment?.tier).toBe("above");
    expect(["Alpha", "Bravo", "Charlie"]).toContain(compliment?.celebrity.name);
  });

  it("never says worse: below the whole pool is the same league as its lowest three", () => {
    const compliment = pickCompliment(20, "global", ROSTER);
    expect(compliment?.tier).toBe("league");
    expect(["Alpha", "Bravo", "Charlie"]).toContain(compliment?.celebrity.name);
  });

  it("treats an unreadable Overall as the league tier instead of throwing", () => {
    expect(pickCompliment(Number.NaN, "global", ROSTER)?.tier).toBe("league");
  });

  it("never shows a Vietnamese Celebrity to the global Audience", () => {
    for (let overall = 0; overall <= 100; overall += 0.5) {
      const compliment = pickCompliment(overall, "global", ROSTER);
      expect(GLOBAL_NAMES).toContain(compliment?.celebrity.name);
      expect(compliment?.lang).toBe("en");
    }
  });

  it("speaks Vietnamese to the vn Audience and mostly names Vietnamese Celebrities", () => {
    let vietnamese = 0;
    let total = 0;
    for (let step = 0; step <= 1000; step += 1) {
      const compliment = pickCompliment(step / 10, "vn", ROSTER);
      expect(compliment?.lang).toBe("vi");
      total += 1;
      if (VN_NAMES.includes(compliment?.celebrity.name ?? "")) vietnamese += 1;
    }
    expect(VN_POOL_SHARE).toBe(0.7);
    expect(vietnamese / total).toBeGreaterThan(0.6);
    expect(vietnamese / total).toBeLessThan(0.8);
  });

  it("gives the same Compliment for the same Overall and Audience", () => {
    expect(pickCompliment(61.237, "vn", ROSTER)).toEqual(pickCompliment(61.237, "vn", ROSTER));
  });

  it("fills the name into the line", () => {
    const compliment = pickCompliment(57, "global", ROSTER);
    expect(compliment?.line).toContain(compliment?.celebrity.name);
    expect(compliment?.line).not.toContain("{name}");
  });

  it("carries no number of any kind, so no Celebrity's Overall can reach a browser", () => {
    for (const overall of [0, 40, 57, 67, 100]) {
      const compliment = pickCompliment(overall, "vn", ROSTER);
      expect(containsNumber(compliment)).toBe(false);
      expect(Object.keys(compliment ?? {}).sort()).toEqual(["celebrity", "lang", "line", "tier"]);
      expect(Object.keys(compliment?.celebrity ?? {}).sort()).toEqual(["credit", "name", "photo"]);
    }
  });

  it("returns null when the chosen pool is empty", () => {
    const vietnameseOnly = ROSTER.filter((celebrity) => celebrity.audience === "vn");
    expect(pickCompliment(60, "global", vietnameseOnly)).toBeNull();
  });
});
