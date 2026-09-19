import type { ElementType, HTMLAttributes } from "react";

import { cn } from "@/lib/ui";

/** Plain rounded box — `corner-shape: squircle` in globals.css already gives it curved
 *  corners, so no clip-path squircle component is needed here. */
export type CardSize = "default" | "spacious";

const SIZES: Record<CardSize, string> = {
  default: "rounded-4xl sm:rounded-5xl p-5 sm:p-6",
  spacious: "rounded-4xl sm:rounded-5xl p-6 sm:p-8",
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  readonly as?: ElementType;
  readonly size?: CardSize;
}

export function Card({ as: As = "section", size = "default", className, ...props }: CardProps) {
  return (
    <As
      className={cn("border-border bg-card shadow-resting border", SIZES[size], className)}
      {...props}
    />
  );
}
