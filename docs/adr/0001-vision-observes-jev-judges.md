# Vision observes, Jev judges

Status: accepted. Date: 2026-09-18

Jev accepts text only, so it cannot rate a photograph directly. TheFace divides the work
between two models. The vision model emits Observations only. An Observation is a neutral
fact and contains no evaluation. Jev then makes every judgment from that text.

## Why

The shortcut is to ask the vision model how attractive a face is, then pass its answer
through. We rejected that method. The resulting numbers would be uncalibrated, they would
change between model versions, and they would carry no probability or confidence value.

A purely descriptive vision model keeps every judgment in rubrics that we write. Jev scores
those rubrics and returns a probability and a confidence value. We can retune a rubric
without running inference again.

## Consequences

The Observation schema controls what TheFace can rate. Jev cannot rate a property that the
schema does not describe. An evaluative description also moves judgment from Jev to the
vision model.

Review every change to the vision prompt against this rule. "Striking eyes" is incorrect.
"Almond eyes" is correct.
