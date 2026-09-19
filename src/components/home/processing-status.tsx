import { AnimatePresence, motion } from "motion/react";

import { FADE_IN, POP, POP_EXIT, cn, useReducedMotion } from "@/lib/ui";

/**
 * What is happening right now, in words.
 *
 * The first stage is the one that needs this most: Screening lazy-loads about 700 KB of
 * face models, and without a message the button simply sits there looking broken. Naming
 * the stage turns a freeze into a wait, which people tolerate far better.
 *
 * Every message says where the work is happening. "On your device" is not decoration —
 * it is the privacy claim being demonstrated at the moment it is true.
 */

export type ProcessingStage =
  | "idle"
  | "loading-models"
  | "screening"
  | "cropping"
  | "observing"
  | "scoring";

const MESSAGES: Record<Exclude<ProcessingStage, "idle">, string> = {
  "loading-models": "Getting ready, on your device…",
  screening: "Looking for a face, on your device…",
  cropping: "Framing the photo, on your device…",
  observing: "Describing what the camera saw…",
  scoring: "Making up our mind…",
};

/** The stages, in order, so the dots can show how far along the work is. */
export const PROCESSING_STAGES = [
  "loading-models",
  "screening",
  "cropping",
  "observing",
  "scoring",
] as const;

export interface ProcessingStatusProps {
  readonly stage: ProcessingStage;
  readonly className?: string;
}

export function ProcessingStatus({ stage, className }: ProcessingStatusProps) {
  const reduced = useReducedMotion();
  if (stage === "idle") return null;

  const index = PROCESSING_STAGES.indexOf(stage as (typeof PROCESSING_STAGES)[number]);

  return (
    <div className={cn("flex items-center gap-3", className)} role="status" aria-live="polite">
      {/* Progress as dots rather than a bar: the durations here are not knowable in
          advance, and a bar that stalls at 70% reads as broken. */}
      <span className="flex items-center gap-1.5" aria-hidden>
        {PROCESSING_STAGES.map((name, position) => (
          <motion.span
            key={name}
            className={cn(
              "size-1.5 rounded-full",
              position <= index ? "bg-[var(--color-chart-1)]" : "bg-muted",
            )}
            animate={reduced || position !== index ? { opacity: 1 } : { opacity: [1, 0.35, 1] }}
            transition={
              reduced || position !== index
                ? FADE_IN
                : { duration: 1.1, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
            }
          />
        ))}
      </span>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={stage}
          className="text-muted-foreground text-sm"
          initial={{ opacity: 0, transform: reduced ? "none" : "translateY(4px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          exit={{ opacity: 0, transform: "translateY(-4px)", transition: POP_EXIT }}
          transition={reduced ? FADE_IN : POP}
        >
          {MESSAGES[stage]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
