import type * as FaceApi from "@vladmandic/face-api";

/**
 * Screening - lazy, self-hosted model loading.
 *
 * `SPEC.md`, "Stack": `@vladmandic/face-api` (TFJS), self-hosted, "~490 KB base, lazy-loaded".
 * And the boundary rule in the same section:
 *
 * > face-api and TFJS are the opposite: client-only and lazy-loaded. They must never enter the
 * > SSR bundle.
 *
 * Three things enforce that here:
 *
 *  1. The `.client.ts` suffix. TanStack Start's import protection denies `**\/*.client.*` in the
 *     server environment by default, so an accidental import from a loader or a server function
 *     is a build error rather than a runtime surprise on Workers.
 *  2. The `@tanstack/react-start/client-only` side-effect import above, which marks the module
 *     explicitly in case the file is ever renamed.
 *  3. `import("@vladmandic/face-api")` is dynamic and lives inside a function. face-api is never
 *     evaluated at module scope, so importing this file costs nothing until Screening runs -
 *     `SPEC.md`: "It loads only when the Visitor reaches the upload step."
 *
 * ## `FaceRecognitionNet` is forbidden
 *
 * face-api ships a fourth model, `FaceRecognitionNet`, and this module must never load it.
 * `SPEC.md`, "Layer 1":
 *
 * > **`FaceRecognitionNet` is available but forbidden.** Its descriptors are biometric
 * > templates and carry exposure well beyond a stored photograph. TheFace never generates or
 * > stores them.
 *
 * `PRIVACY.md`, "What we never store", makes the same promise to Visitors in as many words:
 * "Face recognition data. The software we use can compute a mathematical face template of the
 * kind used to identify a person across different photos. **We do not generate or store
 * these.** We use face detection only to find and frame the face."
 *
 * A descriptor is a 128-float vector that matches one person across unrelated photographs. It
 * is the thing that turns a face image into an identifier and pulls the project squarely into
 * BIPA, CUBI and GDPR Article 9 (`SPEC.md`, "Open legal and vendor risks"). Screening needs
 * none of it: a count, a size, and landmarks for framing.
 *
 * Concretely: never add `faceRecognitionNet` to {@link loadScreeningModels}, never call
 * `.withFaceDescriptor()` / `.withFaceDescriptors()`, never construct a `FaceMatcher`, and
 * never place `face_recognition_model-*` in `public/models/`. Without the weights on disk the
 * calls cannot succeed, which is a second line of defence worth keeping.
 *
 * ## Network access
 *
 * The only requests this module - or anything else under `src/lib/screening/` - may make are
 * the same-origin fetches for its own weights under {@link MODEL_URL}. The weights are
 * self-hosted for that reason: a CDN would be a third party watching Visitors reach the upload
 * step, and `PRIVACY.md`, "Who else sees your data", lists no such party.
 */

/** The face-api module, as imported dynamically. */
export type FaceApiModule = typeof FaceApi;

/**
 * Where the weights are served from. A path under the site's own origin, resolved against
 * `public/`. Never a CDN - see "Network access" above.
 */
export const MODEL_URL = "/models";

/**
 * The exact files that must exist in `public/models/`.
 *
 * Fetch them from the face-api weights directory
 * (https://github.com/vladmandic/face-api/tree/master/model). Deliberately absent:
 * `face_recognition_model-*`, `ssd_mobilenetv1_model-*`, `face_landmark_68_model-*` (the full,
 * non-tiny landmark net), `face_expression_model-*`, and `age_gender_model-*` - Screening no
 * longer runs an apparent-age check (a minor is caught server-side, by the Verdict, instead),
 * so nothing here needs it. Screening uses none of them, and the first is banned outright.
 */
export const SCREENING_MODEL_FILES = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
  "face_landmark_68_tiny_model-weights_manifest.json",
  "face_landmark_68_tiny_model.bin",
] as const;

let faceApiPromise: Promise<FaceApiModule> | null = null;
let screeningModelsPromise: Promise<FaceApiModule> | null = null;

/**
 * These modules were once named `*.client.ts` and carried the
 * `@tanstack/react-start/client-only` marker. Both were removed: Import Protection denies
 * any reference to a `.client.` file from the server graph, including a DYNAMIC import
 * inside an event handler, which is exactly how Screening is loaded. The upload card must
 * render on the server, so it cannot sit behind `<ClientOnly>`.
 *
 * This runtime guard replaces that static one. It fires the moment anything tries to run
 * Screening on a server, which is the case the marker actually protected against.
 */
export function assertBrowser(what = "Screening"): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error(`${what} is browser-only: face-api and TFJS must never run in the SSR bundle.`);
  }
}

/**
 * Imports face-api itself, once. Does not load any weights.
 *
 * Useful on its own for warming the bundle chunk - call it when the Visitor opens the upload
 * step, before they have chosen a Selfie.
 */
export function loadFaceApi(): Promise<FaceApiModule> {
  assertBrowser();
  faceApiPromise ??= import("@vladmandic/face-api");
  return faceApiPromise;
}

/**
 * Imports face-api and loads exactly the two Screening models, once.
 *
 * `TinyFaceDetector` performs Screening, `FaceLandmark68TinyNet` aligns the Crop -
 * `SPEC.md`, "Layer 1". Nothing else.
 *
 * Concurrent callers share one in-flight promise. A failure clears the cache so the next
 * attempt retries rather than replaying the rejection forever; Screening reports it as
 * `"models-unavailable"`, which `messages.ts` renders as our problem, not the Visitor's.
 */
export function loadScreeningModels(): Promise<FaceApiModule> {
  assertBrowser();

  screeningModelsPromise ??= (async () => {
    const faceapi = await loadFaceApi();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      // Never faceRecognitionNet. See "FaceRecognitionNet is forbidden" above.
    ]);
    return faceapi;
  })().catch((error: unknown) => {
    screeningModelsPromise = null;
    throw error;
  });

  return screeningModelsPromise;
}

/** Whether both Screening models are already in memory. */
export function areScreeningModelsLoaded(faceapi: FaceApiModule): boolean {
  return faceapi.nets.tinyFaceDetector.isLoaded && faceapi.nets.faceLandmark68TinyNet.isLoaded;
}

/**
 * Frees the model tensors and forgets the cached load.
 *
 * Worth calling once a Visitor has their Ratings: the weights are a few hundred kilobytes of
 * GPU memory that nothing needs again unless they submit a second Selfie.
 */
export async function disposeScreeningModels(): Promise<void> {
  const pending = screeningModelsPromise;
  screeningModelsPromise = null;
  if (!pending) return;

  const faceapi = await pending.catch(() => null);
  if (!faceapi) return;

  faceapi.nets.tinyFaceDetector.dispose(false);
  faceapi.nets.faceLandmark68TinyNet.dispose(false);
}

/**
 * The TFJS backend actually running detection - "webgl", "wasm", "cpu", or undefined if
 * nothing has initialised yet. Pure fact, not a log: the caller decides whether to log it.
 * A "no-face" result on "cpu" (the slow, no-GPU fallback) is worth telling apart from one
 * on "webgl" - a degraded backend can silently return near-zero-confidence noise, which
 * reads identically to a genuine miss unless this is captured alongside it.
 */
export function activeBackend(faceapi: FaceApiModule): string | undefined {
  // face-api's types omit getBackend from the re-exported tf namespace; it exists at runtime.
  const tf = faceapi.tf as unknown as { getBackend: () => string | undefined };
  return tf.getBackend();
}
