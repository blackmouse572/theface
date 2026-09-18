# Nouls, not Scores, produce Ratings

Status: accepted. Date: 2026-09-18

Jev has a primitive named `Score`. TheFace does not use it for Ratings. A Rating comes from
a Noul, and TheFace uses the returned probability directly as a 0–100 number. `Score`
produces Affinities only.

## Why

This decision looks incorrect, so this record explains it.

`Score` returns a probability-weighted float across ordered levels. The Jev documentation
warns: "do not use score outputs to compute the exact magnitude of a number between two
levels." A 0–100 display implies 101 distinct values. A five-level `Score` provides five
distinct values. A Board that ranks on five values produces many ties.

A Noul returns a calibrated probability. TheFace phrases each Dimension as a proposition,
for example "would a typical viewer say these eyes are above average?". An answer of 0.73
becomes a Rating of 73.

An Affinity keeps `Score`, because a match against an Aesthetic is a graded judgment with
describable levels. That is the purpose of the primitive.

## Consequences

Do not change Ratings to `Score` because the names match. A Rating rubric is a yes or no
proposition. It is not a ladder of levels.
