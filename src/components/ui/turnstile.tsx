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
  readonly className?: string;
}

/** Renders a Cloudflare Turnstile widget and reports its token via `onVerify`. Token
 *  verification happens server-side; this component only collects it. */
export function TurnstileWidget({ siteKey, onVerify, onExpire, className }: TurnstileWidgetProps) {
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
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
    };
  }, [siteKey, containerId]);

  return <div id={containerId} className={className} />;
}
