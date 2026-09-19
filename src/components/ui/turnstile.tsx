import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          appearance?: "always" | "execute" | "interaction-only";
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Turnstile script failed to load")));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface TurnstileWidgetProps {
  readonly siteKey: string;
  readonly onVerify: (token: string) => void;
  readonly onExpire?: () => void;
  /** Bump to fetch a fresh token. A token is single-use, so call this after each submit. */
  readonly resetSignal?: number;
  readonly className?: string;
}

/**
 * Runs a Cloudflare Turnstile widget in the background and reports its token via
 * `onVerify`. Token verification happens server-side; this component only collects it.
 *
 * `interaction-only` keeps the widget invisible unless Cloudflare decides a Visitor must
 * click something, in which case it appears in place. Keep the container free of
 * `display: none` so that fallback stays reachable.
 */
export function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
  resetSignal = 0,
  className,
}: TurnstileWidgetProps) {
  const containerId = useId();
  const widgetIdRef = useRef<string | null>(null);

  // `onVerify`/`onExpire` are read through refs so the mount effect below depends only on
  // `siteKey`/`containerId` — both stable. Without this, a caller passing an inline
  // arrow (a new function identity every render) would tear down and re-render the
  // widget on every parent re-render, not just when the widget should actually remount.
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    let cancelled = false;

    void loadScript().then(() => {
      if (cancelled) return;
      const container = document.getElementById(containerId);
      if (!container || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(container, {
        sitekey: siteKey,
        callback: (token) => onVerifyRef.current(token),
        "expired-callback": () => onExpireRef.current?.(),
        "error-callback": () => onExpireRef.current?.(),
        appearance: "interaction-only",
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
    };
  }, [siteKey, containerId]);

  const lastResetRef = useRef(resetSignal);
  useEffect(() => {
    if (lastResetRef.current === resetSignal) return;
    lastResetRef.current = resetSignal;
    if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
  }, [resetSignal]);

  return <div id={containerId} className={className} />;
}
