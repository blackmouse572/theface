// Deep imports, not the barrel. `@tabler/icons-react` has no `exports` map, so importing
// from the package root makes Vite pre-bundle all ~5000 icons — 4.3 MB served to the
// browser in dev. Production tree-shakes it; development does not.
import IconPhotoPlus from "@tabler/icons-react/dist/esm/icons/IconPhotoPlus.mjs";
import IconShieldCheckFilled from "@tabler/icons-react/dist/esm/icons/IconShieldCheckFilled.mjs";
import IconX from "@tabler/icons-react/dist/esm/icons/IconX.mjs";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, buttonVariants, Card, Tooltip, TurnstileWidget } from "@/components/ui";
import { debug } from "@/lib/debug";
import type { Crop } from "@/lib/screening/crop.browser";
import { cn, FADE_IN, POP, POP_EXIT, useReducedMotion } from "@/lib/ui";
import { scoreCrop, type ScoreResult } from "@/server/score.functions";

import { ProcessingStatus, type ProcessingStage } from "./processing-status";
import { ScoreResultView } from "./score-result";

// See `src/lib/debug.ts` for how to turn this on. Off by default; logs metadata and
// timings only — never the photo, never raw detector output.
const log = debug("upload");

/**
 * The upload card. Pick a Selfie, then press Find out.
 *
 * There is NO consent checkbox here. Someone who chooses a photo and presses the button
 * has asked for it to be analysed; a tick-box at this point adds friction without adding
 * protection, and a pre-ticked one is not consent at all. The consent that matters —
 * storing a face on a Board — is a separate, never-pre-ticked action taken later, at
 * Claim. See ADR-0004 and PRIVACY.md.
 *
 * The preview is a local object URL. The Selfie does not leave the device here: Screening
 * runs in the browser first, and only a Crop is ever sent.
 */

const ACCEPT = "image/jpeg,image/png,image/webp";

export interface UploadCardProps {
  /** Called with the Crop once Screening passes. The Selfie itself never leaves here. */
  readonly onCrop?: (crop: Crop) => void;
  readonly className?: string;
}

const VERDICT_FAILED_MESSAGE = {
  title: "We could not confirm this photo",
  body: "It needs to be a real photograph of one adult, clearly visible. Try another photo.",
};

const TURNSTILE_NOT_READY_MESSAGE = {
  title: "Still confirming you're not a robot",
  body: "Give it a second, then press Find out again.",
};

const RATE_LIMITED_MESSAGE = {
  title: "That's enough for today",
  body: "Come back tomorrow to try again.",
};

const SERVER_ERROR_MESSAGE = {
  title: "Something went wrong on our end",
  body: "Not your photo's fault. Try again in a moment.",
};

function messageFor(reason: "turnstile" | "rate-limited" | "verdict-failed" | "error") {
  switch (reason) {
    case "turnstile":
      return TURNSTILE_NOT_READY_MESSAGE;
    case "rate-limited":
      return RATE_LIMITED_MESSAGE;
    case "error":
      return SERVER_ERROR_MESSAGE;
    case "verdict-failed":
      return VERDICT_FAILED_MESSAGE;
  }
}

export function UploadCard({ onCrop, className }: UploadCardProps) {
  const reduced = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<ProcessingStage>("idle");
  const [failure, setFailure] = useState<{ title: string; body: string } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [score, setScore] = useState<Extract<ScoreResult, { ok: true }> | null>(null);
  const busy = stage !== "idle";

  // An object URL is a document-lifetime handle; not revoking it leaks the Selfie's
  // bytes for as long as the tab is open.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const accept = useCallback(
    (candidate: File | undefined) => {
      if (busy) return;
      if (candidate?.type.startsWith("image/")) {
        setFile(candidate);
        setFailure(null);
        setScore(null);
      }
    },
    [busy],
  );

  const reset = useCallback(() => {
    setFile(null);
    setScore(null);
    setFailure(null);
  }, []);

  /**
   * Screening, then the Crop. Both run here, in the browser.
   *
   * The screening modules are imported dynamically: together with TensorFlow.js they are
   * the heaviest thing this app can load, and nobody who never presses this button should
   * pay for them. That import is also why the first stage has a message — it is a real
   * wait, and an unexplained one looks like a crash.
   */
  const findOut = useCallback(async () => {
    if (!file) return;
    if (!turnstileToken) {
      setFailure(TURNSTILE_NOT_READY_MESSAGE);
      return;
    }
    setFailure(null);
    setScore(null);
    setStage("loading-models");
    log.log("start", { size: file.size, type: file.type });

    try {
      const [{ runScreening }, { createCrop }] = await log.time("load-models", () =>
        Promise.all([
          import("@/lib/screening/screening.browser"),
          import("@/lib/screening/crop.browser"),
        ]),
      );

      setStage("screening");
      const result = await log.time("screening", () => runScreening(file));
      if (!result.ok) {
        const { loadFaceApi, activeBackend } = await import("@/lib/screening/models.browser");
        log.log("screening: rejected", {
          reason: result.reason,
          backend: activeBackend(await loadFaceApi()),
        });
        setFailure({ title: result.message.title, body: result.message.body });
        setStage("idle");
        return;
      }
      log.log("screening: passed", {
        faceAreaFraction: Number(result.faceAreaFraction.toFixed(3)),
      });

      setStage("cropping");
      // createCrop draws to a canvas, so it needs a decoded image rather than the File.
      // An ImageBitmap holds GPU-side memory and must be closed, or the Selfie's pixels
      // stay resident for the life of the tab.
      const bitmap = await createImageBitmap(file);
      let crop: Crop;
      try {
        crop = await log.time("crop", () => createCrop(bitmap, result.landmarks));
        log.log("crop: done", { width: crop.width, height: crop.height });
        onCrop?.(crop);
      } finally {
        bitmap.close();
      }

      setStage("observing");
      const scored = await log.time("score", () =>
        scoreCrop({ data: { crop: crop.dataUrl, turnstileToken } }),
      );

      if (!scored.ok) {
        log.log("score: rejected", { reason: scored.reason, verdict: scored.verdict });
        setFailure(messageFor(scored.reason));
        setStage("idle");
        return;
      }

      log.log("score: done", { overall: Math.round(scored.overall) });
      setScore(scored);
      setStage("idle");
    } catch (error) {
      log.log("failed", { error: error instanceof Error ? error.message : String(error) });
      setFailure({
        title: "We could not read that photo",
        body: "Something went wrong on this device. Try another photo.",
      });
      setStage("idle");
    }
  }, [file, onCrop, turnstileToken]);

  return (
    <Card size="spacious" className={className}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files[0]);
        }}
        className={cn(
          "relative grid min-h-64 place-items-center rounded-3xl border-2 border-dashed p-3 transition-colors",
          dragging ? "border-primary bg-accent" : "border-border",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => accept(event.target.files?.[0])}
        />

        <AnimatePresence mode="popLayout" initial={false}>
          {previewUrl ? (
            <motion.div
              key="preview"
              className="relative"
              initial={{ opacity: 0, transform: reduced ? "none" : "scale(0.96)" }}
              animate={{ opacity: 1, transform: "scale(1)" }}
              exit={{ opacity: 0, transform: "scale(0.96)", transition: POP_EXIT }}
              transition={reduced ? FADE_IN : POP}
            >
              <img
                src={previewUrl}
                alt="The photo you chose"
                className="shadow-floating max-h-80 rounded-xl object-contain"
              />
              <Button
                variant="inverse"
                size="icon"
                disabled={busy}
                onClick={() => setFile(null)}
                aria-label="Choose a different photo"
                className="absolute -top-2 -right-2"
              >
                <IconX size={15} />
              </Button>
            </motion.div>
          ) : (
            <motion.button
              key="picker"
              type="button"
              onClick={() => inputRef.current?.click()}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: FADE_IN }}
              // `motion.button`, not `<Button>`: this needs Framer Motion's own
              // mount/unmount animation, which `Button` — a plain function component —
              // does not forward a ref for. `buttonVariants` keeps the two in one place
              // regardless, so the look can't drift between the animated and plain paths.
              className={buttonVariants({ variant: "outline" })}
            >
              <IconPhotoPlus size={20} className="text-muted-foreground" />
              Upload image
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {score ? (
          <ScoreResultView
            key="result"
            overall={score.overall}
            ratings={score.ratings}
            affinities={score.affinities}
            onReset={reset}
          />
        ) : failure ? (
          <motion.div
            key="failure"
            className="border-border bg-muted/50 mt-5 rounded-3xl border p-4"
            initial={{ opacity: 0, transform: reduced ? "none" : "translateY(4px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0, transition: FADE_IN }}
            transition={reduced ? FADE_IN : POP}
            role="alert"
          >
            <p className="text-sm font-medium">{failure.title}</p>
            <p className="text-muted-foreground mt-1 text-sm">{failure.body}</p>
          </motion.div>
        ) : busy ? (
          <motion.div
            key="working"
            className="mt-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: FADE_IN }}
            transition={FADE_IN}
          >
            <ProcessingStatus stage={stage} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <TurnstileWidget
        siteKey={import.meta.env["VITE_TURNSTILE_SITE_KEY"] ?? ""}
        onVerify={setTurnstileToken}
        onExpire={() => setTurnstileToken(null)}
        className="mt-4"
      />

      {score ? null : (
        <div className="mt-5 flex items-center justify-between gap-4">
          <Tooltip content="Your photo is checked on your device, analysed, then discarded. It is only kept if you later choose to join the leaderboard.">
            <Link
              to="/privacy"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "px-3")}
            >
              <IconShieldCheckFilled size={18} className="text-success" />
              Your data is secure
            </Link>
          </Tooltip>

          <Button
            disabled={!file}
            loading={busy}
            onClick={() => void findOut()}
            className="shrink-0"
          >
            {busy ? "Working…" : "Find out"}
          </Button>
        </div>
      )}
    </Card>
  );
}
