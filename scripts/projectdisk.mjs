// How much disk is cropped on the right, as a function of the camera aim.
//
// cameraRay() in geodesic.wgsl builds the ray as
//     normalize(forward * fov + right * sx + up * sy)
// with sx, sy coming from the NDC point after a roll rotation. Inverting it for
// a world point P (d = P - cameraPosition):
//     sx = fov * (d . right) / (d . forward)
//     sy = fov * (d . up)    / (d . forward)
//     screenPlane = R(-roll) * (sx, sy)
//     ndc         = screenPlane / (aspect, 1) + center
//
// What this reports is the largest disk centred on the hole that still fits
// inside the frame. The radius-9 outline already overflows both edges, so the
// outer disk has always been cropped; a rightward aim buys composition at the
// cost of cropping more of it.
//
// Limitation: straight-line geometry through the disk plane. It does not model
// the lensing traceRay bends the light through, so it under-reports how far the
// arcs and photon ring really reach. An outer bound, not the visual extent.
import { defaultHeroSettings } from "../src/blackhole/settings.ts";

const s = defaultHeroSettings();
const R = s.diskRadius;
const roll = s.cameraRoll;
const cosR = Math.cos(roll);
const sinR = Math.sin(roll);

function basisFor(yaw, pitch, orbitRadius) {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cam = [Math.sin(yaw) * cp * orbitRadius, sp * orbitRadius, Math.cos(yaw) * cp * orbitRadius];
  const len = Math.hypot(...cam);
  const forward = [-cam[0] / len, -cam[1] / len, -cam[2] / len];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const nrm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
  const right = nrm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { cam, basis: { forward, right, up } };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** NDC a point on the disk plane projects to, for a given aim. */
function project(point, cam, basis, aspect, centerX) {
  const d = [point[0] - cam[0], point[1] - cam[1], point[2] - cam[2]];
  const dF = dot(d, basis.forward);
  if (dF <= 1e-6) return null;
  const sx = s.fov * dot(d, basis.right) / dF;
  const sy = s.fov * dot(d, basis.up) / dF;
  return {
    x: (sx * cosR + sy * sinR) / aspect + centerX,
    y: -sx * sinR + sy * cosR + s.centerY,
  };
}

/** Largest disk centred on the hole that fits inside the frame. */
function containedRadius(cam, basis, aspect, centerX) {
  let fit = 0;
  for (let r = 0.25; r <= R; r += 0.25) {
    let ok = true;
    for (let i = 0; i <= 720 && ok; i++) {
      const a = (i / 720) * Math.PI * 2;
      const p = project([r * Math.cos(a), 0, r * Math.sin(a)], cam, basis, aspect, centerX);
      if (!p || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) ok = false;
    }
    if (ok) fit = r;
  }
  return fit;
}

const VIEWPORTS = [
  { label: "1280x800", w: 1280, h: 800 },
  { label: "1440x900", w: 1440, h: 900 },
  { label: "1920x1080", w: 1920, h: 1080 },
  { label: "2560x1440", w: 2560, h: 1440 },
];
const CANDIDATES = [0, 0.04, 0.06, 0.08, 0.1, 0.12, 0.16];

console.log(`disk radius ${R}  distance ${s.distance}  fov ${s.fov}  roll ${roll}  centerY ${s.centerY}`);
console.log("contained radius = biggest disk still fully inside the frame\n");

for (const vp of VIEWPORTS) {
  const aspect = vp.w / vp.h;
  const { cam, basis } = basisFor(0, s.cameraY, s.distance);
  const parts = CANDIDATES.map(
    (cx) => `${cx.toFixed(2)}:${containedRadius(cam, basis, aspect, cx).toFixed(2)}`
  );
  console.log(`${vp.label.padEnd(10)} aspect ${aspect.toFixed(3)}  ${parts.join("  ")}`);
}

console.log("\npx the hole moves right, per centerX (half-width = ndc/2 * width)");
for (const vp of VIEWPORTS) {
  const parts = CANDIDATES.map((cx) => `${cx.toFixed(2)}:${Math.round((cx / 2) * vp.w)}px`);
  console.log(`${vp.label.padEnd(10)}  ${parts.join("  ")}`);
}

// Ties the two halves together: the Hero's right edge against the hole's centre
// in CSS pixels, replicating the Hero's own layout rules so the two can be read
// against each other without opening a browser.
//
//   Hero.module.css: container 1100 centred, 24px inline padding, .content
//   pulls back by 24px and adds --hero-shift-x on top, then 24px of its own
//   padding. Name width is the measured max-content of the longest rotating
//   line, 566px, clamped to what is actually available.
console.log(`\nsettings centerX ${s.centerX}`);

// Measured max-content of the longest rotating line, after the hero name moved
// to Newsreader: 532px, down from the 566px Space Grotesk needed. A serif sets
// narrower at the same optical size, which is worth knowing here because the
// whole gap-to-the-hole calculation below hangs off this number.
const NAME_W = 532;
const CONTAINER = 1100;
const PAD = 24;
const SHIFT = -128;

// Mirrors the gutter clamp in Hero.module.css: a leftward shift can only spend
// the room outside the container, which shrinks to nothing at the container's
// own width. Without this the script would predict copy hanging off the left
// edge at exactly the widths where the CSS is most careful.
const effectiveShift = (w, shift) => Math.max(Math.min(shift, 0), -Math.max(0, (w - CONTAINER) / 2));

console.log("\nviewport   name right edge   hole centre   gap   contained radius");
for (const vp of VIEWPORTS) {
  const heroX = Math.max(0, (vp.w - CONTAINER) / 2);
  const shift = effectiveShift(vp.w, SHIFT);
  const nameX = heroX + PAD + (-PAD + shift) + PAD;
  const nameRight = nameX + Math.min(NAME_W, vp.w - 2 * PAD);
  const holeCentre = vp.w / 2 + (s.centerX / 2) * vp.w;
  const gap = Math.round(holeCentre - nameRight);
  const aspect = vp.w / vp.h;
  const { cam, basis } = basisFor(0, s.cameraY, s.distance);
  const fit = containedRadius(cam, basis, aspect, s.centerX);
  console.log(
    `${String(vp.w).padStart(8)}   ${String(Math.round(nameRight)).padStart(16)}   ` +
    `${String(Math.round(holeCentre)).padStart(11)}   ${String(gap).padStart(4)}   ${fit.toFixed(2)}`
  );
}

// Sweep of the shift knob, so the amount can be picked without rebuilding each
// guess. Reports the gap back to the hole, and the viewport below which the
// gutter clamp starts eating into the requested shift.
console.log("\n--hero-shift-x sweep at 1440x900 (negative = left)");
{
  const vp = { w: 1440 };
  const heroX = Math.max(0, (vp.w - CONTAINER) / 2);
  const holeCentre = vp.w / 2 + (s.centerX / 2) * vp.w;
  for (const rem of [0, -1, -2, -3, -4, -6, -8, -10, -14]) {
    const shift = effectiveShift(vp.w, rem * 16);
    const nameRight = heroX + PAD + (-PAD + shift) + PAD + Math.min(NAME_W, vp.w - 2 * PAD);
    // The clamp only starts spending the request once the gutter, (w - 1100)/2,
    // drops below it. That happens at container + 2*shift.
    const eatenBelow = rem === 0 ? "never" : `${CONTAINER + 2 * Math.abs(rem * 16)}px`;
    console.log(
      `  ${String(rem).padStart(3)}rem  name ends ${String(Math.round(nameRight)).padStart(5)}  ` +
      `gap to hole ${String(Math.round(holeCentre - nameRight)).padStart(4)}  ` +
      `full shift above ${eatenBelow}`
    );
  }
}

console.log("\nradius still visible at the right frame edge (ndc.x = 1), at ndc.y = centerY");
for (const vp of [{ label: "1440x900", w: 1440, h: 900 }, { label: "1920x1080", w: 1920, h: 1080 }]) {
  const aspect = vp.w / vp.h;
  const { cam, basis } = basisFor(0, s.cameraY, s.distance);
  const parts = [];
  for (const cx of CANDIDATES) {
    // March the ray for the pixel on the right edge at the hole's own height.
    const planeX = (1 - cx) * aspect;
    const planeY = 0 - s.centerY;
    const sx = planeX * cosR - planeY * sinR;
    const sy = planeX * sinR + planeY * cosR;
    const v = basis.forward.map((f, i) => f * s.fov + basis.right[i] * sx + basis.up[i] * sy);
    const l = Math.hypot(...v);
    const d = [v[0] / l, v[1] / l, v[2] / l];
    const t = -cam[1] / d[1];
    parts.push(`${cx.toFixed(2)}:${Math.hypot(cam[0] + t * d[0], cam[2] + t * d[2]).toFixed(2)}`);
  }
  console.log(`${vp.label.padEnd(10)}  ${parts.join("  ")}`);
}
