# Aesthetics are rated, people are not classified

Status: accepted. Date: 2026-09-18

The first idea was to guess which region a face comes from. TheFace inverts that idea. It
scores a face against eight described Aesthetics and reports an Affinity for each. It never
infers ethnicity, nationality or origin.

## Why

A phenotype classifier creates the largest risk to the project. One incorrect classification
on a public site causes public criticism. A phenotype classifier is also unreliable, because
the models refuse or hedge inconsistently on questions of this type.

The inversion changes the target of the judgment. The model evaluates an Aesthetic. It does
not evaluate a person. The design keeps the comparison and the shareable chart, and it
removes the ethnicity claim.

A radar chart of eight Affinities also gives people more to discuss than one label.

## Consequences

Each Aesthetic carries a tradition name and a regional origin. The tradition name appears on
the radar chart axis. The origin is a display label in the tooltip only. No `Score` criteria
may reference an origin, a population or an ancestry.

The reason is that an axis label travels in a screenshot without its context. "Old Hollywood"
describes a style. "Anglo-American" describes a people. The criteria are identical either
way, so the axis must carry the style.

The vocabulary enforces this decision. No schema field and no type contains `region`,
`nationality` or `ethnicity`. See `CONTEXT.md`. A contributor who adds such a field breaks a
deliberate pattern.
