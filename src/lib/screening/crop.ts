/**
 * The Crop - pure geometry.
 *
 * `CONTEXT.md`, "Crop": the small, aligned derivative of a Selfie that TheFace rates.
 *
 * ## Landmarks align. Landmarks never rate.
 *
 * `SPEC.md`, "Layer 1 - Screening, on the device":
 *
 * > **Landmarks align the Crop. They never produce a Rating.** A tight headshot and an
 * > arm's-length Selfie otherwise rate differently because of framing. Aligned cropping removes
 * > that variance. TheFace does not send measured ratios to Jev, because precise numbers invite
 * > Jev to weight measurements that it cannot calibrate.
 *
 * Everything in this file is a transform: a centre, a side length, a rotation and a scale. Feed
 * it to a canvas. Do not serialise a {@link CropGeometry} into an Observation, a Jev question,
 * a log line or an API response. The moment an interocular distance or a jaw ratio reaches
 * Layer 2 or Layer 3, this module has become a measurement engine and ADR-0001 ("the vision
 * model observes, Jev judges") no longer holds.
 *
 * ## Why this framing
 *
 * The rectangle is derived from the eyes and the mouth rather than from the detector's box,
 * which is the whole reason a tight headshot and an arm's-length Selfie come out comparable:
 * the eye-to-eye and eye-to-mouth spans are properties of the face, and the detector's box is a
 * property of the photograph. The construction follows FFHQ's alignment - it takes the larger
 * of the two spans, so a face turned to one side (short eye-to-eye) or tipped down (short
 * eye-to-mouth) still yields the same framing.
 *
 * The result is generous on purpose. `SPEC.md`, "What gets rated", asks for Ratings on hair and
 * hairline, forehead and ears, so the Crop has to contain them; a chin-to-brow box would not.
 *
 * This file is pure arithmetic. No DOM, no canvas, no face-api, no network. `crop.client.ts`
 * is the half that touches a canvas.
 */

/** The long edge of the encoded Crop, in pixels. `SPEC.md`, "Cost", prices a 512px Crop. */
export const CROP_LONG_EDGE = 512;

/** JPEG quality for the encoded Crop. */
export const CROP_JPEG_QUALITY = 0.85;

/**
 * Extra breathing room around the FFHQ rectangle, as a fraction of its side.
 *
 * The FFHQ construction is already loose enough to include hair and ears; this is a small top-up
 * so a Crop does not sit flush against the hairline.
 */
export const CROP_PADDING = 0.1;

/** FFHQ: the half-side implied by the eye-to-eye span. */
export const EYE_SPAN_FACTOR = 2.0;

/** FFHQ: the half-side implied by the eye-midpoint-to-mouth span. */
export const EYE_MOUTH_FACTOR = 1.8;

/**
 * How far below the eye midpoint the Crop is centred, as a fraction of the eye-to-mouth vector.
 * Keeps the eyes on the upper third rather than dead centre.
 */
export const CROP_CENTER_BIAS = 0.1;

/** Landmark indices in the 68-point model. Named in image space, as face-api names them. */
const LEFT_EYE_RANGE = [36, 42] as const;
const RIGHT_EYE_RANGE = [42, 48] as const;
const MOUTH_LEFT_CORNER = 48;
const MOUTH_RIGHT_CORNER = 54;

/** The number of landmarks `FaceLandmark68TinyNet` produces. */
export const LANDMARK_COUNT = 68;

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** The three points the alignment needs. Nothing else is read from the 68. */
export interface FaceAnchors {
  /** Centre of the eye nearer x = 0 in the image. */
  readonly leftEye: Vec2;
  /** Centre of the eye nearer x = width in the image. */
  readonly rightEye: Vec2;
  /** Midpoint of the two mouth corners. */
  readonly mouth: Vec2;
}

/**
 * A transform, in source-image pixels. Not a description of a face. See the module comment.
 */
export interface CropGeometry {
  /** Centre of the crop square, in source-image coordinates. */
  readonly center: Vec2;
  /** Side of the crop square, in source-image pixels, before rotation. */
  readonly side: number;
  /** Rotation of the face's horizontal axis, in radians. The canvas undoes it. */
  readonly rollRadians: number;
  /** Side of the encoded Crop, in pixels. Square, so this is both edges. */
  readonly outputSize: number;
  /** `outputSize / side`. Below 1 the Crop is downscaled; above 1 it is upscaled. */
  readonly scale: number;
}

export interface CropGeometryOptions {
  readonly longEdge?: number;
  readonly padding?: number;
  readonly eyeSpanFactor?: number;
  readonly eyeMouthFactor?: number;
  readonly centerBias?: number;
}

function mean(points: readonly Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/**
 * Reduces the 68 landmark positions to the three anchors the alignment uses.
 *
 * Accepts anything with `x` and `y`, so face-api's `Point` works directly and a test can pass
 * plain objects. Positions must be in source-image coordinates - that is `landmarks.positions`
 * from the detection chain, not `unshiftedLandmarks`, which are relative to the face box.
 */
export function faceAnchors(positions: readonly Vec2[]): FaceAnchors {
  if (positions.length !== LANDMARK_COUNT) {
    throw new Error(
      `Expected ${LANDMARK_COUNT} face landmarks for alignment, received ${positions.length}.`,
    );
  }

  const mouthLeft = positions[MOUTH_LEFT_CORNER];
  const mouthRight = positions[MOUTH_RIGHT_CORNER];
  if (!mouthLeft || !mouthRight) throw new Error("Face landmarks are missing mouth corners.");

  return {
    leftEye: mean(positions.slice(LEFT_EYE_RANGE[0], LEFT_EYE_RANGE[1])),
    rightEye: mean(positions.slice(RIGHT_EYE_RANGE[0], RIGHT_EYE_RANGE[1])),
    mouth: { x: (mouthLeft.x + mouthRight.x) / 2, y: (mouthLeft.y + mouthRight.y) / 2 },
  };
}

/**
 * Scales `width` x `height` so its long edge is exactly `longEdge`.
 *
 * Scales up as well as down. A uniform output size is what makes two Crops comparable, and
 * `SPEC.md`, "Cost", prices the Observation against a 512px Crop; a Crop that varied in size
 * with how close the Visitor stood would undo both. `MIN_FACE_AREA_FRACTION` in `screening.ts`
 * is what keeps the upscale factor modest.
 */
export function fitLongEdge(
  width: number,
  height: number,
  longEdge: number = CROP_LONG_EDGE,
): { width: number; height: number; scale: number } {
  const source = Math.max(width, height);
  if (!Number.isFinite(source) || source <= 0 || !Number.isFinite(longEdge) || longEdge <= 0) {
    return { width: 0, height: 0, scale: 0 };
  }

  const scale = longEdge / source;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/**
 * Builds the crop transform from the three anchors.
 *
 * FFHQ's construction. `axis` is the face's horizontal direction, taken as the eye-to-eye
 * vector blended with the perpendicular of the eye-to-mouth vector, so a head tipped in roll is
 * measured by both spans rather than by the eyes alone. Its length is the half-side.
 */
export function computeCropGeometry(
  anchors: FaceAnchors,
  options: CropGeometryOptions = {},
): CropGeometry {
  const {
    longEdge = CROP_LONG_EDGE,
    padding = CROP_PADDING,
    eyeSpanFactor = EYE_SPAN_FACTOR,
    eyeMouthFactor = EYE_MOUTH_FACTOR,
    centerBias = CROP_CENTER_BIAS,
  } = options;

  const eyeMid = {
    x: (anchors.leftEye.x + anchors.rightEye.x) / 2,
    y: (anchors.leftEye.y + anchors.rightEye.y) / 2,
  };
  const eyeToEye = {
    x: anchors.rightEye.x - anchors.leftEye.x,
    y: anchors.rightEye.y - anchors.leftEye.y,
  };
  const eyeToMouth = { x: anchors.mouth.x - eyeMid.x, y: anchors.mouth.y - eyeMid.y };

  // The perpendicular of eyeToMouth, pointing the same way as eyeToEye for an upright face.
  const axisX = eyeToEye.x + eyeToMouth.y;
  const axisY = eyeToEye.y - eyeToMouth.x;
  const axisLength = Math.hypot(axisX, axisY);

  const eyeSpan = Math.hypot(eyeToEye.x, eyeToEye.y);
  const mouthSpan = Math.hypot(eyeToMouth.x, eyeToMouth.y);
  const halfSide = Math.max(eyeSpan * eyeSpanFactor, mouthSpan * eyeMouthFactor);

  const side = Math.max(1, 2 * halfSide * (1 + padding));
  // A face seen exactly edge-on degenerates the axis; fall back to no rotation rather than NaN.
  const rollRadians = axisLength > 0 ? Math.atan2(axisY, axisX) : 0;

  const fitted = fitLongEdge(side, side, longEdge);

  return {
    center: {
      x: eyeMid.x + eyeToMouth.x * centerBias,
      y: eyeMid.y + eyeToMouth.y * centerBias,
    },
    side,
    rollRadians,
    outputSize: fitted.width,
    scale: fitted.scale,
  };
}
