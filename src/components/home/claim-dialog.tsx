import IconBrandX from "@tabler/icons-react/dist/esm/icons/IconBrandX.mjs";
import { useState } from "react";

import {
  Button,
  buttonVariants,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import type { AestheticKey, Ratings } from "@/lib/jev/types";
import type { Crop } from "@/lib/screening/crop.browser";
import { cn } from "@/lib/ui";
import { claimRank } from "@/server/claim.functions";

/**
 * ADR-0005: the only sign-in this app has is X, and it is mandatory to appear on a Board -
 * not an optional upgrade. Same redirect `nav-auth.tsx` uses for the nav bar's sign-in.
 */
function signInWithX() {
  void authClient.signIn.social({ provider: "twitter", callbackURL: window.location.pathname });
}

export interface ClaimDialogProps {
  readonly overall: number;
  readonly ratings: Ratings;
  readonly affinities: Record<AestheticKey, number>;
  /** The Crop this score came from. Needed only if the Contender consents to a Portrait. */
  readonly crop: Crop | null;
  readonly className?: string;
}

type ClaimStage = "idle" | "submitting" | "error";

/**
 * The "Claim your rank" trigger and the dialog it opens.
 *
 * X sign-in is a full-page redirect (`nav-auth.tsx`), which discards this component's
 * in-memory state on the way back. A Visitor who claims while already signed in (e.g. signed
 * in from the nav bar first) gets the whole flow in one dialog; a Visitor who signs in from
 * here returns to a fresh page and needs to score again before claiming - the same trade the
 * rest of this flow already makes by keeping the Crop in memory rather than IndexedDB.
 */
export function ClaimDialog({ overall, ratings, affinities, crop, className }: ClaimDialogProps) {
  const { data: session } = authClient.useSession();
  const [portraitConsent, setPortraitConsent] = useState(false);
  const [stage, setStage] = useState<ClaimStage>("idle");
  const [claimedHandle, setClaimedHandle] = useState<string | null>(null);

  async function submit() {
    setStage("submitting");
    const result = await claimRank({
      data: {
        overall,
        ratings,
        affinities,
        portraitConsent,
        crop: portraitConsent && crop ? crop.dataUrl : undefined,
      },
    });
    if (!result.ok) {
      setStage("error");
      return;
    }
    setClaimedHandle(result.handle);
  }

  return (
    <Dialog>
      <DialogTrigger
        className={cn(buttonVariants({ variant: "primary", size: "sm" }), "shrink-0", className)}
      >
        Claim your rank
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Claim your rank</DialogTitle>
          <DialogDescription>
            {claimedHandle
              ? "You're on the Leaderboard."
              : session
                ? "This puts your score on the public Leaderboard, under your X account."
                : "Sign in with X first - it's the only way to appear on the Leaderboard."}
          </DialogDescription>
        </DialogHeader>

        {claimedHandle ? (
          <DialogPanel>
            <p className="text-sm">
              You're on the board as{" "}
              <a
                href={`https://x.com/${claimedHandle}`}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                @{claimedHandle}
              </a>
              .
            </p>
          </DialogPanel>
        ) : !session ? (
          <DialogFooter variant="bare">
            <button
              type="button"
              onClick={signInWithX}
              className={cn(buttonVariants({ variant: "inverse", size: "md" }), "w-full")}
            >
              <IconBrandX size={18} />
              Sign in with X
            </button>
          </DialogFooter>
        ) : (
          <>
            <DialogPanel>
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={portraitConsent}
                  disabled={!crop}
                  onChange={(event) => setPortraitConsent(event.target.checked)}
                  className="border-border mt-0.5 size-4 shrink-0 rounded"
                />
                <span>
                  Show my photo on the Leaderboard.
                  <span className="text-muted-foreground block text-xs">
                    Optional — deleted automatically after 90 days, or anytime you like. Without
                    this, your entry shows a generated avatar instead.
                  </span>
                </span>
              </label>
              {stage === "error" ? (
                <p className="text-destructive mt-3 text-sm">
                  Something went wrong. Try again in a moment.
                </p>
              ) : null}
            </DialogPanel>
            <DialogFooter variant="bare">
              <Button
                onClick={() => void submit()}
                loading={stage === "submitting"}
                className="w-full"
              >
                Claim your rank
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
