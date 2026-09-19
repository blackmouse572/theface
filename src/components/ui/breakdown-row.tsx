import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

export interface BreakdownRowProps {
  /** Leading content before the name (a dot, or a rank plus an avatar). Not fixed-width;
   *  compose whatever the row needs. Not auto-hidden from screen readers — mark
   *  `aria-hidden` yourself if the content is purely decorative. */
  readonly icon: ReactNode;
  readonly name: ReactNode;
  readonly value: ReactNode;
  /** Optional share, 0-100. See `breakdownPct`. */
  readonly pct?: number;
  readonly className?: string;
}

export function BreakdownRow({ icon, name, value, pct, className }: BreakdownRowProps) {
  return (
    <span className={cn("group flex min-w-0 flex-1 items-center gap-3", className)}>
      <span className="flex shrink-0 items-center gap-2">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm underline-offset-2 group-hover:underline">
        {name}
      </span>
      <span className="flex shrink-0 items-baseline gap-2">
        <span className="text-muted-foreground font-mono text-sm tabular-nums">{value}</span>
        {pct === undefined ? null : (
          <span className="text-muted-foreground/70 w-9 text-right font-mono text-xs tabular-nums">
            {pct}%
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Share of a total for `BreakdownRow`'s `pct`. Divides by the sum of every value, never
 * the largest one. Pass `complete: false` when the value set is capped/incomplete — this
 * returns `undefined` for every row rather than a share computed from a partial sum.
 */
export function breakdownPct(
  values: readonly number[],
  complete: boolean,
): (value: number) => number | undefined {
  if (!complete) return () => undefined;
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return () => undefined;
  return (value) => Math.round((value / total) * 100);
}
