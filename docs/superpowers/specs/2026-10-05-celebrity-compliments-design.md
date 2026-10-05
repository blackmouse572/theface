# Celebrity Compliments - Design Spec

Status: agreed in brainstorming, not yet implemented. Date: 2026-10-05.
Branch: `feat/celebrity-compliments`.

- Vocabulary: [`CONTEXT.md`](../../../CONTEXT.md). This spec adds four terms (see "Docs to update").
- The product this extends: [`SPEC.md`](../../../SPEC.md).

## Contents

1. [Intent](#intent)
2. [Decisions at a glance](#decisions-at-a-glance)
3. [Why the numbers are low](#why-the-numbers-are-low)
4. [Repeatable scores](#repeatable-scores)
5. [The display curve](#the-display-curve)
6. [The Roster](#the-roster)
7. [Seeding the Roster](#seeding-the-roster)
8. [Audience](#audience)
9. [Choosing the Compliment](#choosing-the-compliment)
10. [The pop-up](#the-pop-up)
11. [Failure handling](#failure-handling)
12. [Privacy, licensing and risk](#privacy-licensing-and-risk)
13. [Testing](#testing)
14. [Docs to update](#docs-to-update)
15. [Constants to calibrate](#constants-to-calibrate)
16. [Out of scope](#out-of-scope)

## Intent

**What the owner asked for.** After a Visitor is scored, a pop-up compares them with a
celebrity and makes a flattering joke: "Wow, top five in the world", "you are more beautiful
than X", "you have the beauty of this man". The goal, in the owner's words: "just make me
happy."

- 20–30 international celebrities, men and women, plus Vietnamese celebrities that are shown
  only to Visitors in Vietnam.
- The celebrities' numbers are seeded by Claude's own eyes (this session reads each photo
  and writes the Observation), not by the Workers AI vision model.
- The numbers feel too low: Anne Hathaway came out at 56 on one run and 74 on another.
- The same image must always return the same score.

**Success looks like this.**

1. A Visitor whose Overall shows ~80 sees a pop-up that names a real celebrity and says
   something flattering about the comparison, every time, at every Overall.
2. A Visitor in Vietnam sees Vietnamese celebrities most of the time, in Vietnamese.
3. Scoring the same image twice gives the same Overall and the same Compliment.
4. No celebrity's number is ever visible, in the page or in the client bundle.

## Decisions at a glance

| Decision                  | Choice                                                                   | Section                                                    |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Repeatability             | Observation at `temperature: 0` with a fixed `seed`                      | [Repeatable scores](#repeatable-scores)                    |
| Low numbers               | A display curve; raw numbers stay stored and ranked                      | [The display curve](#the-display-curve)                    |
| Where the Roster lives    | A static JSON file in the repo, read only by the server                  | [The Roster](#the-roster)                                  |
| Who observes Celebrities  | Claude, by hand, under the same rules as the vision model                | [Seeding the Roster](#seeding-the-roster)                  |
| Celebrity photos          | Wikimedia Commons, with credit; an initials badge when none is free      | [The Roster](#the-roster)                                  |
| Vietnam                   | `cf-ipcountry = VN` → the `vn` Audience: 70% Vietnamese picks, in Vietnamese | [Audience](#audience)                                  |
| Matching                  | Always flattering, three tiers, seeded by the score                      | [Choosing the Compliment](#choosing-the-compliment)        |
| Celebrity numbers         | Never leave the server                                                   | [Choosing the Compliment](#choosing-the-compliment)        |

## Why the numbers are low

Three causes. None is a bug.

1. **A Rating is a probability, not a magnitude.** It is Jev's probability that "a typical
   viewer would call this feature above average", times `RATING_CONFIDENCE_BOOST` (1.3)
   (`src/lib/jev/overall.ts`, `ratingFromNoul`). A 0.6 means "slightly more likely yes than
   no", not "60% beautiful".
2. **Jev reads neutral text.** ADR-0001 keeps every evaluative word out of the Observation,
   so Jev judges "almond eye shape, even skin tone, defined gonial angle". From a description
   that plain it is rarely confident that any face is exceptional, so most answers land
   between 0.45 and 0.65 and every Overall, famous or not, sits around 55–75.
3. **The 56 against 74 swing is noise.** The vision model samples at `temperature: 0.1`, a
   different photo produces different Observation fields, and `UNCERTAIN_BAND` then drops a
   different set of Dimensions.

Consequence for this feature: Celebrities scored through the same Jev questions land on the
same compressed scale as Visitors. The Compliment is relative, so it can always flatter
whatever the absolute numbers are.

## Repeatable scores

Of the three layers, only the Observation samples. Jev returns probabilities without
sampling, and everything after Jev is arithmetic.

- `DEFAULT_TEMPERATURE` in `src/lib/observation/observe.ts` changes from `0.1` to `0`.
- A new exported constant, `OBSERVATION_SEED = 42`, travels with every request. The Workers
  AI input type for `mistral-small-3.1-24b-instruct` accepts `seed` ("Random seed for
  reproducibility of the generation").
- `VisionRequest` gains `seed: number`, and `buildObservationRequest` sets it.

**Scope of the promise.** The same image file gives the same Overall. A different photo of
the same person still scores differently, because it is a different picture. Screening and
the Crop are deterministic for the same file in the same browser.

**Verification.** One Crop is sent through the real Workers AI and Jev five times in dev,
and the five Overalls are recorded in the PR. If they differ, implementation stops and the
fallback - a short-lived edge cache keyed by a hash of the Crop - goes back to the owner
before it is built, because it touches the promises in `PRIVACY.md`.

## The display curve

A new pure module, `src/lib/jev/display.ts`:

```ts
/** ADR-0008. Shown numbers are curved; stored numbers are raw. 1 switches the curve off. */
export const DISPLAY_EXPONENT = 0.4;

/** 100 × (raw / 100) ^ DISPLAY_EXPONENT, clamped to 0..100. Not rounded; the UI rounds. */
export function displayRating(raw: number): number;
```

| Raw | Shown |
| --- | ----- |
| 30  | 62    |
| 50  | 76    |
| 60  | 82    |
| 75  | 89    |
| 100 | 100   |

The curve is monotonic, so it never changes an order.

**Applied wherever a number is shown:**

- `src/components/home/score-result.tsx` - the Overall, the top Ratings and their bar
  widths.
- `src/components/home/score-detail-dialog.tsx` - the Overall and every Rating.
- `src/components/home/board-card.tsx` - each Entry's Overall.
- `src/lib/seo/structured-data.ts` - the Board JSON-LD.

**Not applied:** Affinities (their own 0..100 display scale), the Tally, Board ranking,
Percentile, the Claim payload, and `pickCompliment`. All of these keep the raw number.
Because the curve preserves order, Board order and Percentile are unchanged. No migration.

## The Roster

The **Roster** is the list of **Celebrities**. It is generated once by the seed scripts and
committed. Only the server reads it.

### Who is on it

**International pool (`global`, 24).** Substitutes of similar standing are allowed when a
name has no usable free photo; the substitution is reported to the owner.

- Women: Anne Hathaway, Zendaya, Margot Robbie, Scarlett Johansson, Gal Gadot, Beyoncé,
  Taylor Swift, Rihanna, Deepika Padukone, Ana de Armas, Lisa (BLACKPINK), Emma Watson.
- Men: Timothée Chalamet, Brad Pitt, Chris Hemsworth, Keanu Reeves, Ryan Gosling, Henry
  Cavill, Tom Holland, Cha Eun-woo, V (BTS), Idris Elba, Cristiano Ronaldo, Michael B.
  Jordan.

**Vietnamese pool (`vn`, 16).**

| Celebrity                           | Photo source             |
| ----------------------------------- | ------------------------ |
| Jack (J97)                          | Commons                  |
| Trấn Thành                          | Commons                  |
| Trường Giang                        | Commons                  |
| HIEUTHUHAI                          | Commons                  |
| Lê Dương Bảo Lâm                    | Commons                  |
| Nam Em                              | Commons                  |
| Độ Mixi (Phùng Thanh Độ)            | Commons                  |
| Võ Hoàng Yến                        | Commons                  |
| Hương Giang                         | Commons                  |
| Wren Evans                          | Commons                  |
| Chị Phiến (Khuyến Dương)            | Commons                  |
| Cô Phương Hằng (Nguyễn Phương Hằng) | Commons                  |
| Phùng Khánh Linh                    | Commons                  |
| Nàng Mơ (Lê Minh Trà My)            | Owner-supplied; initials badge |
| Dương Gió Tai (Nguyễn Hoàng Dương)  | Owner-supplied; initials badge |
| Hà Môi (Võ Nữ Ngân Hà)              | Owner-supplied; initials badge |

Every Celebrity is an adult. Every Celebrity also passes the same Verdict a Visitor does; a
Celebrity whose photo fails it is left off the Roster and reported, never overridden (see
"Seeding the Roster").

### Files

| Path                                         | Committed | Holds                                                                          |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------------ |
| `seed/celebrities/candidates.json`           | yes       | The input list: slug, name, Audience, Commons file title or local photo, crop box |
| `seed/celebrities/originals/`                | **no**    | Full-size downloads and owner-supplied photos                                  |
| `seed/celebrities/crops/`                    | **no**    | 512px face crops, the Celebrity equivalent of a Crop                           |
| `seed/celebrities/observations/<slug>.json`  | yes       | The Observation, written by hand                                               |
| `public/celebrities/<slug>.webp`             | yes       | 256px square face photo, Commons only                                          |
| `src/lib/celebrities/roster.json`            | yes       | Generated: the Roster                                                          |
| `src/lib/celebrities/roster.ts`              | yes       | The Zod schema and the typed import of `roster.json`                           |

`.gitignore` gains `seed/celebrities/originals/` and `seed/celebrities/crops/`.

### Shapes

```ts
type Audience = "global" | "vn";

interface Credit {
  author: string;          // plain text, HTML stripped
  licence: string;         // e.g. "CC BY-SA 4.0"
  licenceUrl: string | null;
  sourceUrl: string;       // the Commons file page
}

interface Celebrity {
  slug: string;            // "anne-hathaway", "tran-thanh"
  name: string;            // display name, with diacritics: "Trấn Thành"
  audience: Audience;
  overall: number;         // RAW Overall. Server-only. Never sent to a browser.
  photo: string | null;    // "/celebrities/anne-hathaway.webp", or null for an initials badge
  credit: Credit | null;   // non-null exactly when photo is non-null
}

interface Candidate {
  slug: string;
  name: string;
  audience: Audience;
  commonsFile: string | null;   // "File:Trấn Thành.jpg"
  localPhoto: string | null;    // "seed/celebrities/originals/duong-gio-tai.png"
  crop?: { left: number; top: number; size: number }; // fractions of the original, 0..1
}
```

A Celebrity's `audience` says which Visitors see them. It is not a statement about anyone's
origin, and no field is named `region`, `nationality` or `ethnicity` (ADR-0003).

## Seeding the Roster

Seeding runs locally, in Node, through two scripts and one manual step. Nothing here runs in
the Worker.

`tsx` and `sharp` become direct devDependencies (both are already in the lockfile as
transitive dependencies). `tsconfig.json` adds `scripts` to `include` so the scripts are type
checked. `package.json` gains:

```json
"celebs:fetch": "tsx scripts/celebrities/fetch.ts",
"celebs:score": "tsx --env-file=.dev.vars scripts/celebrities/score.ts"
```

### Step 1 - `pnpm celebs:fetch` (`scripts/celebrities/fetch.ts`)

For each Candidate:

1. **Commons Candidates.** Query the Commons API (`action=query&prop=imageinfo&iiprop=url|extmetadata`)
   with a descriptive `User-Agent`. Read `Artist` (strip HTML), `LicenseShortName`,
   `LicenseUrl` and the file page URL.
2. **Accept only free licences:** CC0, public domain, CC BY, CC BY-SA, any version. Anything
   else fails that Candidate loudly; it is replaced with a substitute or a different file.
3. Download the original into `seed/celebrities/originals/`.
4. **Owner-supplied Candidates** skip 1–3; their file is already in `originals/`.
5. Cut the face square using `crop`, or the default box: the full width, starting at the top
   when the image is taller than wide, otherwise centred. Write a 512px JPEG to `crops/` for
   every Candidate, and a 256px WebP to `public/celebrities/` for Commons Candidates only.
6. Print a summary: slug, licence, crop path.

Crop boxes are set by hand. After a first run, each crop is checked by eye and `crop` is
added to `candidates.json` wherever the face is off-centre or too small.

### Step 2 - the Observations, by hand

Claude opens each 512px crop and writes `seed/celebrities/observations/<slug>.json`:

- under the exact rules in `OBSERVATION_SYSTEM_PROMPT` (`src/lib/observation/prompt.ts`):
  neutral anatomical and photographic vocabulary, no evaluative word, no guess at anything not
  visible;
- using only the closed enums of `ObservationSchema`. The fame of the person is not an input:
  the Observation describes this crop, exactly as Mistral would describe a Visitor's.

Where a Commons photo exists, the Observation is written from that photo, so the face shown in
the pop-up is the face that was scored. An owner-supplied photo of the same person stays in
`originals/` as a backup only.

These descriptions are Claude's, not Mistral's, so Celebrity numbers may sit a few points off
Visitor numbers. `MATCH_MARGIN` absorbs this (see "Choosing the Compliment"), and the optional
calibration probe below measures it.

### Step 3 - `pnpm celebs:score` (`scripts/celebrities/score.ts`)

For each Observation file:

1. Validate it with `ObservationSchema`. A failure stops the script and names the file and
   the field.
2. Send it to Jev exactly as `scoreCrop` does:
   `new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY }).systemOne({ state: observation, questions: jevQuestions })`.
   Retry once on a network error.
3. Apply `verdictFromAnswers`. **A Celebrity who fails the Verdict is skipped and reported,
   never overridden.** For a youthful-looking adult the fix is a different photo, not a looser
   threshold.
4. Compute `overallFromAnswers(answers, observation)`: the raw Overall, by the same code a
   Visitor gets.
5. Write `src/lib/celebrities/roster.json`, sorted by slug for stable diffs, and print a table
   of slug, Audience and raw Overall for the owner to review.

About 40 Jev calls in all, under $0.05.

### Optional calibration probe

Score three Commons Celebrity crops through the normal upload flow in dev (real Mistral, real
Jev) and compare the results with their Roster numbers. If Mistral's Overalls run lower on
average, set `MATCH_MARGIN` to the larger of 3 and that average gap. No new code.

## Audience

A new module, `src/server/audience.ts`:

```ts
export type Audience = "global" | "vn";

/** "VN" → "vn"; anything else, or nothing, → "global". `override` wins when it is set. */
export function audienceFromRequest(country: string | undefined, override: string | undefined): Audience;
```

- `scoreCrop` passes `getRequestHeader("cf-ipcountry")` and `env.AUDIENCE_OVERRIDE`.
- `AUDIENCE_OVERRIDE` is an optional Worker variable for local testing, because `vite dev`
  sends no `cf-ipcountry`. It is documented in `.dev.vars.example` and is never set in
  production. `pnpm cf-typegen` runs after adding it.
- The country is read for the one request. It is never stored and never logged.

| Audience | Pool                                              | Language   |
| -------- | ------------------------------------------------- | ---------- |
| `global` | the 24 `global` Celebrities                       | English    |
| `vn`     | `vn` with probability `VN_POOL_SHARE` (0.7), else `global` | Vietnamese |

## Choosing the Compliment

A **Compliment** is the joke line that compares a Visitor with one Celebrity. It is chosen on
the server, in `scoreCrop`, so Celebrity numbers never reach a browser.

### The function

`src/lib/celebrities/compliment.ts` - pure, no I/O:

```ts
export const MATCH_MARGIN = 3;    // raw points
export const VN_POOL_SHARE = 0.7;

export type ComplimentTier = "top" | "above" | "league";

export interface Compliment {
  tier: ComplimentTier;
  lang: "en" | "vi";
  line: string;                   // "{name}" already filled in
  celebrity: { name: string; photo: string | null; credit: Credit | null };
  // Deliberately no number of any kind.
}

export function pickCompliment(
  overall: number,                // the Visitor's RAW Overall
  audience: Audience,
  roster: readonly Celebrity[],
): Compliment | null;             // null only when the chosen pool is empty
```

### The algorithm

1. **Seed.** Hash the string `<overall to 2 decimals>|<audience>` with FNV-1a and feed it to a
   mulberry32 generator, `rng`. The same image gives the same raw Overall, so it gives the
   same Compliment. No `Math.random`.
2. **Pool.** `global` → the `global` Celebrities. `vn` → the `vn` Celebrities if
   `rng() < VN_POOL_SHARE`, else the `global` ones.
3. **Tier.** Sort the pool by raw Overall, ascending. A Visitor *beats* a Celebrity when
   `overall + MATCH_MARGIN >= celebrity.overall`.
   - **top** - beats every Celebrity in the pool. Shortlist: the 3 highest in the pool.
   - **above** - beats at least one. Shortlist: the 3 highest the Visitor beats.
   - **league** - beats none. Shortlist: the 3 lowest in the pool.
4. **Pick.** One Celebrity from the shortlist by `rng`, then one line for that tier and language by `rng`, then
   fill `{name}`.
5. **Return** the name, photo and credit, and nothing else from the Celebrity.

No tier ever says the Visitor is worse than anyone. "league" is the floor, and it is still a
compliment.

### The lines

`src/lib/celebrities/lines.ts` holds 4–6 lines per tier per language, each with one `{name}`.
Examples of the register:

| Tier   | English                                        | Vietnamese                                                |
| ------ | ---------------------------------------------- | --------------------------------------------------------- |
| top    | "Top 5 in the world, easily. Sorry, {name}."   | "Top 5 thế giới là có thật, xin lỗi {name} nha!"          |
| top    | "{name} just got bumped down a spot."          | "Hôm nay {name} phải xếp hàng sau bạn rồi."               |
| above  | "More beautiful than {name}. Not even close."  | "Đẹp hơn {name} luôn rồi, không phải bàn!"                |
| above  | "{name} called. They want your skincare routine." | "{name} mà thấy chắc cũng phải xin bí quyết."          |
| league | "Same league as {name}."                       | "Ngang ngửa {name} luôn, ra đường cẩn thận bị xin chữ ký!" |
| league | "You and {name}: same tier, different zip code." | "Cùng đẳng cấp nhan sắc với {name} đó nha."             |

Lines never mention a number, never use a word that ranks the Visitor below anyone, and never
say the Visitor *looks like* anyone: TheFace compares a number, it does not identify
resemblance.

### In `scoreCrop`

After the Overall is computed and the Tally incremented:

```ts
const audience = audienceFromRequest(getRequestHeader("cf-ipcountry"), env.AUDIENCE_OVERRIDE);
const compliment = safePickCompliment(overall, audience); // null on any throw, logged without the country
return { ok: true, overall, ratings, affinities, compliment };
```

`ScoreResult`'s success branch gains `compliment: Compliment | null`. `roster.json` is
imported only from server-only code (the server function handler and `src/lib/celebrities`,
which is imported nowhere on the client). A post-build check proves it (see "Testing").

## The pop-up

`src/components/home/compliment-dialog.tsx`, built on the existing `Dialog` / `DialogPopup`:
a bottom sheet on phones and a centred card on desktop, like the Claim and detail dialogs.

**Opening.** It opens on its own, once per result, about 900ms after the results appear, once
the Rating bars have filled. Under reduced motion it opens without the delay. Closing it does
not reopen it for the same result.

**Contents, top to bottom.**

1. The Celebrity's photo, a 160px rounded square from `public/celebrities/`, with
   `alt` = the name. With `photo: null`, or when the image fails to load, an initials badge
   ("DG" for Dương Gió Tai) in the same box.
2. The credit, small, under the photo, when `credit` is non-null:
   "Photo: {author} · {licence} · Wikimedia Commons", linking to `sourceUrl` (Vietnamese:
   "Ảnh: {author} · {licence} · Wikimedia Commons").
3. The line, as the dialog title, large, with a tier icon: crown (`top`), sparkles (`above`),
   handshake (`league`), from `@tabler/icons-react`.
4. One button that closes it: "Thanks, I know 😎" / "Biết rồi mà 😎".

**Language.** For `lang: "vi"` every string in the pop-up is Vietnamese and the popup carries
`lang="vi"`. The rest of the site stays English.

**After it closes.** A one-line row sits under the Overall in `score-result.tsx`: a 24px
thumbnail (or badge) and the line. A screenshot of the results still carries the Compliment,
and tapping the row reopens the pop-up.

**Wiring.** `upload-card.tsx` passes `compliment` from the `scoreCrop` result into
`ScoreResultView`, which renders the row and the dialog. `upload-card.tsx` currently carries
the owner's uncommitted changes; implementation builds on top of them and does not commit them
as part of this feature unless the owner says so.

With `compliment: null` there is no pop-up and no row; the results look exactly as they do
today.

## Failure handling

| Failure                                          | Behaviour                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `pickCompliment` throws, or the pool is empty    | `compliment: null`; scoring succeeds; logged without the country |
| A Celebrity photo 404s in the browser            | The initials badge                                               |
| A Commons file is not freely licensed            | `celebs:fetch` fails that Candidate; substitute or another file  |
| An Observation file does not validate            | `celebs:score` stops, naming the file and field                  |
| A Celebrity fails the Verdict                    | Skipped and reported; never overridden                           |
| Jev errors during seeding                        | One retry, then that Celebrity fails and is reported             |
| Five repeat scorings of one Crop disagree        | Stop; take the hash-cache fallback to the owner                  |

## Privacy, licensing and risk

- **No new Visitor data is stored.** The country header is read per request and discarded.
  `PRIVACY.md` gains one sentence saying so.
- **Celebrity numbers are never shown**, in the UI or the client bundle. The pop-up shows a
  name, a photo and a joke.
- **Commons photos are credited** as their licences require. The shipped file is a 256px
  derivative; the credit names the original author, licence and file page.
- **Owner-supplied photos are never committed or shipped.** Only the enum Observation derived
  from each is committed.
- **TheFace stays non-commercial** (ADR-0005), which keeps the use of celebrity names and
  likenesses in a joke context low-risk.
- **Two picks carry more risk, kept at the owner's decision:** Cô Phương Hằng is known for
  suing people, and Nam Em's mental health was widely covered in the press. Either can be
  removed by deleting one Candidate and re-running the scripts.
- **ADR-0003 holds.** The Audience comes from the request's country, never from the face. No
  field is named `region`, `nationality` or `ethnicity`.
- **Retouched photos score higher.** Studio shots (Hà Môi) and casual selfies (Dương Gió Tai)
  sit on the same Roster, so the order partly reflects the photographs. Acceptable for a toy.

## Testing

### Unit tests (Vitest)

| File                                             | Proves                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/jev/display.test.ts`                    | 0→0, 100→100, monotonic over 0..100, 60→82 (rounded), `DISPLAY_EXPONENT` is 0.4                                                                |
| `src/lib/observation/observation.test.ts`        | The request carries `temperature: 0` and `seed: OBSERVATION_SEED`                                                                              |
| `src/lib/celebrities/compliment.test.ts`         | Each tier; the `MATCH_MARGIN` boundary; `global` never gets a `vn` Celebrity for any Overall 0..100; same input, same output; the result has no number; the line contains the name; `vn` gives `lang: "vi"` |
| `src/lib/celebrities/lines.test.ts`              | Every line has exactly one `{name}`; no line contains, as a whole word, worse, uglier, less, lower, below or behind, nor kém, xấu or thua                            |
| `src/lib/celebrities/roster.test.ts`             | `roster.json` passes its Zod schema; at least 24 `global` and 14 `vn`; slugs unique; every `photo` file exists under `public/`; `credit` is non-null exactly when `photo` is, with a free licence |
| `src/server/audience.test.ts`                    | `VN` → `vn`; `US`, empty and missing → `global`; the override wins                                                                             |
| `src/components/home/compliment-dialog.test.tsx` | Name, line and credit link render; the initials badge renders for `photo: null`; Vietnamese strings and `lang="vi"` for `vi`                    |

Existing tests that assert `temperature: 0.1` change to `0`.

### Checks beyond unit tests

1. **Repeatability.** Five scorings of one Crop in dev; the five Overalls in the PR.
2. **No leak.** `pnpm build`, then search `dist/client` for Roster content (for example a
   Celebrity slug with `"overall"` beside it). It must find nothing.
3. **By eye.** Score a photo in the running app with and without `AUDIENCE_OVERRIDE=vn`;
   screenshots of both pop-ups in the PR.
4. `pnpm check` and `pnpm test` pass.

## Docs to update

- **`CONTEXT.md`** - four terms:
  - **Celebrity**: a public figure on the Roster, with a seeded Overall that is never shown.
    _Avoid_: celeb, star, idol.
  - **Roster**: the list of Celebrities. _Avoid_: dataset, list, seed data.
  - **Compliment**: the joke line that compares a Visitor with one Celebrity. _Avoid_: match,
    lookalike, comparison, joke. ("Match" already belongs to Affinity; TheFace never says
    anyone looks like anyone.)
  - **Audience**: `global` or `vn`, from the request's country, never from the face. _Avoid_:
    region, locale, market.
- **`SPEC.md`** - a "Celebrity Compliments" section summarising this spec; the Observation at
  `temperature: 0` with a seed in "Layer 2"; new rows in "Constants to calibrate after launch"
  (see below).
- **`docs/adr/0008-shown-number-curved-stored-number-raw.md`** - why the display curve exists,
  why it is applied at render and not stored, and how to switch it off.
- **`docs/adr/0009-celebrities-observed-by-hand.md`** - why Celebrities are observed by Claude
  rather than Mistral, why they pass the real Verdict and Jev, and why their numbers never
  leave the server.
- **`docs/adr/README.md`** - the two new rows.
- **`PRIVACY.md`** - the country sentence.
- **`.dev.vars.example`** - `AUDIENCE_OVERRIDE=` with a comment.

## Constants to calibrate

| Constant           | Starting value | What settles it                                                       |
| ------------------ | -------------- | --------------------------------------------------------------------- |
| `DISPLAY_EXPONENT` | 0.4            | How the shown numbers feel; 1 switches the curve off                  |
| `MATCH_MARGIN`     | 3 raw points   | The calibration probe, then the Tally against Roster numbers          |
| `VN_POOL_SHARE`    | 0.7            | Whether Visitors in Vietnam enjoy the local or international names more |
| `OBSERVATION_SEED` | 42             | Nothing; any fixed integer. Changing it changes every future Overall  |

## Out of scope

- A "show me someone else" re-roll.
- Confetti or other celebration effects.
- Translating the rest of the site into Vietnamese.
- Any change to the Tally, the Boards' stored data, the Claim, or the Overall's composition.
- Detecting or storing a Visitor's gender; Celebrities of any gender are compared freely.
- Editing the Roster without a redeploy.
