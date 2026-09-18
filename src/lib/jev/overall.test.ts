import type { NoulResponse } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";

import {
  AFFINITY_MAX_INDEX,
  CRAFT_WEIGHTS,
  FEATURE_WEIGHTS,
  FEATURE_WEIGHT_TOTAL,
  IMPRESSION_WEIGHTS,
  IMPRESSION_WEIGHT_TOTAL,
  OVERALL_WEIGHTS,
  OVERALL_WEIGHT_TOTAL,
  affinitiesFromAnswers,
  affinityFromScore,
  computeOverall,
  overallFromAnswers,
  ratingFromNoul,
  ratingsFromAnswers,
} from "./overall";
import { AESTHETIC_KEYS } from "./questions";
import { CRAFT_KEYS, FEATURE_KEYS, IMPRESSION_KEYS } from "./questions";
import type { CraftKey, DimensionAnswers, Probability, RatedDimensionKey, Ratings } from "./types";

const RATED_KEYS: readonly RatedDimensionKey[] = [...FEATURE_KEYS, ...IMPRESSION_KEYS];

/** Every rated Dimension at one Rating. */
function everyRating(rating: number): Ratings {
  const ratings = {} as Record<RatedDimensionKey, number>;
  for (const key of RATED_KEYS) ratings[key] = rating;
  return ratings;
}

/** Features at one Rating, rated Impressions at another. */
function splitRatings(featureRating: number, impressionRating: number): Ratings {
  const ratings = {} as Record<RatedDimensionKey, number>;
  for (const key of FEATURE_KEYS) ratings[key] = featureRating;
  for (const key of IMPRESSION_KEYS) ratings[key] = impressionRating;
  return ratings;
}

/** A Jev answer sheet, as `systemOne` would return one for the Dimension Nouls. */
function answersFrom(probabilities: Record<RatedDimensionKey, Probability>): DimensionAnswers {
  const answers = {} as Record<RatedDimensionKey, NoulResponse>;
  for (const key of RATED_KEYS) answers[key] = { type: "noul", noul: probabilities[key] };
  return answers;
}

function everyCraftRating(rating: number): Record<CraftKey, number> {
  const ratings = {} as Record<CraftKey, number>;
  for (const key of CRAFT_KEYS) ratings[key] = rating;
  return ratings;
}

describe("the weight table", () => {
  it("sums to 100", () => {
    expect(OVERALL_WEIGHT_TOTAL).toBe(100);
  });

  it("gives Features 70 points and rated Impressions 30", () => {
    expect(FEATURE_WEIGHT_TOTAL).toBe(70);
    expect(IMPRESSION_WEIGHT_TOTAL).toBe(30);
    expect(FEATURE_WEIGHT_TOTAL + IMPRESSION_WEIGHT_TOTAL).toBe(100);
  });

  it("weights all 14 Features and all 5 rated Impressions", () => {
    expect(Object.keys(FEATURE_WEIGHTS).sort()).toEqual([...FEATURE_KEYS].sort());
    expect(Object.keys(IMPRESSION_WEIGHTS).sort()).toEqual([...IMPRESSION_KEYS].sort());
  });

  it("holds every Dimension and nothing else", () => {
    const every = [...FEATURE_KEYS, ...IMPRESSION_KEYS, ...CRAFT_KEYS];
    expect(Object.keys(OVERALL_WEIGHTS).sort()).toEqual([...every].sort());
  });

  it("gives no Dimension a negative weight", () => {
    for (const [key, weight] of Object.entries(OVERALL_WEIGHTS)) {
      expect(weight, `${key} carries a negative weight`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Craft (ADR-0007)", () => {
  it("weighs every Craft Dimension at zero", () => {
    expect(Object.keys(CRAFT_WEIGHTS).sort()).toEqual([...CRAFT_KEYS].sort());
    for (const key of CRAFT_KEYS) {
      expect(CRAFT_WEIGHTS[key], `${key} must carry no weight`).toBe(0);
    }
  });

  it("contributes nothing to the Overall", () => {
    const ratings = splitRatings(72, 41);

    const withoutCraft = computeOverall(ratings);
    const withPerfectCraft = computeOverall({ ...ratings, ...everyCraftRating(100) });
    const withRuinedCraft = computeOverall({ ...ratings, ...everyCraftRating(0) });

    expect(withPerfectCraft).toBe(withoutCraft);
    expect(withRuinedCraft).toBe(withoutCraft);
  });

  it("does not change the Overall even for a face rated at the extremes", () => {
    for (const rating of [0, 50, 100]) {
      const ratings = everyRating(rating);
      expect(computeOverall({ ...ratings, ...everyCraftRating(100) })).toBe(
        computeOverall(ratings),
      );
    }
  });
});

describe("ratingFromNoul", () => {
  it("reads a Noul probability as a Rating from 0 to 100", () => {
    expect(ratingFromNoul(0)).toBe(0);
    expect(ratingFromNoul(1)).toBe(100);
    expect(ratingFromNoul(0.73)).toBeCloseTo(73, 10);
  });

  it("clamps a probability outside 0 to 1", () => {
    expect(ratingFromNoul(-0.2)).toBe(0);
    expect(ratingFromNoul(1.4)).toBe(100);
  });
});

describe("computeOverall", () => {
  it("returns the Rating itself when every Dimension is rated the same", () => {
    expect(computeOverall(everyRating(50))).toBeCloseTo(50, 10);
    expect(computeOverall(everyRating(0))).toBe(0);
    expect(computeOverall(everyRating(100))).toBeCloseTo(100, 10);
  });

  it("splits 70/30 between Features and rated Impressions", () => {
    // 70 points at 80 + 30 points at 40 = 6800 / 100.
    expect(computeOverall(splitRatings(80, 40))).toBeCloseTo(68, 10);
  });

  it("moves the Overall by one Dimension's weight only", () => {
    const floor = everyRating(0);
    expect(computeOverall({ ...floor, eyes: 100 })).toBeCloseTo(8, 10);
    expect(computeOverall({ ...floor, ears: 100 })).toBeCloseTo(1, 10);
    expect(computeOverall({ ...floor, confidence: 100 })).toBeCloseTo(8, 10);
  });

  it("stays on 0 to 100", () => {
    expect(computeOverall(everyRating(-40))).toBe(0);
    expect(computeOverall(everyRating(140))).toBe(100);
  });
});

describe("a known set of Noul probabilities", () => {
  // Hand-computed: each probability times 100 times its weight, summed, divided by 100.
  //
  //   Features     648 + 496 + 592 + 476 + 330 + 245 + 290 + 330 + 355
  //                + 160 + 156 + 180 + 100 + 45                        = 4403
  //   Impressions  616 + 504 + 504 + 290 + 207                         = 2121
  //   Overall      (4403 + 2121) / 100                                 = 65.24
  const probabilities: Record<RatedDimensionKey, Probability> = {
    eyes: 0.81,
    symmetry: 0.62,
    skin: 0.74,
    proportions: 0.68,
    jawline: 0.55,
    cheekbones: 0.49,
    nose: 0.58,
    lips: 0.66,
    hairAndHairline: 0.71,
    teeth: 0.4,
    eyebrows: 0.52,
    chin: 0.6,
    forehead: 0.5,
    ears: 0.45,
    confidence: 0.77,
    styleAndGrooming: 0.63,
    approachability: 0.84,
    mainCharacterEnergy: 0.58,
    trustworthiness: 0.69,
  };

  it("produces the expected Overall", () => {
    expect(overallFromAnswers(answersFrom(probabilities))).toBeCloseTo(65.24, 8);
  });

  it("produces the same Overall through Ratings as through answers", () => {
    const answers = answersFrom(probabilities);
    expect(computeOverall(ratingsFromAnswers(answers))).toBe(overallFromAnswers(answers));
  });

  it("reads each Noul probability as a Rating of that probability times 100", () => {
    const ratings = ratingsFromAnswers(answersFrom(probabilities));
    expect(Object.keys(ratings).sort()).toEqual([...RATED_KEYS].sort());
    expect(ratings.eyes).toBeCloseTo(81, 10);
    expect(ratings.trustworthiness).toBeCloseTo(69, 10);
  });

  it("is unmoved by Craft Ratings alongside it", () => {
    const ratings = ratingsFromAnswers(answersFrom(probabilities));
    expect(computeOverall({ ...ratings, ...everyCraftRating(93) })).toBeCloseTo(65.24, 8);
  });
});

describe("affinityFromScore", () => {
  it("maps the rubric's index range onto 0..100", () => {
    expect(affinityFromScore(0)).toBe(0);
    expect(affinityFromScore(AFFINITY_MAX_INDEX)).toBe(100);
    expect(affinityFromScore(AFFINITY_MAX_INDEX / 2)).toBe(50);
  });

  it("matches the live values observed from Jev", () => {
    // Real answers from a smoke call: 1.10 .. 2.45 across the eight Aesthetics.
    expect(affinityFromScore(1.1)).toBeCloseTo(27.5, 5);
    expect(affinityFromScore(2.45)).toBeCloseTo(61.25, 5);
  });

  it("clamps outside the rubric rather than returning a number off the scale", () => {
    expect(affinityFromScore(-1)).toBe(0);
    expect(affinityFromScore(99)).toBe(100);
  });

  it("returns 0 for a non-finite score instead of NaN", () => {
    expect(affinityFromScore(Number.NaN)).toBe(0);
    expect(affinityFromScore(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("never returns a value outside 0..100", () => {
    for (const v of [-99, -0.001, 0, 0.5, 2, 3.999, 4, 4.001, 1e9]) {
      const out = affinityFromScore(v);
      expect(out).toBeGreaterThanOrEqual(0);
      expect(out).toBeLessThanOrEqual(100);
    }
  });
});

describe("affinitiesFromAnswers", () => {
  const answers = Object.fromEntries(
    AESTHETIC_KEYS.map((k, i) => [k, { type: "score", score: i / 2, confidence: 0.7 }]),
  ) as never;

  it("returns one Affinity per Aesthetic, exhaustively", () => {
    const out = affinitiesFromAnswers(answers);
    expect(Object.keys(out).sort()).toEqual([...AESTHETIC_KEYS].sort());
  });

  it("normalises every one onto 0..100", () => {
    for (const value of Object.values(affinitiesFromAnswers(answers))) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});
