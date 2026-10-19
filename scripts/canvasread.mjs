// Decides whether the WebGPU canvas can be read back in this headless setup, and
// by which method. Three paths are tried because they snapshot the canvas
// differently and headless support is uneven:
//   createImageBitmap -> drawImage -> getImageData
//   canvas.toBlob      -> createImageBitmap -> getImageData
//   canvas.toDataURL   -> Image -> canvas -> getImageData
// Also reports whether WebGPU is actually producing frames at all, so a black
// readback can be told apart from a dead renderer.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_BASE = process.argv[2] ?? "http://localhost:4185/";
const WAIT_MS = Number(process.argv[3] ?? 9000);

const profile = mkdtempSync(join(tmpdir(), "bh-readback-"));
const PORT = 9231;

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
  const socket = new WebSocket(page.webSocketDebuggerUrl);
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

  const probe = await send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const c = document.querySelector('canvas');
      const backdrop = document.querySelector('[data-status]');
      const out = {
        status: backdrop?.getAttribute('data-status') ?? null,
        canvas: c ? [c.width, c.height] : null,
        gpu: null,
        methods: {},
      };

      if (navigator.gpu) {
        try {
          const a = await navigator.gpu.requestAdapter();
          out.gpu = a ? { vendor: a.info?.vendor ?? null, arch: a.info?.architecture ?? null, fallback: a.isFallbackAdapter ?? null } : null;
        } catch (e) { out.gpu = { error: String(e) }; }
      }

      if (!c) return out;

      const stats = (source, w, h) => {
        const oc = new OffscreenCanvas(w, h);
        const ctx = oc.getContext('2d');
        ctx.drawImage(source, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        let max = 0, sum = 0, n = 0, nonzero = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = d[i] * 0.2126 + d[i+1] * 0.7152 + d[i+2] * 0.0722;
          if (l > max) max = l;
          if (l > 2) nonzero++;
          sum += l; n++;
        }
        return { max: Math.round(max), mean: +(sum / n).toFixed(2), litFraction: +(nonzero / n).toFixed(4) };
      };

      // 1
      try {
        const bmp = await createImageBitmap(c);
        out.methods.createImageBitmap = stats(bmp, bmp.width, bmp.height);
      } catch (e) { out.methods.createImageBitmap = { error: String(e) }; }

      // 2
      try {
        const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
        if (!blob) throw new Error('null blob');
        const bmp = await createImageBitmap(blob);
        out.methods.toBlob = { bytes: blob.size, ...stats(bmp, bmp.width, bmp.height) };
      } catch (e) { out.methods.toBlob = { error: String(e) }; }

      // 3
      try {
        const url = c.toDataURL('image/png');
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        out.methods.toDataURL = { bytes: url.length, ...stats(img, c.width, c.height) };
      } catch (e) { out.methods.toDataURL = { error: String(e) }; }

      return out;
    })()`,
  });
  console.log(JSON.stringify(probe.result.value, null, 2));
} catch (e) {
  console.error("FAILED " + String(e));
  process.exitCode = 1;
} finally {
  chrome.kill();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
