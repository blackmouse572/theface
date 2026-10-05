import { describe, expect, it } from "vitest";

import { audienceFromRequest } from "./audience";

describe("audienceFromRequest", () => {
  it.each(["VN", "vn", " VN "])(
    "gives the vn Audience for a request from Vietnam (%j)",
    (country) => {
      expect(audienceFromRequest(country, undefined)).toBe("vn");
    },
  );

  it.each(["US", "FR", "", "XX", "T1"])("gives the global Audience for %j", (country) => {
    expect(audienceFromRequest(country, undefined)).toBe("global");
  });

  it("gives the global Audience when Cloudflare sends no country", () => {
    expect(audienceFromRequest(undefined, undefined)).toBe("global");
  });

  it("lets the local-testing override win", () => {
    expect(audienceFromRequest("US", "vn")).toBe("vn");
    expect(audienceFromRequest("VN", "global")).toBe("global");
    expect(audienceFromRequest(undefined, " VN ")).toBe("vn");
  });

  it("ignores an empty or unknown override", () => {
    expect(audienceFromRequest("VN", "")).toBe("vn");
    expect(audienceFromRequest("US", "fr")).toBe("global");
  });
});
