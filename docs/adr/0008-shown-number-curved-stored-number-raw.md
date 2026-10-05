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
