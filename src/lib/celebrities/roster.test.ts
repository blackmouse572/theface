import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadRoster } from "./roster";
import rosterJson from "./roster.json";

describe("the committed Roster", () => {
  it("passes its schema: free licences, credits with photos, unique slugs", () => {
    expect(loadRoster()).toHaveLength(rosterJson.length);
  });

  it("holds at least 24 international and 14 Vietnamese Celebrities", () => {
    const roster = loadRoster();
    expect(
      roster.filter((celebrity) => celebrity.audience === "global").length,
    ).toBeGreaterThanOrEqual(24);
    expect(roster.filter((celebrity) => celebrity.audience === "vn").length).toBeGreaterThanOrEqual(
      14,
    );
  });

  it("ships every photo it points at", () => {
    for (const { photo } of loadRoster()) {
      if (photo !== null) expect(existsSync(join("public", photo)), photo).toBe(true);
    }
  });
});
