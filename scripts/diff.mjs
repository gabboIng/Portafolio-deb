// Is the headless screenshot even capable of showing the canvas?
//
// Two probes disagreed earlier: computed style said the canvas had a red
// background, yet no red reached the screenshot. If hiding the canvas entirely
// produces a byte-identical image, then the canvas contributes nothing to
// headless captures at all, and no amount of screenshotting here can say
// anything about whether the hole renders.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_BASE = process.argv[2] ?? "http://localhost:4184/";
const profile = mkdtempSync(join(tmpdir(), "bh-diff-"));
const PORT = 9225;
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
  await sleep(5500);

  const outDir = process.env.OUTDIR ?? profile;
  const grab = async (name) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    const p = join(outDir, name);
    writeFileSync(p, Buffer.from(s.data, "base64"));
    return p;
  };

  const normal = await grab("normal.png");

  // A control we know is visible: paint the whole page red. If this does not
  // show up either, the capture path is broken in general rather than the
  // canvas being special.
  await send("Runtime.evaluate", {
    expression: `(() => { document.body.style.background = 'rgb(255,0,0)'; return true; })()`,
  });
  await sleep(500);
  const bodyRed = await grab("body-red.png");

  await send("Runtime.evaluate", {
    expression: `(() => { document.body.style.background = ''; return true; })()`,
  });
  await sleep(300);
  await send("Runtime.evaluate", {
    expression: `(() => { document.querySelector('canvas').style.display = 'none'; return true; })()`,
  });
  await sleep(500);
  const noCanvas = await grab("no-canvas.png");

  console.log(JSON.stringify({ normal, bodyRed, noCanvas }));
} catch (e) {
  console.error("FAILED " + String(e));
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  chrome.kill();
  await sleep(400);
  // Only clean the browser profile when it is not also the output directory.
  if ((process.env.OUTDIR ?? profile) === profile) {
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}
