import {
  IconBolt,
  IconBrush,
  IconCrown,
  IconDiamond,
  IconEar,
  IconEye,
  IconEyeglass,
  IconHanger,
  IconMask,
  IconMoodSmile,
  IconMoodSmileBeam,
  IconMoodTongue,
  IconMountain,
  IconRuler2,
  IconScissors,
  IconShieldCheck,
  IconSparkles,
  IconSquareRotated,
  IconTriangleInverted,
  IconWaveSine,
  type Icon,
} from "@tabler/icons-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui";
import type { Compliment } from "@/lib/celebrities/compliment";
import { displayOverall, displayRating } from "@/lib/jev/display";
import { AESTHETICS } from "@/lib/jev/questions";
import type { AestheticKey, Ratings } from "@/lib/jev/types";
import type { Crop } from "@/lib/screening/crop.browser";
import { CHART, FADE_IN, POP, stagger, useReducedMotion } from "@/lib/ui";

import { ClaimDialog } from "./claim-dialog";
import { ComplimentDialog, ComplimentRow, useAutoOpen } from "./compliment-dialog";
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

export const DIMENSION_ICONS: Partial<Record<keyof Ratings, Icon>> = {
  eyes: IconEye,
  symmetry: IconWaveSine,
  skin: IconSparkles,
  proportions: IconRuler2,
  jawline: IconTriangleInverted,
  cheekbones: IconDiamond,
  nose: IconMask,
  lips: IconMoodTongue,
  hairAndHairline: IconScissors,
  teeth: IconMoodSmileBeam,
  eyebrows: IconEyeglass,
  chin: IconSquareRotated,
  forehead: IconMountain,
  ears: IconEar,
  confidence: IconBolt,
  styleAndGrooming: IconHanger,
  approachability: IconMoodSmile,
  mainCharacterEnergy: IconCrown,
  trustworthiness: IconShieldCheck,
};

export interface ScoreResultViewProps {
  readonly overall: number;
  readonly ratings: Ratings;
  readonly affinities: Record<AestheticKey, number>;
  /** The Crop this score came from, held for a possible Claim. See `claim-dialog.tsx`. */
  readonly crop: Crop | null;
  /** The server's Compliment for this result, or null when there is none. */
  readonly compliment?: Compliment | null;
  readonly onReset?: () => void;
}

export function DimensionIcon({ dimension }: { readonly dimension: keyof Ratings }) {
  const Glyph = DIMENSION_ICONS[dimension] ?? IconBrush;
  return (
    <Glyph aria-hidden="true" className="text-muted-foreground size-4 shrink-0" stroke={1.75} />
  );
}

/** The top Dimensions only — nobody shares a low Rating for one Feature. */
export function ScoreResultView({
  overall,
  ratings,
  affinities,
  crop,
  compliment = null,
  onReset,
}: ScoreResultViewProps) {
  const reduced = useReducedMotion();
  const [complimentOpen, setComplimentOpen] = useAutoOpen(compliment, reduced);

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
        <span className="font-mono text-5xl tabular-nums">{displayOverall(overall)}</span>
        <span className="text-muted-foreground text-sm">out of 100</span>
      </div>

      {compliment ? (
        <>
          <ComplimentRow compliment={compliment} onOpen={() => setComplimentOpen(true)} />
          <ComplimentDialog
            compliment={compliment}
            open={complimentOpen}
            onOpenChange={setComplimentOpen}
          />
        </>
      ) : null}

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
              <span className="flex items-center gap-2">
                <DimensionIcon dimension={key as keyof Ratings} />
                {DIMENSION_LABELS[key as keyof Ratings] ?? key}
              </span>
              <span className="text-muted-foreground font-mono tabular-nums">
                {Math.round(displayRating(value))}
              </span>
            </div>
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <motion.div
                className="h-full rounded-full bg-[var(--color-chart-1)]"
                initial={{ width: reduced ? `${displayRating(value)}%` : "0%" }}
                animate={{ width: `${displayRating(value)}%` }}
                transition={{ ...CHART, delay: reduced ? 0 : stagger(index) + 0.08 }}
              />
            </div>
          </motion.li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <ScoreDetailDialog overall={overall} ratings={ratings} affinities={affinities} />
        <div className="flex items-center gap-2">
          {onReset ? (
            <Button variant="outline" size="sm" onClick={onReset}>
              Try again
            </Button>
          ) : null}
          <ClaimDialog overall={overall} ratings={ratings} affinities={affinities} crop={crop} />
        </div>
      </div>
    </motion.div>
  );
}
