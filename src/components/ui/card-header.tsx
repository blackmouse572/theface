import type { ReactNode } from "react";

export interface CardHeaderProps {
  readonly id?: string;
  readonly icon: ReactNode;
  readonly title: ReactNode;
  readonly action?: ReactNode;
}

export function CardHeader({ id, icon, title, action }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="flex items-center gap-2 text-base font-medium">
        <span aria-hidden className="text-muted-foreground flex size-4 items-center justify-center">
          {icon}
        </span>
        {title}
      </h2>
      {action}
    </div>
  );
}
