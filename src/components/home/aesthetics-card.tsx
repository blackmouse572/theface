import IconChevronRight from "@tabler/icons-react/dist/esm/icons/IconChevronRight.mjs";
import IconSparkles from "@tabler/icons-react/dist/esm/icons/IconSparkles.mjs";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";

import { BreakdownRow, Card, CardHeader } from "@/components/ui";
import { FADE_IN, POP, stagger, useReducedMotion } from "@/lib/ui";

export interface AestheticBar {
  readonly name: string;
  readonly slug: string;
  /** Highest Affinity reached, 0..100. */
  readonly affinity: number;
  readonly handle?: string;
}

export interface AestheticsCardProps {
  readonly bars: readonly AestheticBar[];
  readonly className?: string;
}

export function AestheticsCard({ bars, className }: AestheticsCardProps) {
  const reduced = useReducedMotion();

  return (
    <Card className={className} aria-labelledby="aesthetics-heading">
      <CardHeader
        id="aesthetics-heading"
        icon={<IconSparkles size={16} />}
        title="Top facial aesthetics"
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
      <p className="text-muted-foreground mt-1 text-sm">
        The highest score reached against each aesthetic.
      </p>

      <div className="bg-background mt-4 rounded-3xl p-2">
        <ul className="flex flex-col gap-1">
          {bars.map((bar, index) => (
            <motion.li
              key={bar.slug}
              initial={{ opacity: 0, transform: reduced ? "none" : "translateY(6px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{
                ...(reduced ? FADE_IN : POP),
                delay: reduced ? 0 : stagger(index),
                opacity: FADE_IN,
              }}
            >
              <Link
                to="/board/$aesthetic"
                params={{ aesthetic: bar.slug }}
                className="hover:bg-accent focus-visible:ring-ring -mx-2 flex items-center rounded-lg px-2 py-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                title={`${bar.name}: ${Math.round(bar.affinity)} out of 100${
                  bar.handle ? `, held by @${bar.handle}` : ""
                }`}
              >
                <BreakdownRow
                  icon={
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full bg-[var(--color-chart-1)]/50 transition-colors group-hover:bg-[var(--color-chart-1)]"
                    />
                  }
                  name={bar.name}
                  value={Math.round(bar.affinity)}
                />
              </Link>
            </motion.li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
