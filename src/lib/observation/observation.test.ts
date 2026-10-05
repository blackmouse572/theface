import { describe, expect, it, vi } from "vitest";

import {
  buildObservationRequest,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  isDailyLimitError,
  observe,
  OBSERVATION_MODEL,
  OBSERVATION_SEED,
  ObservationError,
  parseObservation,
} from "./observe";
import type { VisionBinding, VisionContentPart, VisionRequest } from "./observe";
import {
  BANNED_ADJECTIVE_TYPES,
  NO_EVALUATION_RULE,
  OBSERVATION_SYSTEM_PROMPT,
  OBSERVATION_USER_PROMPT,
} from "./prompt";
import { OBSERVATION_FIELDS, OBSERVATION_JSON_SCHEMA, ObservationSchema } from "./schema";
import type { Observation } from "./schema";

/* -------------------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------------------- */

/** A complete, valid Observation. Every value is a neutral fact. */
function validObservation(): Observation {
  return {
    mediaKind: "photograph",
    faceCount: 1,
    apparentAgeBracket: "25_34",

    faceShape: "oval",
    facialThirds: "approximately_even",
    facialSymmetry: "slight_asymmetry",
    asymmetryNote: "left brow sits slightly higher",

    eyeShape: "almond",
    canthalTilt: "neutral",
    browShape: "soft_arch",
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
    hairLength: "short",
    hairStyle: "straight",
    hairlinePosition: "average",
    hairDensity: "dense",
    earVisibility: "one_visible",
    earProtrusion: "close_set",

    facialHair: "stubble",
    visibleMakeup: "none_visible",
    eyewear: "none",
    headwear: "none",
    attireRegister: "casual",
    expression: "closed_mouth_smile",
    eyeCreaseWithSmile: "present",
    gazeDirection: "at_camera",

    lightingDirection: "camera_left",
    lightingCharacter: "soft_diffuse",
    headPose: "slight_turn",
    cameraHeight: "eye_level",
    framing: "head_and_shoulders",
    imageSharpness: "sharp",
    background: "blurred",
  };
}

/** A 1x1 JPEG is enough: nothing here decodes the Crop. */
const CROP_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==";

/**
 * A stub Ai binding that records what it received.
 *
 * The stub's `input` is typed as the exact {@link VisionRequest} so the assertions below can
 * read `max_tokens` and the content parts without casting. A narrower stub still satisfies
 * `VisionBinding`, whose own `input` is widened for the benefit of a real `env.AI`.
 */
function stubAi(response: unknown) {
  const run = vi.fn(
    async (_model: typeof OBSERVATION_MODEL, _input: VisionRequest): Promise<unknown> => response,
  );
  const ai: VisionBinding = { run };
  return { ai, run };
}

function contentPartsOf(input: VisionRequest): VisionContentPart[] {
  const user = input.messages.find((message) => message.role === "user");
  expect(Array.isArray(user?.content)).toBe(true);
  return user?.content as VisionContentPart[];
}

/* -------------------------------------------------------------------------------------- *
 * The schema
 * -------------------------------------------------------------------------------------- */

describe("ObservationSchema", () => {
  it("accepts a complete Observation of neutral facts", () => {
    const result = ObservationSchema.safeParse(validObservation());
    expect(result.success).toBe(true);
  });

  it("accepts a null asymmetryNote", () => {
    const result = ObservationSchema.safeParse({ ...validObservation(), asymmetryNote: null });
    expect(result.success).toBe(true);
  });

  it("rejects an evaluative value in place of an observed one", () => {
    // ADR-0001: "almond" is an Observation, "striking" is a judgment.
    const result = ObservationSchema.safeParse({ ...validObservation(), eyeShape: "striking" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["eyeShape"]);
  });

  it("rejects an added field that carries a quality judgment", () => {
    // The schema is strict so that an evaluative field cannot be smuggled in and silently
    // stripped. It has to fail loudly.
    const result = ObservationSchema.safeParse({
      ...validObservation(),
      attractiveness: 8,
      overallImpression: "very handsome",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an Observation with a missing field", () => {
    const { skinTexture: _omitted, ...incomplete } = validObservation();
    const result = ObservationSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["skinTexture"]);
  });

  it("rejects a faceCount that is not a whole number", () => {
    const result = ObservationSchema.safeParse({ ...validObservation(), faceCount: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects an asymmetryNote long enough to hold an opinion", () => {
    const result = ObservationSchema.safeParse({
      ...validObservation(),
      asymmetryNote: "x".repeat(200),
    });
    expect(result.success).toBe(false);
  });

  it("has no field whose name invites a judgment", () => {
    const judgmental = /rating|score|quality|attractive|beaut|appeal|impression|grade|rank/i;
    const offenders = OBSERVATION_FIELDS.filter((field) => judgmental.test(field));
    expect(offenders).toEqual([]);
  });
});

/* -------------------------------------------------------------------------------------- *
 * The schema and the guided_json schema agree
 * -------------------------------------------------------------------------------------- */

describe("OBSERVATION_JSON_SCHEMA", () => {
  it("constrains the model to exactly the fields the Zod schema validates", () => {
    expect(Object.keys(OBSERVATION_JSON_SCHEMA.properties).sort()).toEqual(
      Object.keys(validObservation()).sort(),
    );
    expect([...OBSERVATION_JSON_SCHEMA.required].sort()).toEqual(
      Object.keys(validObservation()).sort(),
    );
    expect(OBSERVATION_JSON_SCHEMA.additionalProperties).toBe(false);
  });

  it("offers the model no enum value that the Zod schema would then reject", () => {
    const base = validObservation();

    for (const [field, property] of Object.entries(OBSERVATION_JSON_SCHEMA.properties)) {
      if (property.enum === undefined) continue;

      for (const value of property.enum) {
        const result = ObservationSchema.safeParse({ ...base, [field]: value });
        expect(result.success, `${field} = ${value} was rejected by ObservationSchema`).toBe(true);
      }
    }
  });

  it("offers at least one enum value per field", () => {
    for (const [field, property] of Object.entries(OBSERVATION_JSON_SCHEMA.properties)) {
      if (field === "faceCount" || field === "asymmetryNote") continue;
      expect(property.enum?.length ?? 0, `${field} has no enum`).toBeGreaterThan(1);
    }
  });
});

/* -------------------------------------------------------------------------------------- *
 * The prompt
 * -------------------------------------------------------------------------------------- */

describe("the Observation prompt", () => {
  it("carries the no-evaluation instruction", () => {
    expect(OBSERVATION_SYSTEM_PROMPT).toContain(NO_EVALUATION_RULE);
    expect(NO_EVALUATION_RULE).toMatch(/never evaluate/i);
  });

  it("lists the banned adjective types", () => {
    for (const kind of BANNED_ADJECTIVE_TYPES) {
      expect(OBSERVATION_SYSTEM_PROMPT).toContain(kind);
    }
    expect(BANNED_ADJECTIVE_TYPES.length).toBeGreaterThan(3);
  });

  it("shows the ADR-0001 contrast between an observation and a judgment", () => {
    expect(OBSERVATION_SYSTEM_PROMPT).toContain("almond eye shape");
    expect(OBSERVATION_SYSTEM_PROMPT).toContain("striking eyes");
    expect(OBSERVATION_SYSTEM_PROMPT).toMatch(/incorrect/i);
  });

  it("forbids inferring ethnicity or skin colour", () => {
    expect(OBSERVATION_SYSTEM_PROMPT).toMatch(/never state or infer ethnicity/i);
    expect(OBSERVATION_SYSTEM_PROMPT).toMatch(/skin colour/i);
  });

  it("tells the model to say so rather than guess when a feature is not visible", () => {
    expect(OBSERVATION_SYSTEM_PROMPT).toMatch(/never guess/i);
  });

  it("keeps the per-request user text short, since the rules ride in the system prompt", () => {
    expect(OBSERVATION_USER_PROMPT.length).toBeLessThan(200);
    expect(OBSERVATION_USER_PROMPT).toMatch(/do not evaluate/i);
  });
});

/* -------------------------------------------------------------------------------------- *
 * The Workers AI call
 * -------------------------------------------------------------------------------------- */

describe("observe", () => {
  it("calls the benchmarked vision model", async () => {
    const { ai, run } = stubAi({ response: JSON.stringify(validObservation()) });

    await observe(ai, CROP_BASE64);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe("@cf/mistralai/mistral-small-3.1-24b-instruct");
    expect(OBSERVATION_MODEL).toBe("@cf/mistralai/mistral-small-3.1-24b-instruct");
  });

  it("sets max_tokens explicitly, because the API default of 256 truncates an Observation", async () => {
    const { ai, run } = stubAi({ response: JSON.stringify(validObservation()) });

    await observe(ai, CROP_BASE64);

    const input = run.mock.calls[0]?.[1];
    expect(input?.max_tokens).toBe(DEFAULT_MAX_TOKENS);
    expect(input?.max_tokens).toBeGreaterThan(256);
  });

  it("sends the fixed seed with every call, so a repeat of one Crop decodes the same way", async () => {
    const { ai, run } = stubAi({ response: JSON.stringify(validObservation()) });

    await observe(ai, CROP_BASE64);

    expect(run.mock.calls[0]?.[1].seed).toBe(42);
    expect(OBSERVATION_SEED).toBe(42);
    expect(run.mock.calls[0]?.[1].temperature).toBe(0);
  });

  it("honours a caller's max_tokens", async () => {
    const { ai, run } = stubAi({ response: JSON.stringify(validObservation()) });

    await observe(ai, CROP_BASE64, { maxTokens: 1500, temperature: 0 });

    expect(run.mock.calls[0]?.[1].max_tokens).toBe(1500);
    expect(run.mock.calls[0]?.[1].temperature).toBe(0);
  });

  it("passes the Crop as an image_url content part, not the deprecated top-level image", async () => {
    const { ai, run } = stubAi({ response: JSON.stringify(validObservation()) });

    await observe(ai, CROP_BASE64);

    const input = run.mock.calls[0]?.[1];
    expect(input).toBeDefined();
    expect(input).not.toHaveProperty("image");

    const parts = contentPartsOf(input!);
    expect(parts).toEqual([
      { type: "text", text: OBSERVATION_USER_PROMPT },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${CROP_BASE64}` } },
    ]);
  });

  it("passes a Crop that already carries a data URL through unchanged", async () => {
    const dataUrl = `data:image/png;base64,${CROP_BASE64}`;
    const { ai, run } = stubAi({ response: JSON.stringify(validObservation()) });

    await observe(ai, dataUrl);

    const parts = contentPartsOf(run.mock.calls[0]![1]);
    expect(parts[1]).toEqual({ type: "image_url", image_url: { url: dataUrl } });
  });

  it("sends the system prompt and constrains decoding with response_format", async () => {
    const { ai, run } = stubAi({ response: JSON.stringify(validObservation()) });

    await observe(ai, CROP_BASE64);

    const input = run.mock.calls[0]?.[1];
    expect(input?.messages[0]).toEqual({ role: "system", content: OBSERVATION_SYSTEM_PROMPT });
    expect(input?.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "observation", schema: OBSERVATION_JSON_SCHEMA },
    });
    // Mistral rejects `guided_json` outright, returning every field missing.
    expect(input).not.toHaveProperty("guided_json");
  });

  it("returns the validated Observation", async () => {
    const expected = validObservation();
    const { ai } = stubAi({ response: JSON.stringify(expected) });

    await expect(observe(ai, CROP_BASE64)).resolves.toEqual(expected);
  });

  it("accepts a response that arrives already parsed", async () => {
    const expected = validObservation();
    const { ai } = stubAi({ response: expected });

    await expect(observe(ai, CROP_BASE64)).resolves.toEqual(expected);
  });

  it("refuses an empty Crop before spending a call", async () => {
    const { ai, run } = stubAi({ response: "{}" });

    await expect(observe(ai, "   ")).rejects.toMatchObject({ failure: "invalid_crop" });
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses a Crop that is not a supported image data URL", async () => {
    const { ai, run } = stubAi({ response: "{}" });

    await expect(observe(ai, "data:application/pdf;base64,AAAA")).rejects.toBeInstanceOf(
      ObservationError,
    );
    expect(run).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------------------- *
 * Failure
 * -------------------------------------------------------------------------------------- */

describe("parseObservation", () => {
  it("names truncation when the JSON does not parse, because that is what max_tokens does", () => {
    const truncated = JSON.stringify(validObservation()).slice(0, 120);

    try {
      parseObservation({ response: truncated }, 256);
      expect.unreachable("a truncated Observation must not validate");
    } catch (error) {
      expect(error).toBeInstanceOf(ObservationError);
      expect((error as ObservationError).failure).toBe("malformed_json");
      expect((error as ObservationError).message).toMatch(/max_tokens/);
    }
  });

  it("reports the offending fields when the JSON is not an Observation", () => {
    const wrong = { ...validObservation(), eyeShape: "gorgeous" };

    try {
      parseObservation({ response: JSON.stringify(wrong) });
      expect.unreachable("an Observation with an invented enum value must not validate");
    } catch (error) {
      expect((error as ObservationError).failure).toBe("schema_mismatch");
      expect((error as ObservationError).message).toContain("eyeShape");
    }
  });

  it("rejects a response with no usable payload", () => {
    expect(() => parseObservation({ usage: {} })).toThrowError(ObservationError);
    expect(() => parseObservation({ response: "" })).toThrowError(/empty/i);
  });
});

/* -------------------------------------------------------------------------------------- *
 * The request builder
 * -------------------------------------------------------------------------------------- */

describe("the daily limit", () => {
  it("recognises Workers AI's exhausted free allowance", () => {
    for (const message of [
      "4006: you have used up your daily free allocation of 10,000 neurons",
      "AiError: 4006: ...",
      "You have used up your daily free allocation",
    ]) {
      expect(isDailyLimitError(new Error(message)), message).toBe(true);
    }
  });

  it("does not mistake other failures for it", () => {
    for (const message of ["fetch failed", "5xx from upstream", "model returned 40060 tokens"]) {
      expect(isDailyLimitError(new Error(message)), message).toBe(false);
    }
  });

  it("surfaces it from observe as its own failure, not a generic error", async () => {
    const run = vi.fn(async () => {
      throw new Error("4006: you have used up your daily free allocation of 10,000 neurons");
    });

    await expect(observe({ run }, CROP_BASE64)).rejects.toMatchObject({
      name: "ObservationError",
      failure: "daily_limit",
    });
  });

  it("lets any other binding error through untouched", async () => {
    const boom = new Error("network down");
    const run = vi.fn(async () => {
      throw boom;
    });

    await expect(observe({ run }, CROP_BASE64)).rejects.toBe(boom);
  });
});

describe("buildObservationRequest", () => {
  it("switches sampling off and pins the seed, to narrow the spread between repeats", () => {
    const request = buildObservationRequest(CROP_BASE64);

    expect(DEFAULT_TEMPERATURE).toBe(0);
    expect(request.temperature).toBe(0);
    expect(request.seed).toBe(42);
    expect(OBSERVATION_SEED).toBe(42);
  });

  it("builds the same request the call sends, without needing a binding", () => {
    const request = buildObservationRequest(CROP_BASE64);

    expect(request.max_tokens).toBe(DEFAULT_MAX_TOKENS);
    expect(request.messages).toHaveLength(2);
    expect(request.response_format.json_schema.schema).toBe(OBSERVATION_JSON_SCHEMA);
  });
});
