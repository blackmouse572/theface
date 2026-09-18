import type { EntryType, Question } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";

import {
  AESTHETIC_KEYS,
  AESTHETICS,
  aestheticQuestions,
  CRAFT_KEYS,
  FEATURE_KEYS,
  featureQuestions,
  IMPRESSION_KEYS,
  impressionQuestions,
  jevQuestions,
  VERDICT_KEYS,
  VERDICT_THRESHOLDS,
  verdictQuestions,
} from "./questions";

/**
 * Words that may never reach Jev in an Aesthetic question.
 *
 * ADR-0003: TheFace rates Aesthetics and never classifies a person. An Aesthetic describes
 * an ideal, so its description is a list of traits. The moment one of these words appears,
 * the question has stopped describing a standard of beauty and started describing a people.
 *
 * This is not a style rule. It is the guard on the decision that removes the project's
 * largest reputational risk.
 */
const FORBIDDEN_IN_CRITERIA =
  /\b(region|regions|regional|ethnicity|ethnicities|ethnic|nationality|nationalities|national|race|races|racial)\b/i;

function textIn(entry: EntryType | undefined): readonly string[] {
  if (entry === null || entry === undefined) return [];
  if (typeof entry === "string") return [entry];
  return [JSON.stringify(entry)];
}

/** Every string a question sends to Jev: its instructions and all of its criteria. */
function textSentToJev(question: Question): readonly string[] {
  const parts: string[] = [...textIn(question.instructions)];
  if (question.type === "noul") {
    parts.push(...textIn(question.criteria?.true), ...textIn(question.criteria?.false));
  } else if (question.type === "score") {
    for (const level of question.criteria) parts.push(...textIn(level));
  } else {
    for (const description of Object.values(question.criteria)) parts.push(...textIn(description));
  }
  return parts;
}

const everyQuestion = Object.entries(jevQuestions) as ReadonlyArray<[string, Question]>;
const everyAestheticQuestion = Object.entries(aestheticQuestions) as ReadonlyArray<
  [keyof typeof AESTHETICS, Question]
>;

describe("the question set", () => {
  it("asks 3 Verdict questions, 19 Dimensions and 8 Aesthetics in one call", () => {
    expect(Object.keys(verdictQuestions)).toHaveLength(3);
    expect(Object.keys(featureQuestions)).toHaveLength(14);
    expect(Object.keys(impressionQuestions)).toHaveLength(5);
    expect(Object.keys(aestheticQuestions)).toHaveLength(8);
    expect(everyQuestion).toHaveLength(3 + 14 + 5 + 8);
  });

  it("names every question exactly once", () => {
    const names = everyQuestion.map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("matches the exported key lists", () => {
    expect(Object.keys(verdictQuestions)).toEqual([...VERDICT_KEYS]);
    expect(Object.keys(featureQuestions).sort()).toEqual([...FEATURE_KEYS].sort());
    expect(Object.keys(impressionQuestions).sort()).toEqual([...IMPRESSION_KEYS].sort());
    expect(Object.keys(aestheticQuestions)).toEqual([...AESTHETIC_KEYS]);
  });

  it("asks every Dimension and Verdict question as a Noul, never a Score (ADR-0002)", () => {
    for (const [name, question] of [
      ...Object.entries(verdictQuestions),
      ...Object.entries(featureQuestions),
      ...Object.entries(impressionQuestions),
    ]) {
      expect(question.type, `${name} must be a Noul`).toBe("noul");
    }
  });

  it("phrases every Noul as a proposition with both outcomes described", () => {
    for (const [name, question] of everyQuestion) {
      if (question.type !== "noul") continue;
      expect(typeof question.instructions, `${name} needs instructions`).toBe("string");
      expect(String(question.instructions).trim(), `${name} needs a question`).toMatch(/\?$/);
      expect(question.criteria?.true, `${name} needs a yes description`).toBeTruthy();
      expect(question.criteria?.false, `${name} needs a no description`).toBeTruthy();
    }
  });

  it("judges from the Observation and from nothing else (ADR-0001)", () => {
    for (const [name, question] of everyQuestion) {
      expect(String(question.instructions), `${name} must name the Observation`).toContain(
        "Observation",
      );
    }
  });

  it("asks no Craft question yet, but names the Craft Dimensions", () => {
    expect(CRAFT_KEYS).toHaveLength(6);
    for (const key of CRAFT_KEYS) {
      expect(Object.keys(jevQuestions)).not.toContain(key);
    }
  });

  it("sets Verdict thresholds that fail closed", () => {
    expect(VERDICT_THRESHOLDS.minOneAdultFace).toBeGreaterThan(0.5);
    expect(VERDICT_THRESHOLDS.minRealPhotograph).toBeGreaterThan(0.5);
    // A high `apparentMinor` probability is a failure, so the ceiling must be low.
    expect(VERDICT_THRESHOLDS.maxApparentMinor).toBeLessThan(0.5);
  });
});

describe("the eight Aesthetics", () => {
  it("carries a tradition name and an origin as two separate fields", () => {
    expect(Object.keys(AESTHETICS)).toEqual([...AESTHETIC_KEYS]);
    for (const key of AESTHETIC_KEYS) {
      const aesthetic = AESTHETICS[key];
      expect(aesthetic.name.length, `${key} needs a tradition name`).toBeGreaterThan(0);
      expect(aesthetic.origin.length, `${key} needs an origin label`).toBeGreaterThan(0);
      expect(aesthetic.name, `${key} must not merge its two labels`).not.toBe(aesthetic.origin);
      expect(aesthetic.traits.length, `${key} needs traits`).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives each Aesthetic a distinct name and a distinct origin", () => {
    const names = AESTHETIC_KEYS.map((key) => AESTHETICS[key].name);
    const origins = AESTHETIC_KEYS.map((key) => AESTHETICS[key].origin);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(origins).size).toBe(origins.length);
  });

  it("asks each Aesthetic as a Score with an ordered rubric (ADR-0002)", () => {
    for (const [key, question] of everyAestheticQuestion) {
      expect(question.type, `${key} must be a Score`).toBe("score");
      if (question.type !== "score") continue;
      expect(question.criteria.length, `${key} needs at least two levels`).toBeGreaterThanOrEqual(
        2,
      );
      for (const level of question.criteria) {
        expect(typeof level, `${key} needs every level described`).toBe("string");
      }
    }
  });

  it("describes the Aesthetic's traits in what it sends to Jev", () => {
    for (const [key, question] of everyAestheticQuestion) {
      const sent = textSentToJev(question).join("\n");
      for (const trait of AESTHETICS[key].traits) {
        expect(sent, `${key} must describe "${trait}"`).toContain(trait);
      }
    }
  });
});

/**
 * The ADR-0003 guards.
 *
 * Both are scoped to the CRITERIA TEXT - every string an Aesthetic question sends to Jev,
 * which is its instructions and its rubric levels. Neither reads `AESTHETICS[key].origin`
 * or `AESTHETICS[key].name`, because those are display labels for TheFace's own surfaces and
 * are deliberately never transmitted.
 */
describe("an Aesthetic describes traits, never a people (ADR-0003)", () => {
  it("uses none of region, ethnicity, nationality or race in its criteria", () => {
    for (const [key, question] of everyAestheticQuestion) {
      for (const text of textSentToJev(question)) {
        expect(
          FORBIDDEN_IN_CRITERIA.test(text),
          `${key} sends a forbidden word to Jev: "${text}"`,
        ).toBe(false);
      }
    }
  });

  it("never references its own origin label in its criteria", () => {
    for (const [key, question] of everyAestheticQuestion) {
      const origin = AESTHETICS[key].origin.toLowerCase();
      for (const text of textSentToJev(question)) {
        expect(
          text.toLowerCase().includes(origin),
          `${key} sends its origin label "${AESTHETICS[key].origin}" to Jev`,
        ).toBe(false);
      }
    }
  });

  it("sends no Aesthetic's name or origin anywhere in the whole question set", () => {
    const labels = AESTHETIC_KEYS.flatMap((key) => [AESTHETICS[key].name, AESTHETICS[key].origin]);
    for (const [name, question] of everyQuestion) {
      const sent = textSentToJev(question).join("\n").toLowerCase();
      for (const label of labels) {
        expect(sent.includes(label.toLowerCase()), `${name} sends the label "${label}"`).toBe(
          false,
        );
      }
    }
  });

  it("asks no question at all about where a person is from", () => {
    for (const [name, question] of everyQuestion) {
      for (const text of textSentToJev(question)) {
        expect(
          FORBIDDEN_IN_CRITERIA.test(text),
          `${name} sends a forbidden word to Jev: "${text}"`,
        ).toBe(false);
      }
    }
  });
});

// The Observation reports skin tone EVENNESS and texture, never colour, so a
// trait that names a colour asks Jev to score from a fact it was never given.
// Colour is also the phenotype triple that ADR-0003 exists to keep out.
describe("no Aesthetic trait names a colour", () => {
  const COLOUR_TERMS = [
    "olive",
    "bronze",
    "golden",
    "pale",
    "fair",
    "tanned",
    "blonde",
    "brunette",
    "cool-toned",
    "warm-toned",
    "grey",
    "gray",
    "hazel",
    "auburn",
    "ebony",
    "ivory",
    "swarthy",
    "porcelain",
  ];
  const COLOUR_PHRASES =
    /\b(dark|light|deep|black|blue|green|brown|red)\s+(hair|eyes|skin|complexion|lashes|brows)\b/i;

  for (const [key, aesthetic] of Object.entries(AESTHETICS)) {
    it(`${key} describes structure, styling or finish only`, () => {
      for (const trait of aesthetic.traits) {
        for (const term of COLOUR_TERMS) {
          expect(trait.toLowerCase()).not.toContain(term);
        }
        expect(trait).not.toMatch(COLOUR_PHRASES);
      }
    });

    it(`${key} still has enough traits to score against`, () => {
      expect(aesthetic.traits.length).toBeGreaterThanOrEqual(5);
    });
  }
});
