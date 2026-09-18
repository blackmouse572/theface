/**
 * The result types for TheFace's Jev layer.
 *
 * Nothing here is hand-written from the API documentation. Every answer type is INFERRED
 * from the question set in `./questions.ts` through the SDK's own `ResultFor`, so a change
 * to a question changes the type of its answer and a stale consumer stops compiling.
 *
 * Types only. This file emits no JavaScript.
 */

import type { ResultFor } from "@typesafe-ai/sdk";

import type {
  AESTHETIC_KEYS,
  CRAFT_KEYS,
  FEATURE_KEYS,
  IMPRESSION_KEYS,
  jevQuestions,
  VERDICT_KEYS,
} from "./questions";

// ---------------------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------------------

/**
 * A probability from 0 to 1, as a Noul returns it.
 *
 * This is Jev's number, not TheFace's. It becomes a Rating in `./overall.ts`.
 */
export type Probability = number;

/**
 * A Rating: a number from 0 to 100 that expresses one judgment about one Dimension.
 *
 * A Rating is a Noul probability multiplied by 100 (ADR-0002). It is never a `Score`.
 */
export type Rating = number;

/**
 * The Overall: the single composite number shown to a Visitor, from 0 to 100.
 *
 * It is always derived, never asked for. `./overall.ts` computes it.
 */
export type Overall = number;

// ---------------------------------------------------------------------------------------
// Dimension keys
// ---------------------------------------------------------------------------------------

/** A Feature is a Dimension that describes part of the face. */
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** An Impression is a Dimension that describes how a face reads to a viewer. */
export type ImpressionKey = (typeof IMPRESSION_KEYS)[number];

/** A Craft is a Dimension that describes the photograph instead of the person. */
export type CraftKey = (typeof CRAFT_KEYS)[number];

/**
 * A Dimension that carries weight in the Overall: every Feature and every rated Impression.
 *
 * ADR-0007 is why a Craft is not in this union.
 */
export type RatedDimensionKey = FeatureKey | ImpressionKey;

/** Every Dimension. CONTEXT.md: each one is a Feature, an Impression or a Craft. */
export type DimensionKey = RatedDimensionKey | CraftKey;

/** One of the three Verdict questions. */
export type VerdictKey = (typeof VERDICT_KEYS)[number];

/** One of the eight Aesthetics. */
export type AestheticKey = (typeof AESTHETIC_KEYS)[number];

// ---------------------------------------------------------------------------------------
// Answers, inferred from the questions
// ---------------------------------------------------------------------------------------

/** The whole question set, as one `systemOne` request carries it. */
export type JevQuestions = typeof jevQuestions;

/**
 * Every answer, keyed by question name, with each answer's type inferred from its question.
 *
 * This is the same mapping the SDK applies to `systemOne`'s result, so
 * `(await client.systemOne({ state, questions: jevQuestions })).answers` is a `JevAnswers`.
 */
export type JevAnswers = { readonly [K in keyof JevQuestions]: ResultFor<JevQuestions[K]> };

/** The three raw Verdict answers, before any threshold is applied. */
export type VerdictAnswers = Pick<JevAnswers, VerdictKey>;

/** The nineteen Dimension answers that produce the Ratings. */
export type DimensionAnswers = Pick<JevAnswers, RatedDimensionKey>;

/** The eight Aesthetic answers. Each one is an Affinity. */
export type AestheticAnswers = Pick<JevAnswers, AestheticKey>;

// ---------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------

/**
 * The Verdict: the judgment on whether a subject may be rated at all.
 *
 * `apparentMinor` runs the other way from the other two - a HIGH probability is a failure.
 * When `passed` is false the Worker discards every Rating and every Affinity, and creates no
 * Leaderboard Entry.
 */
export interface Verdict {
  /** Probability that the Observation describes exactly one adult human face. */
  readonly oneAdultFace: Probability;
  /** Probability that the Observation describes a real photograph of a living person. */
  readonly realPhotograph: Probability;
  /** Probability that the subject appears to be under eighteen. Lower is better. */
  readonly apparentMinor: Probability;
  /** True only when all three conditions in `VERDICT_THRESHOLDS` hold. */
  readonly passed: boolean;
}

/** Every Rating that carries weight in the Overall: 14 Features and 5 rated Impressions. */
export type Ratings = { readonly [K in RatedDimensionKey]: Rating };

/**
 * Craft Ratings, if the advice layer has produced any.
 *
 * Optional, and weighted at zero wherever it appears. ADR-0007.
 */
export type CraftRatings = { readonly [K in CraftKey]?: Rating };

/** What `computeOverall` reads: every rated Dimension, plus any Craft Ratings it must ignore. */
export type OverallInput = Ratings & CraftRatings;

/**
 * An Affinity: how closely a face matches one Aesthetic.
 *
 * It is a `Score` result, so it carries an expected `score` across the rubric levels, the
 * `probabilities` behind it, a `confidence`, and the `legend` that describes each level. It
 * is a property of the match, never of the person.
 */
export type Affinity = JevAnswers[AestheticKey];

/** One Affinity per Aesthetic - the eight axes of the radar chart. */
export type Affinities = { readonly [K in AestheticKey]: JevAnswers[K] };

/** A weight table for the Overall, in the shape `./overall.ts` exports. */
export type DimensionWeights = { readonly [K in DimensionKey]: number };
