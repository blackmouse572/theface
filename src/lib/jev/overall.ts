/**
 * The Overall.
 *
 * TheFace computes the Overall IN CODE, as a weighted combination of the Feature and
 * Impression Ratings. It never asks Jev for the Overall directly: weights in code can be
 * retuned without re-running inference against past Visitors, and the number can always be
 * reconciled against the Ratings displayed beside it. This follows the TypeSafe
 * `composite-scoring` pattern.
 *
 * ADR-0007 - THE OVERALL EXCLUDES CRAFT RATINGS. Lighting, angle, framing, background,
 * expression authenticity and camera distance describe the photograph, not the person. Every
 * Craft weight below is zero, and `computeOverall` reads a Craft Rating only to add nothing
 * with it. A face-rating product that lowers a person's Overall because of a bad lamp
 * measures the wrong thing, and TheFace already reports that lamp as advice. The rule is
 * surprising, so it is stated here, where the Overall is computed.
 *
 * Categorical Impressions carry no weight either, because they return a label rather than a
 * Rating. They are not in this table at all.
 *
 * Pure arithmetic. No I/O, no binding, no network.
 */

import type { Observation } from "@/lib/observation";

import {
  AESTHETIC_KEYS,
  CRAFT_KEYS,
  FEATURE_KEYS,
  IMPRESSION_KEYS,
  VERDICT_THRESHOLDS,
} from "./questions";
import type {
  CraftKey,
  DimensionWeights,
  DimensionAnswers,
  FeatureKey,
  ImpressionKey,
  Overall,
  OverallInput,
  Probability,
  Rating,
  RatedDimensionKey,
  Ratings,
  AestheticAnswers,
  AestheticKey,
  Verdict,
  VerdictAnswers,
} from "./types";

// ---------------------------------------------------------------------------------------
// The weight table
// ---------------------------------------------------------------------------------------

/**
 * Features hold 70 of the 100 points.
 *
 * Three rules produced these numbers (SPEC.md, "Starting weights"): improvable Dimensions
 * carry weight so that better Craft moves the Overall; stable Dimensions carry weight so
 * that two photographs of one face agree; low-signal Dimensions carry almost none.
 */
export const FEATURE_WEIGHTS = {
  eyes: 8,
  symmetry: 8,
  skin: 8,
  proportions: 7,
  jawline: 6,
  cheekbones: 5,
  nose: 5,
  lips: 5,
  hairAndHairline: 5,
  teeth: 4,
  eyebrows: 3,
  chin: 3,
  forehead: 2,
  ears: 1,
} as const satisfies Record<FeatureKey, number>;

/** The five rated Impressions hold the remaining 30 points. */
export const IMPRESSION_WEIGHTS = {
  confidence: 8,
  styleAndGrooming: 8,
  approachability: 6,
  mainCharacterEnergy: 5,
  trustworthiness: 3,
} as const satisfies Record<ImpressionKey, number>;

/**
 * Craft holds ZERO points. Every one of them. ADR-0007.
 *
 * They are listed rather than omitted so that the decision is visible where the Overall is
 * computed, and so that raising one is an obvious, deliberate edit rather than an accident.
 */
export const CRAFT_WEIGHTS = {
  lighting: 0,
  angle: 0,
  framing: 0,
  background: 0,
  expressionAuthenticity: 0,
  cameraDistance: 0,
} as const satisfies Record<CraftKey, number>;

/**
 * The whole weight table, exported so it can be tuned without touching any logic below.
 *
 * SPEC.md records these as a placeholder: "Real Jev output may cluster some Dimensions so
 * tightly that their weight has no effect. Tune them against the Tally after launch."
 *
 * Tuning is safe. `computeOverall` normalises by the table's own total, so a change to one
 * weight keeps the Overall on 0–100 without a second edit. Changing what the Overall MEANS
 * is not safe: the Tally's 101 counters are defined by it, and a change to the composition
 * invalidates every historical counter.
 */
export const OVERALL_WEIGHTS = {
  ...FEATURE_WEIGHTS,
  ...IMPRESSION_WEIGHTS,
  ...CRAFT_WEIGHTS,
} as const satisfies DimensionWeights;

function sumOf(weights: Readonly<Record<string, number>>): number {
  let total = 0;
  for (const weight of Object.values(weights)) total += weight;
  return total;
}

/** 70 from the Features. */
export const FEATURE_WEIGHT_TOTAL = sumOf(FEATURE_WEIGHTS);

/** 30 from the rated Impressions. */
export const IMPRESSION_WEIGHT_TOTAL = sumOf(IMPRESSION_WEIGHTS);

/** 100. The divisor `computeOverall` normalises by. */
export const OVERALL_WEIGHT_TOTAL = sumOf(OVERALL_WEIGHTS);

// ---------------------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------------------

function clamp(value: number, low: number, high: number): number {
  if (Number.isNaN(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/**
 * How much `ratingFromNoul` inflates a Noul probability before it becomes a Rating.
 *
 * A blunt, explicit calibration knob, not a claim about the true distribution: Jev's "above
 * average" propositions read harsher in practice than the Overall should feel, so every
 * Feature and Impression Rating is scaled up 30%, uniformly, before clamping to 100. It never
 * touches the Verdict - `verdictFromAnswers` reads `.noul` directly, not through this
 * function - because inflating `oneAdultFace` or `realPhotograph` would weaken a safety check,
 * not a score.
 */
export const RATING_CONFIDENCE_BOOST = 1.3;

/**
 * A Noul returns a probability from 0 to 1. A Rating is that probability times 100, boosted by
 * {@link RATING_CONFIDENCE_BOOST} first.
 *
 * ADR-0002: this direct reading is the whole reason a Rating is a Noul and not a `Score`. A
 * `Score` would give five distinct values where a Board needs genuine spread.
 */
export function ratingFromNoul(probability: Probability): Rating {
  return clamp(probability * RATING_CONFIDENCE_BOOST, 0, 1) * 100;
}

/** Every Noul answer for a rated Dimension, read as a Rating. */
export function ratingsFromAnswers(answers: DimensionAnswers): Ratings {
  // Built key by key from the two key lists, so the result is exhaustive by construction.
  const ratings = {} as Record<RatedDimensionKey, Rating>;
  for (const key of FEATURE_KEYS) ratings[key] = ratingFromNoul(answers[key].noul);
  for (const key of IMPRESSION_KEYS) ratings[key] = ratingFromNoul(answers[key].noul);
  return ratings;
}

// ---------------------------------------------------------------------------------------
// Affinities
// ---------------------------------------------------------------------------------------

/**
 * Levels in the shared Aesthetic rubric. A `Score` answer is an index across these, so it
 * arrives in the range 0 .. AFFINITY_LEVEL_COUNT - 1, NOT as a percentage.
 */
export const AFFINITY_LEVEL_COUNT = 5;

/** Highest index a `Score` over that rubric can return. */
export const AFFINITY_MAX_INDEX = AFFINITY_LEVEL_COUNT - 1;

/**
 * Reads a `Score` answer as an Affinity on 0..100, the scale the radar chart and the
 * per-Aesthetic Boards use. This is the division TypeSafe's own `composite-scoring` pattern
 * performs (`score / 4`).
 *
 * The 0..100 result is a DISPLAY scale, not a claim of percentage-point precision. Jev's
 * documentation warns against reading exact magnitude between two levels, so the real
 * resolution is AFFINITY_LEVEL_COUNT steps however finely the number prints. Rank a Board on
 * it and draw a radar with it; do not tell a Contender they are "3 points" from the next.
 */
export function affinityFromScore(scoreValue: number): number {
  if (!Number.isFinite(scoreValue)) return 0;
  return (clamp(scoreValue, 0, AFFINITY_MAX_INDEX) / AFFINITY_MAX_INDEX) * 100;
}

/** Every Aesthetic answer, read as an Affinity on 0..100. */
export function affinitiesFromAnswers(answers: AestheticAnswers): Record<AestheticKey, number> {
  const affinities = {} as Record<AestheticKey, number>;
  for (const key of AESTHETIC_KEYS) affinities[key] = affinityFromScore(answers[key].score);
  return affinities;
}

// ---------------------------------------------------------------------------------------
// The Overall
// ---------------------------------------------------------------------------------------

/**
 * The Overall, from 0 to 100: the weighted mean of the Feature and Impression Ratings.
 *
 * Craft Ratings may be passed. They change nothing, because every Craft weight is zero
 * (ADR-0007).
 *
 * `weights` defaults to {@link OVERALL_WEIGHTS} but may be a table with some entries zeroed
 * out - see {@link assessableWeights} - in which case the divisor is that table's own total,
 * not the fixed 100, so excluding a Dimension still leaves the result on 0–100.
 *
 * The result is NOT rounded. A Board ranks on the raw 0–100, so the spread is worth keeping;
 * the Tally rounds to one of its 101 counters at its own edge.
 */
export function computeOverall(
  ratings: OverallInput,
  weights: DimensionWeights = OVERALL_WEIGHTS,
): Overall {
  const weightTotal = sumOf(weights);
  if (weightTotal <= 0) return 0;

  let weighted = 0;
  for (const key of FEATURE_KEYS) weighted += ratings[key] * weights[key];
  for (const key of IMPRESSION_KEYS) weighted += ratings[key] * weights[key];

  // ADR-0007. Every term in this loop is multiplied by zero, absent an override. It is
  // written out rather than dropped so that a Craft weight can never start counting silently.
  for (const key of CRAFT_KEYS) weighted += (ratings[key] ?? 0) * weights[key];

  return clamp(weighted / weightTotal, 0, 100);
}

/**
 * The Observation field(s) behind each Feature, and the value each reports when it found
 * nothing to say. A Feature counts as assessable if AT LEAST ONE of its fields cleared that
 * bar - most Features are one field, a few (eyes, skin) are covered from two angles.
 */
const FEATURE_EVIDENCE: Readonly<
  Record<FeatureKey, readonly { readonly field: keyof Observation; readonly empty: string }[]>
> = {
  eyes: [
    { field: "eyeShape", empty: "not_visible" },
    { field: "canthalTilt", empty: "not_assessable" },
  ],
  eyebrows: [
    { field: "browShape", empty: "not_visible" },
    { field: "browThickness", empty: "not_visible" },
  ],
  nose: [{ field: "noseShape", empty: "not_assessable" }],
  lips: [{ field: "lipFullness", empty: "not_visible" }],
  jawline: [{ field: "jawAngle", empty: "not_assessable" }],
  chin: [{ field: "chinShape", empty: "not_assessable" }],
  cheekbones: [{ field: "cheekboneProminence", empty: "not_assessable" }],
  forehead: [{ field: "foreheadHeight", empty: "obscured" }],
  skin: [
    { field: "skinToneEvenness", empty: "not_assessable" },
    { field: "skinTexture", empty: "not_assessable" },
  ],
  teeth: [
    { field: "teethVisibility", empty: "not_visible" },
    { field: "teethAlignment", empty: "not_assessable" },
  ],
  hairAndHairline: [
    { field: "hairLength", empty: "obscured" },
    { field: "hairStyle", empty: "obscured" },
    { field: "hairlinePosition", empty: "obscured" },
    { field: "hairDensity", empty: "obscured" },
  ],
  ears: [
    { field: "earVisibility", empty: "not_visible" },
    { field: "earProtrusion", empty: "not_visible" },
  ],
  symmetry: [{ field: "facialSymmetry", empty: "not_assessable" }],
  proportions: [{ field: "facialThirds", empty: "not_assessable" }],
};

/**
 * Whether the Observation had anything to say about a Feature at all.
 *
 * A false negative here (calling an assessed Feature unassessable) only costs a little
 * weight; a false positive (trusting a Rating with nothing behind it) is the bug this
 * function exists to catch. See `questions.ts`, `UNCERTAIN_WHEN_UNDESCRIBED`, for the other
 * half of this fix - this is the code-side backstop, in case Jev still answers low anyway.
 */
export function isFeatureAssessable(observation: Observation, key: FeatureKey): boolean {
  return FEATURE_EVIDENCE[key].some(({ field, empty }) => observation[field] !== empty);
}

/**
 * {@link OVERALL_WEIGHTS} with every unassessable Feature's weight zeroed, so
 * {@link computeOverall} renormalises over only the Features the Observation could actually
 * judge. An Observation is optional everywhere this is used - omitting it keeps the original,
 * unfiltered weights, which is what every test that predates this function still exercises.
 */
export function assessableWeights(observation: Observation): DimensionWeights {
  const weights: Record<string, number> = { ...OVERALL_WEIGHTS };
  for (const key of FEATURE_KEYS) {
    if (!isFeatureAssessable(observation, key)) weights[key] = 0;
  }
  return weights as DimensionWeights;
}

/**
 * How far a Noul must sit from 0.5 to count. Jev answers "above average?" with a probability,
 * and 0.5 is where it lands when it cannot tell (the Feature questions ask it to). Inside
 * this band the model did not commit either way, so the Dimension is left out rather than
 * averaged in as if it had.
 *
 * A Dimension that is genuinely average also reads near 0.5 and is dropped with the rest, so
 * this favours decisive signals. Tune it against real answers.
 */
export const UNCERTAIN_BAND = 0.1;

/**
 * The Overall is never computed from fewer than this many weight points. Dropping
 * uncertain Dimensions from a sparse answer could otherwise leave two or three of them
 * deciding the whole number; below the floor the uncertain ones are kept.
 */
export const MIN_CONFIDENT_WEIGHT = 40;

/**
 * `weights` with every Dimension zeroed whose Noul is within {@link UNCERTAIN_BAND} of 0.5.
 * Reads the raw probability, before the confidence boost in `ratingFromNoul`.
 */
export function confidentWeights(
  answers: DimensionAnswers,
  weights: DimensionWeights = OVERALL_WEIGHTS,
): DimensionWeights {
  const kept: Record<string, number> = { ...weights };
  for (const key of [...FEATURE_KEYS, ...IMPRESSION_KEYS]) {
    if (Math.abs(answers[key].noul - 0.5) < UNCERTAIN_BAND) kept[key] = 0;
  }
  return sumOf(kept) >= MIN_CONFIDENT_WEIGHT ? (kept as DimensionWeights) : weights;
}

/**
 * The Overall straight from Jev's answers, for the common path in the Worker.
 *
 * A Dimension is left out when the model could not judge it: the Observation had nothing on
 * it ({@link assessableWeights}, needs `observation`), or Jev itself was unsure
 * ({@link confidentWeights}). What remains is renormalised, so the result stays on 0-100.
 * Omit `observation` and only the second rule applies.
 */
export function overallFromAnswers(answers: DimensionAnswers, observation?: Observation): Overall {
  const assessable = observation ? assessableWeights(observation) : OVERALL_WEIGHTS;
  return computeOverall(ratingsFromAnswers(answers), confidentWeights(answers, assessable));
}

/** `apparentMinor` runs the other way: pass requires it stay BELOW its threshold. */
export function verdictFromAnswers(answers: VerdictAnswers): Verdict {
  const oneAdultFace = answers.oneAdultFace.noul;
  const realPhotograph = answers.realPhotograph.noul;
  const apparentMinor = answers.apparentMinor.noul;

  const passed =
    oneAdultFace >= VERDICT_THRESHOLDS.minOneAdultFace &&
    realPhotograph >= VERDICT_THRESHOLDS.minRealPhotograph &&
    apparentMinor <= VERDICT_THRESHOLDS.maxApparentMinor;

  return { oneAdultFace, realPhotograph, apparentMinor, passed };
}
