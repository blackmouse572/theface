# Design tokens

`globals.css` holds every colour, radius, shadow and font in TheFace. Nothing
else in the app should declare a raw hex value or a raw pixel radius.

The visual language is [oa-design](https://github.com/OpenLabs-so/oa-design)
(MIT, Copyright (c) 2026 Voprex Labs). The palette and the radius base come from
that project's `skills/oa-design/_root.css`. No value here comes from
`OpenLabs-so/openanalytics`, which is AGPL-3.0, except `components/ui/dialog.tsx`,
adapted from that repo's own `dialog.tsx` by explicit user decision.

## What `@theme inline` does

oa-design ships plain CSS custom properties. Tailwind does not build a utility
for a name it has not been told about, so `bg-card` and `text-muted-foreground`
do not exist until something maps the property to a Tailwind theme variable.
The `@theme inline` block is that map. It is one line per token:

```css
--color-card: var(--card);
```

The `inline` keyword is the important part. A plain `@theme` block makes
Tailwind re-emit each variable into `:root` in its own output. Tailwind's copy
then sits alongside ours, and which one wins depends on file order. With
`inline`, Tailwind writes the `var()` directly into the utility and emits
nothing:

```css
.bg-card {
  background-color: var(--card);
}
```

So `:root` and `.dark` stay the only places a value is set. A theme toggle
flips one class on `<html>` and every utility in the app follows.

Put `.dark` on `<html>` and nowhere else. Several tokens are derived with
`var(--ink)`. A custom property substitutes its `var()`s on the element where
it is declared, not where it is used, so those tokens resolve on `:root`.
`.dark` on `<html>` is the same element as `:root`, so the re-inked value is in
place when they resolve. `.dark` on `<body>` or on a wrapper div is a different
element, and dark mode comes out half applied.

## Why the radius scale lives inside `@theme inline`

`--radius-*` is one of Tailwind v4's own theme namespaces. It is where
`rounded-sm` through `rounded-4xl` read their values.

oa-design's `_root.css` declares `--radius-sm` through `--radius-4xl` in
`:root`. That is safe on its own, but under Tailwind v4 it is not extending the
scale, it is overwriting Tailwind's emitted theme variables from outside the
theme. Every `rounded-*` class in the app changes size, and nothing reports an
error. We moved the scale into `@theme inline`, where Tailwind treats it as the
scale it is.

Only `--radius` stays in `:root`, as a plain property. Every step is a `calc()`
multiple of it, so one number moves the whole system. Never write a bespoke
radius on a single element.

## The two rules that carry the look

**Headings are `font-weight: 400`. Medium (500) is the heaviest weight
anywhere.** There is no semibold and no bold in TheFace. `@layer base` sets 400
on `h1` through `h6`. Two things enforce it. The `@font-face` rules declare
`font-weight: 300 500`, so the variable font clamps anything heavier to 500.
`body` sets `font-synthesis-weight: none`, so the browser will not fake a bold
the font cannot supply. Hierarchy comes from size, colour and spacing. If a
heading looks weak it is too small or too close to its body text. Do not fix it
with weight.

**Neutrals are derived, never picked.** There is exactly one grey in this file:
`--ink`. Every hairline and every wash is that ink mixed into transparency:

```css
--border: color-mix(in srgb, var(--ink) 12%, transparent);
```

The percentages come off a fixed ladder: 4, 5, 10, 12, 14. Dark raises the
hairline steps by two points, because a hairline needs more presence on a dark
surface. If a divider needs more weight, move it up the ladder. Do not add a
grey hex. This is why every grey in the app agrees without anyone checking.

Because `color-mix()` carries the whole neutral system, an unlayered
`@supports` block at the end of the file repeats the same mixes as literal
`rgba()`. A browser without `color-mix()` drops those declarations outright,
and the result would not be a slightly wrong grey - it would be no borders at
all, everywhere.

## Corner shape

Every `border-radius` in the app renders with continuous-curvature corners
(a superellipse, not a circular arc) - the oa-design "squircle" look. This is
one declaration, `corner-shape: squircle`, on `*`/`::before`/`::after` in
`@layer base`, not a bespoke radius or a `shape()` clip-path: it rides on
whichever radius a class already sets, so the `--radius` scale stays the only
place a corner size is chosen. Browsers that do not know `corner-shape` drop
the line and keep the plain circular arc - no fallback rule needed. Full
circles (`rounded-full`) look identical either way, since there is no
straight edge for the curve to round.

## Elevation

Elevation is binary. A thing is resting or it is floating. Use
`shadow-resting` and `shadow-floating`, and do not invent a third step.

The raw values live in `:root` as `--elevation-resting` and
`--elevation-floating`, not as `--shadow-*`. `--shadow-*` is the Tailwind theme
namespace itself, so a theme key pointing at a `:root` property of the same
name would reference itself. The `--elevation-*` names keep the bridge
one-directional.

## Chart tokens

The radar chart draws eight axes. The axes are labels, not colours. The five
`--chart-1` … `--chart-5` slots colour _series_ - one Visitor's Ratings against
a comparison line. Assign them in order and never cycle; a sixth series folds
into one grey "other".

`--chart-grid` points at `--border`, the same hairline as every divider in the
app, and `--chart-label` points at `--muted-foreground`. Both follow the theme
switch on their own, so neither is restated under `.dark`. That single shared
hairline is what makes the chart look native rather than pasted in.

Series colours were validated against both surfaces. Overlapping series, which
is what a radar draws, are checked all-pairs, and **all-pairs only clears the
separation floors for the first three slots**. Slots 4 and 5 are fine for small
multiples or for anything carrying a direct label. Do not stack four filled
webs on one chart. On the white card, slots 3, 4 and 5 fall below 3:1 against
the surface, so they need a visible label or a table view beside them. Text
always wears a text token, never a series colour.

## Installing

Tailwind is not installed yet. This file needs:

```
pnpm add -D tailwindcss @tailwindcss/vite
pnpm add @fontsource-variable/inter-tight @fontsource/geist-mono
```

Then add the Tailwind plugin to `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
// plugins: [tailwindcss(), ...]
```

Use `@tailwindcss/vite`, not the PostCSS plugin - this project has no PostCSS
config, and the Vite plugin is faster.

Import `./styles/globals.css` once, from the root route, before any component
CSS.

The `@font-face` rules reference the Fontsource `.woff2` files by bare
specifier. We write them by hand rather than importing Fontsource's own
stylesheets, because Fontsource ships `font-weight: 100 900` and that would let
a stray `font-bold` render at 700. If the bundler cannot resolve a bare
specifier inside `url()`, swap in `@import
"@fontsource-variable/inter-tight/wght.css";` - but the weight clamp is then
gone, and `font-synthesis-weight: none` is all that holds the ceiling.
