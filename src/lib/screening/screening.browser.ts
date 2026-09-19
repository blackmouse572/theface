import type {
  Box,
  FaceDetection,
  FaceLandmarks68,
  TinyFaceDetectorOptions,
} from "@vladmandic/face-api";

import { loadScreeningModels, type FaceApiModule, assertBrowser } from "./models.browser";
import {
  DETECTOR_INPUT_SIZE,
  DETECTOR_LOW_CONFIDENCE_THRESHOLD,
  DETECTOR_SCORE_THRESHOLD,
  evaluateDetections,
  screeningFailure,
  type ScreeningFailure,
} from "./screening";

/**
 * Screening - the entry point, on the device.
 *
 * `CONTEXT.md`, "Screening": the checks that run on a Visitor's own device, **before any
 * transmission**. This module is the only thing standing between a Selfie and the network, and
 * the promise it keeps is the first one `PRIVACY.md` makes:
 *
 * > **If any of those checks fail, the photo is never transmitted anywhere.** It stays on your
 * > device and we never see it.
 *
 * So: nothing here uploads, posts, beacons or logs. The only network traffic anywhere under
 * `src/lib/screening/` is the same-origin fetch of our own model weights from `/models/`
 * (`models.browser.ts`). A caller may only transmit a Selfie-derived thing after
 * {@link runScreening} has returned `ok: true`, and even then it transmits the Crop
 * (`crop.browser.ts`), never the Selfie.
 *
 * The second promise this module keeps is the one about biometrics. `FaceRecognitionNet` is
 * never imported, never loaded and never called; see the long note in `models.browser.ts`.
 *
 * ## What runs, in what order
 *
 * `SPEC.md`, "Layer 1 - Screening, on the device":
 *
 *   1. `TinyFaceDetector` over the whole Selfie - how many faces?
 *   2. The face-area fraction - is the one face big enough to read?
 *   3. `FaceLandmark68TinyNet` over the one face that passed both - landmarks for the Crop.
 *
 * The detector runs twice on a pass - once to count, once inside the landmark chain, because
 * the fluent API has no way to resume from an already-computed detection - and once more, at a
 * far more permissive threshold, on a Selfie that step 1 rejected outright. That third pass
 * never admits anything; it only chooses which of two failure messages a Visitor sees. See
 * `DETECTOR_LOW_CONFIDENCE_THRESHOLD` in `screening.ts`.
 *
 * Client-only, marked twice over: the `.client.ts` suffix that TanStack Start's import
 * protection denies in the server environment, and the side-effect import above.
 */

/** What a Visitor hands us. `CONTEXT.md`, "Selfie": the image that a Visitor selects. */
export type ScreeningInput = File | Blob | HTMLImageElement;

/** A Selfie that passed both checks. */
export interface ScreenedFace {
  readonly ok: true;
  /** The single detected face, in Selfie coordinates. */
  readonly detection: FaceDetection;
  /** 68 landmarks, in Selfie coordinates. For alignment only - see `crop.ts`. */
  readonly landmarks: FaceLandmarks68;
  /** face-api's own aligned box. Informational; `crop.ts` computes its own framing. */
  readonly alignedBox: Box;
  /** The face box area as a fraction of the Selfie's area. */
  readonly faceAreaFraction: number;
  /**
   * The decoded Selfie, ready to hand to `createCrop`. Held in memory only; this is the last
   * point at which the full Selfie exists anywhere, and it never leaves the device.
   */
  readonly source: HTMLImageElement;
}

/** Pass, or a typed reason with the copy already attached. */
export type ScreeningResult = ScreenedFace | ScreeningFailure;

function analyseSingleFace(
  faceapi: FaceApiModule,
  source: HTMLImageElement,
  options: TinyFaceDetectorOptions,
) {
  return faceapi
    .detectSingleFace(source, options)
    .withFaceLandmarks(true) // true = FaceLandmark68TinyNet, per SPEC.md "Layer 1"
    .run();
}

/**
 * A second, permissive detection pass used only to choose which failure message a Visitor
 * sees - see `DETECTOR_LOW_CONFIDENCE_THRESHOLD` in `screening.ts`. Never load-bearing: an
 * error here falls back to the plain "no face" message rather than blocking Screening.
 */
async function sawSomethingFaint(
  faceapi: FaceApiModule,
  source: HTMLImageElement,
): Promise<boolean> {
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: DETECTOR_INPUT_SIZE,
    scoreThreshold: DETECTOR_LOW_CONFIDENCE_THRESHOLD,
  });
  try {
    const detections = await faceapi.detectAllFaces(source, options).run();
    return detections.length > 0;
  } catch {
    return false;
  }
}

async function decodeSelfie(
  faceapi: FaceApiModule,
  input: ScreeningInput,
): Promise<HTMLImageElement | null> {
  try {
    const image = input instanceof HTMLImageElement ? input : await faceapi.bufferToImage(input);
    if (!image.complete && typeof image.decode === "function") await image.decode();
    return image;
  } catch {
    return null;
  }
}

/**
 * Runs Screening against a Selfie, entirely on the device.
 *
 * Never throws for an ordinary failure: every outcome a Visitor can cause comes back as a typed
 * {@link ScreeningFailure} carrying non-accusatory copy. A thrown error means a programming
 * mistake, not a bad Selfie.
 */
export async function runScreening(input: ScreeningInput): Promise<ScreeningResult> {
  assertBrowser("runScreening");
  let faceapi: FaceApiModule;
  try {
    faceapi = await loadScreeningModels();
  } catch {
    return screeningFailure("models-unavailable");
  }

  const source = await decodeSelfie(faceapi, input);
  if (!source) return screeningFailure("unreadable-image");

  const image = {
    width: source.naturalWidth || source.width,
    height: source.naturalHeight || source.height,
  };
  if (image.width <= 0 || image.height <= 0) return screeningFailure("unreadable-image");

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: DETECTOR_INPUT_SIZE,
    scoreThreshold: DETECTOR_SCORE_THRESHOLD,
  });

  // 1. How many faces? Cheapest question, asked first.
  let detections: FaceDetection[];
  try {
    detections = await faceapi.detectAllFaces(source, options).run();
  } catch {
    return screeningFailure("unreadable-image");
  }

  if (detections.length === 0 && (await sawSomethingFaint(faceapi, source))) {
    return screeningFailure("low-confidence-face");
  }

  // 2 lives in the pure core.
  const decision = evaluateDetections(
    detections.map((detection) => detection.box),
    image,
  );
  if (!decision.ok) return decision;

  // 3. Only reached once 1 and 2 have passed.
  const face = await analyseSingleFace(faceapi, source, options).catch(() => null);
  if (!face) return screeningFailure("unreadable-image");

  return {
    ok: true,
    detection: face.detection,
    landmarks: face.landmarks,
    alignedBox: face.alignedRect.box,
    faceAreaFraction: decision.faceAreaFraction,
    source,
  };
}

export {
  DETECTOR_INPUT_SIZE,
  DETECTOR_LOW_CONFIDENCE_THRESHOLD,
  DETECTOR_SCORE_THRESHOLD,
  MIN_FACE_AREA_FRACTION,
  type ScreeningFailure,
  type ScreeningFailureReason,
} from "./screening";
export { SCREENING_REASSURANCE, screeningMessage, type ScreeningMessage } from "./messages";
