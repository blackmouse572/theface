import type { ReactNode } from "react";

import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AESTHETICS } from "@/lib/jev/questions";
import type { AestheticKey, Ratings } from "@/lib/jev/types";
import { cn } from "@/lib/ui";

import { DIMENSION_LABELS } from "./score-result";

export interface ScoreDetailDialogProps {
  readonly overall: number;
  readonly ratings: Ratings;
  readonly affinities: Record<AestheticKey, number>;
  readonly className?: string;
}

/**
 * A row's bar renders at its final width immediately, no fill animation. Unlike the summary
 * list on the results view, this dialog can be reopened many times in one sitting - a repeat
 * reveal is not the rare, first-time moment that earns the summary its animated fill.
 */
function MeterRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground font-mono tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full" aria-hidden="true">
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </li>
  );
}

function SectionHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3
      className={cn("text-muted-foreground text-xs font-medium tracking-wide uppercase", className)}
    >
      {children}
    </h3>
  );
}

/** The "Score detail" trigger and the dialog it opens: every Rating and Affinity behind the Overall. */
export function ScoreDetailDialog({
  overall,
  ratings,
  affinities,
  className,
}: ScoreDetailDialogProps) {
  const allRatings = Object.entries(ratings).sort(([, a], [, b]) => b - a) as [
    keyof Ratings,
    number,
  ][];
  const allAffinities = Object.entries(affinities).sort(([, a], [, b]) => b - a) as [
    AestheticKey,
    number,
  ][];

  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          "text-muted-foreground hover:text-foreground text-sm underline underline-offset-2",
          className,
        )}
      >
        Score detail
      </DialogTrigger>
      <DialogPopup className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Score detail</DialogTitle>
          <DialogDescription>
            {Math.round(overall)} out of 100 — every Feature, Impression and Aesthetic behind it.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="overflow-y-auto">
          <SectionHeading>Features &amp; impressions</SectionHeading>
          <ul className="mt-2 flex flex-col gap-3">
            {allRatings.map(([key, value]) => (
              <MeterRow
                key={key}
                label={DIMENSION_LABELS[key] ?? key}
                value={value}
                color="var(--color-chart-1)"
              />
            ))}
          </ul>

          <SectionHeading className="mt-6">Aesthetic affinities</SectionHeading>
          <ul className="mt-2 flex flex-col gap-3">
            {allAffinities.map(([key, value]) => (
              <MeterRow
                key={key}
                label={AESTHETICS[key].name}
                value={value}
                color="var(--color-chart-2)"
              />
            ))}
          </ul>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
