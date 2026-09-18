/**
 * The Jev question set for TheFace.
 *
 * Every question in this file travels to Jev in ONE `systemOne` request. Jev evaluates
 * questions in parallel, so an extra question costs almost nothing in latency and very
 * little in tokens. See SPEC.md, "Layer 3 -> Jev, one call".
 *
 * Three groups:
 *
 * - Verdict    -> Nouls that decide whether a subject may be rated at all.
 * - Dimensions -> Nouls that produce the Ratings: 14 Features and 5 rated Impressions.
 * - Aesthetics -> `Score` questions that produce the Affinities.
 *
 * ADR-0001: the vision model observes, Jev judges. Every question below judges the neutral
 * facts in an Observation. No question asks the vision model for an opinion.
 *
 * ADR-0002: a Rating comes from a Noul, never from a `Score`. Each Dimension is therefore
 * phrased as a yes/no PROPOSITION about what a typical viewer would say, not as a ladder of
 * levels. The returned probability becomes the Rating directly (see `./overall.ts`).
 *
 * ADR-0003: an Aesthetic describes traits, never a population. Nothing this file sends to
 * Jev names a place, a people or an ancestry. `questions.test.ts` enforces that.
 *
 * This module is pure data. It performs no I/O and holds no binding or credential.
 */

import { noul, score } from "@typesafe-ai/sdk";
import type { NoulQuestion, Questions } from "@typesafe-ai/sdk";

/**
 * Every question is answered from the Observation and from nothing else. Repeating the
 * framing in each question is deliberate: a question ID is never sent to Jev, so each
 * question must carry its complete meaning on its own.
 */
const FROM_THE_OBSERVATION = "Judging only from the neutral facts in the Observation,";

/**
 * A yes/no proposition with both outcomes described. Used for the Verdict and for every
 * Dimension.
 */
function proposition(question: string, yes: string, no: string): NoulQuestion {
  return noul(`${FROM_THE_OBSERVATION} ${question}`, { true: yes, false: no });
}

// ---------------------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------------------

export const VERDICT_KEYS = ["oneAdultFace", "realPhotograph", "apparentMinor"] as const;

/**
 * The Verdict decides whether a subject may be rated at all. It travels in the same call as
 * the Ratings, and the Worker discards every Rating when the Verdict fails.
 *
 * Note the direction of `apparentMinor`: a HIGH probability is a FAILURE. It is phrased in
 * the positive because a Noul is calibrated on the proposition it states, and "does not
 * appear to be a minor" is a negation that reads worse to the model.
 */
export const verdictQuestions = {
  oneAdultFace: proposition(
    "would a typical viewer say this describes exactly one adult human face?",
    "Yes -> exactly one human face is described, it belongs to one person, and that person is an adult.",
    "No -> no face is described, more than one face is described, the face is not human, or the face is not an adult's.",
  ),
  realPhotograph: proposition(
    "would a typical viewer say this describes a real photograph taken of a living person?",
    "Yes -> the facts describe a photograph of a real person in front of a camera.",
    "No -> the facts describe a drawing, a painting, a sculpture, a rendered or generated image, a screenshot of a screen, or a photograph of another photograph.",
  ),
  apparentMinor: proposition(
    "would a typical viewer say the subject appears to be under eighteen years old?",
    "Yes -> a typical viewer would place the subject under eighteen, or would be unsure and would err towards under eighteen.",
    "No -> a typical viewer would confidently place the subject at eighteen or older.",
  ),
} satisfies Questions;

/**
 * Where the Verdict passes or fails. These are placeholders; SPEC.md, "Constants to
 * calibrate after launch" records what settles them. They are deliberately asymmetric: a
 * missing Rating costs a Visitor nothing, and a wrong Rating costs the project a great deal.
 *
 * The Worker applies these. This module states them and stays pure.
 */
export const VERDICT_THRESHOLDS = {
  /** Minimum probability that exactly one adult human face is described. */
  minOneAdultFace: 0.7,
  /** Minimum probability that a real photograph is described. */
  minRealPhotograph: 0.6,
  /** Maximum tolerated probability that the subject appears to be a minor. */
  maxApparentMinor: 0.15,
} as const;

// ---------------------------------------------------------------------------------------
// Dimensions -> Features
// ---------------------------------------------------------------------------------------

export const FEATURE_KEYS = [
  "eyes",
  "eyebrows",
  "nose",
  "lips",
  "jawline",
  "chin",
  "cheekbones",
  "forehead",
  "skin",
  "teeth",
  "hairAndHairline",
  "ears",
  "symmetry",
  "proportions",
] as const;

/**
 * A Feature is a Dimension that describes part of the face. Fourteen of them.
 *
 * Every proposition is "above average", so the fourteen probabilities are comparable and
 * the weighted combination in `./overall.ts` is meaningful. A Feature that the Observation
 * does not describe -> teeth behind closed lips, ears behind hair -> should land near 0.5,
 * which each `false` description says in its own words.
 */
export const featureQuestions = {
  eyes: proposition(
    "would a typical viewer say this person's eyes are above average?",
    "Yes -> a typical viewer would call the eyes a strong feature of this face: well defined, well placed, and well matched to each other.",
    "No -> a typical viewer would call the eyes ordinary for this face, or the Observation says too little about them to decide.",
  ),
  eyebrows: proposition(
    "would a typical viewer say this person's eyebrows are above average?",
    "Yes -> a typical viewer would say the brows suit the face: even, well shaped, and set at a flattering height.",
    "No -> a typical viewer would call the brows ordinary for this face, or the Observation says too little about them to decide.",
  ),
  nose: proposition(
    "would a typical viewer say this person's nose is above average?",
    "Yes -> a typical viewer would say the nose suits the face in width, length and profile.",
    "No -> a typical viewer would call the nose ordinary for this face, or the Observation says too little about it to decide.",
  ),
  lips: proposition(
    "would a typical viewer say this person's lips are above average?",
    "Yes -> a typical viewer would say the lips are a strong feature: good fullness for the face, an even balance between upper and lower, and a clear outline.",
    "No -> a typical viewer would call the lips ordinary for this face, or the Observation says too little about them to decide.",
  ),
  jawline: proposition(
    "would a typical viewer say this person's jawline is above average?",
    "Yes -> a typical viewer would say the jawline is a strong feature: clearly defined along its length and well shaped at the angle.",
    "No -> a typical viewer would call the jawline ordinary for this face, or the Observation says too little about it to decide.",
  ),
  chin: proposition(
    "would a typical viewer say this person's chin is above average?",
    "Yes -> a typical viewer would say the chin suits the face in projection and width, and sits well under the lower lip.",
    "No -> a typical viewer would call the chin ordinary for this face, or the Observation says too little about it to decide.",
  ),
  cheekbones: proposition(
    "would a typical viewer say this person's cheekbones are above average?",
    "Yes -> a typical viewer would say the cheekbones are a strong feature: clearly read, well placed, and even on both sides.",
    "No -> a typical viewer would call the cheekbones ordinary for this face, or the Observation says too little about them to decide.",
  ),
  forehead: proposition(
    "would a typical viewer say this person's forehead is above average?",
    "Yes -> a typical viewer would say the forehead is well proportioned to the rest of the face in height and width.",
    "No -> a typical viewer would call the forehead ordinary for this face, or the Observation says too little about it to decide.",
  ),
  skin: proposition(
    "would a typical viewer say this person's skin is above average?",
    "Yes -> a typical viewer would say the skin is a strong feature: even in tone and texture, and healthy.",
    "No -> a typical viewer would call the skin ordinary for this face, or the Observation says too little about it to decide.",
  ),
  teeth: proposition(
    "would a typical viewer say this person's teeth are above average?",
    "Yes -> the Observation describes visible teeth that are even, well aligned and clean in colour.",
    "No -> a typical viewer would call the teeth ordinary, or the teeth are not visible in this photograph and there is nothing to judge.",
  ),
  hairAndHairline: proposition(
    "would a typical viewer say this person's hair and hairline are above average?",
    "Yes -> a typical viewer would say the hair is a strong feature: healthy in condition and density, with a hairline that frames the face well.",
    "No -> a typical viewer would call the hair and hairline ordinary for this face, or the Observation says too little about them to decide.",
  ),
  ears: proposition(
    "would a typical viewer say this person's ears are above average?",
    "Yes -> the Observation describes visible ears that are well proportioned and sit close and even against the head.",
    "No -> a typical viewer would call the ears ordinary, or the ears are not visible in this photograph and there is nothing to judge.",
  ),
  symmetry: proposition(
    "would a typical viewer say this face is more symmetric than average?",
    "Yes -> the left and right sides match closely in the placement and shape of the eyes, the brows, the mouth and the jaw.",
    "No -> the two sides differ enough for a typical viewer to notice, or the Observation says too little about the match to decide.",
  ),
  proportions: proposition(
    "would a typical viewer say this face is better proportioned than average?",
    "Yes -> the vertical thirds and the horizontal spacing of the features sit in a balance that a typical viewer would call pleasing.",
    "No -> a typical viewer would call the proportions ordinary for a face, or the Observation says too little about them to decide.",
  ),
} satisfies Questions;

// ---------------------------------------------------------------------------------------
// Dimensions -> rated Impressions
// ---------------------------------------------------------------------------------------

export const IMPRESSION_KEYS = [
  "approachability",
  "trustworthiness",
  "mainCharacterEnergy",
  "styleAndGrooming",
  "confidence",
] as const;

/**
 * A rated Impression is a Dimension that describes how a face reads to a viewer. Five of
 * them, and each one carries weight in the Overall.
 *
 * SPEC.md also lists three CATEGORICAL Impressions -> apparent profession, era, apparent age
 * bracket. Those are Jev `Choice` questions, they return a label rather than a 0–100, and
 * they carry no weight. They are not part of this set.
 */
export const impressionQuestions = {
  approachability: proposition(
    "would a typical viewer say this person reads as more approachable than average?",
    "Yes -> a typical viewer would say this is someone easy to start a conversation with: open, warm, unguarded.",
    "No -> a typical viewer would read this person as neutral, closed or hard to read.",
  ),
  trustworthiness: proposition(
    "would a typical viewer say this person reads as more trustworthy than average?",
    "Yes -> a typical viewer's first impression would be of someone steady and honest.",
    "No -> a typical viewer's first impression would be neutral, or would not settle on trust either way.",
  ),
  mainCharacterEnergy: proposition(
    "would a typical viewer say this person has more main-character energy than average?",
    "Yes -> a typical viewer would say this person holds the frame: the presence of someone a story would follow.",
    "No -> a typical viewer would say this person reads as one face among many in the frame.",
  ),
  styleAndGrooming: proposition(
    "would a typical viewer say this person's style and grooming are above average?",
    "Yes -> a typical viewer would say the hair, the brows, the skin and anything worn have all had deliberate care, and that the choices work together.",
    "No -> a typical viewer would call the styling and grooming ordinary or unconsidered.",
  ),
  confidence: proposition(
    "would a typical viewer say this person reads as more confident than average?",
    "Yes -> a typical viewer would say the set of the head, the eyes and the mouth all read as self-assured.",
    "No -> a typical viewer would read this person as neutral, hesitant or uneasy.",
  ),
} satisfies Questions;

// ---------------------------------------------------------------------------------------
// Aesthetics
// ---------------------------------------------------------------------------------------

export const AESTHETIC_KEYS = [
  "kBeauty",
  "bollywoodGlamour",
  "nollywoodGlamour",
  "persianClassical",
  "oldHollywood",
  "nordicMinimalism",
  "mediterraneanClassical",
  "latinScreenSiren",
] as const;

/**
 * An Aesthetic is a described standard of beauty: a set of traits that a tradition prizes.
 * It describes an ideal. It never describes a population, and it is never a claim about
 * anyone's origin.
 *
 * Each Aesthetic carries two labels and one trait list, and the three have three different
 * audiences. ADR-0003 is the record:
 *
 * - `name` is the TRADITION. It goes on the radar chart axis, because an axis label travels
 *   in a screenshot without its context, and a tradition survives that journey where a
 *   people does not.
 * - `origin` is a DISPLAY LABEL ONLY, for the tooltip or detail view. It is never sent to
 *   Jev, it is never a claim about the Visitor, and no criteria string may reference it.
 * - `traits` is the only field that reaches the model. Jev is asked to recognise a set of
 *   visual traits, and is never invited to classify a person.
 *
 * `questions.test.ts` enforces the last two rules.
 */
interface AestheticDefinition {
  /** The tradition. Shown on the radar chart axis. Never sent to Jev. */
  readonly name: string;
  /** A display label for the tooltip only. Never sent to Jev, and never a claim. */
  readonly origin: string;
  /** The traits this Aesthetic prizes. The only field Jev ever sees. */
  readonly traits: readonly string[];
}

export const AESTHETICS = {
  kBeauty: {
    name: "K-beauty",
    origin: "East Asian",
    traits: [
      "a V-line jaw",
      "aegyo-sal, a soft ridge under the lower lash line",
      "a small-face ratio against the shoulders",
      "straight, softly filled brows",
      "dewy, fine-textured skin",
      "a smooth rounded forehead",
      "a gradient lip that fades towards its outer edge",
    ],
  },
  bollywoodGlamour: {
    name: "Bollywood glamour",
    origin: "South Asian",
    traits: [
      "large, deep-set eyes behind a heavy defined lash line",
      "thick, strongly arched brows",
      "full lips with a sharply drawn cupid's bow",
      "high cheekbones carrying a lifted highlight",
      "a luminous, high-sheen skin finish",
      "an oval face with a defined chin",
      "long, thick hair with a high-gloss finish",
    ],
  },
  nollywoodGlamour: {
    name: "Nollywood glamour",
    origin: "West African",
    traits: [
      "a broad nose with wide alae",
      "full, everted lips with a glossy finish",
      "high, wide cheekbones under a bright highlight",
      "an even complexion carrying a strong specular sheen",
      "bold, sharply defined brows",
      "a square chin under a strong jaw",
      "hair worn full and sculpted, or in an architectural braided style",
    ],
  },
  persianClassical: {
    name: "Persian classical",
    origin: "Middle Eastern",
    traits: [
      "a strong, straight or slightly convex nose bridge",
      "deep-set eyes under heavy lashes",
      "thick, continuously arched brows",
      "a matte, even complexion",
      "a long oval face with a defined jaw",
      "a small, full mouth",
      "abundant hair with a strong natural wave",
    ],
  },
  oldHollywood: {
    name: "Old Hollywood",
    origin: "Anglo-American",
    traits: [
      "closely matched left and right features",
      "a thin, high-peaked arched brow",
      "a small, straight nose",
      "a full upper lip with a sharp outline",
      "sculpted cheekbones above a soft hollow",
      "a smooth, even complexion under high-key light",
      "set waves in the hair",
    ],
  },
  nordicMinimalism: {
    name: "Nordic minimalism",
    origin: "Scandinavian",
    traits: [
      "low visual contrast between the features",
      "fine, lightly groomed brows with no drawn edge",
      "a bare, matte skin finish with no visible contouring",
      "a narrow, straight nose",
      "a long vertical face ratio",
      "a sharp jawline",
      "straight hair worn plainly, with little visible styling",
    ],
  },
  mediterraneanClassical: {
    name: "Mediterranean classical",
    origin: "Southern European",
    traits: [
      "a smooth, matte complexion",
      "almond eyes set level under the brow",
      "a straight nose continuing the line of the forehead",
      "clearly defined cheekbones",
      "thick, level brows",
      "an angular jaw",
      "loosely waved hair worn naturally",
    ],
  },
  latinScreenSiren: {
    name: "Latin screen siren",
    origin: "Latin American",
    traits: [
      "a satin skin finish with a lifted highlight",
      "large eyes behind a heavy lash line",
      "a strong, high arched brow",
      "full lips with a glossy finish",
      "high, rounded cheekbones",
      "a heart-shaped face narrowing to the chin",
      "voluminous, strongly waved hair",
    ],
  },
} as const satisfies Record<(typeof AESTHETIC_KEYS)[number], AestheticDefinition>;

/**
 * The five levels of an Affinity. They describe how much of an Aesthetic's trait set a face
 * shows, so one rubric serves all eight Aesthetics and the eight results stay comparable on
 * one radar chart.
 *
 * ADR-0002: a `Score` is correct here and wrong for a Rating. A match against a described
 * ideal is a graded judgment with describable levels, which is what the primitive is for.
 *
 * ADR-0003: only `traits` is interpolated. Neither `name` nor `origin` is sent, so the
 * model is never asked whether a person belongs to a people.
 */
function affinityLevels(traits: readonly string[]) {
  const prized = traits.join("; ");
  return score(
    [
      "An Aesthetic is a described standard of beauty: a set of traits that a tradition prizes.",
      `This Aesthetic prizes the following traits: ${prized}.`,
      `${FROM_THE_OBSERVATION} how much of that trait set does this face show?`,
      "Judge the face against the listed traits and against nothing else. Do not judge the person, and do not judge where the person is from.",
    ].join(" "),
    [
      "The face shows none of the prized traits.",
      "The face shows one or two of the prized traits, and weakly.",
      "The face shows several of the prized traits, while as many are absent.",
      "The face shows most of the prized traits clearly.",
      "The face shows nearly all of the prized traits, strongly and together.",
    ],
  );
}

/** One `Score` per Aesthetic. Each answer is an Affinity. */
export const aestheticQuestions = {
  kBeauty: affinityLevels(AESTHETICS.kBeauty.traits),
  bollywoodGlamour: affinityLevels(AESTHETICS.bollywoodGlamour.traits),
  nollywoodGlamour: affinityLevels(AESTHETICS.nollywoodGlamour.traits),
  persianClassical: affinityLevels(AESTHETICS.persianClassical.traits),
  oldHollywood: affinityLevels(AESTHETICS.oldHollywood.traits),
  nordicMinimalism: affinityLevels(AESTHETICS.nordicMinimalism.traits),
  mediterraneanClassical: affinityLevels(AESTHETICS.mediterraneanClassical.traits),
  latinScreenSiren: affinityLevels(AESTHETICS.latinScreenSiren.traits),
} satisfies Questions;

// ---------------------------------------------------------------------------------------
// Craft
// ---------------------------------------------------------------------------------------

/**
 * A Craft is a Dimension that describes the photograph instead of the person, and Craft is
 * the basis of the advice on the results page.
 *
 * No Craft question exists yet: the advice layer is not built. The keys live here so that
 * CONTEXT.md's rule -> every Dimension is a Feature, an Impression or a Craft -> holds in the
 * types, and so that `./overall.ts` can state a weight of zero for each one by name.
 *
 * ADR-0007: a Craft Rating must never move the Overall, whenever those questions arrive.
 */
export const CRAFT_KEYS = [
  "lighting",
  "angle",
  "framing",
  "background",
  "expressionAuthenticity",
  "cameraDistance",
] as const;

// ---------------------------------------------------------------------------------------
// The whole set
// ---------------------------------------------------------------------------------------

/**
 * Every question TheFace asks Jev, in one object, for one `systemOne` request:
 *
 * ```ts
 * const { answers } = await client.systemOne({ state: observation, questions: jevQuestions });
 * ```
 *
 * The answer types are inferred from this object. See `./types.ts`.
 */
export const jevQuestions = {
  ...verdictQuestions,
  ...featureQuestions,
  ...impressionQuestions,
  ...aestheticQuestions,
} satisfies Questions;
