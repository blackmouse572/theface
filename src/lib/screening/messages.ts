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
 * Screening is a conservative pre-filter with a deliberately high age threshold (see
 * `MIN_APPARENT_AGE` in `screening.ts`). It will reject adults. A Visitor who is rejected must
 * read a sentence about the photograph, never a sentence about themselves. No string here may
 * tell anyone that they look young, that they look underage, or that they were disbelieved.
 *
 * `COULD_NOT_READ` is therefore shared by reference between the age failure and a genuine
 * decode failure. The two are indistinguishable to the Visitor by design: nobody can work
 * backwards from the copy to "the site thinks I look like a minor". `screening.test.ts`
 * asserts that identity, so do not split them into two separate literals.
 */

/**
 * Why Screening refused to pass a Selfie on.
 *
 * The reason lives here, beside the copy, because the copy is the only thing a Visitor is ever
 * shown. Anything that renders a failure must call {@link screeningMessage}; never write copy
 * for a reason at the call site, and never branch on `"apparent-age-below-threshold"` to say
 * something different from what this file says.
 */
export type ScreeningFailureReason =
  /** `TinyFaceDetector` found no face at all. */
  | "no-face"
  /** `TinyFaceDetector` found two or more faces. Screening rates one face or none. */
  | "multiple-faces"
  /** The face covers too little of the frame to read. See `MIN_FACE_AREA_FRACTION`. */
  | "face-too-small"
  /** `AgeGenderNet` estimated an apparent age below `MIN_APPARENT_AGE`. */
  | "apparent-age-below-threshold"
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

/**
 * The generic "that photo did not read" message.
 *
 * Shared, by reference, between the apparent-age failure and a decode failure. See the module
 * comment above before changing this.
 */
const COULD_NOT_READ: ScreeningMessage = {
  title: "We could not read that photo",
  body:
    "We could not read this photo clearly. Try another one - good light on your face, " +
    "no heavy filters, and nothing covering it.",
};

export const SCREENING_MESSAGES: Readonly<Record<ScreeningFailureReason, ScreeningMessage>> = {
  "no-face": {
    title: "No face in that one",
    body:
      "We could not find a face in this photo. Try another one - camera at eye level, " +
      "your whole face in the frame.",
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
  "apparent-age-below-threshold": COULD_NOT_READ,
  "unreadable-image": COULD_NOT_READ,
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
