# Privacy Policy - TheFace

**Last updated:** TODO before launch
**Contact:** TODO - an address people can actually reach for deletion requests

> **Draft.** This describes exactly what the system in `SPEC.md` does. It has not been
> reviewed by a lawyer. Face images attract specific regimes - Illinois BIPA, Texas CUBI,
> GDPR Article 9 - so get it read before launch if TheFace is reachable from those places.

---

## The short version

Your selfie is checked on your own device first. If it passes, a cropped copy is sent for
analysis and then discarded. **Nothing about you is stored unless you choose to join the
leaderboard**, and your photo is only kept if you separately tick a box saying so.

## What happens to your photo, step by step

### 1. In your browser, before anything is sent

When you choose a selfie, it is analysed **on your device**. Nothing is uploaded yet. We
check that the image contains exactly one face, that the face is large enough to read, and
that the person does not appear to be a minor.

**If any of those checks fail, the photo is never transmitted anywhere.** It stays on your
device and we never see it.

### 2. If the checks pass

Your browser crops the image to your face, shrinks it, and sends that crop to our server,
which passes it to **Cloudflare Workers AI**. That service produces a neutral written
description - eye shape, lighting direction, apparent age range, and similar observations.

**The image is not written to disk at any point in this step.** It exists only in memory
for the duration of the request and is discarded when the request ends.

### 3. Scoring

Only the **written description** - not your photo - is sent to **TypeSafe** (the Jev
model), which returns the scores. TypeSafe never receives your image; it cannot, as the
model accepts text only.

### 4. After you see your scores

Your cropped photo stays **in your browser's memory**. It is not on our servers. If you
close the tab without claiming a leaderboard place, it is gone.

## What we store

### If you don't join the leaderboard

**A counter.** We add 1 to a tally of how many people have scored, say, 73 out of 100. That
tally holds no name, no handle, no timestamp, no photo and nothing that could identify you.
It exists so we can tell people what percentile they are in.

**A short-lived record of your network address.** We scramble your IP address into an
unreadable value and count how many times it submits a photo in a day. This stops one person
from flooding the site. The record holds no photo and no name, and it is deleted
automatically within 24 hours.

### If you do join the leaderboard

Joining requires signing in with X, which tells us your X user ID, handle and display name.
We store those, your scores, and the time you joined.

**Your photo is stored only if you tick the photo box.** That box is separate, is never
pre-ticked, and you can join the leaderboard without it - an automatically generated
avatar is used instead. Generated avatars are drawn from your handle and are not pictures
of you.

## What we never store

- **Photos from people who don't join the leaderboard.**
- **Photos from people who join but decline the photo box.**
- **Any photo that failed the on-device checks** - those never leave your device.
- **Face recognition data.** The software we use can compute a mathematical face
  template of the kind used to identify a person across different photos. **We do not
  generate or store these.** We use face detection only to find and frame the face.
- **Your email address.** We never ask for one.

## How long we keep it

| What                               | How long                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| Leaderboard photo                  | **90 days**, then deleted automatically; your entry falls back to a generated avatar |
| Leaderboard entry (handle, scores) | Until you delete it                                                                  |
| Anonymous score tally              | Indefinitely - it contains no personal data                                          |

## Deleting your data

There is a delete button on your leaderboard entry. It removes your entry and your stored
photo.

Stored photos live in a **private store with no public address**. They are served only by
our own server, which checks on every request that the photo still exists and has not
expired.

Deleted photos stop being served **within one hour**. We keep a short cache in front of the
store so pages load quickly, and a deleted photo can be served from that cache until it
expires. We cannot, of course, retrieve a screenshot someone took while your entry was
public.

If the button doesn't work, write to the contact address above and we will do it manually.

## Who else sees your data

| Who            | What they receive                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare** | Hosting, plus the cropped image for analysis (Workers AI), the database, photo storage, and the anti-bot check (Turnstile) |
| **TypeSafe**   | The written description only. Never your image                                                                             |
| **X**          | Only that you signed in. We send them nothing about your scores                                                            |

We do not sell data, and there is no advertising or third-party analytics on TheFace.

## Age

TheFace is for adults. We screen for apparent minors on your device before any upload, and
again during analysis. The screening is imperfect - it estimates apparent age, which is not
the same as knowing it - so it is deliberately set to reject anyone who looks anywhere near
the boundary. If you believe a photo of a minor is on the leaderboard, contact us and we
will remove it immediately.

## What the scores are

Entertainment. TheFace is a toy built to explore what an AI judgment model can do.

TheFace also compares your face against eight **aesthetics** - described sets of traits that
different beauty traditions prize.

This does **not** guess your ethnicity, nationality or origin. It rates how closely your face
matches each described aesthetic. It rates the aesthetic's fit, not you. No output is a
statement about who you are or where you are from.

## Cookies

A session cookie, if you sign in with X, so you stay signed in. Nothing else - no tracking
or advertising cookies.

## Changes

If this policy changes materially, the date at the top changes and the change is noted on
the site. If a change would affect photos already stored, we will ask again rather than
apply it retroactively.
