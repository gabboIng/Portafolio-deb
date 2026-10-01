// Luminance profile of the canvas area only.
//
// The page text sits on top of the canvas, so a whole-frame brightest-pixel
// search reports the headline, not the hole. This masks out the left column
// where the hero copy lives and reports the right half, which is where the
// black hole is actually supposed to be.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";

function decodePng(buf) {
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const row = raw.subarray(rp, rp + stride);
    rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prior ? prior[x] : 0;
      const c = prior && x >= channels ? prior[x - channels] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

const URL_BASE = process.argv[2] ?? "http://localhost:4184/";
const profile = mkdtempSync(join(tmpdir(), "bh-prof-"));
const outDir = process.env.OUTDIR ?? profile;
const PORT = 9226;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(process.env.CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--enable-unsafe-webgpu", "--use-angle=d3d11", "--window-size=1200,800",
  "--no-first-run", "about:blank",
], { stdio: "ignore" });

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

  const health = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const c = document.querySelector('canvas');
      const b = document.querySelector('[data-status]');
      if (!c) return { canvas: null };
      const r = c.getBoundingClientRect();
      return {
        status: b?.getAttribute('data-status') ?? null,
        w: Math.round(r.width), h: Math.round(r.height),
        clientW: c.clientWidth, clientH: c.clientHeight,
        backingW: c.width, backingH: c.height,
      };
    })()`,
  });
  console.log("HEALTH " + JSON.stringify(health.result.value));

  // Hide the page content so only the canvas remains on screen.
  //
  // `visibility:hidden` inherits, so hiding the canvas's own ancestors hides the
  // canvas too and the measurement silently reads the body background instead.
  // Collect the ancestor chain first and pin it visible, then hide everything
  // that is not on it.
  await send("Runtime.evaluate", {
    expression: `(() => {
      const canvas = document.querySelector('canvas');
      const keep = new Set();
      for (let el = canvas; el; el = el.parentElement) keep.add(el);
      for (const el of document.querySelectorAll('body *')) {
        if (!keep.has(el)) el.style.visibility = 'hidden';
      }
      for (const el of keep) el.style.visibility = 'visible';
      const cs = getComputedStyle(canvas);
      return { canvasVisible: cs.visibility, opacity: cs.opacity };
    })()`,
  });
  await sleep(600);

  const s = await send("Page.captureScreenshot", { format: "png" });
  const file = join(outDir, "canvas-only.png");
  writeFileSync(file, Buffer.from(s.data, "base64"));

  const img = decodePng(readFileSync(file));
  const at = (x, y) => {
    const i = (y * img.width + x) * img.channels;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
  console.log(`canvas-only ${img.width}x${img.height} -> ${file}`);

  let maxL = -1, maxAt = null, sum = 0, n = 0, above20 = 0, above60 = 0;
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      const [r, g, b] = at(x, y);
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += l; n++;
      if (l > 20) above20++;
      if (l > 60) above60++;
      if (l > maxL) { maxL = l; maxAt = [x, y, r, g, b]; }
    }
  }
  console.log(`mean luma      ${(sum / n).toFixed(2)} / 255`);
  console.log(`max luma       ${maxL.toFixed(1)} at (${maxAt?.[0]},${maxAt?.[1]}) rgb(${maxAt?.slice(2).join(",")})`);
  console.log(`px luma > 20   ${(100 * above20 / n).toFixed(2)}%`);
  console.log(`px luma > 60   ${(100 * above60 / n).toFixed(2)}%`);

  // Row/column profile: where is the light concentrated?
  console.log("column luma profile (every 10% of width, mean over height):");
  const cols = [];
  for (let g = 0; g < 10; g++) {
    const x0 = Math.floor((img.width / 10) * g), x1 = Math.floor((img.width / 10) * (g + 1));
    let s2 = 0, c2 = 0;
    for (let y = 0; y < img.height; y += 3) {
      for (let x = x0; x < x1; x += 3) {
        const [r, gg, b] = at(x, y);
        s2 += 0.2126 * r + 0.7152 * gg + 0.0722 * b; c2++;
      }
    }
    cols.push((s2 / c2).toFixed(1).padStart(6));
  }
  console.log(cols.join(""));
  console.log("row luma profile (every 10% of height, mean over width):");
  const rows = [];
  for (let g = 0; g < 10; g++) {
    const y0 = Math.floor((img.height / 10) * g), y1 = Math.floor((img.height / 10) * (g + 1));
    let s2 = 0, c2 = 0;
    for (let y = y0; y < y1; y += 3) {
      for (let x = 0; x < img.width; x += 3) {
        const [r, gg, b] = at(x, y);
        s2 += 0.2126 * r + 0.7152 * gg + 0.0722 * b; c2++;
      }
    }
    rows.push((s2 / c2).toFixed(1).padStart(6));
  }
  console.log(rows.join(""));
} catch (e) {
  console.error("FAILED " + String(e));
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  chrome.kill();
  await sleep(400);
  if ((process.env.OUTDIR ?? profile) === profile) {
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}
