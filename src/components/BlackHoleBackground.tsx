import { useEffect, useRef, useState } from "react";

import { createRenderer } from "../blackhole/renderer";
import { prefersReducedMotion } from "../lib/motion";
import styles from "./BlackHoleBackground.module.css";

type Status = "idle" | "live" | "unavailable";

/**
 * What "the hole has landed" actually means: work has been submitted AND the
 * canvas is no longer transparent. Both, because neither alone is enough.
 *
 * A submitted frame is not a visible one -- the canvas sits at opacity 0 for
 * its whole fade, so sequencing off submission alone puts the text on screen
 * over an empty page. And an opaque canvas alone only proves a CSS transition
 * finished, not that a frame was ever drawn. Sequencing off the first frame
 * alone has a subtler failure: the first frame is submitted synchronously
 * inside initialize(), before `ready` resolves and before the status flips to
 * live, so the fade has not started yet and any timer started there expires
 * against a canvas that is still empty.
 */
const CANVAS_OPACITY_READY = 0.99;

/**
 * How long to keep polling for the canvas to go opaque. The fade itself is
 * 380ms, so this is generous; it exists for a machine where the fade stalls.
 * It is not the deadline: the reveal hook's 15s is a last resort for this
 * backdrop never calling back at all, so this cap is what normally ends the
 * wait, and it only ever starts after `ready` has already resolved.
 */
const VISIBLE_WAIT_CAP_MS = 2000;

function canvasOpacity(canvas: HTMLCanvasElement): number {
  return parseFloat(getComputedStyle(canvas).opacity);
}

/**
 * Fixed, non-interactive WebGPU backdrop.
 *
 * The portfolio must not depend on it: if WebGPU is missing or the device
 * fails, we keep a static CSS backdrop and the content is unaffected. Any
 * failure is logged, never surfaced as a screen.
 */
export function BlackHoleBackground({
  onSettled,
}: {
  onSettled?: (framed: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !navigator.gpu) {
      setStatus("unavailable");
      onSettled?.(false);
      return;
    }

    let cancelled = false;
    let settled = false;
    let frameSeen = false;
    let live = false;
    let frame = 0;
    let dispose: (() => void) | undefined;

    const giveUp = (error: unknown) => {
      if (cancelled || settled) return;
      settled = true;
      cancelAnimationFrame(frame);
      setStatus("unavailable");
      onSettled?.(false);
      console.warn("[background] no se pudo renderizar:", error);
    };

    /** Resolves once the canvas is genuinely opaque, or the cap runs out. */
    const waitForVisible = () => {
      const deadline = performance.now() + VISIBLE_WAIT_CAP_MS;
      const check = () => {
        if (cancelled || settled) return;
        if (canvasOpacity(canvas) >= CANVAS_OPACITY_READY) {
          settled = true;
          onSettled?.(true);
          return;
        }
        if (performance.now() > deadline) {
          settled = true;
          onSettled?.(true);
          return;
        }
        frame = requestAnimationFrame(check);
      };
      frame = requestAnimationFrame(check);
    };

    const trySettle = () => {
      if (cancelled || settled || !frameSeen || !live) return;
      waitForVisible();
    };

    try {
      const renderer = createRenderer({
        canvas,
        reducedMotion: prefersReducedMotion(),
        onFirstFrame: () => {
          frameSeen = true;
          trySettle();
        },
      });
      dispose = renderer.dispose;

      renderer.ready
        .then(() => {
          if (cancelled) return;
          live = true;
          setStatus("live");
          trySettle();
        })
        .catch(giveUp);
    } catch (error) {
      giveUp(error);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      dispose?.();
    };
  }, [onSettled]);

  return (
    <div
      className={styles.backdrop}
      data-status={status}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
