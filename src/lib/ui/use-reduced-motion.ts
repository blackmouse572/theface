import { useEffect, useState } from "react";

/**
 * True when the viewer asked for less motion.
 *
 * Every animated component in TheFace reads this and renders its FINAL state directly
 * rather than a faster version of the animation. A reduced-motion viewer should see the
 * headline's first word, a filled bar and a final number — never a quick flicker of the
 * same movement.
 *
 * Starts false so the server and the first client render agree, then corrects on mount.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
