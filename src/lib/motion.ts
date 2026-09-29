export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function watchReducedMotion(
  onChange: (reduced: boolean) => void,
): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  const listener = () => onChange(query.matches);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
