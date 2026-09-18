# Portraits are stored, with consent

Status: accepted. Date: 2026-09-18

The first version of the specification stored no images. This decision relaxes that rule for
one case. A Leaderboard Entry stores a Portrait when the Contender consents. A Visitor's
Selfie still never leaves the device, and a Crop is never written to disk during rating.

## Why

Visitors want to see the face that received the Overall. X authentication attaches a verified
account to that face, which makes the Entry credible instead of a claim that anyone could
make.

The cost is real. A stored face image attracts consent, retention and deletion obligations
that a stored number does not.

## Consequences

The exception must stay narrow, because `PRIVACY.md` depends on it. `SPEC.md` holds the
mechanisms that keep it narrow.

If anyone relaxes this exception further, `PRIVACY.md` stops being true.
