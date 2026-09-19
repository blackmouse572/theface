import type { NoulResponse } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";

import type { Observation } from "@/lib/observation";

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
  assessableWeights,
  computeOverall,
  isFeatureAssessable,
  overallFromAnswers,
  RATING_CONFIDENCE_BOOST,
  ratingFromNoul,
  ratingsFromAnswers,
  verdictFromAnswers,
} from "./overall";
import { AESTHETIC_KEYS, VERDICT_THRESHOLDS } from "./questions";
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

/** An Observation where every Feature has real evidence behind it. */
function fullyAssessedObservation(): Observation {
  return {
    mediaKind: "photograph",
    faceCount: 1,
    apparentAgeBracket: "25_34",
    faceShape: "oval",
    facialThirds: "approximately_even",
    facialSymmetry: "no_visible_asymmetry",
    asymmetryNote: null,
    eyeShape: "almond",
    canthalTilt: "neutral",
    browShape: "straight",
    browThickness: "medium",
    noseShape: "straight",
    lipFullness: "medium",
    jawAngle: "moderately_defined",
    chinShape: "rounded",
    cheekboneProminence: "moderate",
    foreheadHeight: "medium",
    skinToneEvenness: "even",
    skinTexture: "smooth",
    teethVisibility: "partially_visible",
    teethAlignment: "even",
    hairLength: "medium",
    hairStyle: "straight",
    hairlinePosition: "average",
    hairDensity: "medium",
    earVisibility: "both_visible",
    earProtrusion: "moderate",
    facialHair: "none",
    visibleMakeup: "none_visible",
    eyewear: "none",
    headwear: "none",
    attireRegister: "casual",
    expression: "neutral",
    eyeCreaseWithSmile: "not_applicable",
    gazeDirection: "at_camera",
    lightingDirection: "frontal",
    lightingCharacter: "soft_diffuse",
    headPose: "frontal",
    cameraHeight: "eye_level",
    framing: "head_and_shoulders",
    imageSharpness: "sharp",
    background: "plain_solid",
  };
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
  });

  it("clamps a probability outside 0 to 1", () => {
    expect(ratingFromNoul(-0.2)).toBe(0);
    expect(ratingFromNoul(1.4)).toBe(100);
  });

  it("boosts by RATING_CONFIDENCE_BOOST before clamping to 100", () => {
    expect(ratingFromNoul(0.73)).toBeCloseTo(0.73 * RATING_CONFIDENCE_BOOST * 100, 10);
    // 0.9 * 1.3 = 1.17, over the ceiling - the boost can push a high-but-not-certain
    // probability all the way to a Rating of 100.
    expect(ratingFromNoul(0.9)).toBe(100);
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
  // Hand-computed: each probability, boosted by RATING_CONFIDENCE_BOOST and clamped to a
  // Rating (0.81 -> 100, since 0.81 * 1.3 clears 1.0), times its weight, summed, divided by
  // 100.
  //
  //   Features     800.0 + 644.8 + 769.6 + 618.8 + 429.0 + 318.5 + 377.0 + 429.0 + 461.5
  //                + 208.0 + 202.8 + 234.0 + 130.0 + 58.5                          = 5681.5
  //   Impressions  800.0 + 655.2 + 600.0 + 377.0 + 269.1                          = 2701.3
  //   Overall      (5681.5 + 2701.3) / 100                                        = 83.828
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
    expect(overallFromAnswers(answersFrom(probabilities))).toBeCloseTo(83.828, 8);
  });

  it("produces the same Overall through Ratings as through answers", () => {
    const answers = answersFrom(probabilities);
    expect(computeOverall(ratingsFromAnswers(answers))).toBe(overallFromAnswers(answers));
  });

  it("reads each Noul probability as a boosted, clamped Rating", () => {
    const ratings = ratingsFromAnswers(answersFrom(probabilities));
    expect(Object.keys(ratings).sort()).toEqual([...RATED_KEYS].sort());
    // 0.81 * 1.3 = 1.053, clamped to a Rating of 100.
    expect(ratings.eyes).toBe(100);
    expect(ratings.trustworthiness).toBeCloseTo(0.69 * RATING_CONFIDENCE_BOOST * 100, 10);
  });

  it("is unmoved by Craft Ratings alongside it", () => {
    const ratings = ratingsFromAnswers(answersFrom(probabilities));
    expect(computeOverall({ ...ratings, ...everyCraftRating(93) })).toBeCloseTo(83.828, 8);
  });
});

describe("isFeatureAssessable", () => {
  it("is true for every Feature when the Observation describes all of them", () => {
    const observation = fullyAssessedObservation();
    for (const key of FEATURE_KEYS) {
      expect(isFeatureAssessable(observation, key), key).toBe(true);
    }
  });

  it("is false when a Feature's only field carries its empty value", () => {
    const observation = { ...fullyAssessedObservation(), noseShape: "not_assessable" } as const;
    expect(isFeatureAssessable(observation, "nose")).toBe(false);
  });

  it("stays true when only one of two backing fields is empty", () => {
    // eyes reads eyeShape and canthalTilt; either one carrying evidence is enough.
    const observation = { ...fullyAssessedObservation(), eyeShape: "not_visible" } as const;
    expect(isFeatureAssessable(observation, "eyes")).toBe(true);
  });

  it("is false only once every backing field is empty", () => {
    const observation = {
      ...fullyAssessedObservation(),
      eyeShape: "not_visible",
      canthalTilt: "not_assessable",
    } as const;
    expect(isFeatureAssessable(observation, "eyes")).toBe(false);
  });

  it("reads forehead's empty value as obscured, not not_assessable", () => {
    // foreheadHeight has no "not_assessable" option in its own vocabulary - the empty value
    // is "obscured". A wrong empty value here would silently never exclude the Feature.
    const observation = { ...fullyAssessedObservation(), foreheadHeight: "obscured" } as const;
    expect(isFeatureAssessable(observation, "forehead")).toBe(false);
  });
});

describe("assessableWeights", () => {
  it("keeps every weight when the Observation assessed every Feature", () => {
    expect(assessableWeights(fullyAssessedObservation())).toEqual(OVERALL_WEIGHTS);
  });

  it("zeroes only the unassessed Feature's weight", () => {
    const observation = {
      ...fullyAssessedObservation(),
      earVisibility: "not_visible",
      earProtrusion: "not_visible",
    } as const;
    const weights = assessableWeights(observation);
    expect(weights.ears).toBe(0);
    for (const key of FEATURE_KEYS) {
      if (key !== "ears") expect(weights[key], key).toBe(OVERALL_WEIGHTS[key]);
    }
    for (const key of IMPRESSION_KEYS) expect(weights[key]).toBe(OVERALL_WEIGHTS[key]);
  });
});

describe("overallFromAnswers with an Observation", () => {
  it("matches the unfiltered Overall when every Feature was assessed", () => {
    const answers = answersFrom({
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
    });
    expect(overallFromAnswers(answers, fullyAssessedObservation())).toBeCloseTo(
      overallFromAnswers(answers),
      10,
    );
  });

  it("excludes an unassessed Feature instead of trusting its biased-low Rating", () => {
    // Every Feature rated 100 except teeth, unassessed and rated 0 - the exact shape of the
    // bug this backstops: a Noul answering "no" for lack of evidence, not lack of quality.
    const answers = answersFrom({
      ...Object.fromEntries(FEATURE_KEYS.map((key) => [key, 1])),
      ...Object.fromEntries(IMPRESSION_KEYS.map((key) => [key, 1])),
      teeth: 0,
    } as Record<RatedDimensionKey, Probability>);

    const observation = {
      ...fullyAssessedObservation(),
      teethVisibility: "not_visible",
      teethAlignment: "not_assessable",
    } as const;

    expect(overallFromAnswers(answers)).toBeLessThan(100);
    expect(overallFromAnswers(answers, observation)).toBeCloseTo(100, 10);
  });

  it("still returns 100 when every Feature and Impression is unassessed and perfect", () => {
    const perfect = Object.fromEntries(RATED_KEYS.map((key) => [key, 1])) as Record<
      RatedDimensionKey,
      Probability
    >;
    const answers = answersFrom(perfect);
    const observation: Observation = {
      ...fullyAssessedObservation(),
      eyeShape: "not_visible",
      canthalTilt: "not_assessable",
      browShape: "not_visible",
      browThickness: "not_visible",
      noseShape: "not_assessable",
      lipFullness: "not_visible",
      jawAngle: "not_assessable",
      chinShape: "not_assessable",
      cheekboneProminence: "not_assessable",
      foreheadHeight: "obscured",
      skinToneEvenness: "not_assessable",
      skinTexture: "not_assessable",
      teethVisibility: "not_visible",
      teethAlignment: "not_assessable",
      hairLength: "obscured",
      hairStyle: "obscured",
      hairlinePosition: "obscured",
      hairDensity: "obscured",
      earVisibility: "not_visible",
      earProtrusion: "not_visible",
      facialSymmetry: "not_assessable",
      facialThirds: "not_assessable",
    };
    expect(overallFromAnswers(answers, observation)).toBeCloseTo(100, 10);
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

describe("verdictFromAnswers", () => {
  const noul = (n: number): NoulResponse => ({ type: "noul", noul: n });

  it("passes when all three thresholds clear", () => {
    const verdict = verdictFromAnswers({
      oneAdultFace: noul(VERDICT_THRESHOLDS.minOneAdultFace),
      realPhotograph: noul(VERDICT_THRESHOLDS.minRealPhotograph),
      apparentMinor: noul(VERDICT_THRESHOLDS.maxApparentMinor),
    });
    expect(verdict.passed).toBe(true);
  });

  it("fails when oneAdultFace is just below its threshold", () => {
    const verdict = verdictFromAnswers({
      oneAdultFace: noul(VERDICT_THRESHOLDS.minOneAdultFace - 0.01),
      realPhotograph: noul(1),
      apparentMinor: noul(0),
    });
    expect(verdict.passed).toBe(false);
  });

  it("fails when realPhotograph is below its threshold", () => {
    const verdict = verdictFromAnswers({
      oneAdultFace: noul(1),
      realPhotograph: noul(VERDICT_THRESHOLDS.minRealPhotograph - 0.01),
      apparentMinor: noul(0),
    });
    expect(verdict.passed).toBe(false);
  });

  it("fails when apparentMinor is just above its threshold — direction matters", () => {
    const verdict = verdictFromAnswers({
      oneAdultFace: noul(1),
      realPhotograph: noul(1),
      apparentMinor: noul(VERDICT_THRESHOLDS.maxApparentMinor + 0.01),
    });
    expect(verdict.passed).toBe(false);
  });

  it("carries the three probabilities through unchanged", () => {
    const verdict = verdictFromAnswers({
      oneAdultFace: noul(0.91),
      realPhotograph: noul(0.82),
      apparentMinor: noul(0.03),
    });
    expect(verdict.oneAdultFace).toBe(0.91);
    expect(verdict.realPhotograph).toBe(0.82);
    expect(verdict.apparentMinor).toBe(0.03);
  });
});
