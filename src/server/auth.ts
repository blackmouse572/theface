import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import * as schema from "@/db/schema";

import { getDb } from "./db";

/**
 * The only auth this app has - X (Twitter) OAuth. See ADR-0005: authentication is
 * mandatory for the Leaderboard, and PRIVACY.md promises TheFace never asks for an email,
 * so the X app must not request the email scope - `xUsername` is the one profile field this
 * app actually needs, mapped in via `mapProfileToUser` per the build checklist in SPEC.md.
 */
export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { schema, provider: "sqlite" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  advanced: { useSecureCookies: true },
  socialProviders: {
    twitter: {
      clientId: env.TWITTER_CLIENT_ID,
      clientSecret: env.TWITTER_CLIENT_SECRET,
      mapProfileToUser: (profile) => ({ xUsername: profile.data.username }),
    },
  },
  user: {
    additionalFields: {
      xUsername: { type: "string", required: false, input: true },
    },
  },
  plugins: [tanstackStartCookies()],
});
