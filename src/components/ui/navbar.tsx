import IconBrandGithub from "@tabler/icons-react/dist/esm/icons/IconBrandGithub.mjs";
import IconHome2 from "@tabler/icons-react/dist/esm/icons/IconHome2.mjs";
import IconShieldCheckFilled from "@tabler/icons-react/dist/esm/icons/IconShieldCheckFilled.mjs";
import IconTrophy from "@tabler/icons-react/dist/esm/icons/IconTrophy.mjs";
import { Link } from "@tanstack/react-router";

import { buttonVariants } from "@/components/ui/button";
import { NavAuth } from "@/components/ui/nav-auth";
import { cn } from "@/lib/ui";

const GITHUB_URL = "https://github.com/blackmouse572/TheFace";

const NAV_LINKS = [
  { to: "/", label: "Home", exact: true, icon: IconHome2 },
  { to: "/board", label: "Leaderboard", exact: false, icon: IconTrophy },
  { to: "/privacy", label: "Privacy", exact: false, icon: IconShieldCheckFilled },
] as const;

export function Navbar() {
  return (
    <header className="bg-background sticky top-0 z-50 px-4 pt-3 pb-2">
      <div className="border-border bg-card/80 shadow-resting mx-auto flex w-full max-w-4xl items-center justify-between gap-1 rounded-full border px-2 py-2 backdrop-blur-sm sm:gap-2 sm:px-4">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 rounded-full px-1 py-1 font-medium tracking-tight"
        >
          <img src="/icon-192.png" alt="" className="size-8 rounded-full" />
          <span className="text-foreground hidden sm:inline">TheFace</span>
        </Link>

        <nav className="flex items-center gap-0.5 sm:gap-1">
          {NAV_LINKS.map(({ to, label, exact, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact }}
              activeProps={{ className: "!bg-accent !text-foreground" }}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "px-2 sm:px-4",
              )}
            >
              <Icon size={18} className="sm:hidden" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="TheFace on GitHub"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          >
            <IconBrandGithub size={18} />
          </a>
          <NavAuth />
        </div>
      </div>
    </header>
  );
}
