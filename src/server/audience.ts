/**
 * Which Celebrities a Visitor's Compliment may name.
 *
 * ADR-0003: the Audience comes from where the REQUEST comes from - Cloudflare's
 * `cf-ipcountry` header - and never from the face. The country is read for this one request
 * and is never stored or logged (PRIVACY.md).
 */
import { AUDIENCES, type Audience } from "@/lib/celebrities/schema";

export type { Audience } from "@/lib/celebrities/schema";

/**
 * The request's country: Cloudflare's `cf-ipcountry` header, or `request.cf.country` when the
 * header is missing (it depends on the zone's IP Geolocation setting). Never stored or logged.
 */
export function countryOf(
  header: string | undefined,
  cf: { readonly country?: unknown } | undefined,
): string | undefined {
  const fromHeader = header?.trim();
  if (fromHeader) return fromHeader;
  return typeof cf?.country === "string" ? cf.country : undefined;
}

/**
 * @param country   The `cf-ipcountry` header: an ISO 3166 code, or Cloudflare's "XX"/"T1".
 * @param override  `AUDIENCE_OVERRIDE`, for local testing only, because `vite dev` sends no
 *                  `cf-ipcountry`. Wins when it names a real Audience.
 */
export function audienceFromRequest(
  country: string | undefined,
  override: string | undefined,
): Audience {
  const forced = override?.trim().toLowerCase();
  const known = AUDIENCES.find((audience) => audience === forced);
  if (known) return known;
  return country?.trim().toUpperCase() === "VN" ? "vn" : "global";
}
