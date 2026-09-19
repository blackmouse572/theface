/**
 * Screening - the pure decision core.
 *
 * `SPEC.md`, "Layer 1 - Screening, on the device" and `CONTEXT.md`, "Screening": the checks
 * that run on a Visitor's own device, before any transmission. Screening confirms two
 * conditions:
 *
 *   1. The Selfie contains exactly one face.      (`TinyFaceDetector`)
 *   2. The face is large enough to read.          (a fraction of the frame)
 *
 * This file holds the thresholds and the decision. It holds no model, no canvas and no DOM. It
 * is deliberately separate from `screening.browser.ts` so that the rules can be read and tested
 * without a WebGL context or 600 KB of weights, and so that a route that only wants to render a
 * failure never drags TensorFlow.js anywhere near a bundle.
 *
 * There used to be a third check here, an apparent-age pre-filter via `AgeGenderNet`. It was
 * removed: a minor is still caught, just one layer up, by the Verdict's `apparentMinor` check
 * against the server-side Observation (`jev/overall.ts`). That remains the only age gate.
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

/** `TinyFaceDetector` input size. 416 is the library default and is ample for selfie framing. */
export const DETECTOR_INPUT_SIZE = 416;

/**
 * `TinyFaceDetector` score threshold. The library default. Lower values invent faces in
 * wallpaper and clothing, which would read to a Visitor as "more than one face".
 */
export const DETECTOR_SCORE_THRESHOLD = 0.5;

/**
 * A second, far more permissive `TinyFaceDetector` pass, run only after the real pass at
 * {@link DETECTOR_SCORE_THRESHOLD} finds nothing at all. It never admits a Selfie - it only
 * decides which of two failure messages a Visitor sees: a confident "no face here" versus
 * "something faint was there", which points a Visitor at a different fix (more even light,
 * face the camera) than a genuinely empty frame does. Untested placeholder value; calibrate
 * against the observed split between the two messages, same as the other thresholds here.
 */
export const DETECTOR_LOW_CONFIDENCE_THRESHOLD = 0.1;

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

/** What Screening's two checks decide. `screening.browser.ts` widens a pass with face-api objects. */
export type DetectionOutcome =
  | { readonly ok: true; readonly box: BoxLike; readonly faceAreaFraction: number }
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
 * Screening's two checks: exactly one face, large enough to read.
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
