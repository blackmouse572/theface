import "@tanstack/react-start/client-only";
import type { FaceLandmarks68 } from "@vladmandic/face-api";

import {
  computeCropGeometry,
  CROP_JPEG_QUALITY,
  CROP_LONG_EDGE,
  faceAnchors,
  type CropGeometry,
  type Vec2,
} from "./crop";

/**
 * The Crop - encoding, on the device.
 *
 * `CONTEXT.md`, "Crop": the small, aligned derivative of a Selfie that TheFace rates. This half
 * takes the transform that `crop.ts` computed and runs it through a canvas: aligned to the
 * face, padded, downscaled to a {@link CROP_LONG_EDGE}px long edge, encoded as JPEG at
 * {@link CROP_JPEG_QUALITY}, returned both as a base64 data URL (for the POST body - see
 * `SPEC.md`, "Build checklist", on `image_url`) and as a `Blob` (for the later, consented
 * upload on a Claim).
 *
 * Landmarks are used for alignment only. See the module comment in `crop.ts`; the rule matters
 * more than the code.
 *
 * ## The Crop's lifetime
 *
 * `SPEC.md`, "Portraits": "A Crop is never uploaded unless a Claim happens. The Crop must
 * therefore survive in the browser from scoring until the Claim decision. Hold it in memory or
 * IndexedDB rather than asking for the file again." `PRIVACY.md` repeats it: "Your cropped
 * photo stays in your browser's memory. It is not on our servers. If you close the tab without
 * claiming a leaderboard place, it is gone." Keep the returned object; do not write it anywhere
 * that outlives the tab beyond that.
 *
 * Client-only, and named so that TanStack Start's import protection says so: a canvas does not
 * exist on Workers, and neither should this.
 */

/**
 * The fill behind the Crop.
 *
 * A rotated square near the edge of a Selfie can reach outside the frame. Transparent pixels
 * encode to black in a JPEG, which would read to the Observation as a dark background and drag
 * the lighting Craft Rating around. Neutral mid-grey is the least opinionated thing to leave
 * there.
 */
export const CROP_BACKGROUND = "#7f7f7f";

/** What `createCrop` can draw from. */
export type CropSource = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap;

/**
 * An encoded Crop.
 *
 * Note what is *not* here: the {@link CropGeometry}. The Crop is the object that gets POSTed,
 * and attaching the eye span, the roll and the face centre to it would put measured facial
 * numbers one `JSON.stringify` away from the wire. `SPEC.md`: "TheFace does not send measured
 * ratios to Jev." Call `computeCropGeometry` directly if you genuinely need the transform.
 */
export interface Crop {
  /** `data:image/jpeg;base64,...` - what Layer 2 sends to the vision model. */
  readonly dataUrl: string;
  /** The same bytes, for the consented Portrait upload on a Claim. */
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
}

export interface CreateCropOptions {
  readonly longEdge?: number;
  readonly quality?: number;
  readonly padding?: number;
}

/** Landmarks, either as face-api gives them or as plain points. */
export type CropLandmarks = FaceLandmarks68 | readonly Vec2[];

function landmarkPositions(landmarks: CropLandmarks): readonly Vec2[] {
  return "positions" in landmarks ? landmarks.positions : landmarks;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not encode the Crop as a JPEG."));
      },
      "image/jpeg",
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The browser could not read the encoded Crop."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("The browser could not read the encoded Crop."));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Renders the aligned Crop and encodes it.
 *
 * The canvas transform reads outward-in: move to the centre of the output, undo the head's
 * roll, scale the face's own span down to the output size, then move the face centre to the
 * origin. A source pixel `p` therefore lands at
 * `output/2 + scale * R(-roll) * (p - center)`, which puts the eye axis flat and the same
 * amount of face in the frame whatever the Visitor's distance from the camera.
 */
export async function createCrop(
  source: CropSource,
  landmarks: CropLandmarks,
  options: CreateCropOptions = {},
): Promise<Crop> {
  const { longEdge = CROP_LONG_EDGE, quality = CROP_JPEG_QUALITY, padding } = options;

  const geometry = computeCropGeometry(faceAnchors(landmarkPositions(landmarks)), {
    longEdge,
    padding,
  });

  const canvas = drawCrop(source, geometry);
  const blob = await canvasToBlob(canvas, quality);
  const dataUrl = await blobToDataUrl(blob);

  return { dataUrl, blob, width: canvas.width, height: canvas.height };
}

/** The canvas half, split out so it can be reused for a preview without re-encoding. */
export function drawCrop(source: CropSource, geometry: CropGeometry): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = geometry.outputSize;
  canvas.height = geometry.outputSize;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("The browser refused a 2D canvas context for the Crop.");

  context.fillStyle = CROP_BACKGROUND;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(-geometry.rollRadians);
  context.scale(geometry.scale, geometry.scale);
  context.translate(-geometry.center.x, -geometry.center.y);
  context.drawImage(source, 0, 0);
  context.restore();

  return canvas;
}
