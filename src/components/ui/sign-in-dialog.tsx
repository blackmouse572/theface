import IconBrandX from "@tabler/icons-react/dist/esm/icons/IconBrandX.mjs";

import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/ui";

export interface SignInDialogProps {
  readonly onSignIn: () => void;
}

/** The "Sign in" trigger, and the X-login confirmation dialog it opens. */
export function SignInDialog({ onSignIn }: SignInDialogProps) {
  return (
    <Dialog>
      <DialogTrigger
        className={cn(buttonVariants({ variant: "primary", size: "sm" }), "shrink-0 px-3 sm:px-6")}
      >
        Sign in
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Sign in with X</DialogTitle>
          <DialogDescription>
            TheFace confirms you're a real person with X before you can claim a spot on the
            Leaderboard.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter variant="bare">
          <button
            type="button"
            onClick={onSignIn}
            className={cn(buttonVariants({ variant: "inverse", size: "md" }), "w-full")}
          >
            <IconBrandX size={18} />
            Log in with X
          </button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
