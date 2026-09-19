import { describe, expect, it } from "vitest";

import {
  computeCropGeometry,
  CROP_JPEG_QUALITY,
  CROP_LONG_EDGE,
  CROP_PADDING,
  EYE_MOUTH_FACTOR,
  EYE_SPAN_FACTOR,
  faceAnchors,
  fitLongEdge,
  LANDMARK_COUNT,
  type CropGeometry,
  type Vec2,
} from "./crop";
import { SCREENING_MESSAGES, SCREENING_REASSURANCE, screeningMessage } from "./messages";
import {
  DETECTOR_LOW_CONFIDENCE_THRESHOLD,
  DETECTOR_SCORE_THRESHOLD,
  evaluateDetections,
  faceAreaFraction,
  MIN_FACE_AREA_FRACTION,
  screeningFailure,
  type BoxLike,
  type ScreeningFailureReason,
} from "./screening";

/**
 * Screening - tests for everything that can be decided without a model.
 *
 * No weights are loaded and no canvas is created here. face-api's output is faked: a detection
 * is `{ box: { x, y, width, height } }` and landmarks are `{ positions: Point[] }`, which is the
 * shape the real library hands back, and the shape both pure modules consume.
 *
 * The client halves (`screening.browser.ts`, `crop.browser.ts`) are deliberately not imported.
 * They need a DOM, a WebGL context and 600 KB of weights, and the rules worth protecting - the
 * thresholds, the ordering, the framing maths and the copy - all live on this side of the seam.
 */

const ALL_REASONS: readonly ScreeningFailureReason[] = [
  "no-face",
  "low-confidence-face",
  "multiple-faces",
  "face-too-small",
  "unreadable-image",
  "models-unavailable",
];

/** A stand-in for face-api's `FaceDetection`. Only `box` is ever read. */
function mockDetection(box: BoxLike, score = 0.9) {
  return { box, score, imageDims: { width: 0, height: 0 } };
}

/** A box covering exactly `fraction` of a `width` x `height` frame, as a square. */
function boxCovering(fraction: number, width: number, height: number): BoxLike {
  const side = Math.sqrt(fraction * width * height);
  return { x: (width - side) / 2, y: (height - side) / 2, width: side, height: side };
}

function rotate(point: Vec2, about: Vec2, radians: number): Vec2 {
  const dx = point.x - about.x;
  const dy = point.y - about.y;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: about.x + dx * cos - dy * sin, y: about.y + dx * sin + dy * cos };
}

interface FaceShape {
  /** Midpoint between the eyes, in image coordinates. */
  readonly center?: Vec2;
  /** Distance between the two eye centres. */
  readonly eyeSpan?: number;
  /** Distance from the eye midpoint down to the mouth. */
  readonly mouthDrop?: number;
  /** Head tilt, in radians, clockwise in image coordinates. */
  readonly roll?: number;
}

/**
 * A stand-in for face-api's `FaceLandmarks68`.
 *
 * Only indices 36-47 (the eyes) and 48/54 (the mouth corners) are read by `faceAnchors`, so the
 * rest are filled with the face centre - a real jawline would change nothing.
 */
function mockLandmarks(shape: FaceShape = {}) {
  const { center = { x: 500, y: 400 }, eyeSpan = 60, mouthDrop = 60, roll = 0 } = shape;

  const positions: Vec2[] = Array.from({ length: LANDMARK_COUNT }, () => center);
  const place = (index: number, point: Vec2) => {
    positions[index] = rotate(point, center, roll);
  };

  for (let i = 36; i < 42; i += 1) place(i, { x: center.x - eyeSpan / 2, y: center.y });
  for (let i = 42; i < 48; i += 1) place(i, { x: center.x + eyeSpan / 2, y: center.y });
  place(48, { x: center.x - eyeSpan / 3, y: center.y + mouthDrop });
  place(54, { x: center.x + eyeSpan / 3, y: center.y + mouthDrop });

  return { positions };
}

/** Where a source pixel lands in the encoded Crop, per the transform in `crop.browser.ts`. */
function project(geometry: CropGeometry, point: Vec2): Vec2 {
  const dx = point.x - geometry.center.x;
  const dy = point.y - geometry.center.y;
  const cos = Math.cos(-geometry.rollRadians);
  const sin = Math.sin(-geometry.rollRadians);
  return {
    x: geometry.outputSize / 2 + (dx * cos - dy * sin) * geometry.scale,
    y: geometry.outputSize / 2 + (dx * sin + dy * cos) * geometry.scale,
  };
}

describe("thresholds", () => {
  it("keeps the face-area threshold a lenient fraction", () => {
    expect(MIN_FACE_AREA_FRACTION).toBeGreaterThan(0);
    // Above ~25% would reject ordinary arm's-length selfies, which SPEC.md forbids in effect:
    // a false reject must read as a photo-quality problem, so it must also be rare.
    expect(MIN_FACE_AREA_FRACTION).toBeLessThan(0.25);
  });

  it("keeps the low-confidence probe strictly below the real threshold", () => {
    // Otherwise it could never find anything the real pass had already missed.
    expect(DETECTOR_LOW_CONFIDENCE_THRESHOLD).toBeLessThan(DETECTOR_SCORE_THRESHOLD);
    expect(DETECTOR_LOW_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
  });
});

describe("faceAreaFraction", () => {
  it("is the box area over the image area", () => {
    expect(
      faceAreaFraction({ x: 0, y: 0, width: 200, height: 200 }, { width: 1000, height: 1000 }),
    ).toBeCloseTo(0.04, 10);
  });

  it("ignores where the box sits", () => {
    const image = { width: 800, height: 600 };
    const a = faceAreaFraction({ x: 0, y: 0, width: 120, height: 160 }, image);
    const b = faceAreaFraction({ x: 640, y: 400, width: 120, height: 160 }, image);
    expect(a).toBe(b);
  });

  it("returns 0 rather than NaN or Infinity for a degenerate frame or box", () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    expect(faceAreaFraction(box, { width: 0, height: 0 })).toBe(0);
    expect(faceAreaFraction(box, { width: Number.NaN, height: 100 })).toBe(0);
    expect(faceAreaFraction({ x: 0, y: 0, width: 0, height: 100 }, { width: 10, height: 10 })).toBe(
      0,
    );
    expect(
      faceAreaFraction({ x: 0, y: 0, width: -50, height: 50 }, { width: 10, height: 10 }),
    ).toBe(0);
  });
});

describe("evaluateDetections", () => {
  const image = { width: 1000, height: 1000 };

  it("fails with no-face when the detector found nothing", () => {
    const result = evaluateDetections([], image);
    expect(result).toMatchObject({ ok: false, reason: "no-face" });
  });

  it("fails with multiple-faces for two or more, whatever their size", () => {
    const big = mockDetection(boxCovering(0.3, 1000, 1000));
    const result = evaluateDetections([big.box, big.box], image);
    expect(result).toMatchObject({ ok: false, reason: "multiple-faces" });
  });

  it("fails with face-too-small just below the threshold", () => {
    const box = boxCovering(MIN_FACE_AREA_FRACTION * 0.99, 1000, 1000);
    expect(evaluateDetections([mockDetection(box).box], image)).toMatchObject({
      ok: false,
      reason: "face-too-small",
    });
  });

  it("passes exactly at the threshold and reports the fraction", () => {
    const box = boxCovering(MIN_FACE_AREA_FRACTION, 1000, 1000);
    const result = evaluateDetections([mockDetection(box).box], image);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.faceAreaFraction).toBeCloseTo(MIN_FACE_AREA_FRACTION, 10);
    expect(result.box).toBe(box);
  });

  it("honours an overridden threshold, so the constant can be calibrated", () => {
    const box = boxCovering(0.02, 1000, 1000);
    expect(evaluateDetections([box], image, 0.01)).toMatchObject({ ok: true });
    expect(evaluateDetections([box], image, 0.05)).toMatchObject({ ok: false });
  });
});

describe("the result union", () => {
  it("discriminates on ok, and every failure carries a reason and its copy", () => {
    for (const reason of ALL_REASONS) {
      const failure = screeningFailure(reason);
      expect(failure.ok).toBe(false);
      expect(failure.reason).toBe(reason);
      expect(failure.message).toBe(screeningMessage(reason));
      expect(failure.message.title.length).toBeGreaterThan(0);
      expect(failure.message.body.length).toBeGreaterThan(0);
    }
  });

  it("gives a pass no reason to branch on", () => {
    const result = evaluateDetections([boxCovering(0.2, 1000, 1000)], {
      width: 1000,
      height: 1000,
    });
    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("reason");
    expect(result).not.toHaveProperty("message");
  });
});

describe("failure copy", () => {
  it("covers every reason", () => {
    for (const reason of ALL_REASONS) {
      expect(SCREENING_MESSAGES[reason]).toBeDefined();
    }
    expect(Object.keys(SCREENING_MESSAGES).sort()).toEqual([...ALL_REASONS].sort());
  });

  it("never accuses anyone of anything", () => {
    // SPEC.md: "The message must never accuse the Visitor." No string may mention age, youth
    // or proof of identity, even though Screening no longer checks any of them itself.
    const banned =
      /\b(minor|minors|underage|young|younger|youth|child|children|kid|kids|teen|teenager|age|aged|ages|birthday|adult|adults|id|identity|verify|verified|prove|proof|suspect|suspicious)\b/i;
    const judgement = /\byou (look|seem|appear|are)\b/i;

    for (const reason of ALL_REASONS) {
      const { title, body } = SCREENING_MESSAGES[reason];
      expect(`${title} ${body}`).not.toMatch(banned);
      expect(`${title} ${body}`).not.toMatch(judgement);
    }
  });

  it("talks about the photograph or the app, never the person", () => {
    for (const reason of ALL_REASONS) {
      const { body } = SCREENING_MESSAGES[reason];
      expect(body.toLowerCase()).toMatch(/photo|device|frame/);
    }
  });

  it("has a line that states the privacy promise Screening keeps", () => {
    expect(SCREENING_REASSURANCE.toLowerCase()).toContain("device");
  });
});

describe("fitLongEdge", () => {
  it("scales the long edge to the target and keeps the aspect ratio", () => {
    expect(fitLongEdge(1024, 768, 512)).toEqual({ width: 512, height: 384, scale: 0.5 });
    expect(fitLongEdge(768, 1024, 512)).toEqual({ width: 384, height: 512, scale: 0.5 });
  });

  it("defaults to the 512px long edge SPEC.md prices the Observation against", () => {
    expect(CROP_LONG_EDGE).toBe(512);
    expect(CROP_JPEG_QUALITY).toBe(0.85);
    expect(fitLongEdge(2000, 2000).width).toBe(512);
  });

  it("scales up as well as down, so every Crop is the same size", () => {
    expect(fitLongEdge(256, 256, 512)).toEqual({ width: 512, height: 512, scale: 2 });
  });

  it("returns zeros rather than NaN for a degenerate input", () => {
    expect(fitLongEdge(0, 0, 512)).toEqual({ width: 0, height: 0, scale: 0 });
    expect(fitLongEdge(100, 100, 0)).toEqual({ width: 0, height: 0, scale: 0 });
  });
});

describe("faceAnchors", () => {
  it("reduces 68 landmarks to two eyes and a mouth", () => {
    const anchors = faceAnchors(
      mockLandmarks({ center: { x: 100, y: 100 }, eyeSpan: 60 }).positions,
    );
    expect(anchors.leftEye).toEqual({ x: 70, y: 100 });
    expect(anchors.rightEye).toEqual({ x: 130, y: 100 });
    expect(anchors.mouth.x).toBeCloseTo(100, 10);
    expect(anchors.mouth.y).toBeCloseTo(160, 10);
  });

  it("refuses a landmark set that is not the 68-point model", () => {
    expect(() => faceAnchors([])).toThrow(/68/);
    expect(() => faceAnchors(Array.from({ length: 5 }, () => ({ x: 0, y: 0 })))).toThrow(/68/);
  });
});

describe("computeCropGeometry", () => {
  it("frames from the face's own spans, not from the detector box", () => {
    const geometry = computeCropGeometry(
      faceAnchors(mockLandmarks({ eyeSpan: 60, mouthDrop: 60 }).positions),
    );

    const halfSide = Math.max(60 * EYE_SPAN_FACTOR, 60 * EYE_MOUTH_FACTOR);
    expect(geometry.side).toBeCloseTo(2 * halfSide * (1 + CROP_PADDING), 10);
    expect(geometry.rollRadians).toBeCloseTo(0, 10);
    expect(geometry.outputSize).toBe(CROP_LONG_EDGE);
    expect(geometry.scale).toBeCloseTo(CROP_LONG_EDGE / geometry.side, 10);
  });

  it("centres slightly below the eyes, not on them", () => {
    const geometry = computeCropGeometry(
      faceAnchors(mockLandmarks({ center: { x: 500, y: 400 }, mouthDrop: 60 }).positions),
    );
    expect(geometry.center.x).toBeCloseTo(500, 10);
    expect(geometry.center.y).toBeGreaterThan(400);
    expect(geometry.center.y).toBeLessThan(430);
  });

  it("recovers the head's roll", () => {
    for (const roll of [-0.4, -0.15, 0.15, 0.35]) {
      const geometry = computeCropGeometry(faceAnchors(mockLandmarks({ roll }).positions));
      expect(geometry.rollRadians).toBeCloseTo(roll, 6);
    }
  });

  it("puts a tight headshot and an arm's-length Selfie in the same place", () => {
    // SPEC.md: "A tight headshot and an arm's-length Selfie otherwise rate differently because
    // of framing. Aligned cropping removes that variance." This is that claim, as arithmetic.
    const tight = mockLandmarks({ center: { x: 400, y: 380 }, eyeSpan: 220, mouthDrop: 230 });
    const distant = mockLandmarks({ center: { x: 1500, y: 900 }, eyeSpan: 44, mouthDrop: 46 });

    const tightGeometry = computeCropGeometry(faceAnchors(tight.positions));
    const distantGeometry = computeCropGeometry(faceAnchors(distant.positions));

    expect(tightGeometry.outputSize).toBe(distantGeometry.outputSize);

    for (const index of [36, 45, 48, 54]) {
      const a = project(tightGeometry, tight.positions[index]!);
      const b = project(distantGeometry, distant.positions[index]!);
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    }
  });

  it("levels a tilted face in the encoded Crop", () => {
    const tilted = mockLandmarks({ roll: 0.3, eyeSpan: 80 });
    const geometry = computeCropGeometry(faceAnchors(tilted.positions));

    const leftEye = project(geometry, tilted.positions[36]!);
    const rightEye = project(geometry, tilted.positions[45]!);
    expect(leftEye.y).toBeCloseTo(rightEye.y, 6);
    expect(rightEye.x).toBeGreaterThan(leftEye.x);
  });

  it("keeps the whole face inside the Crop", () => {
    const face = mockLandmarks({ eyeSpan: 70, mouthDrop: 75 });
    const geometry = computeCropGeometry(faceAnchors(face.positions));

    for (const point of face.positions) {
      const projected = project(geometry, point);
      expect(projected.x).toBeGreaterThan(0);
      expect(projected.x).toBeLessThan(geometry.outputSize);
      expect(projected.y).toBeGreaterThan(0);
      expect(projected.y).toBeLessThan(geometry.outputSize);
    }
  });

  it("emits a transform and nothing that could be read as a measurement", () => {
    // SPEC.md: landmarks align the Crop, they never produce a Rating, and TheFace sends no
    // measured ratios onward. If a ratio, a score or a symmetry number ever appears on this
    // object, someone will eventually put it in an Observation.
    const geometry = computeCropGeometry(faceAnchors(mockLandmarks().positions));
    expect(Object.keys(geometry).sort()).toEqual([
      "center",
      "outputSize",
      "rollRadians",
      "scale",
      "side",
    ]);
  });

  it("does not blow up on a degenerate face", () => {
    const flat = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 10, y: 10 }));
    const geometry = computeCropGeometry(faceAnchors(flat));
    expect(Number.isFinite(geometry.rollRadians)).toBe(true);
    expect(geometry.side).toBeGreaterThan(0);
    expect(geometry.scale).toBeGreaterThan(0);
  });
});
