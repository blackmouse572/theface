import "@tanstack/react-start/client-only";
import type {
  Box,
  FaceDetection,
  FaceLandmarks68,
  TinyFaceDetectorOptions,
} from "@vladmandic/face-api";

import { loadScreeningModels, type FaceApiModule } from "./models.client";
import {
  DETECTOR_INPUT_SIZE,
  DETECTOR_SCORE_THRESHOLD,
  evaluateScreening,
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
 * (`models.client.ts`). A caller may only transmit a Selfie-derived thing after
 * {@link runScreening} has returned `ok: true`, and even then it transmits the Crop
 * (`crop.client.ts`), never the Selfie.
 *
 * The second promise this module keeps is the one about biometrics. `FaceRecognitionNet` is
 * never imported, never loaded and never called; see the long note in `models.client.ts`.
 *
 * ## What runs, in what order
 *
 * `SPEC.md`, "Layer 1 - Screening, on the device", and "Why Screening and Verdict are ours to
 * build", which orders the admission layers by cost. Inside Screening the same logic applies:
 *
 *   1. `TinyFaceDetector` over the whole Selfie - how many faces?
 *   2. The face-area fraction - is the one face big enough to read?
 *   3. `FaceLandmark68TinyNet` + `AgeGenderNet` over the aligned face - apparent age >= ~25?
 *
 * Step 3 costs roughly as much as steps 1 and 2 together, so it runs only if they pass. That is
 * why `evaluateScreening` in `screening.ts` takes `estimateApparentAge` as a callback: the
 * ordering is a property of the pure core and is tested there, not an accident of this file.
 *
 * The detector does run twice - once to count, once inside the landmark-and-age chain. That is
 * a deliberate trade. `withAgeAndGender()` after `withFaceLandmarks()` estimates age from the
 * *aligned* face rather than the raw box, which is the accurate path, and the fluent API has no
 * way to resume from an already-computed detection. `TinyFaceDetector` is the cheap model of
 * the three; paying for it twice buys both the early exit and the better age estimate.
 *
 * Client-only, marked twice over: the `.client.ts` suffix that TanStack Start's import
 * protection denies in the server environment, and the side-effect import above.
 */

/** What a Visitor hands us. `CONTEXT.md`, "Selfie": the image that a Visitor selects. */
export type ScreeningInput = File | Blob | HTMLImageElement;

/** A Selfie that passed all three checks. */
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
   * The apparent age `AgeGenderNet` estimated, in years.
   *
   * Do not display this and do not send it anywhere. It is an unreliable number with an error
   * band of several years (`SPEC.md`), it is here so the value behind the decision can be
   * logged locally while calibrating `MIN_APPARENT_AGE`, and showing it to a Visitor would turn
   * a photo-quality message into exactly the accusation `messages.ts` exists to prevent.
   */
  readonly apparentAge: number;
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
    .withAgeAndGender()
    .run();
}

type FaceAnalysis = NonNullable<Awaited<ReturnType<typeof analyseSingleFace>>>;

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

  // 2 and 3 live in the pure core. `takeAnalysis` exists because the landmark-and-age chain
  // produces both the number the core needs and the landmarks the Crop needs, and reading it
  // back through a call keeps the types honest across the callback boundary.
  let faceAnalysis: FaceAnalysis | null = null;
  const takeAnalysis = (): FaceAnalysis | null => faceAnalysis;

  const decision = await evaluateScreening({
    detections: detections.map((detection) => detection.box),
    image,
    // 3. Only reached when 1 and 2 have passed, so AgeGenderNet never sees a rejected Selfie.
    estimateApparentAge: async () => {
      try {
        faceAnalysis = (await analyseSingleFace(faceapi, source, options)) ?? null;
      } catch {
        faceAnalysis = null;
      }
      return takeAnalysis()?.age ?? Number.NaN;
    },
  });

  const face = takeAnalysis();

  // A model that fell over is our problem, not an apparent-age failure. Both render the same
  // words (`messages.ts`), but the reason a caller sees should still be the true one.
  if (!face) {
    if (decision.ok || decision.reason === "apparent-age-below-threshold") {
      return screeningFailure("unreadable-image");
    }
    return decision;
  }
  if (!decision.ok) return decision;

  return {
    ok: true,
    detection: face.detection,
    landmarks: face.landmarks,
    alignedBox: face.alignedRect.box,
    faceAreaFraction: decision.faceAreaFraction,
    apparentAge: decision.apparentAge,
    source,
  };
}

export {
  DETECTOR_INPUT_SIZE,
  DETECTOR_SCORE_THRESHOLD,
  MIN_APPARENT_AGE,
  MIN_FACE_AREA_FRACTION,
  type ScreeningFailure,
  type ScreeningFailureReason,
} from "./screening";
export { SCREENING_REASSURANCE, screeningMessage, type ScreeningMessage } from "./messages";
