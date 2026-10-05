import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { incrementTally } from "@/db/queries";
import { pickCompliment, type Compliment } from "@/lib/celebrities/compliment";
import { loadRoster } from "@/lib/celebrities/roster";
import {
  affinitiesFromAnswers,
  overallFromAnswers,
  ratingsFromAnswers,
  verdictFromAnswers,
} from "@/lib/jev/overall";
import { jevQuestions } from "@/lib/jev/questions";
import type { AestheticKey, Ratings } from "@/lib/jev/types";
import { ObservationError, observe } from "@/lib/observation";
import { audienceFromRequest } from "@/server/audience";
import { DAILY_LIMIT, rateLimiterName } from "@/server/rate-limiter";
import { verifyTurnstile } from "@/server/turnstile";

import { getDb } from "./db";
import { debug } from "./debug";

const log = debug("score");

const ScoreInput = z.object({
  /** The Crop as a base64 data URL. Never written to disk; discarded once Observation
   *  and Jev have both returned. */
  crop: z.string().min(1),
  turnstileToken: z.string().min(1),
});

export type ScoreResult =
  | {
      readonly ok: false;
      readonly reason: "turnstile" | "rate-limited" | "ai-limit" | "verdict-failed" | "error";
      /** The three Verdict probabilities, only on `verdict-failed`. Not shown to a
       *  Visitor — VERDICT_THRESHOLDS are untested placeholders, and this is what
       *  makes a false rejection diagnosable instead of a black box. See `debug.ts`. */
      readonly verdict?: { oneAdultFace: number; realPhotograph: number; apparentMinor: number };
    }
  | {
      readonly ok: true;
      readonly overall: number;
      readonly ratings: Ratings;
      readonly affinities: Record<AestheticKey, number>;
      /** The pop-up's joke, chosen here so no Celebrity's number reaches the browser.
       *  Null when the Roster is empty or broken: scoring never fails for its sake. */
      readonly compliment: Compliment | null;
    };

function clientIp(): string {
  return getRequestHeader("cf-connecting-ip") ?? getRequestIP() ?? "unknown";
}

/**
 * The Compliment for a raw Overall, or null. Never fails a scoring: a broken Roster costs
 * the pop-up, not the result. The country goes straight into `audienceFromRequest` and is
 * never logged.
 */
function complimentFor(overall: number): Compliment | null {
  try {
    // Optional and local-only, so it is not in the generated Env: production never sets it.
    const override =
      "AUDIENCE_OVERRIDE" in env && typeof env.AUDIENCE_OVERRIDE === "string"
        ? env.AUDIENCE_OVERRIDE
        : undefined;
    const audience = audienceFromRequest(getRequestHeader("cf-ipcountry"), override);
    return pickCompliment(overall, audience, loadRoster());
  } catch (error) {
    log.log("compliment: failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export const scoreCrop = createServerFn({ method: "POST" })
  .validator(ScoreInput)
  .handler(async ({ data }): Promise<ScoreResult> => {
    const ip = clientIp();
    log.log("start", { cropBytes: data.crop.length });

    try {
      const turnstileOk = await log.time("turnstile", () =>
        verifyTurnstile(data.turnstileToken, env.TURNSTILE_SECRET_KEY, ip),
      );
      if (!turnstileOk) {
        log.log("rejected", { reason: "turnstile" });
        return { ok: false, reason: "turnstile" };
      }

      const limiterName = await rateLimiterName(ip, { salt: env.RATE_LIMIT_SALT });
      const limiter = env.RATE_LIMIT.getByName(limiterName);
      const quota = await log.time("rate-limit", () => limiter.hit(DAILY_LIMIT));
      log.log("rate-limit: quota", { used: quota.used, limit: quota.limit });
      if (!quota.allowed) {
        log.log("rejected", { reason: "rate-limited" });
        return { ok: false, reason: "rate-limited" };
      }

      const observation = await log.time("observe", () => observe(env.AI, data.crop));
      log.log("observation", observation);

      const client = new TypeSafeClient({ apiKey: env.TYPESAFE_API_KEY });
      const { answers } = await log.time("jev", () =>
        client.systemOne({ state: observation, questions: jevQuestions }),
      );

      const verdict = verdictFromAnswers(answers);
      log.log("verdict", { ...verdict });
      if (!verdict.passed) {
        log.log("rejected", { reason: "verdict-failed" });
        return {
          ok: false,
          reason: "verdict-failed",
          verdict: {
            oneAdultFace: verdict.oneAdultFace,
            realPhotograph: verdict.realPhotograph,
            apparentMinor: verdict.apparentMinor,
          },
        };
      }

      const overall = overallFromAnswers(answers, observation);
      const ratings = ratingsFromAnswers(answers);
      const affinities = affinitiesFromAnswers(answers);
      log.log("scored", { overall: Number(overall.toFixed(2)) });

      const db = getDb();
      await incrementTally(db, Math.round(overall));

      const compliment = complimentFor(overall);
      return { ok: true, overall, ratings, affinities, compliment };
    } catch (error) {
      if (error instanceof ObservationError && error.failure === "daily_limit") {
        log.log("rejected", { reason: "ai-limit" });
        return { ok: false, reason: "ai-limit" };
      }
      log.log("error", { error: error instanceof Error ? error.message : String(error) });
      return { ok: false, reason: "error" };
    }
  });
