import { useEffect, useRef, useState } from "react";

import { SignInDialog } from "@/components/ui/sign-in-dialog";
import { authClient } from "@/lib/auth-client";

/**
 * The only sign-in this app has is X (ADR-0005) - there is no separate account system to
 * fall back to, so this button *is* the X OAuth redirect.
 */
function signInWithX() {
  void authClient.signIn.social({
    provider: "twitter",
    callbackURL: window.location.pathname,
  });
}

function AccountMenu({
  user,
}: {
  readonly user: { readonly xUsername?: string | null; readonly name: string; readonly image?: string | null };
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handle = user.xUsername ? `@${user.xUsername}` : user.name;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="border-border hover:bg-accent flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm font-medium transition-colors"
      >
        <img src={user.image ?? "/icon-192.png"} alt="" className="size-6 rounded-full" />
        <span className="hidden sm:inline">{handle}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="border-border bg-card shadow-floating absolute top-full right-0 z-50 mt-2 min-w-32 rounded-2xl border p-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => authClient.signOut()}
            className="hover:bg-accent w-full rounded-xl px-3 py-2 text-left text-sm"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Sign-in button, or the signed-in account menu - whichever the session says. */
export function NavAuth() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <div className="bg-accent h-8 w-22 shrink-0 animate-pulse rounded-full" />;
  }

  if (!session) {
    return <SignInDialog onSignIn={signInWithX} />;
  }

  return <AccountMenu user={session.user} />;
}
