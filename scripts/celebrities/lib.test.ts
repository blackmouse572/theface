import { describe, expect, it } from "vitest";

import {
  CandidateSchema,
  parseImageInfo,
  resolveCrop,
  stripHtml,
  thumbWidthFor,
  type CommonsPage,
} from "./lib";

describe("stripHtml", () => {
  it("keeps the text of a Commons Artist link", () => {
    const artist =
      '<a href="//commons.wikimedia.org/w/index.php?title=User:Htpt2507&amp;action=edit&amp;redlink=1" class="new" title="User:Htpt2507 (page does not exist)">Htpt2507</a>';
    expect(stripHtml(artist)).toBe("Htpt2507");
  });

  it("decodes entities and collapses whitespace", () => {
    expect(stripHtml("Jane &amp; John\n   Doe")).toBe("Jane & John Doe");
  });
});

describe("resolveCrop", () => {
  it("takes the top square of a portrait image", () => {
    expect(resolveCrop(800, 1200)).toEqual({ left: 0, top: 0, size: 800 });
  });

  it("centres the square of a landscape image", () => {
    expect(resolveCrop(1200, 800)).toEqual({ left: 200, top: 0, size: 800 });
  });

  it("reads a hand-set box as fractions of the width", () => {
    expect(resolveCrop(1000, 1500, { left: 0.25, top: 0.1, size: 0.5 })).toEqual({
      left: 250,
      top: 150,
      size: 500,
    });
  });

  it("shrinks a box that would run off the image", () => {
    expect(resolveCrop(1000, 1000, { left: 0.8, top: 0.9, size: 0.5 })).toEqual({
      left: 800,
      top: 900,
      size: 100,
    });
  });
});

describe("thumbWidthFor", () => {
  it.each([
    [739, 500],
    [4000, 1920],
    [1920, 1280],
    [1921, 1920],
    [10, 20],
  ])("asks for a standard Wikimedia width below an original %i px wide: %i", (width, expected) => {
    expect(thumbWidthFor(width)).toBe(expected);
  });
});

describe("parseImageInfo", () => {
  const page: CommonsPage = {
    title: "File:Hieuthuhai 1.jpg",
    imageinfo: [
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/8/83/Hieuthuhai_1.jpg",
        descriptionurl: "https://commons.wikimedia.org/wiki/File:Hieuthuhai_1.jpg",
        extmetadata: {
          Artist: { value: "KhanhVu - Director" },
          LicenseShortName: { value: "CC BY 3.0" },
          LicenseUrl: { value: "https://creativecommons.org/licenses/by/3.0" },
        },
      },
    ],
  };

  it("returns the download URL and the credit", () => {
    expect(parseImageInfo(page)).toEqual({
      url: "https://upload.wikimedia.org/wikipedia/commons/8/83/Hieuthuhai_1.jpg",
      credit: {
        author: "KhanhVu - Director",
        licence: "CC BY 3.0",
        licenceUrl: "https://creativecommons.org/licenses/by/3.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Hieuthuhai_1.jpg",
      },
    });
  });

  it("downloads Commons' thumbnail when it offers one, not the full original", () => {
    const withThumb = structuredClone(page);
    withThumb.imageinfo![0]!.thumburl =
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Hieuthuhai_1.jpg/1600px-Hieuthuhai_1.jpg";
    expect(parseImageInfo(withThumb).url).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Hieuthuhai_1.jpg/1600px-Hieuthuhai_1.jpg",
    );
  });

  it("refuses a licence that is not free", () => {
    const nonFree = structuredClone(page);
    nonFree.imageinfo![0]!.extmetadata!["LicenseShortName"] = { value: "CC BY-NC 2.0" };
    expect(() => parseImageInfo(nonFree)).toThrow(/not CC0, public domain, CC BY or CC BY-SA/);
  });

  it("trims an Artist that carries its own licence and link", () => {
    const messy = structuredClone(page);
    messy.imageinfo![0]!.extmetadata!["Artist"] = {
      value:
        "By Gage Skidmore, CC BY-SA 3.0, https://commons.wikimedia.org/w/index.php?curid=50365084",
    };
    expect(parseImageInfo(messy).credit.author).toBe("Gage Skidmore");
  });

  it("keeps an Artist whose commas belong to a place name", () => {
    const placed = structuredClone(page);
    placed.imageinfo![0]!.extmetadata!["Artist"] = {
      value: "Gage Skidmore from Peoria, AZ, United States of America",
    };
    expect(parseImageInfo(placed).credit.author).toBe(
      "Gage Skidmore from Peoria, AZ, United States of America",
    );
  });

  it("credits an unknown author rather than leaving the credit empty", () => {
    const anonymous = structuredClone(page);
    delete anonymous.imageinfo![0]!.extmetadata!["Artist"];
    expect(parseImageInfo(anonymous).credit.author).toBe("Unknown author");
  });

  it("fails clearly when Commons returns no file", () => {
    expect(() => parseImageInfo({ title: "File:Missing.jpg" })).toThrow(/no file URL/);
  });
});

describe("CandidateSchema", () => {
  const base = { slug: "tran-thanh", name: "Trấn Thành", audience: "vn" };

  it("accepts a Commons Candidate and an owner-photo Candidate", () => {
    expect(
      CandidateSchema.safeParse({ ...base, commonsFile: "File:Trấn Thành.jpg", localPhoto: null })
        .success,
    ).toBe(true);
    expect(
      CandidateSchema.safeParse({
        ...base,
        commonsFile: null,
        localPhoto: "seed/celebrities/originals/tran-thanh.png",
      }).success,
    ).toBe(true);
  });

  it("needs exactly one photo source", () => {
    expect(
      CandidateSchema.safeParse({ ...base, commonsFile: null, localPhoto: null }).success,
    ).toBe(false);
    expect(
      CandidateSchema.safeParse({ ...base, commonsFile: "File:A.jpg", localPhoto: "a.png" })
        .success,
    ).toBe(false);
  });
});
