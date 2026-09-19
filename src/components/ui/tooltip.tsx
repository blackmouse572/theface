import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

import { cn } from "@/lib/ui";

export interface TooltipProps {
  /** The element that reveals the tooltip on hover or keyboard focus — an icon button or
   *  link, not plain text. It receives `aria-describedby` so the tooltip is announced. */
  readonly children: ReactElement;
  readonly content: ReactNode;
  readonly className?: string;
}

/**
 * A hover/focus tooltip with no JS state of its own: visibility is driven entirely by
 * `:hover` and `:focus-within` in CSS, so it behaves identically for a mouse and for
 * keyboard focus, and can never get out of sync with the DOM.
 */
export function Tooltip({ children, content, className }: TooltipProps) {
  const id = useId();
  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": id,
      })
    : children;

  return (
    <span className={cn("group relative inline-flex", className)}>
      {trigger}
      <span
        id={id}
        role="tooltip"
        className={cn(
          "bg-foreground text-background shadow-floating pointer-events-none absolute bottom-full",
          "left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg px-3 py-2 text-xs leading-relaxed",
          "opacity-0 transition-opacity duration-150",
          "group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        {content}
      </span>
    </span>
  );
}
