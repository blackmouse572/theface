/**
 * Screening - the user-facing copy for every failure.
 *
 * This module is pure data. It imports nothing, touches no browser API, and is safe in any
 * environment.
 *
 * ## The rule that governs every string in this file
 *
 * `SPEC.md`, "Layer 1 - Screening, on the device":
 *
 * > An adult who fails this check makes one more attempt. The message must describe a photo
 * > quality problem, for example "we could not read this photo clearly, try another". The
 * > message must never accuse the Visitor.
 *
 * A Visitor who is rejected must read a sentence about the photograph, never a sentence about
 * themselves. No string here may tell anyone that they look young, that they look underage, or
 * that they were disbelieved. Screening no longer gates on apparent age at all - a minor is
 * caught one layer up, by the Verdict - so that concern no longer applies to any reason below,
 * but the rule that governs the copy still does.
 */

/**
 * Why Screening refused to pass a Selfie on.
 *
 * The reason lives here, beside the copy, because the copy is the only thing a Visitor is ever
 * shown. Anything that renders a failure must call {@link screeningMessage}; never write copy
 * for a reason at the call site.
 */
export type ScreeningFailureReason =
  /** `TinyFaceDetector` found no face at all, not even at a permissive threshold. */
  | "no-face"
  /**
   * `TinyFaceDetector` found nothing at the real threshold, but something at a far more
   * permissive one. See `DETECTOR_LOW_CONFIDENCE_THRESHOLD` in `screening.ts`.
   */
  | "low-confidence-face"
  /** `TinyFaceDetector` found two or more faces. Screening rates one face or none. */
  | "multiple-faces"
  /** The face covers too little of the frame to read. See `MIN_FACE_AREA_FRACTION`. */
  | "face-too-small"
  /** The file would not decode, or a model threw while reading it. */
  | "unreadable-image"
  /** The model weights could not be fetched from `/models/`. Not the Visitor's fault at all. */
  | "models-unavailable";

export interface ScreeningMessage {
  /** A short heading. Informal, per `SPEC.md` "What this is". */
  readonly title: string;
  /** One or two sentences. Always about the photograph. */
  readonly body: string;
}

export const SCREENING_MESSAGES: Readonly<Record<ScreeningFailureReason, ScreeningMessage>> = {
  "no-face": {
    title: "No face in that one",
    body:
      "We could not find a face in this photo. Try another one - camera at eye level, " +
      "your whole face in the frame.",
  },
  "low-confidence-face": {
    title: "We could not read that clearly",
    body:
      "This photo may have a face in it, but we could not read it clearly enough. Try more " +
      "even light and face the camera directly.",
  },
  "multiple-faces": {
    title: "More than one face",
    body: "There is more than one face in this photo. Try one with just you in the frame.",
  },
  "face-too-small": {
    title: "A little too far away",
    body:
      "The face in this photo is too small for us to read. Try one taken closer up, or crop " +
      "in before you choose it.",
  },
  "unreadable-image": {
    title: "We could not read that photo",
    body:
      "We could not read this photo clearly. Try another one - good light on your face, " +
      "no heavy filters, and nothing covering it.",
  },
  "models-unavailable": {
    title: "That is on us",
    body:
      "We could not start the check that runs on your device. Check your connection and try " +
      "again.",
  },
};

/**
 * The one sentence worth repeating on every Screening failure.
 *
 * `PRIVACY.md`, "What happens to your photo, step by step": "If any of those checks fail, the
 * photo is never transmitted anywhere." Screening is what makes that true, so say so.
 */
export const SCREENING_REASSURANCE = "Your photo stayed on your device. We never received it.";

/** The copy for a failure. The only supported way to turn a reason into words. */
export function screeningMessage(reason: ScreeningFailureReason): ScreeningMessage {
  return SCREENING_MESSAGES[reason];
}
