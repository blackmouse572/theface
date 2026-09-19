import { AnimatePresence, motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

import { cn, SWAP, SWAP_EXIT, useReducedMotion } from "@/lib/ui";

export type ActionSwapAnimation = "blur" | "roll" | "cascade";

/** Animations with a single-element variant set (cascade animates per letter). */
type CoreAnimation = "blur" | "roll";

export interface ActionSwapTextProps {
  value: string;
  children: ReactNode;
  animation?: ActionSwapAnimation;
  className?: string;
}

const BLUR_TRANSITION = { duration: 0.2, ease: "easeInOut" } as const;
const SWAP_BLUR = "blur(8px)";
const ROLL_BLUR = "blur(3px)";

// Cascade rolls the label one letter at a time, left to right. The leaving
// and landing strings overlap as independent layers (no shared cells), so
// proportional glyph widths never jitter. Exits cascade at half the enter
// stagger so the tail of the old label lingers briefly.
const CASCADE_STAGGER = 0.025;

const CASCADE_LETTER_VARIANTS: Variants = {
  initial: { opacity: 0, y: "105%", filter: ROLL_BLUR },
  animate: (delay: number = 0) => ({
    opacity: 1,
    y: "0%",
    filter: "blur(0px)",
    transition: { ...SWAP, delay },
  }),
  exit: (delay: number = 0) => ({
    opacity: 0,
    y: "-105%",
    filter: ROLL_BLUR,
    transition: { ...SWAP_EXIT, delay: delay * 0.5 },
  }),
};

const TEXT_VARIANTS: Record<CoreAnimation, Variants> = {
  blur: {
    initial: { opacity: 0, scale: 0.94, filter: SWAP_BLUR },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)", transition: BLUR_TRANSITION },
    exit: { opacity: 0, scale: 0.94, filter: SWAP_BLUR, transition: BLUR_TRANSITION },
  },
  roll: {
    initial: { opacity: 0, y: "90%", filter: ROLL_BLUR },
    animate: { opacity: 1, y: "0%", filter: "blur(0px)", transition: SWAP },
    exit: { opacity: 0, y: "-90%", filter: ROLL_BLUR, transition: SWAP_EXIT },
  },
};

/**
 * Letter-by-letter (or whole-label) swap for a run of text. `cascade` splits the
 * string into per-letter slots that roll in staggered, left to right; `blur`/`roll`
 * swap the whole label as one element. Falls back to the closest single-element
 * animation when the content isn't plain text or motion is reduced.
 */
export function ActionSwapText({
  value,
  children,
  animation = "blur",
  className,
}: ActionSwapTextProps) {
  const reduce = useReducedMotion();

  const label = typeof children === "string" ? children : null;
  const cascade = animation === "cascade" && label !== null && !reduce;
  const coreAnimation: CoreAnimation = animation === "cascade" ? "roll" : animation;

  return (
    <span
      className={cn(
        "relative -my-[0.08em] inline-block max-w-full whitespace-nowrap py-[0.08em] align-bottom",
        className,
      )}
      style={{ clipPath: "inset(0 -999px)", WebkitClipPath: "inset(0 -999px)" }}
    >
      <span aria-hidden className="invisible inline-block whitespace-nowrap">
        {cascade
          ? label.split("").map((char, index) => (
              <span key={`${index}-${char}`} className="inline-block whitespace-pre">
                {char}
              </span>
            ))
          : children}
      </span>
      {cascade ? (
        <>
          {/* Letters are decorative fragments; readers get the whole label. */}
          <span className="sr-only">{label}</span>
          <AnimatePresence initial={false}>
            <motion.span
              key={`cascade-${value}`}
              aria-hidden
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute top-[0.08em] left-0 inline-block whitespace-pre"
            >
              {label.split("").map((char, i) => (
                <motion.span
                  key={`${i}-${char}`}
                  custom={i * CASCADE_STAGGER}
                  variants={CASCADE_LETTER_VARIANTS}
                  className="inline-block whitespace-pre will-change-[opacity,filter,transform]"
                >
                  {char}
                </motion.span>
              ))}
            </motion.span>
          </AnimatePresence>
        </>
      ) : (
        <AnimatePresence initial={false}>
          <motion.span
            key={`${animation}-${value}`}
            variants={TEXT_VARIANTS[coreAnimation]}
            initial={reduce ? false : "initial"}
            animate={reduce ? { opacity: 1, filter: "blur(0px)", scale: 1, y: 0 } : "animate"}
            exit={reduce ? undefined : "exit"}
            className="absolute top-[0.08em] left-0 inline-block max-w-full truncate will-change-[opacity,filter,transform]"
          >
            {children}
          </motion.span>
        </AnimatePresence>
      )}
    </span>
  );
}
