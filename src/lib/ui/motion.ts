/**
 * Motion constants.
 *
 * Every transition in TheFace comes from this file. Springs are stated as one named
 * constant per JOB, not per component, so two things that should feel the same cannot
 * drift apart. The values follow the oa-design language (MIT).
 *
 * The rule that keeps the app feeling quick: nothing in app chrome tweens longer than
 * 0.2s. A spring has no duration, so use one wherever something moves; use a tween only
 * where a spring cannot go (opacity, and SVG geometry, which springs animate unreliably).
 */

import type { Transition } from "motion/react";

/** Panels, cards, anything that grows or shrinks. */
export const PANEL: Transition = { type: "spring", stiffness: 550, damping: 38 };

/** Shared-layout glides, where one element becomes another. */
export const LAYOUT: Transition = { type: "spring", stiffness: 550, damping: 40 };

/** Something arriving with a little weight: a result, a badge. */
export const POP: Transition = { type: "spring", stiffness: 400, damping: 26 };

/**
 * The same thing leaving. STIFFER than POP on purpose: an arrival is worth watching,
 * a departure is the system getting out of the way and should snap.
 */
export const POP_EXIT: Transition = { type: "spring", stiffness: 460, damping: 30 };

/** Content trading places within a fixed slot: letters cascading, labels swapping. */
export const SWAP: Transition = { type: "spring", stiffness: 460, damping: 30, mass: 0.55 };

/** The tail end of a swap leaving — quick, so it doesn't linger under the new content. */
export const SWAP_EXIT: Transition = { duration: 0.16, ease: [0.16, 1, 0.3, 1] };

/** Strips and notices that slide in from an edge. */
export const BANNER: Transition = { type: "spring", stiffness: 400, damping: 30 };

/**
 * Bars and chart geometry. A tween, because a spring does not animate SVG reliably.
 * Kept under the 300ms UI budget — this runs on the home page, not in a marketing reel.
 */
export const CHART: Transition = { duration: 0.25, ease: [0.23, 1, 0.32, 1] };

export const FADE_IN: Transition = { duration: 0.16, ease: "easeOut" };
export const FADE_OUT: Transition = { duration: 0.1, ease: "easeOut" };

/** Delay for item `index` in a staggered list, capped so a long list never crawls. */
export function stagger(index: number, step = 0.04, max = 0.32): number {
  return Math.min(index * step, max);
}
