# X authentication is mandatory for the Leaderboard

Status: accepted. Date: 2026-09-18

A Visitor must authenticate with X to appear on a Board. Authentication is a prerequisite,
not an optional upgrade.

## Why

A typed handle proves nothing. Without authentication, one person can enter another person's
handle and place that person's identity beside an appearance rating. That is the only
failure in this product that harms someone who never used it.

There is no free alternative. X has had no free API tier since February 2026. No method
verifies handle ownership without a billed call.

## Consequences

This decision forecloses revenue. The X Developer Agreement permits non-commercial use only,
so advertising or any monetisation would place the project in breach. TheFace cannot be
monetised while X authentication is mandatory.

Every Leaderboard Entry is keyed on `x_user_id`. Displayed X content must be removable within
24 hours of a request.
