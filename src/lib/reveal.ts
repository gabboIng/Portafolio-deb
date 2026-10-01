import { useCallback, useEffect, useRef, useState } from "react";

import { prefersReducedMotion } from "./motion";

/**
 * The opening beat: the black hole lands first, the content follows a beat
 * behind it.
 *
 * The gate is not a blocking loader, it is a wait with three ways out, and the
 * content is never held hostage by any of them:
 *
 *   - the backdrop calls back once the hole is actually on screen
 *   - a last-resort deadline, in case the backdrop never calls back at all
 *   - no gate at all, decided synchronously before the first paint
 *
 * The last one is what keeps a browser without WebGPU from waiting: it will
 * never show a hole, so gating its content would only cost it time.
 *
 * And if this script never runs there is no `data-revealed` attribute in the
 * DOM, so the CSS treats the content as visible. Content can only ever be
 * hidden by React explicitly asking for it.
 */

/**
 * A deliberate hold, not a safety margin. The backdrop calls back only once the
 * hole is genuinely on screen, so this is the pause between "the hole is here"
 * and "now the page". It is a beat of nothing on purpose: the hole alone, then
 * the text arriving under it.
 *
 * Not applied when there is no hole to sit behind. A browser without WebGPU, or
 * a visitor who asked for reduced motion, gets its content immediately --
 * waiting would only cost them time to arrive at a page that is already fine.
 */
const CONTENT_HOLD_MS = 2200;

/**
 * Last resort, not a race. The backdrop is what normally ends the wait, and it
 * does so at whatever speed the machine compiles the pipelines. This only
 * covers the backdrop never calling back at all.
 *
 * It has to clear the entire normal path, which is now compile + fade + hold.
 * Anything near that cost competes with the compile and wins by arriving first,
 * which inverts the opening: the content shows while the hole is still being
 * built, and the hole then fades in behind the text.
 *
 * Measured: 1100-1400ms of compile on an idle machine, but 4000-4700ms with the
 * box under load. Add the 380ms fade and the 2200ms hold and the worst case
 * seen is ~7.4s. Any deadline tuned to the idle number is a coin flip on a
 * busy one, so this is roughly double that rather than a measured constant. A
 * true number cannot work here, because compile time is unbounded.
 */
const REVEAL_TIMEOUT_MS = 15000;

export interface IntroReveal {
  /** Drives `data-revealed` on the app root. */
  revealed: boolean;
  /**
   * Pass to the backdrop. `framed` tells it whether a frame actually reached
   * the screen: if it did, the content follows after a deliberate hold so the
   * hole is seen on its own first; if WebGPU gave up there is no hole to sit
   * behind, so the content shows at once rather than making those visitors
   * wait out a pause that buys them nothing.
   */
  onSettled: (framed: boolean) => void;
}

export function useIntroReveal(): IntroReveal {
  // Decided before the first paint, so the ungated cases never flash. A
  // browser with no WebGPU is ungated too: it will never show a hole, so
  // gating its content would only ever cost it time.
  //
  // Truthiness, not `"gpu" in navigator`: a browser can expose the property and
  // still hand back nothing, and this must agree with the check the backdrop
  // makes before it decides it has no adapter.
  const [revealed, setRevealed] = useState(
    () =>
      prefersReducedMotion() ||
      typeof navigator === "undefined" ||
      !navigator.gpu,
  );
  const holdTimer = useRef<number | undefined>(undefined);
  const settled = useRef(false);

  const reveal = useCallback(() => setRevealed(true), []);

  useEffect(() => {
    if (revealed) return;
    const id = window.setTimeout(reveal, REVEAL_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [revealed, reveal]);

  useEffect(
    () => () => {
      if (holdTimer.current !== undefined) {
        window.clearTimeout(holdTimer.current);
      }
    },
    [],
  );

  const onSettled = useCallback(
    (framed: boolean) => {
      if (settled.current) return;
      settled.current = true;
      if (!framed) {
        reveal();
        return;
      }
      holdTimer.current = window.setTimeout(reveal, CONTENT_HOLD_MS);
    },
    [reveal],
  );

  return { revealed, onSettled };
}
