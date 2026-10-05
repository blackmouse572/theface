/**
 * Seeding, step 1: download each Celebrity's photo and cut the face crops.
 *
 *   pnpm celebs:fetch                 every Candidate
 *   pnpm celebs:fetch tran-thanh lisa only the slugs named
 *
 * Commons Candidates: the original goes to ORIGINALS_DIR, a 512px crop to CROPS_DIR (for the
 * hand-written Observation) and a 256px WebP to PUBLIC_DIR (shipped), and the credit goes to
 * CREDITS_FILE. Owner-photo Candidates: only the 512px crop. Their photo is never shipped.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import sharp from "sharp";

import type { Credit } from "@/lib/celebrities/schema";

import {
  CANDIDATES_FILE,
  CandidatesSchema,
  CREDITS_FILE,
  CROPS_DIR,
  ORIGINALS_DIR,
  parseImageInfo,
  PUBLIC_DIR,
  resolveCrop,
  type Candidate,
  type CommonsPage,
} from "./lib";

// Generic on purpose: no personal data in requests.
const USER_AGENT = "TheFace-seed/0.1 (celebrity roster seeding; local script)";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

async function commonsInfo(file: string): Promise<{ url: string; credit: Credit }> {
  const params = new URLSearchParams({
    action: "query",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    format: "json",
    formatversion: "2",
    titles: file,
  });
  const response = await fetch(`${COMMONS_API}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`${file}: Commons API answered ${response.status}`);
  const body = (await response.json()) as { query?: { pages?: CommonsPage[] } };
  const page = body.query?.pages?.[0];
  if (!page) throw new Error(`${file}: not found on Commons`);
  return parseImageInfo(page);
}

async function download(url: string, to: string): Promise<void> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`download answered ${response.status}`);
  await writeFile(to, Buffer.from(await response.arrayBuffer()));
}

async function cut(candidate: Candidate, original: string): Promise<void> {
  // Bake EXIF orientation in first, so the crop box is measured on the upright image.
  const upright = await sharp(original).rotate().toBuffer();
  const { width, height } = await sharp(upright).metadata();
  if (!width || !height) throw new Error(`${original}: unreadable image`);
  const box = resolveCrop(width, height, candidate.crop);
  const face = sharp(upright).extract({
    left: box.left,
    top: box.top,
    width: box.size,
    height: box.size,
  });
  await face
    .clone()
    .resize(512, 512)
    .jpeg({ quality: 90 })
    .toFile(`${CROPS_DIR}/${candidate.slug}.jpg`);
  if (candidate.commonsFile) {
    await face
      .clone()
      .resize(256, 256)
      .webp({ quality: 82 })
      .toFile(`${PUBLIC_DIR}/${candidate.slug}.webp`);
  }
}

const only = new Set(process.argv.slice(2));
const candidates = CandidatesSchema.parse(
  JSON.parse(await readFile(CANDIDATES_FILE, "utf8")),
).filter((candidate) => only.size === 0 || only.has(candidate.slug));
await Promise.all(
  [ORIGINALS_DIR, CROPS_DIR, PUBLIC_DIR].map((dir) => mkdir(dir, { recursive: true })),
);
const credits: Record<string, Credit> = existsSync(CREDITS_FILE)
  ? (JSON.parse(await readFile(CREDITS_FILE, "utf8")) as Record<string, Credit>)
  : {};

const failures: string[] = [];
for (const candidate of candidates) {
  try {
    let original: string;
    if (candidate.commonsFile) {
      const { url, credit } = await commonsInfo(candidate.commonsFile);
      const extension = (
        /\.(jpe?g|png|webp)$/i.exec(new URL(url).pathname)?.[1] ?? "jpg"
      ).toLowerCase();
      original = `${ORIGINALS_DIR}/${candidate.slug}.${extension}`;
      if (!existsSync(original)) await download(url, original);
      credits[candidate.slug] = credit;
    } else {
      original = candidate.localPhoto ?? "";
      if (!existsSync(original)) throw new Error(`owner photo missing at ${original}`);
      delete credits[candidate.slug];
    }
    await cut(candidate, original);
    const source = credits[candidate.slug]?.licence ?? "owner photo (initials badge)";
    console.log(`ok    ${candidate.slug.padEnd(22)} ${source}`);
  } catch (error) {
    failures.push(candidate.slug);
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`FAIL  ${candidate.slug.padEnd(22)} ${reason}`);
  }
  // Be polite to Commons.
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const sorted = Object.fromEntries(Object.entries(credits).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(CREDITS_FILE, `${JSON.stringify(sorted, null, 2)}\n`);

if (failures.length > 0) {
  console.error(`\n${failures.length} failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
