/**
 * Seeding, step 3: judge each hand-written Observation with the real Jev questions, the real
 * Verdict and the real `overallFromAnswers`, then write the Roster.
 *
 *   pnpm celebs:score          score and write src/lib/celebrities/roster.json
 *   pnpm celebs:score --check  validate the Observation files only; no Jev call
 *
 * A Celebrity who fails the Verdict is skipped and reported, never overridden (ADR-0009).
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

import { TypeSafeClient } from "@typesafe-ai/sdk";

import { CelebritySchema, type Celebrity, type Credit } from "@/lib/celebrities/schema";
import { overallFromAnswers, verdictFromAnswers } from "@/lib/jev/overall";
import { jevQuestions } from "@/lib/jev/questions";
import { ObservationSchema, type Observation } from "@/lib/observation";

import {
  CANDIDATES_FILE,
  CandidatesSchema,
  CREDITS_FILE,
  OBSERVATIONS_DIR,
  ROSTER_FILE,
} from "./lib";

const checkOnly = process.argv.includes("--check");
const candidates = CandidatesSchema.parse(JSON.parse(await readFile(CANDIDATES_FILE, "utf8")));
const credits: Record<string, Credit> = existsSync(CREDITS_FILE)
  ? (JSON.parse(await readFile(CREDITS_FILE, "utf8")) as Record<string, Credit>)
  : {};

// 1. Every Observation validates before anything is sent.
const observations = new Map<string, Observation>();
const problems: string[] = [];
for (const candidate of candidates) {
  const file = `${OBSERVATIONS_DIR}/${candidate.slug}.json`;
  if (!existsSync(file)) {
    problems.push(`${candidate.slug}: no Observation at ${file}`);
    continue;
  }
  const parsed = ObservationSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    problems.push(`${candidate.slug}: ${fields.join("; ")}`);
    continue;
  }
  observations.set(candidate.slug, parsed.data);
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${observations.size} Observations valid.`);
if (checkOnly) process.exit(0);

// 2. Jev, asked exactly as scoreCrop asks it.
const apiKey = process.env["TYPESAFE_API_KEY"];
if (!apiKey) {
  console.error("TYPESAFE_API_KEY is not set. Run `pnpm celebs:score`, which loads .dev.vars.");
  process.exit(1);
}
const client = new TypeSafeClient({ apiKey });

async function judge(observation: Observation) {
  try {
    return await client.systemOne({ state: observation, questions: jevQuestions });
  } catch {
    // One retry, for a dropped connection.
    return client.systemOne({ state: observation, questions: jevQuestions });
  }
}

const roster: Celebrity[] = [];
const skipped: string[] = [];
for (const candidate of candidates) {
  const observation = observations.get(candidate.slug);
  if (!observation) continue;
  try {
    const { answers } = await judge(observation);
    const verdict = verdictFromAnswers(answers);
    if (!verdict.passed) {
      skipped.push(
        `${candidate.slug}: failed the Verdict (oneAdultFace ${verdict.oneAdultFace.toFixed(2)}, realPhotograph ${verdict.realPhotograph.toFixed(2)}, apparentMinor ${verdict.apparentMinor.toFixed(2)})`,
      );
      continue;
    }
    const credit = candidate.commonsFile ? (credits[candidate.slug] ?? null) : null;
    if (candidate.commonsFile && !credit) {
      skipped.push(`${candidate.slug}: no credit yet; run pnpm celebs:fetch ${candidate.slug}`);
      continue;
    }
    roster.push(
      CelebritySchema.parse({
        slug: candidate.slug,
        name: candidate.name,
        audience: candidate.audience,
        overall: Number(overallFromAnswers(answers, observation).toFixed(2)),
        photo: candidate.commonsFile ? `/celebrities/${candidate.slug}.webp` : null,
        credit,
      }),
    );
  } catch (error) {
    skipped.push(`${candidate.slug}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

roster.sort((a, b) => a.slug.localeCompare(b.slug));
await writeFile(ROSTER_FILE, `${JSON.stringify(roster, null, 2)}\n`);

// 3. A table for the owner to review, highest first within each Audience.
for (const audience of ["vn", "global"] as const) {
  console.log(`\n${audience}`);
  const pool = roster.filter((celebrity) => celebrity.audience === audience);
  for (const celebrity of pool.sort((a, b) => b.overall - a.overall)) {
    console.log(`  ${celebrity.overall.toFixed(1).padStart(5)}  ${celebrity.name}`);
  }
}
if (skipped.length > 0) {
  console.error(`\nSkipped:\n  ${skipped.join("\n  ")}`);
  process.exitCode = 1;
}
