import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { TextCascade } from "@/components/motion/text-cascade";
import { cn, PANEL, useReducedMotion } from "@/lib/ui";

/**
 * The adjective cycles, the rest of the question holds still.
 *
 * The word's box tracks its own width, but by tweening the real CSS `width` (measured
 * from a hidden same-font sizer) rather than a `layout` scale transform: scaling the box
 * visibly squishes the letters mid-transition when a much longer or shorter word swaps
 * in, which animating the actual width doesn't. `overflow-x-clip` hides the reveal on
 * the horizontal axis only, so `TextCascade`'s own vertical clipping (its descenders'
 * breathing room) is untouched.
 */

export const HEADLINE_WORDS = ["handsome", "pretty", "striking", "photogenic"] as const;

const HOLD_MS = 2200;

export interface AnimatedHeadlineProps {
  readonly words?: readonly string[];
  readonly className?: string;
}

export function AnimatedHeadline({ words = HEADLINE_WORDS, className }: AnimatedHeadlineProps) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const sizerRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();

  useEffect(() => {
    if (reduced || words.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), HOLD_MS);
    return () => clearInterval(id);
  }, [reduced, words.length]);

  const word = words[index] ?? words[0] ?? "";

  useEffect(() => {
    setWidth(sizerRef.current?.offsetWidth);
  }, [word]);

  return (
    <h1
      className={cn(
        "text-center text-4xl font-normal tracking-tight text-balance sm:text-5xl",
        className,
      )}
    >
      Are you{" "}
      <span className="relative inline-block align-bottom">
        <span ref={sizerRef} aria-hidden className="invisible absolute whitespace-nowrap">
          {word}
        </span>
        <motion.span
          initial={false}
          animate={width === undefined ? undefined : { width }}
          transition={reduced ? { duration: 0 } : PANEL}
          className="inline-block overflow-x-clip align-bottom"
        >
          <TextCascade text={word} className="text-primary" />
        </motion.span>
      </span>
      ?{/* A screen reader gets one stable sentence rather than a word changing under it. */}
      <span className="sr-only">Are you {words.join(", ")}?</span>
    </h1>
  );
}
