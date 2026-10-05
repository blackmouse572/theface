# TheFace

A toy that rates a face. This document defines the project's vocabulary. It is a glossary
only. For what TheFace does, see [`SPEC.md`](./SPEC.md).

## Language

### People

**Visitor**:
Someone who submits a Selfie and receives Ratings, without an identity.
_Avoid_: user, guest, anonymous user

**Contender**:
A Visitor who has taken a place on a Board under a verified identity.
_Avoid_: user, member, account, player

### The photograph

Three distinct objects with three distinct lifetimes. They are never interchangeable.

**Selfie**:
The image that a Visitor selects.
_Avoid_: photo, image, picture, upload

**Crop**:
The small, aligned derivative of a Selfie that TheFace rates.
_Avoid_: photo, image, thumbnail

**Portrait**:
A stored Crop, displayed on a Leaderboard Entry. It exists only with consent.
_Avoid_: photo, image, avatar

**Avatar**:
A generated illustration shown in place of a Portrait. It depicts nobody.
_Avoid_: icon, identicon, placeholder

### Judgments

**Observation**:
A neutral, factual description of a Crop. An Observation describes. It never evaluates.
_Avoid_: description, analysis, caption

**Rating**:
A number from 0 to 100 that expresses one judgment about one Dimension.
_Avoid_: score, grade, points

**Dimension**:
One property that can be rated. Every Dimension is a Feature, an Impression or a Craft.
_Avoid_: aspect, category, metric, attribute

**Feature**:
A Dimension that describes part of the face.
_Avoid_: facial aspect, trait

**Impression**:
A Dimension that describes how a face reads to a viewer.
_Avoid_: vibe, personality, perception

**Craft**:
A Dimension that describes the photograph instead of the person. Craft is the basis of
advice.
_Avoid_: quality, technical, photo score

**Overall**:
The single composite number shown to a Visitor. It is always derived, never asked for.
_Avoid_: total, final score, average

**Aesthetic**:
A described standard of beauty: a set of traits that a tradition prizes. An Aesthetic
describes an ideal. It never describes a population, and it is never a claim about anyone's
origin.
_Avoid_: region, nationality, ethnicity, origin, race, look

**Affinity**:
How closely a face matches one Aesthetic. It is a property of the match, not of the person.
_Avoid_: region score, match, similarity, percentage

**Tally**:
The anonymous record of every Overall that TheFace has produced. It holds counts and nothing
else.
_Avoid_: history, log, stats, distribution

**Percentile**:
An Overall's position within the Tally, expressed as the share of recorded Overalls that it
exceeds.
_Avoid_: rank, position, ranking

### Admission

**Screening**:
The checks that run on a Visitor's own device, before any transmission. Screening confirms
three conditions:

- The Selfie contains exactly one face.
- The face is large enough to read.
- The subject does not appear to be a minor.

_Avoid_: gate, check, validation, filter

**Verdict**:
The judgment on whether a subject may be rated at all, made from an Observation.
_Avoid_: gate, moderation, safety check

### The Leaderboard

**Claim**:
The act by which a Visitor becomes a Contender. A Claim is always deliberate.
_Avoid_: register, sign up, submit, enter

**Leaderboard Entry**:
A Contender's public record. Its owner can delete it at any time.
_Avoid_: row, record, submission, profile

**Board**:
One ranked list. There is a Board for the Overall and a Board for each Aesthetic.
_Avoid_: leaderboard (for a single list), table, ranking, chart

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

### Borrowed terms

These three belong to the Jev API, not to TheFace. They appear here because this document
bans "score" as a synonym for Rating, while `Score` is also a real primitive.

**Jev**:
The model that makes every judgment in TheFace. Jev accepts text only.

**Noul**:
A Jev question that returns a probability between 0 and 1. A Noul produces a Rating.

**`Score`**:
A Jev question that returns a position across ordered levels. A `Score` produces an Affinity.
Always write it in code font. Never use it as a word for a Rating.
