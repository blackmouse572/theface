/**
 * TheFace - D1 (SQLite) schema.
 *
 * Vocabulary is fixed by `CONTEXT.md`. Table and column names use those terms and no
 * synonyms. Three rules constrain what may live here:
 *
 * - ADR-0003: no field names a people. There is no `region`, `ethnicity`, `nationality` or
 *   `race` column. An Aesthetic carries a tradition name only; its regional origin is a
 *   display label in the UI and is deliberately absent from the database.
 * - ADR-0004 / `PRIVACY.md`: a Portrait is stored only with consent, for 90 days.
 * - ADR-0006: a Visitor who does not Claim leaves nothing but a Tally counter.
 */

import { sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Every Rating and every Affinity is an integer in this closed range. */
export const RATING_MIN = 0;
export const RATING_MAX = 100;

/** `PRIVACY.md`: a Portrait is deleted 90 days after the Claim. */
export const PORTRAIT_TTL_DAYS = 90;
export const PORTRAIT_TTL_MS = PORTRAIT_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Drizzle's default for a `created_at` / `updated_at` column on D1. */
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/* -------------------------------------------------------------------------------------- */
/* Aesthetics                                                                               */
/* -------------------------------------------------------------------------------------- */

/**
 * The eight Aesthetics, as tradition names.
 *
 * PROVISIONAL. `SPEC.md` § "Still to decide" records that the eight are not chosen. This
 * list exists so the schema can be built; changing it is a migration.
 *
 * Each name is a style or a scene, never a people - ADR-0003: "'Old Hollywood' describes a
 * style. 'Anglo-American' describes a people. The criteria are identical either way, so the
 * axis must carry the style." The origin label that ADR-0003 permits in a tooltip is UI
 * data. It must not become a column.
 */
export const AESTHETICS = [
  "kBeauty",
  "bollywoodGlamour",
  "nollywoodGlamour",
  "persianClassical",
  "oldHollywood",
  "nordicMinimalism",
  "mediterraneanClassical",
  "latinScreenSiren",
] as const;

export type Aesthetic = (typeof AESTHETICS)[number];

/* -------------------------------------------------------------------------------------- */
/* Leaderboard Entry                                                                        */
/* -------------------------------------------------------------------------------------- */

/**
 * A Contender's public record. Keyed on the X user id (ADR-0005).
 *
 * 36 columns, well inside D1's 100-column limit.
 */
export const leaderboardEntry = sqliteTable(
  "leaderboard_entry",
  {
    /**
     * The X user id. X returns this as a string, because the value exceeds the range that
     * JSON numbers represent exactly. It is never stored as an integer.
     */
    xUserId: text("x_user_id").primaryKey(),
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),

    /** The Overall: derived in code from the Ratings below. Never asked of Jev. */
    overall: integer("overall").notNull(),

    /* The 19 Dimension Ratings. Craft is excluded - ADR-0007 - so no Craft column exists. */

    /* 14 Features. */
    ratingEyes: integer("rating_eyes").notNull(),
    ratingEyebrows: integer("rating_eyebrows").notNull(),
    ratingNose: integer("rating_nose").notNull(),
    ratingLips: integer("rating_lips").notNull(),
    ratingJawline: integer("rating_jawline").notNull(),
    ratingChin: integer("rating_chin").notNull(),
    ratingCheekbones: integer("rating_cheekbones").notNull(),
    ratingForehead: integer("rating_forehead").notNull(),
    ratingSkin: integer("rating_skin").notNull(),
    ratingTeeth: integer("rating_teeth").notNull(),
    ratingHairAndHairline: integer("rating_hair_and_hairline").notNull(),
    ratingEars: integer("rating_ears").notNull(),
    ratingSymmetry: integer("rating_symmetry").notNull(),
    ratingProportions: integer("rating_proportions").notNull(),

    /* 5 rated Impressions. The categorical Impressions return a label, carry no weight and
       are not stored. */
    ratingApproachability: integer("rating_approachability").notNull(),
    ratingTrustworthiness: integer("rating_trustworthiness").notNull(),
    ratingMainCharacterEnergy: integer("rating_main_character_energy").notNull(),
    ratingStyleAndGrooming: integer("rating_style_and_grooming").notNull(),
    ratingConfidence: integer("rating_confidence").notNull(),

    /* The 8 Affinities. One per Aesthetic, one Board each. */
    affinityKBeauty: integer("affinity_k_beauty").notNull(),
    affinityOldHollywood: integer("affinity_old_hollywood").notNull(),
    affinityBollywoodGlamour: integer("affinity_bollywood_glamour").notNull(),
    affinityNordicMinimalism: integer("affinity_nordic_minimalism").notNull(),
    affinityMediterraneanClassical: integer("affinity_mediterranean_classical").notNull(),
    affinityNollywoodGlamour: integer("affinity_nollywood_glamour").notNull(),
    affinityPersianClassical: integer("affinity_persian_classical").notNull(),
    affinityLatinScreenSiren: integer("affinity_latin_screen_siren").notNull(),

    /**
     * The R2 object key of the Portrait. NULL means the Entry shows an Avatar - either the
     * Contender declined the Portrait box, deleted the Portrait, or the 90 days elapsed.
     */
    portraitKey: text("portrait_key"),

    /**
     * ADR-0004: a Portrait is stored only on a separate, never pre-ticked consent. This flag
     * records the consent that stored the current Portrait, so it clears with the Portrait.
     */
    portraitConsent: integer("portrait_consent", { mode: "boolean" }).notNull().default(false),

    /** When the Portrait expires. NULL whenever `portraitKey` is NULL. */
    portraitExpiresAt: integer("portrait_expires_at", { mode: "timestamp_ms" }),

    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(nowMs)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    /* Nine Boards, nine indexes. Each one serves exactly one `ORDER BY ... LIMIT` and
       nothing else. D1 charges rows scanned, so a Board must never sort at read time. */
    index("leaderboard_entry_overall_idx").on(table.overall),
    index("leaderboard_entry_affinity_k_beauty_idx").on(table.affinityKBeauty),
    index("leaderboard_entry_affinity_old_hollywood_idx").on(table.affinityOldHollywood),
    index("leaderboard_entry_affinity_bollywood_glamour_idx").on(table.affinityBollywoodGlamour),
    index("leaderboard_entry_affinity_nordic_minimalism_idx").on(table.affinityNordicMinimalism),
    index("leaderboard_entry_affinity_mediterranean_classical_idx").on(
      table.affinityMediterraneanClassical,
    ),
    index("leaderboard_entry_affinity_nollywood_glamour_idx").on(table.affinityNollywoodGlamour),
    index("leaderboard_entry_affinity_persian_classical_idx").on(table.affinityPersianClassical),
    index("leaderboard_entry_affinity_latin_screen_siren_idx").on(table.affinityLatinScreenSiren),

    /**
     * The expiry sweep. Partial, so it holds only the Entries that actually carry a
     * Portrait: a Contender who declined the box costs nothing to index, and clearing a
     * Portrait removes the row from this index.
     */
    index("leaderboard_entry_portrait_expires_at_idx")
      .on(table.portraitExpiresAt)
      .where(sql`${table.portraitKey} is not null`),
  ],
);

export type LeaderboardEntry = typeof leaderboardEntry.$inferSelect;
export type NewLeaderboardEntry = typeof leaderboardEntry.$inferInsert;

/** The Affinity column that each Aesthetic's Board ranks on. */
export const affinityColumns = {
  kBeauty: leaderboardEntry.affinityKBeauty,
  oldHollywood: leaderboardEntry.affinityOldHollywood,
  bollywoodGlamour: leaderboardEntry.affinityBollywoodGlamour,
  nordicMinimalism: leaderboardEntry.affinityNordicMinimalism,
  mediterraneanClassical: leaderboardEntry.affinityMediterraneanClassical,
  nollywoodGlamour: leaderboardEntry.affinityNollywoodGlamour,
  persianClassical: leaderboardEntry.affinityPersianClassical,
  latinScreenSiren: leaderboardEntry.affinityLatinScreenSiren,
} as const satisfies Record<Aesthetic, SQLiteColumn>;

/* -------------------------------------------------------------------------------------- */
/* Tally                                                                                    */
/* -------------------------------------------------------------------------------------- */

/** One bucket per Overall: 0 through 100 inclusive. */
export const TALLY_BUCKETS = RATING_MAX - RATING_MIN + 1;

/** `SPEC.md`: Percentile stays hidden until the Tally holds about this many Overalls. */
export const MIN_TALLY_FOR_PERCENTILE = 200;

/**
 * The Tally - 101 rows, one per Overall, each holding a count.
 *
 * ADR-0006: this is the only thing TheFace stores for a Visitor who does not Claim, and it
 * must stay that way. **No identifier and no timestamp may ever be added to this table.** A
 * counter is not personal data; a counter with a timestamp beside it is a history.
 *
 * `overall` is declared `integer primary key`, so it is the SQLite rowid: a bucket is found
 * without a secondary index, and the whole table is 101 rows to scan.
 */
export const tally = sqliteTable("tally", {
  /** The Overall this bucket counts. 0–100. */
  overall: integer("overall").primaryKey(),
  /** How many Overalls of this value TheFace has produced. */
  count: integer("count").notNull().default(0),
});

export type TallyRow = typeof tally.$inferSelect;

/* -------------------------------------------------------------------------------------- */
/* better-auth                                                                              */
/* -------------------------------------------------------------------------------------- */

/*
 * The better-auth core schema, owned by Drizzle so that `drizzle-kit generate` plus
 * `wrangler d1 migrations apply` is the single migration path for every table.
 *
 * Shape verified against better-auth 1.7.5 - `@better-auth/core/dist/db/get-tables.mjs`
 * (`buildAuthTables`) and the CLI's own Drizzle/SQLite snapshot
 * (`packages/cli/test/__snapshots__/auth-schema-sqlite-*.txt`).
 *
 * The TypeScript property names below are load-bearing: `@better-auth/drizzle-adapter`
 * resolves a field with `schemaModel[field]`, so each key must match better-auth's field
 * name exactly. The SQL column names are free, and are snake_case to match the rest of this
 * schema - the same split the better-auth CLI emits.
 */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /**
   * Required by better-auth. `PRIVACY.md` promises that TheFace never asks for an email, so
   * the X app must not request the email scope; better-auth fills this from the profile.
   */
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  /**
   * The X handle, populated by `mapProfileToUser`. better-auth only writes an extra field
   * that is declared in `user.additionalFields` with `input: true`; without that flag the
   * value is dropped before it reaches the adapter.
   */
  xUsername: text("x_username"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(nowMs)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(nowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    /** For the `twitter` provider this holds the X user id - the Leaderboard Entry key. */
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(nowMs)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(nowMs)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
