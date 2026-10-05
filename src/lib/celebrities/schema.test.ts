import { describe, expect, it } from "vitest";

import { CelebritySchema, isFreeLicence, RosterSchema } from "./schema";

const credit = {
  author: "Jane Doe",
  licence: "CC BY-SA 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
};

const celebrity = {
  slug: "jane-doe",
  name: "Jane Doe",
  audience: "global",
  overall: 61.5,
  photo: "/celebrities/jane-doe.webp",
  credit,
};

describe("isFreeLicence", () => {
  it.each([
    "CC0",
    "CC0 1.0",
    "Public domain",
    "PD",
    "CC BY 2.0",
    "CC BY 3.0",
    "CC BY-SA 4.0",
    "cc by-sa 3.0",
  ])("accepts %s", (licence) => expect(isFreeLicence(licence)).toBe(true));

  it.each([
    "CC BY-NC 2.0",
    "CC BY-NC-SA 4.0",
    "CC BY-ND 4.0",
    "All rights reserved",
    "Fair use",
    "GFDL",
    "",
  ])("rejects %s", (licence) => expect(isFreeLicence(licence)).toBe(false));
});

describe("CelebritySchema", () => {
  it("accepts a Celebrity with a credited photo", () => {
    expect(CelebritySchema.safeParse(celebrity).success).toBe(true);
  });

  it("accepts a Celebrity with neither photo nor credit (an initials badge)", () => {
    expect(CelebritySchema.safeParse({ ...celebrity, photo: null, credit: null }).success).toBe(
      true,
    );
  });

  it("rejects a photo without a credit", () => {
    expect(CelebritySchema.safeParse({ ...celebrity, credit: null }).success).toBe(false);
  });

  it("rejects a credit without a photo", () => {
    expect(CelebritySchema.safeParse({ ...celebrity, photo: null }).success).toBe(false);
  });

  it("rejects a licence that is not free", () => {
    const nonFree = { ...celebrity, credit: { ...credit, licence: "CC BY-NC 2.0" } };
    expect(CelebritySchema.safeParse(nonFree).success).toBe(false);
  });

  it("rejects an Audience other than global or vn", () => {
    expect(CelebritySchema.safeParse({ ...celebrity, audience: "us" }).success).toBe(false);
  });

  it("rejects an Overall outside 0..100", () => {
    expect(CelebritySchema.safeParse({ ...celebrity, overall: 101 }).success).toBe(false);
  });
});

describe("RosterSchema", () => {
  it("rejects duplicate slugs", () => {
    expect(RosterSchema.safeParse([celebrity, celebrity]).success).toBe(false);
  });
});
