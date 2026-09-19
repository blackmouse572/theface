/**
 * The Aesthetics, as the interface names them.
 *
 * This is presentation data: a label, a regional origin for the tooltip, and a slug for
 * the Board URL. It holds NO traits and imports nothing, which is the point — the trait
 * sets live in `lib/jev/questions.ts` alongside the TypeSafe SDK, and anything importing
 * that file drags the SDK into whatever bundle it lands in. The SEO module and the route
 * list need only the names, so they read them from here and the browser stays light.
 *
 * `aesthetics.test.ts` asserts this list and the Jev question set never diverge.
 *
 * ADR-0003: `origin` is a display label only. It is never sent to a model, and no scoring
 * criteria may reference it.
 */

export interface AestheticLabel {
  readonly key: string;
  /** The tradition. This is what a radar axis shows. */
  readonly name: string;
  /** The regional origin. Tooltip and detail view only. */
  readonly origin: string;
  readonly slug: string;
}

export const AESTHETIC_LABELS: readonly AestheticLabel[] = [
  { key: "kBeauty", name: "K-beauty", origin: "East Asian", slug: "k-beauty" },
  {
    key: "bollywoodGlamour",
    name: "Bollywood glamour",
    origin: "South Asian",
    slug: "bollywood-glamour",
  },
  {
    key: "nollywoodGlamour",
    name: "Nollywood glamour",
    origin: "West African",
    slug: "nollywood-glamour",
  },
  {
    key: "persianClassical",
    name: "Persian classical",
    origin: "Middle Eastern",
    slug: "persian-classical",
  },
  { key: "oldHollywood", name: "Old Hollywood", origin: "Anglo-American", slug: "old-hollywood" },
  {
    key: "nordicMinimalism",
    name: "Nordic minimalism",
    origin: "Scandinavian",
    slug: "nordic-minimalism",
  },
  {
    key: "mediterraneanClassical",
    name: "Mediterranean classical",
    origin: "Southern European",
    slug: "mediterranean-classical",
  },
  {
    key: "latinScreenSiren",
    name: "Latin screen siren",
    origin: "Latin American",
    slug: "latin-screen-siren",
  },
];
