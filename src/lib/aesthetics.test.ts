import { describe, expect, it } from "vitest";

import { AESTHETIC_LABELS } from "./aesthetics";
import { AESTHETICS } from "./jev/questions";
import { slug } from "./seo";

// This list exists as a copy so the browser does not have to load the TypeSafe SDK.
// A copy drifts unless something checks it, so this is that something.
describe("the label list matches the Jev question set", () => {
  it("has the same keys in the same order", () => {
    expect(AESTHETIC_LABELS.map((a) => a.key)).toEqual(Object.keys(AESTHETICS));
  });

  it("has the same name and origin for every Aesthetic", () => {
    for (const label of AESTHETIC_LABELS) {
      const source = AESTHETICS[label.key as keyof typeof AESTHETICS];
      expect(label.name).toBe(source.name);
      expect(label.origin).toBe(source.origin);
    }
  });

  it("derives every slug from its own name", () => {
    for (const label of AESTHETIC_LABELS) expect(label.slug).toBe(slug(label.name));
  });
});
