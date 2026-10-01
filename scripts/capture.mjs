// One-off capture harness. Not part of the app; delete when the intro is verified.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_BASE = process.argv[2] ?? "http://localhost:4184/";
const OUT = process.argv[3] ?? "shot.png";
const WAIT_MS = Number(process.argv[4] ?? 4500);

const profile = mkdtempSync(join(tmpdir(), "bh-cap-"));
const PORT = 9223;

const chrome = spawn(
  process.env.CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--enable-unsafe-webgpu",
    "--enable-features=Vulkan,WebGPU",
    "--use-angle=d3d11",
    "--window-size=1440,900",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

let socket;
try {
  let list = [];
  for (let i = 0; i < 40; i++) {
    try {
      list = await targets();
      if (list.length) break;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  const page = list.find((t) => t.type === "page") ?? list[0];
  if (!page) throw new Error("no page target");

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    socket.addEventListener("open", res, { once: true });
    socket.addEventListener("error", rej, { once: true });
  });

  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
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
  await sleep(WAIT_MS);

  // Diagnostic: hide the CSS glow so anything left on screen must be the
  // canvas. If the hole is a paint-order problem this reveals it; if the
  // frame itself is empty, the canvas is genuinely black.
  // Paint a loud colour behind the canvas. Three outcomes:
  //   - red visible  -> canvas is composited and transparent (shader wrote nothing)
  //   - still black  -> something opaque is covering it, or the canvas never composites
  //   - hole visible -> it was working all along and the earlier reads were wrong
  if (process.env.PROBE_CANVAS) {
    await send("Runtime.evaluate", {
      expression: `(() => {
        const st = document.createElement('style');
        st.textContent = 'canvas { background: #ff0000 !important; }';
        document.head.appendChild(st);
        return true;
      })()`,
    });
    await sleep(400);
  }

  if (process.env.NOGLOW) {
    await send("Runtime.evaluate", {
      expression: `(() => {
        const b = document.querySelector('[data-status]');
        if (b) b.style.setProperty('--kill', '1');
        const st = document.createElement('style');
        st.id = 'killglow';
        st.textContent = '[data-status]::before { opacity: 0 !important; }';
        document.head.appendChild(st);
        return true;
      })()`,
    });
    await sleep(400);
  }

  const probe = await send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const c = document.querySelector('canvas');
      const backdrop = document.querySelector('[data-status]');
      const gpu = {
        hasNavigatorGpu: typeof navigator.gpu !== 'undefined',
      };
      if (navigator.gpu) {
        try {
          const a = await navigator.gpu.requestAdapter();
          gpu.adapter = a ? (a.info?.vendor ?? 'sin vendor') : null;
          gpu.isFallback = a?.isFallbackAdapter ?? null;
        } catch (e) {
          gpu.error = String(e);
        }
      }
      if (!c) return { canvas: null, gpu };
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      const shell = document.querySelector('[data-revealed]');
      // Sample the canvas itself. A flat background means the shader never
      // drew and we are only looking at the CSS glow.
      let pixels = null;
      try {
        const bmp = await createImageBitmap(c);
        const oc = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = oc.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
        let min = 255, max = 0, sum = 0, n = 0;
        for (let i = 0; i < d.length; i += 4 * 97) {
          const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
          if (l < min) min = l;
          if (l > max) max = l;
          sum += l; n++;
        }
        pixels = { min: Math.round(min), max: Math.round(max), mean: Math.round(sum / n), samples: n, w: bmp.width, h: bmp.height };
      } catch (e) {
        pixels = { error: String(e) };
      }
      return {
        status: backdrop?.getAttribute('data-status') ?? null,
        canvas: { opacity: cs.opacity, position: cs.position, zIndex: cs.zIndex, w: Math.round(r.width), h: Math.round(r.height) },
        revealed: shell?.getAttribute('data-revealed') ?? null,
        pixels,
        gpu,
      };
    })()`,
  });
  console.log("PROBE " + JSON.stringify(probe.result.value));

  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("SAVED " + OUT);
} catch (error) {
  console.error("FAILED " + String(error));
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
