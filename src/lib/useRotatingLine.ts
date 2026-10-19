import { useEffect, useState } from "react";

import { prefersReducedMotion, watchReducedMotion } from "./motion";

/**
 * Cycles one line of text at a time.
 *
 * Long enough to actually be read rather than skimmed, and it stops dead in
 * two cases where a rotating line is worse than no animation:
 *
 *   - reduced motion. A visitor who asked for less motion gets the first line,
 *     static, and the hook never starts a timer. Announced politely so a screen
 *     reader picks up the change as a sentence rather than as a countdown.
 *   - a backgrounded tab. requestAnimationFrame stops in a hidden tab but
 *     setInterval does not, so without the visibility check the index would run
 *     several cycles ahead and jump when the tab came back.
 */
const ROTATE_MS = 3200;

export function useRotatingLine(lines: readonly string[]): number {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => watchReducedMotion(setReduced), []);

  useEffect(() => {
    if (reduced || lines.length < 2) return;
    if (typeof document !== "undefined" && document.hidden) return;

    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % lines.length);
    }, ROTATE_MS);

    return () => window.clearInterval(id);
  }, [reduced, lines.length]);

  return index;
}
