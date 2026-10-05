import IconChevronRight from "@tabler/icons-react/dist/esm/icons/IconChevronRight.mjs";
import IconTrophy from "@tabler/icons-react/dist/esm/icons/IconTrophy.mjs";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";

import { BreakdownRow, Card, CardHeader } from "@/components/ui";
import { displayRating } from "@/lib/jev/display";
import { cn, FADE_IN, POP, stagger, useReducedMotion } from "@/lib/ui";

export interface BoardRow {
  readonly rank: number;
  readonly handle: string;
  readonly displayName: string;
  readonly overall: number;
  /** Portrait or Avatar — the server decides which. */
  readonly imageUrl: string;
}

export interface BoardCardProps {
  readonly rows: readonly BoardRow[];
  readonly className?: string;
}

export function BoardCard({ rows, className }: BoardCardProps) {
  const reduced = useReducedMotion();

  return (
    <Card className={cn("flex flex-col", className)} aria-labelledby="board-heading">
      <CardHeader
        id="board-heading"
        icon={<IconTrophy size={16} />}
        title="Top beautiful face"
        action={
          <Link
            to="/board"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex items-center gap-0.5 rounded text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            See all
            <IconChevronRight size={14} />
          </Link>
        }
      />

      <div className="bg-background mt-4 flex flex-1 flex-col rounded-3xl p-2">
        {rows.length === 0 ? (
          <div className="text-muted-foreground m-auto flex max-w-[22ch] flex-col items-center gap-2 text-center text-sm">
            <IconTrophy size={24} className="opacity-40" />
            <p>Nobody has claimed a rank yet. Yours could be the first.</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-1">
            {rows.map((row, index) => (
              <motion.li
                key={row.handle}
                initial={{ opacity: 0, transform: reduced ? "none" : "translateY(6px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{
                  ...(reduced ? FADE_IN : POP),
                  delay: reduced ? 0 : stagger(index),
                  opacity: FADE_IN,
                }}
              >
                <a
                  href={`https://x.com/${row.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:bg-accent focus-visible:ring-ring -mx-2 flex items-center rounded-lg px-2 py-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <BreakdownRow
                    icon={
                      <>
                        <span className="text-muted-foreground w-5 text-right font-mono text-sm tabular-nums">
                          {row.rank}
                        </span>
                        <img
                          src={row.imageUrl}
                          alt=""
                          loading="lazy"
                          width={32}
                          height={32}
                          className="bg-muted size-8 rounded-full object-cover"
                        />
                      </>
                    }
                    name={
                      <>
                        <span className="block truncate">{row.displayName}</span>
                        <span className="text-muted-foreground block truncate font-mono text-xs">
                          @{row.handle}
                        </span>
                      </>
                    }
                    value={Math.round(displayRating(row.overall))}
                  />
                </a>
              </motion.li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
