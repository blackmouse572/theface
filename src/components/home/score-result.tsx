import { motion } from "motion/react";

import { AESTHETICS } from "@/lib/jev/questions";
import type { AestheticKey, Ratings } from "@/lib/jev/types";
import type { Crop } from "@/lib/screening/crop.browser";
import { CHART, FADE_IN, POP, stagger, useReducedMotion } from "@/lib/ui";

import { ClaimDialog } from "./claim-dialog";
import { ScoreDetailDialog } from "./score-detail-dialog";

export const DIMENSION_LABELS: Partial<Record<keyof Ratings, string>> = {
  eyes: "Eyes",
  symmetry: "Symmetry",
  skin: "Skin",
  proportions: "Proportions",
  jawline: "Jawline",
  cheekbones: "Cheekbones",
  nose: "Nose",
  lips: "Lips",
  hairAndHairline: "Hair",
  teeth: "Teeth",
  eyebrows: "Eyebrows",
  chin: "Chin",
  forehead: "Forehead",
  ears: "Ears",
  confidence: "Confidence",
  styleAndGrooming: "Style and grooming",
  approachability: "Approachability",
  mainCharacterEnergy: "Main-character energy",
  trustworthiness: "Trustworthiness",
};

export interface ScoreResultViewProps {
  readonly overall: number;
  readonly ratings: Ratings;
  readonly affinities: Record<AestheticKey, number>;
  /** The Crop this score came from, held for a possible Claim. See `claim-dialog.tsx`. */
  readonly crop: Crop | null;
  readonly onReset?: () => void;
}

/** The top Dimensions only — nobody shares a low Rating for one Feature. */
export function ScoreResultView({
  overall,
  ratings,
  affinities,
  crop,
  onReset,
}: ScoreResultViewProps) {
  const reduced = useReducedMotion();

  const topRatings = Object.entries(ratings)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const topAesthetic = Object.entries(affinities).sort(([, a], [, b]) => b - a)[0];

  return (
    <motion.div
      initial={{ opacity: 0, transform: reduced ? "none" : "translateY(6px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={reduced ? FADE_IN : POP}
      className="mt-5"
    >
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-5xl tabular-nums">{Math.round(overall)}</span>
        <span className="text-muted-foreground text-sm">out of 100</span>
      </div>

      {topAesthetic ? (
        <p className="text-muted-foreground mt-1 text-sm">
          Closest match: {AESTHETICS[topAesthetic[0] as AestheticKey].name} (
          {Math.round(topAesthetic[1])})
        </p>
      ) : null}

      <ul className="mt-4 flex flex-col gap-3">
        {topRatings.map(([key, value], index) => (
          <motion.li
            key={key}
            className="flex flex-col gap-1"
            initial={{ opacity: 0, transform: reduced ? "none" : "translateY(6px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            transition={{
              ...(reduced ? FADE_IN : POP),
              delay: reduced ? 0 : stagger(index),
              opacity: FADE_IN,
            }}
          >
            <div className="flex items-center justify-between text-sm">
              <span>{DIMENSION_LABELS[key as keyof Ratings] ?? key}</span>
              <span className="text-muted-foreground font-mono tabular-nums">
                {Math.round(value)}
              </span>
            </div>
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <motion.div
                className="h-full rounded-full bg-[var(--color-chart-1)]"
                initial={{ width: reduced ? `${value}%` : "0%" }}
                animate={{ width: `${value}%` }}
                transition={{ ...CHART, delay: reduced ? 0 : stagger(index) + 0.08 }}
              />
            </div>
          </motion.li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ScoreDetailDialog overall={overall} ratings={ratings} affinities={affinities} />
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2"
            >
              Try another photo
            </button>
          ) : null}
        </div>
        <ClaimDialog overall={overall} ratings={ratings} affinities={affinities} crop={crop} />
      </div>
    </motion.div>
  );
}
