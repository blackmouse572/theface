import type { Icon } from "@tabler/icons-react";
// Deep imports, not the barrel: see the note at the top of `upload-card.tsx`.
import IconCrown from "@tabler/icons-react/dist/esm/icons/IconCrown.mjs";
import IconHeartHandshake from "@tabler/icons-react/dist/esm/icons/IconHeartHandshake.mjs";
import IconSparkles from "@tabler/icons-react/dist/esm/icons/IconSparkles.mjs";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
// Types only. The Roster, and every Celebrity's number, stays on the server (ADR-0009).
import type { Compliment, ComplimentLang, ComplimentTier } from "@/lib/celebrities/compliment";
import { cn } from "@/lib/ui";

/** How long the results get to land before the Compliment pops: the Rating bars' fill. */
export const AUTO_OPEN_DELAY_MS = 900;

const STRINGS = {
  en: {
    thanks: "Thanks, I know 😎",
    photo: "Photo (cropped)",
    reopen: "Show the compliment again",
  },
  vi: { thanks: "Biết rồi mà 😎", photo: "Ảnh (đã cắt)", reopen: "Xem lại lời khen" },
} as const satisfies Record<ComplimentLang, Record<string, string>>;

const TIER_ICONS: Record<ComplimentTier, Icon> = {
  top: IconCrown,
  above: IconSparkles,
  league: IconHeartHandshake,
};

/** "Dương Gió Tai" → "DG". The first letters of the first two words, ignoring parentheses. */
export function initialsOf(name: string): string {
  const words = name
    .normalize("NFC")
    .replace(/\([^)]*\)/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? "");
  return letters.join("").toLocaleUpperCase("vi") || "?";
}

/**
 * Opens once per result: `AUTO_OPEN_DELAY_MS` after a new `trigger`, or at once under reduced
 * motion. A Visitor who closes it is not shown it again for the same result, even when the
 * reduced-motion preference settles after mount and re-runs the effect.
 */
export function useAutoOpen(
  trigger: object | null,
  reduced: boolean,
): readonly [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  const openedFor = useRef<object | null>(null);

  useEffect(() => {
    if (trigger === null || openedFor.current === trigger) return;
    const timer = setTimeout(
      () => {
        openedFor.current = trigger;
        setOpen(true);
      },
      reduced ? 0 : AUTO_OPEN_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [trigger, reduced]);

  return [open, setOpen] as const;
}

/** The Celebrity's Commons photo, or an initials badge when there is none or it fails. */
export function CelebrityPicture({
  name,
  photo,
  size,
}: {
  readonly name: string;
  readonly photo: string | null;
  readonly size: "sm" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const large = size === "lg";
  const box = large ? "size-40 rounded-3xl text-4xl" : "size-6 rounded-md text-[10px]";

  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={large ? name : ""}
        width={large ? 160 : 24}
        height={large ? 160 : 24}
        onError={() => setFailed(true)}
        className={cn("bg-muted shrink-0 object-cover", box)}
      />
    );
  }
  return (
    <span
      role={large ? "img" : undefined}
      aria-label={large ? name : undefined}
      aria-hidden={large ? undefined : true}
      className={cn(
        "bg-accent text-accent-foreground grid shrink-0 place-items-center font-medium",
        box,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

export interface ComplimentDialogProps {
  readonly compliment: Compliment;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The pop-up: the Celebrity, the credit their photo's licence requires, and the joke. */
export function ComplimentDialog({ compliment, open, onOpenChange }: ComplimentDialogProps) {
  const { tier, lang, line, celebrity } = compliment;
  const strings = STRINGS[lang];
  const TierIcon = TIER_ICONS[tier];

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogPopup lang={lang} className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <CelebrityPicture
            key={celebrity.photo ?? celebrity.name}
            name={celebrity.name}
            photo={celebrity.photo}
            size="lg"
          />
          {celebrity.credit ? (
            <p className="text-muted-foreground max-w-[36ch] text-xs [overflow-wrap:anywhere]">
              {strings.photo}:{" "}
              <a
                href={celebrity.credit.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground underline underline-offset-2"
              >
                {celebrity.credit.author} · Wikimedia Commons
              </a>
              {" · "}
              {celebrity.credit.licenceUrl ? (
                <a
                  href={celebrity.credit.licenceUrl}
                  target="_blank"
                  rel="noreferrer license"
                  className="hover:text-foreground underline underline-offset-2"
                >
                  {celebrity.credit.licence}
                </a>
              ) : (
                celebrity.credit.licence
              )}
            </p>
          ) : null}
          <DialogTitle className="mt-2 flex flex-col items-center gap-2 text-xl text-balance">
            <TierIcon aria-hidden="true" size={20} className="text-primary shrink-0" />
            {line}
          </DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button className="w-full sm:w-auto" />}>
            {strings.thanks}
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/** The one-line Compliment under the Overall. It survives a screenshot and reopens the pop-up. */
export function ComplimentRow({
  compliment,
  onOpen,
}: {
  readonly compliment: Compliment;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      lang={compliment.lang}
      onClick={onOpen}
      className="hover:bg-accent focus-visible:ring-ring -mx-2 mt-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <CelebrityPicture
        key={compliment.celebrity.photo ?? compliment.celebrity.name}
        name={compliment.celebrity.name}
        photo={compliment.celebrity.photo}
        size="sm"
      />
      <span className="sr-only">{STRINGS[compliment.lang].reopen}: </span>
      <span className="truncate">{compliment.line}</span>
    </button>
  );
}
