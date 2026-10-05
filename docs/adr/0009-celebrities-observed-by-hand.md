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
