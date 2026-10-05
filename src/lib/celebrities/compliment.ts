/**
 * Choosing the Compliment: the joke line that compares a Visitor with one Celebrity.
 *
 * Pure: no I/O, no clock, no Math.random. The choice is seeded by the Visitor's raw Overall
 * and Audience, so the same image (which gets the same Overall) always gets the same
 * Compliment. Runs on the server only, inside `scoreCrop`, and returns a name, a photo and a
 * credit, never a number: no Celebrity's Overall reaches a browser (ADR-0009).
 */
import { LINES, NAME_SLOT, type ComplimentLang, type ComplimentTier } from "./lines";
import type { Audience, Celebrity, Credit } from "./schema";

export type { ComplimentLang, ComplimentTier } from "./lines";

/**
 * Raw points of benefit of the doubt. A Visitor beats a Celebrity when
 * `overall + MATCH_MARGIN >= celebrity.overall`. It absorbs the gap between Observations
 * written by hand (the Roster) and by the vision model (Visitors). Calibrate after launch.
 */
export const MATCH_MARGIN = 3;

/** How often a Visitor in Vietnam is compared with a Vietnamese Celebrity. */
export const VN_POOL_SHARE = 0.7;

/** How many Celebrities a tier chooses among. */
const SHORTLIST = 3;

export interface Compliment {
  readonly tier: ComplimentTier;
  readonly lang: ComplimentLang;
  /** The joke, with the Celebrity's name filled in. */
  readonly line: string;
  /** Deliberately no number of any kind. */
  readonly celebrity: {
    readonly name: string;
    readonly photo: string | null;
    readonly credit: Credit | null;
  };
}

/**
 * @param overall  The Visitor's RAW Overall, never the displayed one.
 * @returns null only when the chosen pool is empty.
 */
export function pickCompliment(
  overall: number,
  audience: Audience,
  roster: readonly Celebrity[],
): Compliment | null {
  const rng = mulberry32(fnv1a(`${overall.toFixed(2)}|${audience}`));
  const lang: ComplimentLang = audience === "vn" ? "vi" : "en";
  const poolAudience: Audience = audience === "vn" && rng() < VN_POOL_SHARE ? "vn" : "global";
  const pool = roster
    .filter((celebrity) => celebrity.audience === poolAudience)
    .sort((a, b) => a.overall - b.overall);
  if (pool.length === 0) return null;

  // NaN beats nobody, so an unreadable Overall lands in the league tier instead of throwing.
  const beaten = pool.filter((celebrity) => overall + MATCH_MARGIN >= celebrity.overall);

  let tier: ComplimentTier;
  let shortlist: readonly Celebrity[];
  if (beaten.length === pool.length) {
    tier = "top";
    shortlist = pool.slice(-SHORTLIST);
  } else if (beaten.length > 0) {
    tier = "above";
    shortlist = beaten.slice(-SHORTLIST);
  } else {
    tier = "league";
    shortlist = pool.slice(0, SHORTLIST);
  }

  const celebrity = pickOne(shortlist, rng);
  const line = pickOne(LINES[lang][tier], rng).replace(NAME_SLOT, celebrity.name);
  return {
    tier,
    lang,
    line,
    celebrity: { name: celebrity.name, photo: celebrity.photo, credit: celebrity.credit },
  };
}

function pickOne<T>(items: readonly T[], rng: () => number): T {
  const item = items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
  if (item === undefined) throw new Error("pickOne: empty list");
  return item;
}

/** FNV-1a, 32-bit: a string to a well-spread seed. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: a small 32-bit generator, the same sequence for the same seed. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
