import { useEffect, useRef, useState } from "react";

import { createRenderer } from "../blackhole/renderer";
import { prefersReducedMotion } from "../lib/motion";
import styles from "./BlackHoleBackground.module.css";

type Status = "idle" | "live" | "unavailable";

/**
 * Fixed, non-interactive WebGPU backdrop.
 *
 * The portfolio must not depend on it: if WebGPU is missing or the device
 * fails, we keep a static CSS backdrop and the content is unaffected. Any
 * failure is logged, never surfaced as a screen.
 */
export function BlackHoleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !navigator.gpu) {
      setStatus("unavailable");
      return;
    }

    let cancelled = false;
    let dispose: (() => void) | undefined;

    try {
      const renderer = createRenderer({
        canvas,
        reducedMotion: prefersReducedMotion(),
      });
      dispose = renderer.dispose;

      renderer.ready
        .then(() => {
          if (!cancelled) setStatus("live");
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setStatus("unavailable");
          console.warn("[background] WebGPU no disponible:", error);
        });
    } catch (error) {
      setStatus("unavailable");
      console.warn("[background] no se pudo crear el render:", error);
    }

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

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
