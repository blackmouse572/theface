import { type VariantProps, cva } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/ui";

/** No press/active transform by design — do not add one back. */
export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium",
    "transition-colors outline-none",
    "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-1",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-resting hover:bg-primary/90",
        outline: "border-border bg-background hover:bg-accent border",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        inverse: "bg-foreground text-background hover:bg-foreground/90",
      },
      size: {
        sm: "h-8 px-4 text-sm",
        md: "h-11 px-6 text-base",
        icon: "size-7 rounded-full p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

function Spinner({ className }: { readonly className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Shows a spinner and disables the button without changing its width. */
  readonly loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={loading || disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
