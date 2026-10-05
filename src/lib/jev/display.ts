/**
 * The number a Visitor SEES. ADR-0008: shown numbers are curved, stored numbers are raw.
 *
 * A Rating is a Noul probability (ADR-0002), and Jev reads a deliberately neutral Observation
 * (ADR-0001), so real Overalls cluster around 55-75 for every face, famous or not. TheFace is
 * a toy and may be generous (SPEC.md, "What this is"), so every shown Rating and Overall runs
 * through this concave curve: a raw 60 shows as 82, a raw 75 as 89.
 *
 * Everything stored or compared keeps the raw number - the Tally, Board ranking, Percentile,
 * the Claim payload and the Compliment. The curve is monotonic, so it never changes an order.
 *
 * Pure arithmetic. Set DISPLAY_EXPONENT to 1 to switch the curve off.
 */
export const DISPLAY_EXPONENT = 0.4;

/** 100 × (raw / 100) ^ DISPLAY_EXPONENT, clamped to 0..100. Not rounded: the UI rounds. */
export function displayRating(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw >= 100) return 100;
  return 100 * (raw / 100) ** DISPLAY_EXPONENT;
}

/**
 * The Overall as a Visitor sees it, as a whole number.
 *
 * A Claim stores `Math.round(raw)` on the Board, so every screen curves that same integer.
 * Curving the unrounded raw instead would let the results page and the Board disagree by a
 * point for the same score (raw 59.6: 81 against 82).
 */
export function displayOverall(raw: number): number {
  return Math.round(displayRating(Math.round(raw)));
}
