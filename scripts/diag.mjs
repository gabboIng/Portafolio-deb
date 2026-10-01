// Focused diagnostic: is the canvas compositing at all, and is it on top?
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_BASE = process.argv[2] ?? "http://localhost:4184/";
const profile = mkdtempSync(join(tmpdir(), "bh-diag-"));
const PORT = 9224;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  process.env.CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--enable-unsafe-webgpu",
    "--use-angle=d3d11",
    "--window-size=1200,800",
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" }
);

let socket;
try {
  let list = [];
  for (let i = 0; i < 40; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      if (list.length) break;
    } catch {}
    await sleep(250);
  }
  const page = list.find((t) => t.type === "page") ?? list[0];
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    socket.addEventListener("open", res, { once: true });
    socket.addEventListener("error", rej, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      socket.send(JSON.stringify({ id: n, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: URL_BASE });
  await sleep(5000);

  const out = await send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const c = document.querySelector('canvas');
      const b = document.querySelector('[data-status]');
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      const hit = document.elementFromPoint(cx, cy);

      // Force a loud CSS background and read it back from computed style.
      c.style.background = 'rgb(255, 0, 0)';
      const after = getComputedStyle(c).backgroundColor;

      // Does the loop keep producing new frames? Read the canvas twice, far
      // apart, and compare. Identical bytes across time on a live animated
      // canvas means the loop is parked.
      const grab = async () => {
        const bmp = await createImageBitmap(c);
        const oc = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = oc.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
        let sum = 0, nonzero = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = d[i] + d[i+1] + d[i+2];
          sum += l;
          if (l > 6) nonzero++;
        }
        return { total: sum, nonzeroPx: nonzero, px: d.length / 4 };
      };
      const a = await grab();
      await new Promise((r) => setTimeout(r, 1200));
      const z = await grab();

      return {
        status: b?.getAttribute('data-status') ?? null,
        canvasComputed: {
          opacity: cs.opacity, position: cs.position, zIndex: cs.zIndex,
          visibility: cs.visibility, display: cs.display,
          backgroundAfterInjection: after,
        },
        elementAtCanvasCenter: hit ? (hit.tagName + (hit.className ? '.' + hit.className : '')) : null,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        documentHidden: document.hidden,
        visibilityState: document.visibilityState,
        frameA: a, frameB: z, framesIdentical: a.total === z.total && a.nonzeroPx === z.nonzeroPx,
      };
    })()`,
  });
  console.log(JSON.stringify(out.result.value, null, 2));
} catch (e) {
  console.error("FAILED " + String(e));
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  chrome.kill();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
