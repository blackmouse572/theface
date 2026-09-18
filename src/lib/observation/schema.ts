/**
 * The shape of an Observation.
 *
 * An Observation is a neutral, factual description of a Crop. It describes. It never
 * evaluates. See `docs/adr/0001-vision-observes-jev-judges.md`: judgment belongs to Jev, and
 * a schema field that invites a quality judgment moves judgment out of the calibrated layer.
 *
 * Two rules governed every field below.
 *
 * 1. **No field may invite an evaluation.** There is no `attractiveness`, no `quality`, no
 *    `notes`, no free-text summary. Almost every field is a closed enum of neutral
 *    anatomical or photographic terms, so the vision model cannot smuggle a verdict past the
 *    prompt. A closed enum is also the strongest form of `guided_json` constraint.
 * 2. **No field may exist that no Jev question consumes.** Output is roughly 35 percent of
 *    the Observation's cost (SPEC.md, "Cost"), so every field here maps to a Dimension in
 *    SPEC.md, "What gets rated", or to the Verdict.
 *
 * Two further exclusions are deliberate:
 *
 * - **No measurement.** No ratios, no pixel distances, no angles in degrees. SPEC.md,
 *   "Layer 1": precise numbers invite Jev to weight measurements that it cannot calibrate.
 * - **No skin colour, ancestry, ethnicity or nationality.** `docs/adr/0003-aesthetics-not-
 *   ethnicity.md`. Skin is observed as tone *evenness* and surface *texture* only. This is
 *   also the field most likely to make a vision provider refuse (SPEC.md, "Open legal and
 *   vendor risks").
 */

import { z } from "zod";

/* -------------------------------------------------------------------------------------- *
 * Enum vocabularies
 *
 * Each vocabulary is declared once and used twice: by the Zod schema that validates what
 * comes back, and by the JSON Schema handed to `guided_json`. Declaring them once is what
 * keeps the two definitions from drifting apart.
 * -------------------------------------------------------------------------------------- */

/* --- Verdict inputs (SPEC.md, "Why Screening and Verdict are ours to build") ------------ */

/** Feeds the Verdict Noul "real photograph?". */
export const MEDIA_KINDS = [
  "photograph",
  "artwork_or_illustration",
  "digital_render_or_avatar",
  "screenshot_or_screen_photo",
] as const;

/** Feeds the Verdict Noul "apparent minor?". Brackets, never a number: an Observation must
 * not offer a precision the model does not have. */
export const AGE_BRACKETS = [
  "under_13",
  "13_17",
  "18_24",
  "25_34",
  "35_44",
  "45_54",
  "55_64",
  "65_plus",
] as const;

/* --- Features (SPEC.md, "What gets rated") ---------------------------------------------- */

/** Proportions, Jawline. */
export const FACE_SHAPES = [
  "oval",
  "round",
  "square",
  "heart",
  "diamond",
  "oblong",
  "triangular",
] as const;

/** Proportions. */
export const FACIAL_THIRDS = [
  "approximately_even",
  "upper_third_longer",
  "middle_third_longer",
  "lower_third_longer",
  "not_assessable",
] as const;

/** Symmetry. */
export const SYMMETRY_LEVELS = [
  "no_visible_asymmetry",
  "slight_asymmetry",
  "noticeable_asymmetry",
  "not_assessable",
] as const;

/** Eyes. */
export const EYE_SHAPES = [
  "almond",
  "round",
  "hooded",
  "monolid",
  "upturned",
  "downturned",
  "deep_set",
  "protruding",
  "not_visible",
] as const;

/** Eyes. */
export const CANTHAL_TILTS = ["upward", "neutral", "downward", "not_assessable"] as const;

/** Eyebrows. */
export const BROW_SHAPES = [
  "straight",
  "soft_arch",
  "high_arch",
  "rounded",
  "angular",
  "not_visible",
] as const;

/** Eyebrows. */
export const BROW_THICKNESSES = ["thin", "medium", "thick", "not_visible"] as const;

/** Nose. */
export const NOSE_SHAPES = [
  "straight",
  "convex_bridge",
  "concave_bridge",
  "narrow",
  "wide_base",
  "upturned_tip",
  "downturned_tip",
  "not_assessable",
] as const;

/** Lips. */
export const LIP_FULLNESSES = ["thin", "medium", "full", "not_visible"] as const;

/** Jawline. */
export const JAW_ANGLES = [
  "soft_rounded",
  "moderately_defined",
  "sharply_angular",
  "not_assessable",
] as const;

/** Chin. */
export const CHIN_SHAPES = [
  "rounded",
  "pointed",
  "square",
  "cleft",
  "receding",
  "projecting",
  "not_assessable",
] as const;

/** Cheekbones. */
export const CHEEKBONE_PROMINENCES = ["flat", "moderate", "prominent", "not_assessable"] as const;

/** Forehead. */
export const FOREHEAD_HEIGHTS = ["short", "medium", "tall", "obscured"] as const;

/** Skin. Evenness of tone, never the tone itself. See ADR-0003. */
export const SKIN_TONE_EVENNESS = ["even", "slightly_uneven", "uneven", "not_assessable"] as const;

/** Skin. */
export const SKIN_TEXTURES = [
  "smooth",
  "fine_texture",
  "visible_texture",
  "visible_blemishes",
  "not_assessable",
] as const;

/** Teeth. */
export const TEETH_VISIBILITIES = ["not_visible", "partially_visible", "fully_visible"] as const;

/** Teeth. */
export const TEETH_ALIGNMENTS = [
  "even",
  "slightly_irregular",
  "irregular",
  "not_assessable",
] as const;

/** Hair and hairline. */
export const HAIR_LENGTHS = [
  "none_or_shaved",
  "very_short",
  "short",
  "medium",
  "long",
  "obscured",
] as const;

/** Hair and hairline. Also read by the categorical Impressions (era, apparent profession). */
export const HAIR_STYLES = [
  "cropped",
  "straight",
  "wavy",
  "curly",
  "coiled",
  "tied_back",
  "braided",
  "updo",
  "obscured",
] as const;

/** Hair and hairline. */
export const HAIRLINE_POSITIONS = ["low", "average", "high", "receding", "obscured"] as const;

/** Hair and hairline. The Jev rubric for that Dimension names density, so it is observed. */
export const HAIR_DENSITIES = ["sparse", "medium", "dense", "obscured"] as const;

/** Ears. */
export const EAR_VISIBILITIES = ["not_visible", "one_visible", "both_visible"] as const;

/** Ears. The Jev rubric names how the ears sit against the head, so it is observed. */
export const EAR_PROTRUSIONS = ["close_set", "moderate", "protruding", "not_visible"] as const;

/* --- Rated Impressions (SPEC.md, "What gets rated") ------------------------------------- */

/** Style and grooming. */
export const FACIAL_HAIR = [
  "none",
  "stubble",
  "moustache",
  "short_beard",
  "full_beard",
  "goatee",
  "not_assessable",
] as const;

/** Style and grooming. */
export const MAKEUP_VISIBILITIES = [
  "none_visible",
  "minimal",
  "noticeable",
  "not_assessable",
] as const;

/** Style and grooming. */
export const EYEWEAR = ["none", "clear_glasses", "tinted_or_sunglasses"] as const;

/** Style and grooming, Hair and hairline (it explains an obscured hairline). */
export const HEADWEAR = ["none", "hat_or_cap", "hood", "headscarf", "other"] as const;

/** Style and grooming, and the categorical Impressions. A register of dress, never a
 * judgment of it. */
export const ATTIRE_REGISTERS = [
  "not_visible",
  "casual",
  "smart_casual",
  "formal",
  "athletic",
  "uniform",
] as const;

/** Approachability, Trustworthiness, Confidence, and Craft expression authenticity. */
export const EXPRESSIONS = [
  "neutral",
  "slight_smile",
  "closed_mouth_smile",
  "open_mouth_smile",
  "laughing",
  "pursed_lips",
  "raised_brows",
  "furrowed_brows",
  "not_assessable",
] as const;

/**
 * Craft expression authenticity, Approachability, Trustworthiness.
 *
 * The neutral anatomical fact behind "is this smile genuine?": whether the orbicularis oculi
 * has engaged, visible as creasing at the outer eye corners. Jev decides what it means.
 */
export const EYE_CREASE_STATES = ["present", "absent", "not_applicable"] as const;

/** Confidence, Main-character energy, and Craft angle. */
export const GAZE_DIRECTIONS = [
  "at_camera",
  "slightly_off_camera",
  "away",
  "upward",
  "downward",
  "obscured",
] as const;

/* --- Craft (SPEC.md, "What gets rated"; the only group that produces advice) ------------- */

export const LIGHTING_DIRECTIONS = [
  "frontal",
  "camera_left",
  "camera_right",
  "above",
  "below",
  "behind",
  "ambient_undirectional",
  "not_assessable",
] as const;

/**
 * Craft lighting.
 *
 * Named "character" rather than "quality": this field records what the light is doing, and a
 * field called `lightingQuality` reads as a verdict on the photograph. ADR-0001 applies to
 * field names as much as to values.
 */
export const LIGHT_CHARACTERS = [
  "soft_diffuse",
  "hard_directional",
  "flat_even",
  "dim",
  "high_contrast",
  "on_camera_flash",
  "mixed_colour",
] as const;

/** Craft angle, and Symmetry (a turned head produces apparent asymmetry). */
export const HEAD_POSES = ["frontal", "slight_turn", "three_quarter", "profile", "tilted"] as const;

/** Craft angle. */
export const CAMERA_HEIGHTS = ["above_eye_level", "eye_level", "below_eye_level"] as const;

/** Craft framing and Craft camera distance. */
export const FRAMINGS = [
  "tight_headshot",
  "head_and_shoulders",
  "upper_body",
  "wider_than_upper_body",
] as const;

/** Craft camera distance, and Skin (a soft Crop hides texture). */
export const SHARPNESS_LEVELS = ["sharp", "slightly_soft", "soft_or_blurred"] as const;

export const BACKGROUNDS = [
  "plain_solid",
  "blurred",
  "indoor_detailed",
  "outdoor_natural",
  "outdoor_urban",
  "not_visible",
] as const;

/** The one free-text field in the schema. Kept short on purpose. */
export const ASYMMETRY_NOTE_MAX_LENGTH = 80;

/* -------------------------------------------------------------------------------------- *
 * The Zod schema
 * -------------------------------------------------------------------------------------- */

/**
 * `strictObject` rather than `object`: an unexpected key is a failure, not something to be
 * silently stripped. It mirrors `additionalProperties: false` in the JSON Schema below, and
 * an unexpected key is exactly how an evaluative field would first appear.
 */
export const ObservationSchema = z.strictObject({
  /* Verdict inputs */
  mediaKind: z.enum(MEDIA_KINDS),
  faceCount: z.int().min(0).max(10),
  apparentAgeBracket: z.enum(AGE_BRACKETS),

  /* Proportions and symmetry */
  faceShape: z.enum(FACE_SHAPES),
  facialThirds: z.enum(FACIAL_THIRDS),
  facialSymmetry: z.enum(SYMMETRY_LEVELS),
  asymmetryNote: z.string().max(ASYMMETRY_NOTE_MAX_LENGTH).nullable(),

  /* Features */
  eyeShape: z.enum(EYE_SHAPES),
  canthalTilt: z.enum(CANTHAL_TILTS),
  browShape: z.enum(BROW_SHAPES),
  browThickness: z.enum(BROW_THICKNESSES),
  noseShape: z.enum(NOSE_SHAPES),
  lipFullness: z.enum(LIP_FULLNESSES),
  jawAngle: z.enum(JAW_ANGLES),
  chinShape: z.enum(CHIN_SHAPES),
  cheekboneProminence: z.enum(CHEEKBONE_PROMINENCES),
  foreheadHeight: z.enum(FOREHEAD_HEIGHTS),
  skinToneEvenness: z.enum(SKIN_TONE_EVENNESS),
  skinTexture: z.enum(SKIN_TEXTURES),
  teethVisibility: z.enum(TEETH_VISIBILITIES),
  teethAlignment: z.enum(TEETH_ALIGNMENTS),
  hairLength: z.enum(HAIR_LENGTHS),
  hairStyle: z.enum(HAIR_STYLES),
  hairlinePosition: z.enum(HAIRLINE_POSITIONS),
  hairDensity: z.enum(HAIR_DENSITIES),
  earVisibility: z.enum(EAR_VISIBILITIES),
  earProtrusion: z.enum(EAR_PROTRUSIONS),

  /* Rated Impression inputs */
  facialHair: z.enum(FACIAL_HAIR),
  visibleMakeup: z.enum(MAKEUP_VISIBILITIES),
  eyewear: z.enum(EYEWEAR),
  headwear: z.enum(HEADWEAR),
  attireRegister: z.enum(ATTIRE_REGISTERS),
  expression: z.enum(EXPRESSIONS),
  eyeCreaseWithSmile: z.enum(EYE_CREASE_STATES),
  gazeDirection: z.enum(GAZE_DIRECTIONS),

  /* Craft */
  lightingDirection: z.enum(LIGHTING_DIRECTIONS),
  lightingCharacter: z.enum(LIGHT_CHARACTERS),
  headPose: z.enum(HEAD_POSES),
  cameraHeight: z.enum(CAMERA_HEIGHTS),
  framing: z.enum(FRAMINGS),
  imageSharpness: z.enum(SHARPNESS_LEVELS),
  background: z.enum(BACKGROUNDS),
});

/** A neutral, factual description of a Crop. */
export type Observation = z.infer<typeof ObservationSchema>;

/* -------------------------------------------------------------------------------------- *
 * The JSON Schema for `guided_json`
 *
 * Built from the same vocabularies as the Zod schema above, so the constraint the model
 * decodes under and the validation the Worker applies cannot disagree.
 * -------------------------------------------------------------------------------------- */

interface JsonSchemaProperty {
  type: string | string[];
  enum?: string[];
  description?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
}

/**
 * Descriptions cost input tokens on every request, so only the fields whose names do not
 * carry their own meaning get one.
 */
const enumProperty = (values: readonly string[], description?: string): JsonSchemaProperty => ({
  type: "string",
  enum: [...values],
  ...(description === undefined ? {} : { description }),
});

const observationProperties: Record<keyof Observation, JsonSchemaProperty> = {
  mediaKind: enumProperty(MEDIA_KINDS, "What the image itself is, not what it depicts."),
  faceCount: {
    type: "integer",
    minimum: 0,
    maximum: 10,
    description: "How many human faces are wholly or partly visible. An animal counts as 0.",
  },
  apparentAgeBracket: enumProperty(
    AGE_BRACKETS,
    "The bracket the face appears to fall in. Report what is visible, do not err generously.",
  ),

  faceShape: enumProperty(FACE_SHAPES),
  facialThirds: enumProperty(
    FACIAL_THIRDS,
    "Relative height of hairline-to-brow, brow-to-nose-base, nose-base-to-chin.",
  ),
  facialSymmetry: enumProperty(
    SYMMETRY_LEVELS,
    "Discount asymmetry that a turned head or side lighting explains.",
  ),
  asymmetryNote: {
    type: ["string", "null"],
    maxLength: ASYMMETRY_NOTE_MAX_LENGTH,
    description:
      "One short anatomical clause naming where the asymmetry sits, or null. Example: 'left brow sits slightly higher'. No adjectives of quality.",
  },

  eyeShape: enumProperty(EYE_SHAPES),
  canthalTilt: enumProperty(CANTHAL_TILTS, "Direction of the line from inner to outer eye corner."),
  browShape: enumProperty(BROW_SHAPES),
  browThickness: enumProperty(BROW_THICKNESSES),
  noseShape: enumProperty(NOSE_SHAPES),
  lipFullness: enumProperty(LIP_FULLNESSES),
  jawAngle: enumProperty(JAW_ANGLES),
  chinShape: enumProperty(CHIN_SHAPES),
  cheekboneProminence: enumProperty(CHEEKBONE_PROMINENCES),
  foreheadHeight: enumProperty(FOREHEAD_HEIGHTS),
  skinToneEvenness: enumProperty(
    SKIN_TONE_EVENNESS,
    "How uniform the tone is across the face. Never report the tone, colour or any ancestry.",
  ),
  skinTexture: enumProperty(SKIN_TEXTURES),
  teethVisibility: enumProperty(TEETH_VISIBILITIES),
  teethAlignment: enumProperty(TEETH_ALIGNMENTS),
  hairLength: enumProperty(HAIR_LENGTHS),
  hairStyle: enumProperty(HAIR_STYLES),
  hairlinePosition: enumProperty(HAIRLINE_POSITIONS),
  hairDensity: enumProperty(HAIR_DENSITIES),
  earVisibility: enumProperty(EAR_VISIBILITIES),
  earProtrusion: enumProperty(EAR_PROTRUSIONS, "How far the ears stand out from the head."),

  facialHair: enumProperty(FACIAL_HAIR),
  visibleMakeup: enumProperty(MAKEUP_VISIBILITIES),
  eyewear: enumProperty(EYEWEAR),
  headwear: enumProperty(HEADWEAR),
  attireRegister: enumProperty(ATTIRE_REGISTERS, "The register of any visible clothing."),
  expression: enumProperty(EXPRESSIONS),
  eyeCreaseWithSmile: enumProperty(
    EYE_CREASE_STATES,
    "Creasing at the outer eye corners while smiling. 'not_applicable' when not smiling or not visible.",
  ),
  gazeDirection: enumProperty(GAZE_DIRECTIONS),

  lightingDirection: enumProperty(LIGHTING_DIRECTIONS, "Where the dominant light comes from."),
  lightingCharacter: enumProperty(LIGHT_CHARACTERS),
  headPose: enumProperty(HEAD_POSES),
  cameraHeight: enumProperty(CAMERA_HEIGHTS, "The lens height relative to the subject's eyes."),
  framing: enumProperty(FRAMINGS, "How much of the subject the frame includes."),
  imageSharpness: enumProperty(SHARPNESS_LEVELS),
  background: enumProperty(BACKGROUNDS),
};

/**
 * Handed to the vision model as `guided_json`.
 *
 * `required` is derived from the properties rather than written out, so a new field cannot
 * be added and left optional by accident. Every field is required: a missing field and a
 * hallucinated field are both easier to catch than a silently absent one.
 */
export const OBSERVATION_JSON_SCHEMA = {
  type: "object",
  properties: observationProperties,
  required: Object.keys(observationProperties),
  additionalProperties: false,
} as const satisfies {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties: false;
};

/** The field names of an Observation, in schema order. */
export const OBSERVATION_FIELDS = Object.keys(observationProperties) as (keyof Observation)[];
