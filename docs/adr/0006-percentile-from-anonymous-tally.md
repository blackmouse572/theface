# Percentile comes from an anonymous Tally

Status: accepted. Date: 2026-09-18

TheFace stores no row for a Visitor who does not Claim. Percentile instead comes from the
Tally: 101 integer counters, one per Overall. The Tally holds no identifier and no timestamp.

## Why

Percentile needs a distribution. Storing a row for every Visitor would supply one, but it
would also store people who chose not to be stored.

Storing rows only for Contenders does not work either. TheFace prompts a Claim above an
Overall of 70, so the stored population would be selected for high Overalls. A Percentile
computed against that population would rank a genuine 75 below average.

A counter is not personal data. It gives an exact Percentile and stores nobody.

The Tally is also the billing answer. D1 charges rows scanned, and a `COUNT(*)` query over
stored rows scans one index row for every row beneath the Overall.

## Consequences

This decision is difficult to reverse, because the data that was not stored cannot be
recovered. TheFace can never analyse per-Visitor history before the date of any future
change.

TheFace hides Percentile until the Tally holds about 200 Overalls. A seeded synthetic prior
would collide with real data later.
