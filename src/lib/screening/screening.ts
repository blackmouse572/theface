/**
 * Screening - the pure decision core.
 *
 * `SPEC.md`, "Layer 1 - Screening, on the device" and `CONTEXT.md`, "Screening": the checks
 * that run on a Visitor's own device, before any transmission. Screening confirms three
 * conditions, in this order:
 *
 *   1. The Selfie contains exactly one face.      (`TinyFaceDetector`)
 *   2. The face is large enough to read.          (a fraction of the frame)
 *   3. The subject does not appear to be a minor. (`AgeGenderNet`)
 *
 * This file holds the thresholds and the decision. It holds no model, no canvas and no DOM. It
 * is deliberately separate from `screening.client.ts` so that the rules can be read and tested
 * without a WebGL context or 600 KB of weights, and so that a route that only wants to render a
 * failure never drags TensorFlow.js anywhere near a bundle.
 *
 * The order is not cosmetic. `estimateApparentAge` is a callback, not a value, precisely so
 * that `AgeGenderNet` never runs on a Selfie that has already failed a cheaper check -
 * `SPEC.md`, "Why Screening and Verdict are ours to build" orders the three admission layers by
 * cost, and this is that ordering inside the cheapest one. `screening.test.ts` asserts the
 * callback is not invoked when the detections fail.
 */

import { screeningMessage, type ScreeningFailureReason, type ScreeningMessage } from "./messages";

export type { ScreeningFailureReason, ScreeningMessage };

/**
 * The face bounding box must cover at least this fraction of the total image area.
 *
 * `SPEC.md`, "Constants to calibrate after launch", lists "Screening face-area threshold" as
 * **not yet chosen**, to be settled by "Real Selfies at mobile framing". 0.04 is a starting
 * guess, not a measured value - recalibrate it against the observed false-reject rate before
 * anyone relies on it.
 *
 * Why 4%: `TinyFaceDetector`'s box is roughly brow-to-chin, so a face filling 4% of a 4:3
 * frame is about a fifth of the frame height - an arm's-length Selfie clears it comfortably,
 * a face in a group shot or a landscape does not. It is deliberately lenient. A false reject
 * here costs a Visitor, and every Screening failure must read as a photo-quality problem
 * (`messages.ts`), so the threshold should sit well below normal selfie framing rather than
 * near it.
 *
 * Note this is a *relative* test, so it says nothing about absolute resolution: a 200x200
 * image with a 40x40 face passes. That is intentional - a low-resolution Crop is the
 * Observation's and the Verdict's problem (`SPEC.md`, "Why Screening and Verdict are ours to
 * build"), and adding an absolute pixel floor here would add a second knob to calibrate for
 * very little gain.
 */
export const MIN_FACE_AREA_FRACTION = 0.04;

/**
 * The minimum apparent age, in years, that `AgeGenderNet` must estimate.
 *
 * **This is 25, not 18, and that is the whole point.** `SPEC.md`:
 *
 * > The age check is a conservative pre-filter, not a precise check. The threshold is
 * > approximately 25, not 18. TFJS age estimation has an error band of several years. A
 * > threshold of 18 would therefore fail in the critical range, because the model can estimate
 * > a 16-year-old as 19. A high threshold keeps an ambiguous Selfie on the device.
 *
 * The consequence is that Screening rejects adults, routinely. That is priced in: the failure
 * copy describes a photo-quality problem and never the person (`messages.ts`), and two further
 * layers - the Observation and the Verdict - catch what this one misses.
 *
 * `SPEC.md`, "Constants to calibrate after launch", settles this against "The observed false-
 * reject rate". Lower it only with data, and never below the low twenties.
 */
export const MIN_APPARENT_AGE = 25;

/** `TinyFaceDetector` input size. 416 is the library default and is ample for selfie framing. */
export const DETECTOR_INPUT_SIZE = 416;

/**
 * `TinyFaceDetector` score threshold. The library default. Lower values invent faces in
 * wallpaper and clothing, which would read to a Visitor as "more than one face".
 */
export const DETECTOR_SCORE_THRESHOLD = 0.5;

/** The parts of a `FaceDetection.box` this module needs. Structural, so a test can fake it. */
export interface BoxLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

export interface ScreeningFailure {
  readonly ok: false;
  readonly reason: ScreeningFailureReason;
  /** The only copy a Visitor may be shown for this failure. See `messages.ts`. */
  readonly message: ScreeningMessage;
}

/** The outcome of the two cheap checks: exactly one face, and it is big enough. */
export type DetectionOutcome =
  | { readonly ok: true; readonly box: BoxLike; readonly faceAreaFraction: number }
  | ScreeningFailure;

/** The outcome of the apparent-age pre-filter. */
export type ApparentAgeOutcome =
  | { readonly ok: true; readonly apparentAge: number }
  | ScreeningFailure;

/** What the pure core decides. `screening.client.ts` widens the pass with face-api objects. */
export type ScreeningDecision =
  | {
      readonly ok: true;
      readonly box: BoxLike;
      readonly faceAreaFraction: number;
      readonly apparentAge: number;
    }
  | ScreeningFailure;

/** Build a failure, with its copy already attached so no call site has to invent any. */
export function screeningFailure(reason: ScreeningFailureReason): ScreeningFailure {
  return { ok: false, reason, message: screeningMessage(reason) };
}

/**
 * The face box area as a fraction of the total image area.
 *
 * Returns 0 for a degenerate box or a degenerate frame rather than `NaN` or `Infinity`, so
 * that a broken decode fails the size check instead of slipping past it.
 */
export function faceAreaFraction(box: BoxLike, image: ImageDimensions): number {
  const imageArea = image.width * image.height;
  if (!Number.isFinite(imageArea) || imageArea <= 0) return 0;

  const boxArea = Math.max(0, box.width) * Math.max(0, box.height);
  if (!Number.isFinite(boxArea) || boxArea <= 0) return 0;

  return boxArea / imageArea;
}

/**
 * Checks 1 and 2: exactly one face, large enough to read.
 *
 * Zero faces and two-or-more faces are distinct failures because they are distinct problems
 * for the Visitor to fix, and neither reason is about the person.
 */
export function evaluateDetections(
  detections: readonly BoxLike[],
  image: ImageDimensions,
  minFaceAreaFraction: number = MIN_FACE_AREA_FRACTION,
): DetectionOutcome {
  if (detections.length === 0) return screeningFailure("no-face");
  if (detections.length > 1) return screeningFailure("multiple-faces");

  const box = detections[0];
  if (!box) return screeningFailure("no-face");

  const fraction = faceAreaFraction(box, image);
  if (fraction < minFaceAreaFraction) return screeningFailure("face-too-small");

  return { ok: true, box, faceAreaFraction: fraction };
}

/**
 * Check 3: the conservative apparent-age pre-filter.
 *
 * Written as `!(age >= threshold)` rather than `age < threshold` on purpose: a `NaN` age - a
 * model that ran but produced nothing usable - must fail closed, and `NaN < 25` is `false`.
 */
export function evaluateApparentAge(
  apparentAge: number,
  minApparentAge: number = MIN_APPARENT_AGE,
): ApparentAgeOutcome {
  if (!(Number.isFinite(apparentAge) && apparentAge >= minApparentAge)) {
    return screeningFailure("apparent-age-below-threshold");
  }
  return { ok: true, apparentAge };
}

export interface ScreeningEvaluation {
  /** One entry per face `TinyFaceDetector` found, in any order. */
  readonly detections: readonly BoxLike[];
  /** The natural dimensions of the Selfie the detector ran against. */
  readonly image: ImageDimensions;
  /**
   * Runs `AgeGenderNet`. Called at most once, and only after checks 1 and 2 have passed, so
   * that the age model never touches a Selfie that is already rejected.
   */
  readonly estimateApparentAge: () => Promise<number>;
  readonly minFaceAreaFraction?: number;
  readonly minApparentAge?: number;
}

/** Runs the three Screening checks in cost order and returns the first failure, or a pass. */
export async function evaluateScreening(input: ScreeningEvaluation): Promise<ScreeningDecision> {
  const detected = evaluateDetections(input.detections, input.image, input.minFaceAreaFraction);
  if (!detected.ok) return detected;

  const aged = evaluateApparentAge(await input.estimateApparentAge(), input.minApparentAge);
  if (!aged.ok) return aged;

  return {
    ok: true,
    box: detected.box,
    faceAreaFraction: detected.faceAreaFraction,
    apparentAge: aged.apparentAge,
  };
}
