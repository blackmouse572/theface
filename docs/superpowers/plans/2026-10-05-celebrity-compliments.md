# Celebrity Compliments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After scoring, show a pop-up that compares the Visitor with a celebrity and always flatters them. Also make scores repeatable for the same image, and show numbers through a generous display curve.

**Architecture:** A static, committed Roster (`src/lib/celebrities/roster.json`) is produced by local seed scripts: Commons photos, Observations written by hand, then the real Jev questions. `scoreCrop` picks the Compliment server-side with a pure, score-seeded function, so a Celebrity's number never reaches the browser. The results view auto-opens a dialog. A pure `displayRating` curve is applied only where numbers are rendered.

**Tech Stack:** TanStack Start server functions on Cloudflare Workers, Workers AI (Mistral Small 3.1), Jev via `@typesafe-ai/sdk`, React 19, base-ui Dialog, Zod 4, Vitest 5 + Testing Library, `tsx` and `sharp` for the Node seed scripts.

**Spec:** [`docs/superpowers/specs/2026-10-05-celebrity-compliments-design.md`](../specs/2026-10-05-celebrity-compliments-design.md). Executors read both documents.

## Global Constraints

- Vocabulary comes from `CONTEXT.md`: Visitor, Overall, Rating, Celebrity, Roster, Compliment, Audience. Never write "match" or "lookalike" for a Compliment. No field, type or variable is named `region`, `nationality` or `ethnicity` (ADR-0003).
- A Celebrity's number never leaves the server. `Compliment` contains no number of any kind. `src/lib/celebrities/roster.ts` is imported only by server code. Client code may use `import type` from `src/lib/celebrities/*`, and nothing else.
- Stored and compared numbers stay raw: the Tally, Board ranking, Percentile, the Claim payload and `pickCompliment`. Only rendering calls `displayRating`.
- Constants, verbatim: `DEFAULT_TEMPERATURE = 0`, `OBSERVATION_SEED = 42`, `DISPLAY_EXPONENT = 0.4`, `MATCH_MARGIN = 3`, `VN_POOL_SHARE = 0.7`, `AUTO_OPEN_DELAY_MS = 900`.
- No `Math.random` anywhere in Compliment selection.
- Icons in new components use deep imports: `@tabler/icons-react/dist/esm/icons/IconX.mjs` (see the note at the top of `upload-card.tsx`).
- Component tests start with the line `// @vitest-environment jsdom`. Every other test runs on `node`.
- Formatting: run `pnpm exec oxfmt <changed files>` before each commit. `pnpm check` runs `oxlint`, `oxfmt --check` and `tsc`.
- Commits: sentence-case, imperative subject, like the existing history. End every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage explicit paths only. **Never stage `plans/` and never stage the owner's uncommitted hunks in `src/components/home/upload-card.tsx`** (Task 5 shows how to stage only this feature's line).
- Network requests from the seed scripts send a generic `User-Agent`. Never put the owner's email or any personal data in a request.
- Owner-supplied photos are never committed or shipped. `seed/celebrities/originals/` and `seed/celebrities/crops/` are gitignored.

## Review Focus

1. **An unreadable Overall (NaN) reaches `pickCompliment`.** It must return a `league` Compliment, not throw. Test in Task 3.
2. **`cf-ipcountry` arrives in an unexpected case or with whitespace (`"vn"`, `" VN "`).** It must still give the `vn` Audience. Test in Task 4.
3. **A Celebrity photo fails to load in the browser.** The pop-up must fall back to the initials badge, not a broken image. Test in Task 5.
4. **Names with diacritics, decomposed (NFD) Unicode or a parenthetical (`"V (BTS)"`, `"Độ Mixi"`).** The badge must show correct initials. Test in Task 5.
5. **The reduced-motion preference settles after mount.** That re-runs the auto-open effect, and it must not reopen a pop-up the Visitor already closed for the same result. Test in Task 5.

---

## File Structure

| Path | Responsibility | Task |
| --- | --- | --- |
| `src/lib/observation/observe.ts` | `temperature: 0`, fixed `seed` | 1 |
| `src/lib/jev/display.ts` | `displayRating`, the display curve | 2 |
| `src/lib/celebrities/schema.ts` | Zod schemas and types for the Roster, `isFreeLicence`, `AUDIENCES`. No data. | 3 |
| `src/lib/celebrities/lines.ts` | Joke lines per tier and language | 3 |
| `src/lib/celebrities/compliment.ts` | `pickCompliment`, pure and score-seeded | 3 |
| `src/lib/celebrities/roster.ts` | `loadRoster()`, lazy parse of `roster.json`. Server only. | 3 |
| `src/lib/celebrities/roster.json` | Generated Roster data (`[]` until Task 9) | 3, 9 |
| `src/server/audience.ts` | `audienceFromRequest` | 4 |
| `src/server/score.functions.ts` | Adds `compliment` to the result | 4 |
| `src/components/home/compliment-dialog.tsx` | `ComplimentDialog`, `ComplimentRow`, `CelebrityPicture`, `useAutoOpen`, `initialsOf` | 5 |
| `src/components/home/score-result.tsx` | Curve on numbers, the Compliment row and dialog | 2, 5 |
| `scripts/celebrities/lib.ts` | Pure seed helpers: paths, Candidate schema, crop math, Commons parsing | 6 |
| `scripts/celebrities/fetch.ts` | Downloads photos and cuts crops | 6 |
| `scripts/celebrities/score.ts` | Validates Observations, asks Jev, writes the Roster | 6 |
| `seed/celebrities/candidates.json`, `credits.json`, `observations/*.json` | Seed inputs, committed | 7, 8 |
| `public/celebrities/*.webp` | Shipped Commons photos | 7 |

`schema.ts` is split from `roster.ts` (the spec put both in `roster.ts`). That way the seed scripts and client type imports never pull in the JSON data.

---

### Task 1: Repeatable Observations

**Files:**
- Modify: `src/lib/observation/observe.ts` (the `DEFAULT_TEMPERATURE` constant, the `VisionRequest` interface, `buildObservationRequest`)
- Modify: `src/lib/observation/index.ts`
- Modify: `SPEC.md` ("Layer 2 - Observation, in the Worker")
- Test: `src/lib/observation/observation.test.ts`

**Interfaces:**
- Produces: `export const OBSERVATION_SEED = 42`, `export const DEFAULT_TEMPERATURE = 0` (both from `@/lib/observation`), and `VisionRequest.seed: number`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/observation/observation.test.ts`, extend the import from `"./observe"` so it includes `DEFAULT_TEMPERATURE` and `OBSERVATION_SEED`:

```ts
import {
  buildObservationRequest,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  isDailyLimitError,
  observe,
  OBSERVATION_MODEL,
  OBSERVATION_SEED,
  ObservationError,
  parseObservation,
} from "./observe";
```

Add inside `describe("observe", ...)`:

```ts
  it("sends the fixed seed with every call, so a repeat of one Crop decodes the same way", async () => {
    const { ai, run } = stubAi({ response: JSON.stringify(validObservation()) });

    await observe(ai, CROP_BASE64);

    expect(run.mock.calls[0]?.[1].seed).toBe(OBSERVATION_SEED);
    expect(run.mock.calls[0]?.[1].temperature).toBe(0);
  });
```

Add inside `describe("buildObservationRequest", ...)`:

```ts
  it("samples deterministically: the same image must give the same Overall", () => {
    const request = buildObservationRequest(CROP_BASE64);

    expect(DEFAULT_TEMPERATURE).toBe(0);
    expect(request.temperature).toBe(0);
    expect(request.seed).toBe(42);
    expect(OBSERVATION_SEED).toBe(42);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/observation/observation.test.ts`
Expected: FAIL. `OBSERVATION_SEED` is not exported (a TypeScript/undefined error), and `temperature` is `0.1`.

- [ ] **Step 3: Implement**

In `src/lib/observation/observe.ts`, replace the `DEFAULT_TEMPERATURE` block:

```ts
/** An Observation is a record of facts, and the same Crop must always give the same one, so
 * the same image always gets the same Overall. 0 removes sampling. */
export const DEFAULT_TEMPERATURE = 0;

/**
 * Sent with every call, so a repeat of the same Crop decodes the same way even where the
 * provider's decoder is not perfectly greedy. Any fixed integer works. Changing it changes
 * every future Observation, and therefore every future Overall.
 */
export const OBSERVATION_SEED = 42;
```

In `interface VisionRequest`, add after `temperature: number;`:

```ts
  seed: number;
```

In `buildObservationRequest`, add after the `temperature:` line:

```ts
    seed: OBSERVATION_SEED,
```

In `src/lib/observation/index.ts`, add `OBSERVATION_SEED,` to the `export { ... } from "./observe";` list, right after `OBSERVATION_MODEL,`.

In `SPEC.md`, under "### Layer 2 - Observation, in the Worker", find the paragraph that ends "Mistral rejects `guided_json`." and add this paragraph after it:

```markdown
The call runs at `temperature: 0` with a fixed `seed` (`OBSERVATION_SEED`), so the same Crop
always produces the same Observation, and the same image always gets the same Overall.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/observation/observation.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
pnpm exec oxfmt src/lib/observation/observe.ts src/lib/observation/index.ts src/lib/observation/observation.test.ts
git add src/lib/observation/observe.ts src/lib/observation/index.ts src/lib/observation/observation.test.ts SPEC.md
git commit -m "Make the Observation deterministic: temperature 0 and a fixed seed

The same image now gets the same Observation, and so the same Overall.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The display curve

**Files:**
- Create: `src/lib/jev/display.ts`
- Test: `src/lib/jev/display.test.ts`
- Modify: `src/components/home/score-result.tsx` (the Overall `<span>`, the top-Ratings value `<span>`, the bar `motion.div`)
- Modify: `src/components/home/score-detail-dialog.tsx` (`DialogDescription`, the Ratings `MeterRow` map)
- Modify: `src/components/home/board-card.tsx` (`BreakdownRow value=`)
- Create: `docs/adr/0008-shown-number-curved-stored-number-raw.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Produces: `export const DISPLAY_EXPONENT = 0.4;` and `export function displayRating(raw: number): number` from `@/lib/jev/display`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/jev/display.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { DISPLAY_EXPONENT, displayRating } from "./display";

describe("displayRating", () => {
  it("keeps both ends of the scale fixed", () => {
    expect(displayRating(0)).toBe(0);
    expect(displayRating(100)).toBe(100);
  });

  it("lifts the middle of the scale, where real Overalls cluster", () => {
    expect(Math.round(displayRating(30))).toBe(62);
    expect(Math.round(displayRating(50))).toBe(76);
    expect(Math.round(displayRating(60))).toBe(82);
    expect(Math.round(displayRating(75))).toBe(89);
  });

  it("never changes an order, so Boards and Percentiles are untouched", () => {
    for (let raw = 0; raw < 100; raw += 0.25) {
      expect(displayRating(raw + 0.25)).toBeGreaterThan(displayRating(raw));
    }
  });

  it("clamps what it cannot show", () => {
    expect(displayRating(-5)).toBe(0);
    expect(displayRating(140)).toBe(100);
    expect(displayRating(Number.NaN)).toBe(0);
  });

  it("uses the agreed exponent", () => {
    expect(DISPLAY_EXPONENT).toBe(0.4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/jev/display.test.ts`
Expected: FAIL with "Failed to resolve import "./display"".

- [ ] **Step 3: Implement `display.ts`**

Create `src/lib/jev/display.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/jev/display.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Apply the curve where numbers render**

In `src/components/home/score-result.tsx`:
- Add the import `import { displayRating } from "@/lib/jev/display";` beside the other `@/lib/jev` import.
- Replace `<span className="font-mono text-5xl tabular-nums">{Math.round(overall)}</span>` with `<span className="font-mono text-5xl tabular-nums">{Math.round(displayRating(overall))}</span>`.
- In the top-Ratings list, replace `{Math.round(value)}` with `{Math.round(displayRating(value))}`.
- In the bar `motion.div`, change the two width props from:

  ```tsx
                  initial={{ width: reduced ? `${value}%` : "0%" }}
                  animate={{ width: `${value}%` }}
  ```

  to:

  ```tsx
                  initial={{ width: reduced ? `${displayRating(value)}%` : "0%" }}
                  animate={{ width: `${displayRating(value)}%` }}
  ```
- Leave `ScoreDetailDialog` and `ClaimDialog` receiving the raw `overall`/`ratings`. The detail dialog curves its own display, and the Claim must send raw numbers.

In `src/components/home/score-detail-dialog.tsx`:
- Add `import { displayRating } from "@/lib/jev/display";`.
- Replace `{Math.round(overall)} out of 100 — every Feature, Impression and Aesthetic behind it.` with `{Math.round(displayRating(overall))} out of 100 — every Feature, Impression and Aesthetic behind it.`
- In the `allRatings.map(...)` `MeterRow`, replace `value={value}` with `value={displayRating(value)}`. Leave the `allAffinities` `MeterRow` unchanged: Affinities are not curved.

In `src/components/home/board-card.tsx`:
- Add `import { displayRating } from "@/lib/jev/display";`.
- Replace `value={Math.round(row.overall)}` with `value={Math.round(displayRating(row.overall))}`.

(`src/lib/seo/structured-data.ts` emits no number, so it needs no change.)

- [ ] **Step 6: Write ADR-0008**

Create `docs/adr/0008-shown-number-curved-stored-number-raw.md`:

```markdown
# The shown number is curved, the stored number is raw

Status: accepted. Date: 2026-10-05

A Rating is a Noul probability (ADR-0002), and Jev reads a deliberately neutral Observation
(ADR-0001). From that text Jev is rarely sure that any face is exceptional, so real Overalls
cluster around 55 to 75 for every face, famous or not. Visitors read a 60 as a failing grade.

TheFace shows every Rating and the Overall through `displayRating`: 100 × (raw / 100) ^ 0.4.
A raw 60 shows as 82 and a raw 75 shows as 89. Everything stored or compared keeps the raw
number: the Tally, Board ranking, Percentile, the Claim payload and the Compliment.

## Why

The probability is the honest quantity, and ADR-0002 depends on keeping it. Raising it at the
source, with a larger `RATING_CONFIDENCE_BOOST`, would change what the Overall means. ADR-0006
and ADR-0007 record that a change of meaning invalidates every Tally counter and every Board
Entry already written.

A curve applied at render changes no stored value. It is monotonic, so it never reorders a
Board and never moves a Percentile. TheFace is a toy and may be generous (SPEC.md, "What this
is").

## Consequences

Every component that shows a Rating or the Overall calls `displayRating`. Code that stores,
ranks or compares never does. A new display that forgets the curve shows a number that
disagrees with the rest of the page, so review every new number display against this record.

Set `DISPLAY_EXPONENT` to 1 to switch the curve off. Affinities keep their own 0-100 display
scale and are not curved.
```

In `docs/adr/README.md`, add this row after the 0007 row:

```markdown
| [0008](./0008-shown-number-curved-stored-number-raw.md) | The shown number is curved, the stored number is raw | accepted |
```

- [ ] **Step 7: Verify the whole project still checks**

Run: `pnpm exec tsc --noEmit && pnpm vitest run`
Expected: no TypeScript errors; all tests PASS.

- [ ] **Step 8: Commit**

```bash
pnpm exec oxfmt src/lib/jev/display.ts src/lib/jev/display.test.ts src/components/home/score-result.tsx src/components/home/score-detail-dialog.tsx src/components/home/board-card.tsx
git add src/lib/jev/display.ts src/lib/jev/display.test.ts src/components/home/score-result.tsx src/components/home/score-detail-dialog.tsx src/components/home/board-card.tsx docs/adr/0008-shown-number-curved-stored-number-raw.md docs/adr/README.md
git commit -m "Show Ratings and the Overall through a generous display curve

A raw 60 now shows as 82. The Tally, Board ranking and the Claim keep the raw
number; the curve is monotonic, so no order or Percentile moves. ADR-0008.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Celebrity core: schema, lines and `pickCompliment`

**Files:**
- Create: `src/lib/celebrities/schema.ts`, `src/lib/celebrities/lines.ts`, `src/lib/celebrities/compliment.ts`, `src/lib/celebrities/roster.ts`, `src/lib/celebrities/roster.json`
- Test: `src/lib/celebrities/schema.test.ts`, `src/lib/celebrities/lines.test.ts`, `src/lib/celebrities/compliment.test.ts`
- Modify: `CONTEXT.md`

**Interfaces:**
- Produces, from `@/lib/celebrities/schema`:
  - `AUDIENCES: readonly ["global", "vn"]`, `type Audience = "global" | "vn"`
  - `isFreeLicence(shortName: string): boolean`
  - `SLUG_PATTERN: RegExp`
  - `CreditSchema`, `type Credit = { author: string; licence: string; licenceUrl: string | null; sourceUrl: string }`
  - `CelebritySchema`, `type Celebrity = { slug: string; name: string; audience: Audience; overall: number; photo: string | null; credit: Credit | null }`
  - `RosterSchema`
- Produces, from `@/lib/celebrities/lines`: `COMPLIMENT_TIERS`, `type ComplimentTier = "top" | "above" | "league"`, `COMPLIMENT_LANGS`, `type ComplimentLang = "en" | "vi"`, `NAME_SLOT = "{name}"`, `LINES`.
- Produces, from `@/lib/celebrities/compliment`:
  - `MATCH_MARGIN = 3`, `VN_POOL_SHARE = 0.7`
  - `interface Compliment { tier: ComplimentTier; lang: ComplimentLang; line: string; celebrity: { name: string; photo: string | null; credit: Credit | null } }`
  - `pickCompliment(overall: number, audience: Audience, roster: readonly Celebrity[]): Compliment | null`
  - re-exports `type ComplimentTier`, `type ComplimentLang`
- Produces, from `@/lib/celebrities/roster` (SERVER ONLY): `loadRoster(): readonly Celebrity[]`.

- [ ] **Step 1: Write the failing schema test**

Create `src/lib/celebrities/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { CelebritySchema, isFreeLicence, RosterSchema } from "./schema";

const credit = {
  author: "Jane Doe",
  licence: "CC BY-SA 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
};

const celebrity = {
  slug: "jane-doe",
  name: "Jane Doe",
  audience: "global",
  overall: 61.5,
  photo: "/celebrities/jane-doe.webp",
  credit,
};

describe("isFreeLicence", () => {
  it.each(["CC0", "CC0 1.0", "Public domain", "PD", "CC BY 2.0", "CC BY 3.0", "CC BY-SA 4.0", "cc by-sa 3.0"])(
    "accepts %s",
    (licence) => expect(isFreeLicence(licence)).toBe(true),
  );

  it.each(["CC BY-NC 2.0", "CC BY-NC-SA 4.0", "CC BY-ND 4.0", "All rights reserved", "Fair use", "GFDL", ""])(
    "rejects %s",
    (licence) => expect(isFreeLicence(licence)).toBe(false),
  );
});

describe("CelebritySchema", () => {
  it("accepts a Celebrity with a credited photo", () => {
    expect(CelebritySchema.safeParse(celebrity).success).toBe(true);
  });

  it("accepts a Celebrity with neither photo nor credit (an initials badge)", () => {
    expect(CelebritySchema.safeParse({ ...celebrity, photo: null, credit: null }).success).toBe(true);
  });

  it("rejects a photo without a credit", () => {
    expect(CelebritySchema.safeParse({ ...celebrity, credit: null }).success).toBe(false);
  });

  it("rejects a credit without a photo", () => {
    expect(CelebritySchema.safeParse({ ...celebrity, photo: null }).success).toBe(false);
  });

  it("rejects a licence that is not free", () => {
    const nonFree = { ...celebrity, credit: { ...credit, licence: "CC BY-NC 2.0" } };
    expect(CelebritySchema.safeParse(nonFree).success).toBe(false);
  });

  it("rejects an Audience other than global or vn", () => {
    expect(CelebritySchema.safeParse({ ...celebrity, audience: "us" }).success).toBe(false);
  });

  it("rejects an Overall outside 0..100", () => {
    expect(CelebritySchema.safeParse({ ...celebrity, overall: 101 }).success).toBe(false);
  });
});

describe("RosterSchema", () => {
  it("rejects duplicate slugs", () => {
    expect(RosterSchema.safeParse([celebrity, celebrity]).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/celebrities/schema.test.ts`
Expected: FAIL with "Failed to resolve import "./schema"".

- [ ] **Step 3: Implement `schema.ts`**

Create `src/lib/celebrities/schema.ts`:

```ts
/**
 * The shapes of the Roster: the Celebrities a Compliment can name.
 *
 * No data lives here. `roster.ts` loads the data, server-side only. The seed scripts and the
 * client's `import type`s use these shapes without pulling the Roster, and its numbers, in.
 */
import { z } from "zod";

/**
 * Which Visitors see a Celebrity. It records who knows the Celebrity. It is never a claim
 * about anyone's origin (ADR-0003). A Visitor's Audience comes from the request's country,
 * never from the face (`src/server/audience.ts`).
 */
export const AUDIENCES = ["global", "vn"] as const;
export type Audience = (typeof AUDIENCES)[number];

/** CC0, public domain, CC BY and CC BY-SA, any version. Nothing NonCommercial or NoDerivatives. */
export function isFreeLicence(shortName: string): boolean {
  const licence = shortName.trim().toLowerCase();
  if (/\b(nc|nd)\b/.test(licence)) return false;
  return (
    licence.startsWith("cc0") ||
    licence.startsWith("public domain") ||
    licence === "pd" ||
    /^cc by(-sa)? \d/.test(licence)
  );
}

/** A Commons photo's credit, shown under the photo as its licence requires. */
export const CreditSchema = z.object({
  author: z.string().min(1),
  licence: z.string().refine(isFreeLicence, "not CC0, public domain, CC BY or CC BY-SA"),
  licenceUrl: z.url().nullable(),
  sourceUrl: z.url(),
});
export type Credit = z.infer<typeof CreditSchema>;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CelebritySchema = z
  .object({
    slug: z.string().regex(SLUG_PATTERN),
    /** Display name, with diacritics: "Trấn Thành". */
    name: z.string().min(1),
    audience: z.enum(AUDIENCES),
    /** RAW Overall. Server-only: never sent to a browser (ADR-0009). */
    overall: z.number().min(0).max(100),
    /** A Commons photo under `public/`, or null for an initials badge. */
    photo: z
      .string()
      .regex(/^\/celebrities\/[a-z0-9-]+\.webp$/)
      .nullable(),
    credit: CreditSchema.nullable(),
  })
  .refine(
    (celebrity) => (celebrity.photo === null) === (celebrity.credit === null),
    "a photo needs a credit, and a credit needs a photo",
  );
export type Celebrity = z.infer<typeof CelebritySchema>;

export const RosterSchema = z
  .array(CelebritySchema)
  .refine(
    (roster) => new Set(roster.map((celebrity) => celebrity.slug)).size === roster.length,
    "slugs must be unique",
  );
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run src/lib/celebrities/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing lines test**

Create `src/lib/celebrities/lines.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { COMPLIMENT_LANGS, COMPLIMENT_TIERS, LINES, NAME_SLOT } from "./lines";

const ALL = COMPLIMENT_LANGS.flatMap((lang) =>
  COMPLIMENT_TIERS.flatMap((tier) => LINES[lang][tier].map((line) => ({ lang, tier, line }))),
);

describe("LINES", () => {
  it("has four to six lines for every tier in every language", () => {
    for (const lang of COMPLIMENT_LANGS) {
      for (const tier of COMPLIMENT_TIERS) {
        expect(LINES[lang][tier].length).toBeGreaterThanOrEqual(4);
        expect(LINES[lang][tier].length).toBeLessThanOrEqual(6);
      }
    }
  });

  it.each(ALL)("$lang/$tier names exactly one Celebrity: $line", ({ line }) => {
    expect(line.split(NAME_SLOT)).toHaveLength(2);
  });

  it.each(ALL)("$lang/$tier never ranks the Visitor below anyone: $line", ({ line }) => {
    expect(line).not.toMatch(/\b(worse|uglier|less|lower|below|behind)\b/i);
    expect(line).not.toMatch(/kém|xấu|thua/i);
  });

  it.each(ALL)("$lang/$tier never quotes a score: $line", ({ line }) => {
    expect(line).not.toMatch(/\d{2,}/);
  });

  it.each(ALL)("$lang/$tier never claims a resemblance: $line", ({ line }) => {
    expect(line).not.toMatch(/looks? like|resembl|giống/i);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run src/lib/celebrities/lines.test.ts`
Expected: FAIL with "Failed to resolve import "./lines"".

- [ ] **Step 7: Implement `lines.ts`**

Create `src/lib/celebrities/lines.ts`:

```ts
/**
 * The Compliment's words. Every line flatters the Visitor, names exactly one Celebrity
 * through {name}, never quotes a number, never ranks the Visitor below anyone, and never says
 * the Visitor looks like anyone: TheFace compares a number, it does not judge resemblance.
 * `lines.test.ts` enforces each rule.
 */

export const COMPLIMENT_TIERS = ["top", "above", "league"] as const;
/** top: beats the whole pool. above: beats some of it. league: beats none, still a compliment. */
export type ComplimentTier = (typeof COMPLIMENT_TIERS)[number];

export const COMPLIMENT_LANGS = ["en", "vi"] as const;
export type ComplimentLang = (typeof COMPLIMENT_LANGS)[number];

export const NAME_SLOT = "{name}";

export const LINES: {
  readonly [L in ComplimentLang]: { readonly [T in ComplimentTier]: readonly string[] };
} = {
  en: {
    top: [
      "Top 5 in the world, easily. Sorry, {name}.",
      "{name} just got bumped down a spot.",
      "Somebody tell {name} there's a new face at the top.",
      "Move over, {name}. The crown fits you better.",
    ],
    above: [
      "More beautiful than {name}. Not even close.",
      "{name} called. They want your skincare routine.",
      "Prettier than {name}, and that's on the record.",
      "If {name} saw this, they'd ask for your secret.",
    ],
    league: [
      "Same league as {name}.",
      "You and {name}: same tier, different zip code.",
      "Put you next to {name} and nobody would complain.",
      "Officially in {name}'s league. Act accordingly.",
    ],
  },
  vi: {
    top: [
      "Top 5 thế giới là có thật, xin lỗi {name} nha!",
      "Hôm nay {name} phải xếp hàng sau bạn rồi.",
      "Ai báo {name} giùm, ngôi vương đổi chủ rồi!",
      "Nhan sắc này thì {name} cũng phải dè chừng.",
    ],
    above: [
      "Đẹp hơn {name} luôn rồi, không phải bàn!",
      "{name} mà thấy chắc cũng phải xin bí quyết.",
      "Visual này vượt mặt {name} rồi nha.",
      "Đứng cạnh bạn, {name} cũng phải lép vế.",
    ],
    league: [
      "Ngang ngửa {name} luôn, ra đường cẩn thận bị xin chữ ký!",
      "Cùng đẳng cấp nhan sắc với {name} đó nha.",
      "Bạn với {name} chung một mâm rồi đó.",
      "Đặt cạnh {name} chẳng ai chê được đâu.",
    ],
  },
};
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm vitest run src/lib/celebrities/lines.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing `pickCompliment` test**

Create `src/lib/celebrities/compliment.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { MATCH_MARGIN, pickCompliment, VN_POOL_SHARE } from "./compliment";
import type { Celebrity } from "./schema";

function celeb(slug: string, name: string, audience: Celebrity["audience"], overall: number): Celebrity {
  return { slug, name, audience, overall, photo: null, credit: null };
}

const ROSTER: Celebrity[] = [
  celeb("alpha", "Alpha", "global", 50),
  celeb("bravo", "Bravo", "global", 55),
  celeb("charlie", "Charlie", "global", 60),
  celeb("delta", "Delta", "global", 65),
  celeb("echo", "Echo", "global", 70),
  celeb("lan", "Lan", "vn", 52),
  celeb("minh", "Minh", "vn", 58),
  celeb("ngoc", "Ngoc", "vn", 63),
  celeb("phuong", "Phuong", "vn", 68),
];
const GLOBAL_NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
const VN_NAMES = ["Lan", "Minh", "Ngoc", "Phuong"];

function containsNumber(value: unknown): boolean {
  if (typeof value === "number") return true;
  if (value !== null && typeof value === "object") return Object.values(value).some(containsNumber);
  return false;
}

describe("pickCompliment", () => {
  it("puts a Visitor who beats the whole pool in the top tier, naming one of its top three", () => {
    const compliment = pickCompliment(70, "global", ROSTER);
    expect(compliment?.tier).toBe("top");
    expect(["Charlie", "Delta", "Echo"]).toContain(compliment?.celebrity.name);
  });

  it("counts a Celebrity as beaten within MATCH_MARGIN", () => {
    expect(pickCompliment(70 - MATCH_MARGIN, "global", ROSTER)?.tier).toBe("top");
    expect(pickCompliment(70 - MATCH_MARGIN - 0.01, "global", ROSTER)?.tier).toBe("above");
  });

  it("names one of the three highest Celebrities the Visitor beats", () => {
    // 57 + MATCH_MARGIN beats 50, 55 and 60, and not 65.
    const compliment = pickCompliment(57, "global", ROSTER);
    expect(compliment?.tier).toBe("above");
    expect(["Alpha", "Bravo", "Charlie"]).toContain(compliment?.celebrity.name);
  });

  it("never says worse: below the whole pool is the same league as its lowest three", () => {
    const compliment = pickCompliment(20, "global", ROSTER);
    expect(compliment?.tier).toBe("league");
    expect(["Alpha", "Bravo", "Charlie"]).toContain(compliment?.celebrity.name);
  });

  it("treats an unreadable Overall as the league tier instead of throwing", () => {
    expect(pickCompliment(Number.NaN, "global", ROSTER)?.tier).toBe("league");
  });

  it("never shows a Vietnamese Celebrity to the global Audience", () => {
    for (let overall = 0; overall <= 100; overall += 0.5) {
      const compliment = pickCompliment(overall, "global", ROSTER);
      expect(GLOBAL_NAMES).toContain(compliment?.celebrity.name);
      expect(compliment?.lang).toBe("en");
    }
  });

  it("speaks Vietnamese to the vn Audience and mostly names Vietnamese Celebrities", () => {
    let vietnamese = 0;
    let total = 0;
    for (let step = 0; step <= 1000; step += 1) {
      const compliment = pickCompliment(step / 10, "vn", ROSTER);
      expect(compliment?.lang).toBe("vi");
      total += 1;
      if (VN_NAMES.includes(compliment?.celebrity.name ?? "")) vietnamese += 1;
    }
    expect(VN_POOL_SHARE).toBe(0.7);
    expect(vietnamese / total).toBeGreaterThan(0.6);
    expect(vietnamese / total).toBeLessThan(0.8);
  });

  it("gives the same Compliment for the same Overall and Audience", () => {
    expect(pickCompliment(61.237, "vn", ROSTER)).toEqual(pickCompliment(61.237, "vn", ROSTER));
  });

  it("fills the name into the line", () => {
    const compliment = pickCompliment(57, "global", ROSTER);
    expect(compliment?.line).toContain(compliment?.celebrity.name);
    expect(compliment?.line).not.toContain("{name}");
  });

  it("carries no number of any kind, so no Celebrity's Overall can reach a browser", () => {
    for (const overall of [0, 40, 57, 67, 100]) {
      const compliment = pickCompliment(overall, "vn", ROSTER);
      expect(containsNumber(compliment)).toBe(false);
      expect(Object.keys(compliment ?? {}).sort()).toEqual(["celebrity", "lang", "line", "tier"]);
      expect(Object.keys(compliment?.celebrity ?? {}).sort()).toEqual(["credit", "name", "photo"]);
    }
  });

  it("returns null when the chosen pool is empty", () => {
    const vietnameseOnly = ROSTER.filter((celebrity) => celebrity.audience === "vn");
    expect(pickCompliment(60, "global", vietnameseOnly)).toBeNull();
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `pnpm vitest run src/lib/celebrities/compliment.test.ts`
Expected: FAIL with "Failed to resolve import "./compliment"".

- [ ] **Step 11: Implement `compliment.ts`, `roster.ts` and an empty `roster.json`**

Create `src/lib/celebrities/compliment.ts`:

```ts
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
```

Create `src/lib/celebrities/roster.json` containing exactly:

```json
[]
```

Create `src/lib/celebrities/roster.ts`:

```ts
/**
 * The Roster, generated by `pnpm celebs:score` and committed as `roster.json`.
 *
 * SERVER ONLY. Every entry carries its Celebrity's raw Overall, and a client import would
 * ship all of them to every browser (ADR-0009). The Compliment that leaves the server carries
 * a name, a photo and a credit, never a number.
 *
 * Parsed lazily and once, so a broken file costs the Compliment, not the module that imports
 * it: `scoreCrop` catches the throw and scores without a pop-up.
 */
import rosterJson from "./roster.json";
import { RosterSchema, type Celebrity } from "./schema";

let roster: readonly Celebrity[] | undefined;

export function loadRoster(): readonly Celebrity[] {
  roster ??= RosterSchema.parse(rosterJson);
  return roster;
}
```

- [ ] **Step 12: Run the Celebrity tests to verify they pass**

Run: `pnpm vitest run src/lib/celebrities`
Expected: PASS for `schema.test.ts`, `lines.test.ts` and `compliment.test.ts`. If the Vietnamese-share test lands outside 0.6–0.8, check the pool draw. It must be the **first** `rng()` call, before any other use of `rng`.

- [ ] **Step 13: Add the vocabulary to `CONTEXT.md`**

In `CONTEXT.md`, insert this block immediately before the line `### Borrowed terms`:

```markdown
### Celebrities

**Celebrity**:
A public figure on the Roster. A Celebrity has a seeded Overall that is never shown to anyone.
_Avoid_: celeb, star, idol

**Roster**:
The list of Celebrities that a Compliment can name.
_Avoid_: dataset, list, seed data

**Compliment**:
The joke line that compares a Visitor's Overall with one Celebrity. A Compliment never says
that a Visitor looks like anyone, and never ranks a Visitor below anyone.
_Avoid_: match, lookalike, comparison, joke

**Audience**:
Which Celebrities a Compliment may name: `global` or `vn`. It comes from the country of the
request, never from the face.
_Avoid_: region, locale, market

```

- [ ] **Step 14: Typecheck and commit**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

```bash
pnpm exec oxfmt src/lib/celebrities
git add src/lib/celebrities CONTEXT.md
git commit -m "Add the Celebrity core: Roster schema, Compliment lines and pickCompliment

pickCompliment is pure and seeded by the raw Overall and Audience, so the same
image always gets the same Compliment. It returns a name, photo and credit only,
never a number. The Roster itself is empty until it is seeded.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Audience, and the Compliment in `scoreCrop`

**Files:**
- Create: `src/server/audience.ts`
- Test: `src/server/audience.test.ts`
- Modify: `src/server/score.functions.ts` (imports, `ScoreResult`, the handler's success path, a new `complimentFor` function)
- Modify: `.dev.vars.example`, `PRIVACY.md`

**Interfaces:**
- Consumes: `AUDIENCES`, `type Audience` from `@/lib/celebrities/schema`; `pickCompliment`, `type Compliment` from `@/lib/celebrities/compliment`; `loadRoster` from `@/lib/celebrities/roster`.
- Produces: `audienceFromRequest(country: string | undefined, override: string | undefined): Audience` from `@/server/audience`. `ScoreResult`'s success branch gains `readonly compliment: Compliment | null`.

- [ ] **Step 1: Write the failing test**

Create `src/server/audience.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { audienceFromRequest } from "./audience";

describe("audienceFromRequest", () => {
  it.each(["VN", "vn", " VN "])("gives the vn Audience for a request from Vietnam (%j)", (country) => {
    expect(audienceFromRequest(country, undefined)).toBe("vn");
  });

  it.each(["US", "FR", "", "XX", "T1"])("gives the global Audience for %j", (country) => {
    expect(audienceFromRequest(country, undefined)).toBe("global");
  });

  it("gives the global Audience when Cloudflare sends no country", () => {
    expect(audienceFromRequest(undefined, undefined)).toBe("global");
  });

  it("lets the local-testing override win", () => {
    expect(audienceFromRequest("US", "vn")).toBe("vn");
    expect(audienceFromRequest("VN", "global")).toBe("global");
    expect(audienceFromRequest(undefined, " VN ")).toBe("vn");
  });

  it("ignores an empty or unknown override", () => {
    expect(audienceFromRequest("VN", "")).toBe("vn");
    expect(audienceFromRequest("US", "fr")).toBe("global");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/server/audience.test.ts`
Expected: FAIL with "Failed to resolve import "./audience"".

- [ ] **Step 3: Implement `audience.ts`**

Create `src/server/audience.ts`:

```ts
/**
 * Which Celebrities a Visitor's Compliment may name.
 *
 * ADR-0003: the Audience comes from where the REQUEST comes from - Cloudflare's
 * `cf-ipcountry` header - and never from the face. The country is read for this one request
 * and is never stored or logged (PRIVACY.md).
 */
import { AUDIENCES, type Audience } from "@/lib/celebrities/schema";

export type { Audience } from "@/lib/celebrities/schema";

/**
 * @param country   The `cf-ipcountry` header: an ISO 3166 code, or Cloudflare's "XX"/"T1".
 * @param override  `AUDIENCE_OVERRIDE`, for local testing only, because `vite dev` sends no
 *                  `cf-ipcountry`. Wins when it names a real Audience.
 */
export function audienceFromRequest(
  country: string | undefined,
  override: string | undefined,
): Audience {
  const forced = override?.trim().toLowerCase();
  const known = AUDIENCES.find((audience) => audience === forced);
  if (known) return known;
  return country?.trim().toUpperCase() === "VN" ? "vn" : "global";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run src/server/audience.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the Compliment into `scoreCrop`**

In `src/server/score.functions.ts`:

Add these imports in the existing import groups:

```ts
import { pickCompliment, type Compliment } from "@/lib/celebrities/compliment";
import { loadRoster } from "@/lib/celebrities/roster";
import { audienceFromRequest } from "@/server/audience";
```

In the success branch of `ScoreResult`, add after `readonly affinities: Record<AestheticKey, number>;`:

```ts
      /** The pop-up's joke, chosen here so no Celebrity's number reaches the browser.
       *  Null when the Roster is empty or broken: scoring never fails for its sake. */
      readonly compliment: Compliment | null;
```

Replace:

```ts
      log.log("scored", { overall: Math.round(overall) });

      const db = getDb();
      await incrementTally(db, Math.round(overall));

      return { ok: true, overall, ratings, affinities };
```

with:

```ts
      log.log("scored", { overall: Number(overall.toFixed(2)) });

      const db = getDb();
      await incrementTally(db, Math.round(overall));

      const compliment = complimentFor(overall);
      return { ok: true, overall, ratings, affinities, compliment };
```

Add this function after `clientIp()`:

```ts
/**
 * The Compliment for a raw Overall, or null. Never fails a scoring: a broken Roster costs
 * the pop-up, not the result. The country goes straight into `audienceFromRequest` and is
 * never logged.
 */
function complimentFor(overall: number): Compliment | null {
  try {
    // Optional and local-only, so it is not in the generated Env: production never sets it.
    const override =
      "AUDIENCE_OVERRIDE" in env && typeof env.AUDIENCE_OVERRIDE === "string"
        ? env.AUDIENCE_OVERRIDE
        : undefined;
    const audience = audienceFromRequest(getRequestHeader("cf-ipcountry"), override);
    return pickCompliment(overall, audience, loadRoster());
  } catch (error) {
    log.log("compliment: failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
```

- [ ] **Step 6: Document the override and the country**

Append to `.dev.vars.example`:

```bash

# Local testing only. Forces the Audience of the celebrity Compliment, because `vite dev`
# sends no cf-ipcountry header. "vn" gives the Vietnamese pool and Vietnamese lines.
# Never set this in production.
AUDIENCE_OVERRIDE=
```

In `PRIVACY.md`, at the end of the "### 3. Scoring" section (after the paragraph ending "the model accepts text only."), add:

```markdown
**Your country, for one moment.** Cloudflare tells us which country your request comes
from. We use it only to choose which celebrities the joke after your score may mention -
visitors in Vietnam also see Vietnamese celebrities - and then forget it. It is never
stored or logged, and it is never guessed from your face.
```

In `PRIVACY.md`, at the end of the "## What the scores are" section (after the paragraph ending "where you are from."), add:

```markdown
The celebrity joke after your score is a joke. It compares numbers. It never says you look
like anyone, and no celebrity's own score is ever shown.
```

- [ ] **Step 7: Typecheck and run the suite**

Run: `pnpm exec tsc --noEmit && pnpm vitest run`
Expected: no errors. All tests PASS. `upload-card.tsx` still compiles, because it only reads fields that already existed.

- [ ] **Step 8: Commit**

```bash
pnpm exec oxfmt src/server/audience.ts src/server/audience.test.ts src/server/score.functions.ts
git add src/server/audience.ts src/server/audience.test.ts src/server/score.functions.ts .dev.vars.example PRIVACY.md
git commit -m "Choose the Compliment in scoreCrop, from the request's country

cf-ipcountry VN gives the vn Audience; the country is never stored or logged.
A broken or empty Roster returns compliment: null and never fails a scoring.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The pop-up

**Files:**
- Create: `src/components/home/compliment-dialog.tsx`
- Test: `src/components/home/compliment-dialog.test.tsx`
- Modify: `src/components/home/score-result.tsx` (imports, props, the Compliment row and dialog under the Overall)
- Modify: `src/components/home/upload-card.tsx` (one added prop line, staged on its own)

**Interfaces:**
- Consumes: `type Compliment`, `type ComplimentLang`, `type ComplimentTier` from `@/lib/celebrities/compliment` (type-only imports).
- Produces, from `./compliment-dialog`:
  - `AUTO_OPEN_DELAY_MS = 900`
  - `initialsOf(name: string): string`
  - `useAutoOpen(trigger: object | null, reduced: boolean): readonly [boolean, (open: boolean) => void]`
  - `CelebrityPicture`
  - `ComplimentDialog({ compliment, open, onOpenChange })`
  - `ComplimentRow({ compliment, onOpen })`
- `ScoreResultViewProps` gains `readonly compliment?: Compliment | null`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/home/compliment-dialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Compliment } from "@/lib/celebrities/compliment";

import {
  AUTO_OPEN_DELAY_MS,
  ComplimentDialog,
  ComplimentRow,
  initialsOf,
  useAutoOpen,
} from "./compliment-dialog";

const credited: Compliment = {
  tier: "above",
  lang: "en",
  line: "More beautiful than Anne Hathaway. Not even close.",
  celebrity: {
    name: "Anne Hathaway",
    photo: "/celebrities/anne-hathaway.webp",
    credit: {
      author: "Jane Doe",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
    },
  },
};

const vietnamese: Compliment = {
  tier: "league",
  lang: "vi",
  line: "Ngang ngửa Dương Gió Tai luôn, ra đường cẩn thận bị xin chữ ký!",
  celebrity: { name: "Dương Gió Tai", photo: null, credit: null },
};

describe("initialsOf", () => {
  it.each([
    ["Trấn Thành", "TT"],
    ["Dương Gió Tai", "DG"],
    ["Độ Mixi", "ĐM"],
    ["V (BTS)", "V"],
    ["Lisa (BLACKPINK)", "L"],
    ["Cô Phương Hằng", "CP"],
    ["Rihanna", "R"],
    ["Ánh Viên".normalize("NFD"), "ÁV"],
    ["", "?"],
  ])("%s gives %s", (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

describe("ComplimentDialog", () => {
  it("shows the photo, the credit and the line as the dialog's name", () => {
    render(<ComplimentDialog compliment={credited} open onOpenChange={() => {}} />);

    expect(screen.getByRole("dialog", { name: /More beautiful than Anne Hathaway/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Anne Hathaway" })).toHaveAttribute(
      "src",
      "/celebrities/anne-hathaway.webp",
    );
    expect(
      screen.getByRole("link", { name: "Jane Doe · CC BY-SA 4.0 · Wikimedia Commons" }),
    ).toHaveAttribute("href", "https://commons.wikimedia.org/wiki/File:Example.jpg");
    expect(screen.getByRole("button", { name: "Thanks, I know 😎" })).toBeInTheDocument();
  });

  it("falls back to an initials badge when the photo fails to load", () => {
    render(<ComplimentDialog compliment={credited} open onOpenChange={() => {}} />);

    fireEvent.error(screen.getByRole("img", { name: "Anne Hathaway" }));

    expect(screen.getByRole("img", { name: "Anne Hathaway" })).toHaveTextContent("AH");
  });

  it("speaks Vietnamese, with an initials badge, to the vn Audience", () => {
    render(<ComplimentDialog compliment={vietnamese} open onOpenChange={() => {}} />);

    const dialog = screen.getByRole("dialog", { name: /Ngang ngửa Dương Gió Tai/ });
    expect(dialog).toHaveAttribute("lang", "vi");
    expect(screen.getByRole("img", { name: "Dương Gió Tai" })).toHaveTextContent("DG");
    expect(screen.getByRole("button", { name: "Biết rồi mà 😎" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("asks to close from its button", () => {
    const onOpenChange = vi.fn();
    render(<ComplimentDialog compliment={credited} open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Thanks, I know 😎" }));

    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
  });
});

describe("ComplimentRow", () => {
  it("reopens the pop-up from the row under the Overall", () => {
    const onOpen = vi.fn();
    render(<ComplimentRow compliment={credited} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: /More beautiful than Anne Hathaway/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("useAutoOpen", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens once the results have landed, not before", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAutoOpen(credited, false));

    act(() => vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS - 1));
    expect(result.current[0]).toBe(false);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe(true);
  });

  it("opens without the delay under reduced motion", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAutoOpen(credited, true));

    act(() => vi.advanceTimersByTime(0));

    expect(result.current[0]).toBe(true);
  });

  it("opens once per result: closing sticks, even when the motion preference settles late", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ trigger, reduced }: { trigger: Compliment | null; reduced: boolean }) =>
        useAutoOpen(trigger, reduced),
      { initialProps: { trigger: credited, reduced: false } },
    );
    act(() => vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS));
    act(() => result.current[1](false));

    rerender({ trigger: credited, reduced: true });
    act(() => vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS));
    expect(result.current[0]).toBe(false);

    rerender({ trigger: { ...vietnamese }, reduced: false });
    act(() => vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS));
    expect(result.current[0]).toBe(true);
  });

  it("never opens without a Compliment", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAutoOpen(null, false));

    act(() => vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS * 2));

    expect(result.current[0]).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/components/home/compliment-dialog.test.tsx`
Expected: FAIL with "Failed to resolve import "./compliment-dialog"".

- [ ] **Step 3: Implement `compliment-dialog.tsx`**

Create `src/components/home/compliment-dialog.tsx`:

```tsx
// Deep imports, not the barrel: see the note at the top of `upload-card.tsx`.
import IconCrown from "@tabler/icons-react/dist/esm/icons/IconCrown.mjs";
import IconHeartHandshake from "@tabler/icons-react/dist/esm/icons/IconHeartHandshake.mjs";
import IconSparkles from "@tabler/icons-react/dist/esm/icons/IconSparkles.mjs";
import type { Icon } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
// Types only. The Roster, and every Celebrity's number, stays on the server (ADR-0009).
import type { Compliment, ComplimentLang, ComplimentTier } from "@/lib/celebrities/compliment";
import { cn } from "@/lib/ui";

/** How long the results get to land before the Compliment pops: the Rating bars' fill. */
export const AUTO_OPEN_DELAY_MS = 900;

const STRINGS = {
  en: { thanks: "Thanks, I know 😎", photo: "Photo", reopen: "Show the compliment again" },
  vi: { thanks: "Biết rồi mà 😎", photo: "Ảnh", reopen: "Xem lại lời khen" },
} as const satisfies Record<ComplimentLang, Record<string, string>>;

const TIER_ICONS: Record<ComplimentTier, Icon> = {
  top: IconCrown,
  above: IconSparkles,
  league: IconHeartHandshake,
};

/** "Dương Gió Tai" → "DG". The first letters of the first two words, ignoring parentheses. */
export function initialsOf(name: string): string {
  const words = name
    .normalize("NFC")
    .replace(/\([^)]*\)/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? "");
  return letters.join("").toLocaleUpperCase("vi") || "?";
}

/**
 * Opens once per result: `AUTO_OPEN_DELAY_MS` after a new `trigger`, or at once under reduced
 * motion. A Visitor who closes it is not shown it again for the same result, even when the
 * reduced-motion preference settles after mount and re-runs the effect.
 */
export function useAutoOpen(
  trigger: object | null,
  reduced: boolean,
): readonly [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  const openedFor = useRef<object | null>(null);

  useEffect(() => {
    if (trigger === null || openedFor.current === trigger) return;
    const timer = setTimeout(
      () => {
        openedFor.current = trigger;
        setOpen(true);
      },
      reduced ? 0 : AUTO_OPEN_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [trigger, reduced]);

  return [open, setOpen] as const;
}

/** The Celebrity's Commons photo, or an initials badge when there is none or it fails. */
export function CelebrityPicture({
  name,
  photo,
  size,
}: {
  readonly name: string;
  readonly photo: string | null;
  readonly size: "sm" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const large = size === "lg";
  const box = large ? "size-40 rounded-3xl text-4xl" : "size-6 rounded-md text-[10px]";

  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={large ? name : ""}
        width={large ? 160 : 24}
        height={large ? 160 : 24}
        onError={() => setFailed(true)}
        className={cn("bg-muted shrink-0 object-cover", box)}
      />
    );
  }
  return (
    <span
      role={large ? "img" : undefined}
      aria-label={large ? name : undefined}
      aria-hidden={large ? undefined : true}
      className={cn(
        "bg-accent text-accent-foreground grid shrink-0 place-items-center font-medium",
        box,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

export interface ComplimentDialogProps {
  readonly compliment: Compliment;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The pop-up: the Celebrity, the credit their photo's licence requires, and the joke. */
export function ComplimentDialog({ compliment, open, onOpenChange }: ComplimentDialogProps) {
  const { tier, lang, line, celebrity } = compliment;
  const strings = STRINGS[lang];
  const TierIcon = TIER_ICONS[tier];

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogPopup lang={lang} className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <CelebrityPicture
            key={celebrity.photo ?? celebrity.name}
            name={celebrity.name}
            photo={celebrity.photo}
            size="lg"
          />
          {celebrity.credit ? (
            <p className="text-muted-foreground max-w-[36ch] text-xs">
              {strings.photo}:{" "}
              <a
                href={celebrity.credit.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground underline underline-offset-2"
              >
                {celebrity.credit.author} · {celebrity.credit.licence} · Wikimedia Commons
              </a>
            </p>
          ) : null}
          <DialogTitle className="mt-2 flex items-center justify-center gap-2 text-xl text-balance">
            <TierIcon aria-hidden="true" size={20} className="text-primary shrink-0" />
            {line}
          </DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button className="w-full sm:w-auto" />}>{strings.thanks}</DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/** The one-line Compliment under the Overall. It survives a screenshot and reopens the pop-up. */
export function ComplimentRow({
  compliment,
  onOpen,
}: {
  readonly compliment: Compliment;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      lang={compliment.lang}
      onClick={onOpen}
      className="hover:bg-accent focus-visible:ring-ring -mx-2 mt-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <CelebrityPicture
        key={compliment.celebrity.photo ?? compliment.celebrity.name}
        name={compliment.celebrity.name}
        photo={compliment.celebrity.photo}
        size="sm"
      />
      <span className="sr-only">{STRINGS[compliment.lang].reopen}: </span>
      <span className="truncate">{compliment.line}</span>
    </button>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/home/compliment-dialog.test.tsx`
Expected: PASS. If `toHaveAttribute("lang", "vi")` fails because `DialogPopup` drops the prop, move `lang={lang}` onto a wrapping `<div lang={lang}>` inside `DialogPopup` around the header and footer. Then assert `lang` on `screen.getByRole("dialog").querySelector("[lang]")`.

- [ ] **Step 5: Render the row and the pop-up in the results**

In `src/components/home/score-result.tsx`:

Add the imports:

```ts
import type { Compliment } from "@/lib/celebrities/compliment";

import { ComplimentDialog, ComplimentRow, useAutoOpen } from "./compliment-dialog";
```

(The second goes with the other `./` imports, beside `./claim-dialog`.)

In `interface ScoreResultViewProps`, add after `readonly crop: Crop | null;`:

```ts
  /** The server's Compliment for this result, or null when there is none. */
  readonly compliment?: Compliment | null;
```

Add `compliment = null,` to the destructured props of `ScoreResultView`. Right after `const reduced = useReducedMotion();`, add:

```ts
  const [complimentOpen, setComplimentOpen] = useAutoOpen(compliment, reduced);
```

Immediately after the closing `</div>` of the Overall block (the `div` holding the `text-5xl` number and "out of 100"), insert:

```tsx
      {compliment ? (
        <>
          <ComplimentRow compliment={compliment} onOpen={() => setComplimentOpen(true)} />
          <ComplimentDialog
            compliment={compliment}
            open={complimentOpen}
            onOpenChange={setComplimentOpen}
          />
        </>
      ) : null}
```

- [ ] **Step 6: Pass the Compliment from the upload card, staging only this line**

`src/components/home/upload-card.tsx` holds the owner's uncommitted changes. Edit the working file, then stage a version that is `HEAD` plus this one line only.

Working-file edit: in the `<ScoreResultView ... />` element, add `compliment={score.compliment}` between `crop={crop}` and `onReset={reset}`:

```tsx
          <ScoreResultView
            key="result"
            overall={score.overall}
            ratings={score.ratings}
            affinities={score.affinities}
            crop={crop}
            compliment={score.compliment}
            onReset={reset}
          />
```

- [ ] **Step 7: Typecheck, run the suite and check the build**

Run: `pnpm exec tsc --noEmit && pnpm vitest run && pnpm exec oxlint .`
Expected: no TypeScript errors, all tests PASS, no lint errors.

- [ ] **Step 8: Commit, staging only this feature's line of `upload-card.tsx`**

```bash
SCRATCH=/tmp/claude-1000/-home-jaden-nguyen-workspaces-TheFace/f873a142-b19b-49ec-8283-297387cb5517/scratchpad
pnpm exec oxfmt src/components/home/compliment-dialog.tsx src/components/home/compliment-dialog.test.tsx src/components/home/score-result.tsx
git add src/components/home/compliment-dialog.tsx src/components/home/compliment-dialog.test.tsx src/components/home/score-result.tsx

# upload-card.tsx: stage HEAD + the one compliment line, leaving the owner's hunks unstaged.
git show HEAD:src/components/home/upload-card.tsx > "$SCRATCH/upload-card.head.tsx"
python3 - "$SCRATCH/upload-card.head.tsx" <<'EOF'
import sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
old = "            crop={crop}\n            onReset={reset}\n"
new = "            crop={crop}\n            compliment={score.compliment}\n            onReset={reset}\n"
assert text.count(old) == 1, "anchor not found exactly once"
open(path, "w", encoding="utf-8").write(text.replace(old, new))
EOF
blob=$(git hash-object -w "$SCRATCH/upload-card.head.tsx")
git update-index --cacheinfo "100644,$blob,src/components/home/upload-card.tsx"
git diff --cached --stat
git diff --cached src/components/home/upload-card.tsx   # expect exactly one added line
```

Expected: the cached diff of `upload-card.tsx` is exactly `+            compliment={score.compliment}`. `git diff src/components/home/upload-card.tsx` (unstaged) still shows the owner's tone/icon changes.

```bash
git commit -m "Pop up the Compliment after the results land

The dialog opens once per result, 900ms after the results appear (at once under
reduced motion), with the Celebrity's credited Commons photo or an initials badge.
A one-line row under the Overall keeps it in screenshots and reopens it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Seed tooling: `celebs:fetch` and `celebs:score`

**Files:**
- Modify: `package.json` (devDependencies, scripts), `pnpm-lock.yaml`, `tsconfig.json` (`include`), `vitest.config.ts` (`include`), `.gitignore`
- Create: `scripts/celebrities/lib.ts`, `scripts/celebrities/fetch.ts`, `scripts/celebrities/score.ts`
- Test: `scripts/celebrities/lib.test.ts`

**Interfaces:**
- Consumes: `AUDIENCES`, `SLUG_PATTERN`, `isFreeLicence`, `CelebritySchema`, `type Celebrity`, `type Credit` from `@/lib/celebrities/schema`; `ObservationSchema`, `type Observation` from `@/lib/observation`; `jevQuestions` from `@/lib/jev/questions`; `overallFromAnswers`, `verdictFromAnswers` from `@/lib/jev/overall`.
- Produces, from `scripts/celebrities/lib.ts`:
  - path constants `SEED_DIR`, `ORIGINALS_DIR`, `CROPS_DIR`, `OBSERVATIONS_DIR`, `CANDIDATES_FILE`, `CREDITS_FILE`, `PUBLIC_DIR`, `ROSTER_FILE`
  - `CropBoxSchema`, `type CropBox`
  - `CandidateSchema`, `CandidatesSchema`, `type Candidate`
  - `stripHtml(html: string): string`
  - `resolveCrop(width: number, height: number, crop?: CropBox): { left: number; top: number; size: number }`
  - `type CommonsPage`, `parseImageInfo(page: CommonsPage): { url: string; credit: Credit }`
- Commands: `pnpm celebs:fetch [slug...]`, `pnpm celebs:score [--check]`.

- [ ] **Step 1: Add the dependencies, scripts and config**

Run: `pnpm add -D tsx sharp`
Expected: both appear under `devDependencies`. The lockfile already resolves `tsx@4.23.13` and `sharp@0.35.4`.

In `package.json` `"scripts"`, add after `"db:migrate:remote"`:

```json
    "celebs:fetch": "tsx scripts/celebrities/fetch.ts",
    "celebs:score": "tsx --env-file=.dev.vars scripts/celebrities/score.ts"
```

In `tsconfig.json`, change `"include"` to:

```json
  "include": ["src", "scripts", "*.ts", "*.config.ts", "worker-configuration.d.ts"]
```

In `vitest.config.ts`, change `include` to:

```ts
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
```

Append to `.gitignore`:

```gitignore

# Celebrity seeding: full-size and owner-supplied photos, and the crops observed by hand.
# Never committed: only the Observations and the shipped Commons photos are.
seed/celebrities/originals/
seed/celebrities/crops/
```

- [ ] **Step 2: Write the failing helper tests**

Create `scripts/celebrities/lib.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { CandidateSchema, parseImageInfo, resolveCrop, stripHtml, type CommonsPage } from "./lib";

describe("stripHtml", () => {
  it("keeps the text of a Commons Artist link", () => {
    const artist =
      '<a href="//commons.wikimedia.org/w/index.php?title=User:Htpt2507&amp;action=edit&amp;redlink=1" class="new" title="User:Htpt2507 (page does not exist)">Htpt2507</a>';
    expect(stripHtml(artist)).toBe("Htpt2507");
  });

  it("decodes entities and collapses whitespace", () => {
    expect(stripHtml("Jane &amp; John\n   Doe")).toBe("Jane & John Doe");
  });
});

describe("resolveCrop", () => {
  it("takes the top square of a portrait image", () => {
    expect(resolveCrop(800, 1200)).toEqual({ left: 0, top: 0, size: 800 });
  });

  it("centres the square of a landscape image", () => {
    expect(resolveCrop(1200, 800)).toEqual({ left: 200, top: 0, size: 800 });
  });

  it("reads a hand-set box as fractions of the width", () => {
    expect(resolveCrop(1000, 1500, { left: 0.25, top: 0.1, size: 0.5 })).toEqual({
      left: 250,
      top: 150,
      size: 500,
    });
  });

  it("shrinks a box that would run off the image", () => {
    expect(resolveCrop(1000, 1000, { left: 0.8, top: 0.9, size: 0.5 })).toEqual({
      left: 800,
      top: 900,
      size: 100,
    });
  });
});

describe("parseImageInfo", () => {
  const page: CommonsPage = {
    title: "File:Hieuthuhai 1.jpg",
    imageinfo: [
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/8/83/Hieuthuhai_1.jpg",
        descriptionurl: "https://commons.wikimedia.org/wiki/File:Hieuthuhai_1.jpg",
        extmetadata: {
          Artist: { value: "KhanhVu - Director" },
          LicenseShortName: { value: "CC BY 3.0" },
          LicenseUrl: { value: "https://creativecommons.org/licenses/by/3.0" },
        },
      },
    ],
  };

  it("returns the download URL and the credit", () => {
    expect(parseImageInfo(page)).toEqual({
      url: "https://upload.wikimedia.org/wikipedia/commons/8/83/Hieuthuhai_1.jpg",
      credit: {
        author: "KhanhVu - Director",
        licence: "CC BY 3.0",
        licenceUrl: "https://creativecommons.org/licenses/by/3.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Hieuthuhai_1.jpg",
      },
    });
  });

  it("refuses a licence that is not free", () => {
    const nonFree = structuredClone(page);
    nonFree.imageinfo![0]!.extmetadata!["LicenseShortName"] = { value: "CC BY-NC 2.0" };
    expect(() => parseImageInfo(nonFree)).toThrow(/not CC0, public domain, CC BY or CC BY-SA/);
  });

  it("credits an unknown author rather than leaving the credit empty", () => {
    const anonymous = structuredClone(page);
    delete anonymous.imageinfo![0]!.extmetadata!["Artist"];
    expect(parseImageInfo(anonymous).credit.author).toBe("Unknown author");
  });

  it("fails clearly when Commons returns no file", () => {
    expect(() => parseImageInfo({ title: "File:Missing.jpg" })).toThrow(/no file URL/);
  });
});

describe("CandidateSchema", () => {
  const base = { slug: "tran-thanh", name: "Trấn Thành", audience: "vn" };

  it("accepts a Commons Candidate and an owner-photo Candidate", () => {
    expect(
      CandidateSchema.safeParse({ ...base, commonsFile: "File:Trấn Thành.jpg", localPhoto: null })
        .success,
    ).toBe(true);
    expect(
      CandidateSchema.safeParse({
        ...base,
        commonsFile: null,
        localPhoto: "seed/celebrities/originals/tran-thanh.png",
      }).success,
    ).toBe(true);
  });

  it("needs exactly one photo source", () => {
    expect(CandidateSchema.safeParse({ ...base, commonsFile: null, localPhoto: null }).success).toBe(
      false,
    );
    expect(
      CandidateSchema.safeParse({ ...base, commonsFile: "File:A.jpg", localPhoto: "a.png" }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run scripts/celebrities/lib.test.ts`
Expected: FAIL with "Failed to resolve import "./lib"".

- [ ] **Step 4: Implement `lib.ts`**

Create `scripts/celebrities/lib.ts`:

```ts
/**
 * Pure helpers for seeding the Roster. No network and no file system: those live in
 * `fetch.ts` and `score.ts`, so everything here is unit tested.
 *
 * See docs/superpowers/specs/2026-10-05-celebrity-compliments-design.md, "Seeding the Roster".
 */
import { z } from "zod";

import { AUDIENCES, isFreeLicence, SLUG_PATTERN, type Credit } from "@/lib/celebrities/schema";

export const SEED_DIR = "seed/celebrities";
/** Full-size downloads and owner-supplied photos. Gitignored. */
export const ORIGINALS_DIR = `${SEED_DIR}/originals`;
/** 512px face crops, the Celebrity equivalent of a Crop. Gitignored. */
export const CROPS_DIR = `${SEED_DIR}/crops`;
export const OBSERVATIONS_DIR = `${SEED_DIR}/observations`;
export const CANDIDATES_FILE = `${SEED_DIR}/candidates.json`;
export const CREDITS_FILE = `${SEED_DIR}/credits.json`;
/** The shipped 256px Commons photos. */
export const PUBLIC_DIR = "public/celebrities";
export const ROSTER_FILE = "src/lib/celebrities/roster.json";

/** A hand-set face square: `left` and `size` are fractions of the width, `top` of the height. */
export const CropBoxSchema = z.object({
  left: z.number().min(0).max(1),
  top: z.number().min(0).max(1),
  size: z.number().gt(0).max(1),
});
export type CropBox = z.infer<typeof CropBoxSchema>;

export const CandidateSchema = z
  .object({
    slug: z.string().regex(SLUG_PATTERN),
    name: z.string().min(1),
    audience: z.enum(AUDIENCES),
    /** "File:Trấn Thành.jpg": a Commons photo, shipped with its credit. */
    commonsFile: z.string().startsWith("File:").nullable(),
    /** An owner-supplied photo under ORIGINALS_DIR: observed only, never shipped. */
    localPhoto: z.string().nullable(),
    crop: CropBoxSchema.optional(),
  })
  .refine(
    (candidate) => (candidate.commonsFile === null) !== (candidate.localPhoto === null),
    "exactly one of commonsFile and localPhoto",
  );
export type Candidate = z.infer<typeof CandidateSchema>;
export const CandidatesSchema = z.array(CandidateSchema);

const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/** Commons metadata arrives as HTML. The credit shows plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The face square in pixels. Without a hand-set box: the full width from the top of a
 * portrait image, or the centred square of a landscape one. A box that would run off the
 * image is shrunk to fit.
 */
export function resolveCrop(
  width: number,
  height: number,
  crop?: CropBox,
): { left: number; top: number; size: number } {
  const side = Math.min(width, height);
  if (!crop) {
    return { left: width > height ? Math.round((width - side) / 2) : 0, top: 0, size: side };
  }
  const left = Math.round(crop.left * width);
  const top = Math.round(crop.top * height);
  const size = Math.max(1, Math.min(Math.round(crop.size * width), width - left, height - top));
  return { left, top, size };
}

/** One page of a Commons `prop=imageinfo&iiprop=url|extmetadata&formatversion=2` response. */
export interface CommonsPage {
  title: string;
  imageinfo?: Array<{
    url?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: unknown }>;
  }>;
}

/** The download URL and the credit, or a throw naming the file and the reason. */
export function parseImageInfo(page: CommonsPage): { url: string; credit: Credit } {
  const info = page.imageinfo?.[0];
  if (!info?.url || !info.descriptionurl) {
    throw new Error(`${page.title}: Commons returned no file URL`);
  }
  const meta = info.extmetadata ?? {};
  const text = (key: string): string => {
    const value = meta[key]?.value;
    return typeof value === "string" ? stripHtml(value) : "";
  };
  const licence = text("LicenseShortName");
  if (!isFreeLicence(licence)) {
    throw new Error(
      `${page.title}: licence "${licence || "unknown"}" is not CC0, public domain, CC BY or CC BY-SA`,
    );
  }
  return {
    url: info.url,
    credit: {
      author: text("Artist") || "Unknown author",
      licence,
      licenceUrl: text("LicenseUrl") || null,
      sourceUrl: info.descriptionurl,
    },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/celebrities/lib.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement `fetch.ts`**

Create `scripts/celebrities/fetch.ts`:

```ts
/**
 * Seeding, step 1: download each Celebrity's photo and cut the face crops.
 *
 *   pnpm celebs:fetch                 every Candidate
 *   pnpm celebs:fetch tran-thanh lisa only the slugs named
 *
 * Commons Candidates: the original goes to ORIGINALS_DIR, a 512px crop to CROPS_DIR (for the
 * hand-written Observation) and a 256px WebP to PUBLIC_DIR (shipped), and the credit goes to
 * CREDITS_FILE. Owner-photo Candidates: only the 512px crop. Their photo is never shipped.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import sharp from "sharp";

import type { Credit } from "@/lib/celebrities/schema";

import {
  CANDIDATES_FILE,
  CandidatesSchema,
  CREDITS_FILE,
  CROPS_DIR,
  ORIGINALS_DIR,
  parseImageInfo,
  PUBLIC_DIR,
  resolveCrop,
  type Candidate,
  type CommonsPage,
} from "./lib";

// Generic on purpose: no personal data in requests.
const USER_AGENT = "TheFace-seed/0.1 (celebrity roster seeding; local script)";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

async function commonsInfo(file: string): Promise<{ url: string; credit: Credit }> {
  const params = new URLSearchParams({
    action: "query",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    format: "json",
    formatversion: "2",
    titles: file,
  });
  const response = await fetch(`${COMMONS_API}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`${file}: Commons API answered ${response.status}`);
  const body = (await response.json()) as { query?: { pages?: CommonsPage[] } };
  const page = body.query?.pages?.[0];
  if (!page) throw new Error(`${file}: not found on Commons`);
  return parseImageInfo(page);
}

async function download(url: string, to: string): Promise<void> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`download answered ${response.status}`);
  await writeFile(to, Buffer.from(await response.arrayBuffer()));
}

async function cut(candidate: Candidate, original: string): Promise<void> {
  // Bake EXIF orientation in first, so the crop box is measured on the upright image.
  const upright = await sharp(original).rotate().toBuffer();
  const { width, height } = await sharp(upright).metadata();
  if (!width || !height) throw new Error(`${original}: unreadable image`);
  const box = resolveCrop(width, height, candidate.crop);
  const face = sharp(upright).extract({
    left: box.left,
    top: box.top,
    width: box.size,
    height: box.size,
  });
  await face.clone().resize(512, 512).jpeg({ quality: 90 }).toFile(`${CROPS_DIR}/${candidate.slug}.jpg`);
  if (candidate.commonsFile) {
    await face
      .clone()
      .resize(256, 256)
      .webp({ quality: 82 })
      .toFile(`${PUBLIC_DIR}/${candidate.slug}.webp`);
  }
}

const only = new Set(process.argv.slice(2));
const candidates = CandidatesSchema.parse(JSON.parse(await readFile(CANDIDATES_FILE, "utf8"))).filter(
  (candidate) => only.size === 0 || only.has(candidate.slug),
);
await Promise.all([ORIGINALS_DIR, CROPS_DIR, PUBLIC_DIR].map((dir) => mkdir(dir, { recursive: true })));
const credits: Record<string, Credit> = existsSync(CREDITS_FILE)
  ? (JSON.parse(await readFile(CREDITS_FILE, "utf8")) as Record<string, Credit>)
  : {};

const failures: string[] = [];
for (const candidate of candidates) {
  try {
    let original: string;
    if (candidate.commonsFile) {
      const { url, credit } = await commonsInfo(candidate.commonsFile);
      const extension = (/\.(jpe?g|png|webp)$/i.exec(new URL(url).pathname)?.[1] ?? "jpg").toLowerCase();
      original = `${ORIGINALS_DIR}/${candidate.slug}.${extension}`;
      if (!existsSync(original)) await download(url, original);
      credits[candidate.slug] = credit;
    } else {
      original = candidate.localPhoto ?? "";
      if (!existsSync(original)) throw new Error(`owner photo missing at ${original}`);
      delete credits[candidate.slug];
    }
    await cut(candidate, original);
    console.log(
      `ok    ${candidate.slug.padEnd(22)} ${credits[candidate.slug]?.licence ?? "owner photo (initials badge)"}`,
    );
  } catch (error) {
    failures.push(candidate.slug);
    console.error(`FAIL  ${candidate.slug.padEnd(22)} ${error instanceof Error ? error.message : String(error)}`);
  }
  // Be polite to Commons.
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const sorted = Object.fromEntries(Object.entries(credits).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(CREDITS_FILE, `${JSON.stringify(sorted, null, 2)}\n`);

if (failures.length > 0) {
  console.error(`\n${failures.length} failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
```

- [ ] **Step 7: Implement `score.ts`**

Create `scripts/celebrities/score.ts`:

```ts
/**
 * Seeding, step 3: judge each hand-written Observation with the real Jev questions, the real
 * Verdict and the real `overallFromAnswers`, then write the Roster.
 *
 *   pnpm celebs:score          score and write src/lib/celebrities/roster.json
 *   pnpm celebs:score --check  validate the Observation files only; no Jev call
 *
 * A Celebrity who fails the Verdict is skipped and reported, never overridden (ADR-0009).
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

import { TypeSafeClient } from "@typesafe-ai/sdk";

import { CelebritySchema, type Celebrity, type Credit } from "@/lib/celebrities/schema";
import { overallFromAnswers, verdictFromAnswers } from "@/lib/jev/overall";
import { jevQuestions } from "@/lib/jev/questions";
import { ObservationSchema, type Observation } from "@/lib/observation";

import { CANDIDATES_FILE, CandidatesSchema, CREDITS_FILE, OBSERVATIONS_DIR, ROSTER_FILE } from "./lib";

const checkOnly = process.argv.includes("--check");
const candidates = CandidatesSchema.parse(JSON.parse(await readFile(CANDIDATES_FILE, "utf8")));
const credits: Record<string, Credit> = existsSync(CREDITS_FILE)
  ? (JSON.parse(await readFile(CREDITS_FILE, "utf8")) as Record<string, Credit>)
  : {};

// 1. Every Observation validates before anything is sent.
const observations = new Map<string, Observation>();
const problems: string[] = [];
for (const candidate of candidates) {
  const file = `${OBSERVATIONS_DIR}/${candidate.slug}.json`;
  if (!existsSync(file)) {
    problems.push(`${candidate.slug}: no Observation at ${file}`);
    continue;
  }
  const parsed = ObservationSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    problems.push(`${candidate.slug}: ${fields.join("; ")}`);
    continue;
  }
  observations.set(candidate.slug, parsed.data);
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${observations.size} Observations valid.`);
if (checkOnly) process.exit(0);

// 2. Jev, asked exactly as scoreCrop asks it.
const apiKey = process.env["TYPESAFE_API_KEY"];
if (!apiKey) {
  console.error("TYPESAFE_API_KEY is not set. Run `pnpm celebs:score`, which loads .dev.vars.");
  process.exit(1);
}
const client = new TypeSafeClient({ apiKey });

async function judge(observation: Observation) {
  try {
    return await client.systemOne({ state: observation, questions: jevQuestions });
  } catch {
    // One retry, for a dropped connection.
    return client.systemOne({ state: observation, questions: jevQuestions });
  }
}

const roster: Celebrity[] = [];
const skipped: string[] = [];
for (const candidate of candidates) {
  const observation = observations.get(candidate.slug);
  if (!observation) continue;
  try {
    const { answers } = await judge(observation);
    const verdict = verdictFromAnswers(answers);
    if (!verdict.passed) {
      skipped.push(
        `${candidate.slug}: failed the Verdict (oneAdultFace ${verdict.oneAdultFace.toFixed(2)}, realPhotograph ${verdict.realPhotograph.toFixed(2)}, apparentMinor ${verdict.apparentMinor.toFixed(2)})`,
      );
      continue;
    }
    const credit = candidate.commonsFile ? (credits[candidate.slug] ?? null) : null;
    if (candidate.commonsFile && !credit) {
      skipped.push(`${candidate.slug}: no credit yet; run pnpm celebs:fetch ${candidate.slug}`);
      continue;
    }
    roster.push(
      CelebritySchema.parse({
        slug: candidate.slug,
        name: candidate.name,
        audience: candidate.audience,
        overall: Number(overallFromAnswers(answers, observation).toFixed(2)),
        photo: candidate.commonsFile ? `/celebrities/${candidate.slug}.webp` : null,
        credit,
      }),
    );
  } catch (error) {
    skipped.push(`${candidate.slug}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

roster.sort((a, b) => a.slug.localeCompare(b.slug));
await writeFile(ROSTER_FILE, `${JSON.stringify(roster, null, 2)}\n`);

// 3. A table for the owner to review, highest first within each Audience.
for (const audience of ["vn", "global"] as const) {
  console.log(`\n${audience}`);
  const pool = roster.filter((celebrity) => celebrity.audience === audience);
  for (const celebrity of pool.sort((a, b) => b.overall - a.overall)) {
    console.log(`  ${celebrity.overall.toFixed(1).padStart(5)}  ${celebrity.name}`);
  }
}
if (skipped.length > 0) {
  console.error(`\nSkipped:\n  ${skipped.join("\n  ")}`);
  process.exitCode = 1;
}
```

- [ ] **Step 8: Check the tooling end to end on an empty seed**

Run:

```bash
mkdir -p seed/celebrities/observations
echo '[]' > seed/celebrities/candidates.json
pnpm celebs:score --check
pnpm celebs:fetch
```

Expected: `0 Observations valid.` from the first command. The second exits 0 and writes `seed/celebrities/credits.json` as `{}`. If `tsx` cannot resolve `@/...` imports, confirm `tsconfig.json` still has `"paths": { "@/*": ["./src/*"] }`. tsx reads it from the project root.

Run: `pnpm exec tsc --noEmit && pnpm vitest run && pnpm exec oxlint .`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
pnpm exec oxfmt scripts/celebrities vitest.config.ts
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts .gitignore scripts/celebrities seed/celebrities/candidates.json seed/celebrities/credits.json
git commit -m "Add the Celebrity seed scripts: celebs:fetch and celebs:score

fetch downloads freely licensed Commons photos with their credits and cuts the
crops; score judges hand-written Observations with the real Jev questions and
Verdict and writes the Roster. Owner-supplied photos are gitignored.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Seed photos: Candidates, downloads and crops

**Files:**
- Modify: `seed/celebrities/candidates.json`, `seed/celebrities/credits.json`
- Create: `public/celebrities/<slug>.webp` (Commons Candidates only)
- Create, gitignored: `seed/celebrities/originals/*`, `seed/celebrities/crops/*.jpg`

**Interfaces:**
- Consumes: `pnpm celebs:fetch` from Task 6; the `Candidate` shape (`slug`, `name`, `audience`, `commonsFile`, `localPhoto`, optional `crop`).
- Produces: one 512px crop per Candidate in `seed/celebrities/crops/`, a credit per Commons Candidate in `credits.json`, and a 256px WebP per Commons Candidate in `public/celebrities/`.

- [ ] **Step 1: Copy the owner's photos into place**

```bash
IMAGES=/tmp/claude-1000/-home-jaden-nguyen-workspaces-TheFace/f873a142-b19b-49ec-8283-297387cb5517/images
mkdir -p seed/celebrities/originals
cp "$IMAGES/1.png" seed/celebrities/originals/duong-gio-tai.png
cp "$IMAGES/4.png" seed/celebrities/originals/ha-moi.png
cp "$IMAGES/7.png" seed/celebrities/originals/nang-mo.png
cp "$IMAGES/6.png" seed/celebrities/originals/phung-khanh-linh-owner.png   # backup only; her Commons photo is used
ls -la seed/celebrities/originals
```

Expected: four files. If `$IMAGES` no longer exists, stop and ask the owner to paste the three photos again (Dương Gió Tai, Hà Môi, Nàng Mơ).

- [ ] **Step 2: Choose a Commons file for each Commons Candidate**

List the free files for a name with:

```bash
q="Anne Hathaway"; curl -s -A "TheFace-seed/0.1 (celebrity roster seeding; local script)" \
  "https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=10&format=json&srsearch=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$q")" \
  | python3 -c 'import json,sys;[print(r["title"]) for r in json.load(sys.stdin)["query"]["search"]]'
```

Pick, per person, a file that:
- shows the face frontal or near-frontal, without sunglasses and without a hand over the face;
- has the face at least ~300px wide in the original;
- shows the person as an adult, preferring photos from 2015 or later;
- is a single person, or a group photo where a crop box can isolate the person.

For the Vietnamese pool, start from these files, found during brainstorming. Replace any that fail the licence check or the criteria above:

| slug | name | commonsFile |
| --- | --- | --- |
| `jack` | Jack J97 | `File:Jack - J97.png` |
| `tran-thanh` | Trấn Thành | `File:Trấn Thành.jpg` |
| `truong-giang` | Trường Giang | `File:Trường Giang 2026.png` |
| `hieuthuhai` | HIEUTHUHAI | `File:Hieuthuhai 1.jpg` |
| `le-duong-bao-lam` | Lê Dương Bảo Lâm | `File:Lê Dương Bảo Lâm.png` |
| `nam-em` | Nam Em | `File:Nam Em 2020.png` |
| `do-mixi` | Độ Mixi | `File:20190411 Độ Mixi.jpg` |
| `vo-hoang-yen` | Võ Hoàng Yến | `File:Võ Hoàng Yến.jpg` |
| `huong-giang` | Hương Giang | `File:Huong Giang in 2015 (cropped).png` |
| `wren-evans` | Wren Evans | `File:Wren Evans.png` |
| `chi-phien` | Chị Phiến | `File:Chị Phiến.png` |
| `co-phuong-hang` | Cô Phương Hằng | `File:20181013 Nguyễn Phương Hằng at Talkshow (cropped).png` |
| `phung-khanh-linh` | Phùng Khánh Linh | `File:Phùng Khánh Linh năm 2025.jpg` |

International pool slugs and names (search for each):
- `anne-hathaway` Anne Hathaway, `zendaya` Zendaya, `margot-robbie` Margot Robbie, `scarlett-johansson` Scarlett Johansson, `gal-gadot` Gal Gadot, `beyonce` Beyoncé
- `taylor-swift` Taylor Swift, `rihanna` Rihanna, `deepika-padukone` Deepika Padukone, `ana-de-armas` Ana de Armas, `lisa` Lisa (BLACKPINK), `emma-watson` Emma Watson
- `timothee-chalamet` Timothée Chalamet, `brad-pitt` Brad Pitt, `chris-hemsworth` Chris Hemsworth, `keanu-reeves` Keanu Reeves, `ryan-gosling` Ryan Gosling, `henry-cavill` Henry Cavill
- `tom-holland` Tom Holland, `cha-eun-woo` Cha Eun-woo, `v` V (BTS), `idris-elba` Idris Elba, `cristiano-ronaldo` Cristiano Ronaldo, `michael-b-jordan` Michael B. Jordan

If a person has no usable free file, substitute someone of similar standing and the same gender, and record the substitution for the owner report in Task 9.

- [ ] **Step 3: Write `candidates.json`**

Write `seed/celebrities/candidates.json` as an array of 40 entries: the 24 international and 13 Vietnamese Commons Candidates with `"localPhoto": null`, plus these three owner-photo Candidates:

```json
  { "slug": "duong-gio-tai", "name": "Dương Gió Tai", "audience": "vn", "commonsFile": null, "localPhoto": "seed/celebrities/originals/duong-gio-tai.png" },
  { "slug": "ha-moi", "name": "Hà Môi", "audience": "vn", "commonsFile": null, "localPhoto": "seed/celebrities/originals/ha-moi.png" },
  { "slug": "nang-mo", "name": "Nàng Mơ", "audience": "vn", "commonsFile": null, "localPhoto": "seed/celebrities/originals/nang-mo.png" }
```

A Commons entry looks like:

```json
  { "slug": "tran-thanh", "name": "Trấn Thành", "audience": "vn", "commonsFile": "File:Trấn Thành.jpg", "localPhoto": null }
```

International entries use `"audience": "global"`.

- [ ] **Step 4: Fetch**

Run: `pnpm celebs:fetch`
Expected: `ok` lines for all 40. For each `FAIL` (non-free licence, missing file), choose another file in `candidates.json` and re-run with just that slug, e.g. `pnpm celebs:fetch lisa`.

- [ ] **Step 5: Check every crop by eye and set crop boxes**

Open each `seed/celebrities/crops/<slug>.jpg` with the Read tool. A good crop matches a Visitor's Crop: the whole face from hairline to chin, roughly centred, filling about 50–70% of the square, no other face fully in frame.

For each bad crop, open the original (`seed/celebrities/originals/<slug>.*`) and add a `crop` box to that Candidate. `left` and `size` are fractions of the image **width**, `top` of the image **height**:

```json
  { "slug": "brad-pitt", "name": "Brad Pitt", "audience": "global", "commonsFile": "File:…", "localPhoto": null, "crop": { "left": 0.28, "top": 0.06, "size": 0.42 } }
```

Re-run `pnpm celebs:fetch <slug>` and re-check the crop until it is right.

- [ ] **Step 6: Check the shipped photos' weight**

Run: `du -ch public/celebrities/*.webp | tail -1 && ls public/celebrities | wc -l`
Expected: 37 files, the Commons Candidates. Total under about 1 MB.

- [ ] **Step 7: Commit**

```bash
git status --short seed public   # originals/ and crops/ must NOT appear
git add seed/celebrities/candidates.json seed/celebrities/credits.json public/celebrities
git commit -m "Seed the Celebrity photos: 40 Candidates, 37 credited Commons photos

Owner-supplied photos for Dương Gió Tai, Hà Môi and Nàng Mơ stay gitignored and
are used for their Observations only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Write the Observations by hand

**Files:**
- Create: `seed/celebrities/observations/<slug>.json` (40 files)

**Interfaces:**
- Consumes: the 512px crops from Task 7; `ObservationSchema` and its enums in `src/lib/observation/schema.ts`; the rules in `OBSERVATION_SYSTEM_PROMPT` in `src/lib/observation/prompt.ts`.
- Produces: one Observation per Candidate that `pnpm celebs:score --check` accepts.

The owner chose this step deliberately (ADR-0009). Claude reads each crop and writes the Observation, in place of the Workers AI vision model.

- [ ] **Step 1: Load the rules**

Read `src/lib/observation/prompt.ts` (all eight rules and the banned adjective list) and the whole of `src/lib/observation/schema.ts`. The enum lists there are the only allowed values. Also read the `validObservation()` fixture at the top of `src/lib/observation/observation.test.ts`; it is a complete, valid example to copy the field order from.

- [ ] **Step 2: Write the Observations, ten at a time**

For each Candidate, in `candidates.json` order:
1. Open `seed/celebrities/crops/<slug>.jpg` with the Read tool. Use the crop only, never the original or what you know of the person: Mistral sees only the crop, and the Roster must be judged the same way.
2. Write `seed/celebrities/observations/<slug>.json` with **every** schema field filled:
   - `mediaKind` is what the crop shows (`"photograph"` for a real photo).
   - `faceCount` counts faces fully in the crop.
   - `apparentAgeBracket` is what is visible, not the person's known age (Rule 8).
   - Where a feature is hidden, too soft or cut off, use the enum's `not_visible` / `not_assessable` / `obscured` value (Rule 7). Never guess.
   - Free-text fields, such as `asymmetryNote`, use neutral anatomical words only. None of the banned adjective kinds, no names, nothing about origin, ethnicity or skin colour (Rules 1, 3 and 5).
3. After every ten files, run `pnpm celebs:score --check` and fix whatever it names before writing the next ten.

- [ ] **Step 3: Validate all 40 and screen for evaluative words**

Run: `pnpm celebs:score --check`
Expected: `40 Observations valid.`

Run: `grep -l -i -E "beautiful|handsome|pretty|cute|stunning|striking|gorgeous|flawless|perfect|attractive|ideal|great|ugly|plain" seed/celebrities/observations/*.json`
Expected: no output. Any hit is a Rule 3 breach: rewrite that field in neutral words.

- [ ] **Step 4: Commit**

```bash
git add seed/celebrities/observations
git commit -m "Add hand-written Observations for the 40 Celebrity Candidates

Written from each 512px crop under the vision prompt's rules: neutral facts,
closed enums, no evaluation. ADR-0009.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Score the Roster, lock it with tests, document it

**Files:**
- Modify: `src/lib/celebrities/roster.json` (generated)
- Create: `src/lib/celebrities/roster.test.ts`
- Create: `docs/adr/0009-celebrities-observed-by-hand.md`
- Modify: `docs/adr/README.md`, `SPEC.md`

**Interfaces:**
- Consumes: `pnpm celebs:score`; `loadRoster()` from `./roster`.
- Produces: a committed Roster with at least 24 `global` and 14 `vn` Celebrities.

- [ ] **Step 1: Write the failing Roster test**

Create `src/lib/celebrities/roster.test.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadRoster } from "./roster";
import rosterJson from "./roster.json";

describe("the committed Roster", () => {
  it("passes its schema: free licences, credits with photos, unique slugs", () => {
    expect(loadRoster()).toHaveLength(rosterJson.length);
  });

  it("holds at least 24 international and 14 Vietnamese Celebrities", () => {
    const roster = loadRoster();
    expect(roster.filter((celebrity) => celebrity.audience === "global").length).toBeGreaterThanOrEqual(24);
    expect(roster.filter((celebrity) => celebrity.audience === "vn").length).toBeGreaterThanOrEqual(14);
  });

  it("ships every photo it points at", () => {
    for (const { photo } of loadRoster()) {
      if (photo !== null) expect(existsSync(join("public", photo)), photo).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/celebrities/roster.test.ts`
Expected: FAIL on the size test (the Roster is still `[]`).

- [ ] **Step 3: Score**

Run: `pnpm celebs:score`
Expected: two tables (`vn`, `global`) of raw Overalls. It may end with a `Skipped:` list. For each skip:
- **Failed the Verdict:** do not loosen anything. Choose a different photo for that person (Task 7, Steps 2–5), rewrite their Observation (Task 8), and re-run. If no other photo passes, leave them out and report it.
- **No credit yet:** run `pnpm celebs:fetch <slug>`, then re-run.

- [ ] **Step 4: Run the Roster test to verify it passes**

Run: `pnpm vitest run src/lib/celebrities`
Expected: PASS. If a pool is under its floor because of Verdict skips, add substitutes (Tasks 7–8) until it passes.

- [ ] **Step 5: Write ADR-0009**

Create `docs/adr/0009-celebrities-observed-by-hand.md`:

```markdown
# Celebrities are observed by hand, judged by Jev, and never shown rated

Status: accepted. Date: 2026-10-05

After scoring, a Compliment compares the Visitor with a Celebrity from the Roster, so every
Celebrity needs an Overall. Claude writes each Celebrity's Observation by reading a 512px
crop of their photo, under the same rules the vision model follows. The same Jev questions,
the same Verdict and the same `overallFromAnswers` that judge a Visitor then judge it.

## Why

The owner chose this over running the photos through the Workers AI model. It needs no extra
vendor key, and the Observations are committed, so the Roster can be re-scored and reviewed
without a vision call.

The cost is comparability. Two observers describe one face differently, so Celebrity
Overalls may sit a few points off Visitor Overalls. `MATCH_MARGIN` absorbs the gap. The
Compliment is relative and always flattering, so a gap moves a Visitor between tiers; it
never produces an insult.

Every Celebrity passes the real Verdict. A youthful-looking adult whose photo fails it is left
off the Roster, not let through. The Verdict protects minors, and an exception for anyone
weakens it for everyone.

A Celebrity's number is never shown. A public page that prints a real person's appearance
rating invites a dispute with that person. Only the server reads the Roster, and a Compliment
carries a name, a photo and a credit, never a number.

## Consequences

The Roster changes only by editing `seed/celebrities/`, re-running `pnpm celebs:fetch` and
`pnpm celebs:score`, and redeploying. Owner-supplied photos are used for the Observation
only. They are never committed or shipped, and those Celebrities appear with an initials
badge.

Import `src/lib/celebrities/roster.ts` from server code only. A client import would ship
every Celebrity's number to every browser.
```

In `docs/adr/README.md`, add after the 0008 row:

```markdown
| [0009](./0009-celebrities-observed-by-hand.md) | Celebrities are observed by hand, judged by Jev, and never shown rated | accepted |
```

- [ ] **Step 6: Add the feature to `SPEC.md`**

In the `## Contents` list, insert `8. [Celebrity Compliments](#celebrity-compliments)` after `7. [The results page](#the-results-page)`, and renumber the items after it, 9 through 18.

Insert this section immediately before `## Why Screening and Verdict are ours to build`:

```markdown
## Celebrity Compliments

After the results appear, a pop-up compares the Visitor with one Celebrity and flatters
them: "More beautiful than Anne Hathaway. Not even close." The design is
[`docs/superpowers/specs/2026-10-05-celebrity-compliments-design.md`](./docs/superpowers/specs/2026-10-05-celebrity-compliments-design.md).

- **The Roster** holds about 24 international and 16 Vietnamese Celebrities. Each Overall
  comes from an Observation written by hand and judged by the real Jev questions and Verdict.
  See [ADR-0009](./docs/adr/0009-celebrities-observed-by-hand.md).
- **The server chooses the Compliment** inside `scoreCrop`, so no Celebrity's number reaches
  a browser. The choice is seeded by the Overall, so the same image always gets the same
  Compliment.
- **Three tiers, all flattering.** `top` beats the whole pool, `above` beats some of it, and
  `league` beats none and is still a compliment. A Visitor beats a Celebrity within
  `MATCH_MARGIN`.
- **The Audience.** A request from Vietnam (`cf-ipcountry: VN`) gets Vietnamese lines and the
  Vietnamese pool 70% of the time. The Audience never comes from the face (ADR-0003).
- **Photos** come from Wikimedia Commons under CC0, public domain, CC BY or CC BY-SA, and
  show their credit. A Celebrity without a free photo shows an initials badge.

The numbers a Visitor sees are curved, and the numbers TheFace stores are raw. See
[ADR-0008](./docs/adr/0008-shown-number-curved-stored-number-raw.md).
```

In the "Constants to calibrate after launch" table, add these rows after the `Screening face-area threshold` row:

```markdown
| Display exponent              | 0.4                        | How the shown numbers feel. 1 switches the curve off (ADR-0008)                                                                       |
| Compliment match margin       | 3 raw points               | The calibration probe, then the Tally against Roster numbers                                                                          |
| Vietnamese pool share         | 0.7                        | Whether Visitors in Vietnam enjoy local or international names more                                                                   |
```

- [ ] **Step 7: Full check, then commit**

Run: `pnpm check && pnpm test`
Expected: clean, all PASS.

```bash
git add src/lib/celebrities/roster.json src/lib/celebrities/roster.test.ts docs/adr/0009-celebrities-observed-by-hand.md docs/adr/README.md SPEC.md
git commit -m "Score the Roster and document Celebrity Compliments

ADR-0009 records why Celebrities are observed by hand, why they pass the real
Verdict, and why their numbers never leave the server.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Report the Roster to the owner**

Paste the `pnpm celebs:score` tables into the conversation, together with every substitution (Task 7) and every Verdict skip (this task). This is a report, not a gate: the owner may ask to drop or swap names afterwards.

---

### Task 10: End-to-end verification

**Files:**
- Modify (only if the calibration probe says so): `src/lib/celebrities/compliment.ts` (`MATCH_MARGIN`), the matching row in `SPEC.md`'s constants table

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: The static checks**

Run: `pnpm check && pnpm test`
Expected: clean, all PASS.

- [ ] **Step 2: No Roster in the client bundle**

```bash
SCRATCH=/tmp/claude-1000/-home-jaden-nguyen-workspaces-TheFace/f873a142-b19b-49ec-8283-297387cb5517/scratchpad
pnpm build
node -e 'for (const c of require("./src/lib/celebrities/roster.json")) if (/^[\x20-\x7e]+$/.test(c.name) && c.name.length > 4) console.log(c.name)' > "$SCRATCH/names.txt"
if grep -rlF --include='*.js' -f "$SCRATCH/names.txt" dist/client; then echo "LEAK: Roster names in the client bundle"; else echo "clean: no Roster in the client bundle"; fi
grep -rlF --include='*.js' -f "$SCRATCH/names.txt" dist/server | head -1
```

Expected: `clean: no Roster in the client bundle`, and the last command prints one server file (proof the search works). On a LEAK, find which client module imports `@/lib/celebrities/roster` or `compliment` at runtime (not `import type`) and fix that import. Do not continue until it is clean.

- [ ] **Step 3: Start the app**

Run `pnpm dev` in the background (`run_in_background: true`) and read its output for the local URL. The AI binding is remote, so each scoring spends real Workers AI neurons (about 53 each) and one Jev call. This task uses about 12 scorings. The daily cap is 25 per IP (`DAILY_LIMIT`).

- [ ] **Step 4: Repeatability, five times**

Using the Playwright browser tools: open the app, press "Upload image", upload `seed/celebrities/originals/anne-hathaway.<ext>` (any Commons original of an adult works) and press "Find out". Wait for "out of 100". Then press "Try again" and repeat with the same file, five times in all.

From the dev server output, record the five `[theface:score] scored { overall: … }` values and confirm the five `observation` logs are identical.

Expected: five identical Overalls. **If they differ: stop.** Report the five values to the owner and ask about the hash-cache fallback (spec, "Repeatable scores") before doing anything else.

- [ ] **Step 5: The calibration probe**

Score two more Commons originals the same way, for example `tran-thanh` and `brad-pitt`. With `anne-hathaway`, compute `gap = mean(roster.overall − logged overall)` over the three.

If `gap > 3`, set `MATCH_MARGIN` in `src/lib/celebrities/compliment.ts` to `Math.round(gap)`, update the "Compliment match margin" row in `SPEC.md`, run `pnpm test`, and commit:

```bash
git add src/lib/celebrities/compliment.ts SPEC.md
git commit -m "Calibrate MATCH_MARGIN to the measured Roster-to-Visitor gap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Otherwise leave it at 3 and record the measured gap for the final report.

- [ ] **Step 6: See both pop-ups**

On the first scoring above, take a screenshot of the English pop-up (`browser_take_screenshot`, saved to `$SCRATCH/compliment-en.png`). Then check:
- the pop-up appeared about a second after the result;
- the photo and credit link are shown;
- closing it leaves the one-line row, and the row reopens it;
- the Overall shows the curved number, matching the "Score detail" dialog.

Then append `AUDIENCE_OVERRIDE=vn` as a new last line of `.dev.vars`, restart `pnpm dev`, score once more, and save `$SCRATCH/compliment-vi.png`. Expected: Vietnamese line, "Biết rồi mà 😎", and a Vietnamese or international Celebrity. **Afterwards remove that line from `.dev.vars`** (`sed -i '/^AUDIENCE_OVERRIDE=vn$/d' .dev.vars`) and stop the dev server.

- [ ] **Step 7: Final report**

Report to the owner:
- the five repeatability Overalls;
- the measured calibration gap and the resulting `MATCH_MARGIN`;
- the two screenshot paths;
- the leak-check result;
- the `pnpm check && pnpm test` result.

Then use superpowers:finishing-a-development-branch to decide how to integrate `feat/celebrity-compliments`.
