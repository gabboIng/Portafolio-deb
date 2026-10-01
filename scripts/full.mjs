// Full-page composition check: the real thing, content and canvas together.
//
// The framing work moved the black hole to the centre of the frame, which means
// the hero copy now sits over the left arm of the disk instead of beside it.
// That trade only works if the scrim actually keeps the text readable, so this
// captures the page as shipped and measures contrast in the text block.
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
const WAIT = Number(process.argv[3] ?? 6500);
const profile = mkdtempSync(join(tmpdir(), "bh-full-"));
const outDir = process.env.OUTDIR ?? profile;
const PORT = 9227;
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

  // Two shots: the gated opening, while the hole is alone, and the settled
  // page once the content has arrived. That pair is the whole feature.
  await sleep(Math.min(1800, WAIT));
  const early = await send("Page.captureScreenshot", { format: "png" });
  const earlyPath = join(outDir, "opening.png");
  writeFileSync(earlyPath, Buffer.from(early.data, "base64"));

  const earlyState = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => ({
      revealed: document.querySelector('[data-revealed]')?.getAttribute('data-revealed'),
      status: document.querySelector('[data-status]')?.getAttribute('data-status'),
    }))()`,
  });
  console.log("EARLY " + JSON.stringify(earlyState.result.value));

  await sleep(WAIT);
  const late = await send("Page.captureScreenshot", { format: "png" });
  const latePath = join(outDir, "settled.png");
  writeFileSync(latePath, Buffer.from(late.data, "base64"));

  const lateState = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const items = [...document.querySelectorAll('[data-reveal="item"]')];
      const nav = document.querySelector('[data-reveal="nav"]');
      const hero = document.querySelector('h1');
      return {
        revealed: document.querySelector('[data-revealed]')?.getAttribute('data-revealed'),
        status: document.querySelector('[data-status]')?.getAttribute('data-status'),
        navOpacity: nav ? getComputedStyle(nav).opacity : null,
        itemOpacities: items.map((el) => Number(getComputedStyle(el).opacity).toFixed(2)),
        heroRect: hero ? (({x,y,width,height}) => ({x:Math.round(x),y:Math.round(y),w:Math.round(width),h:Math.round(height)}))(hero.getBoundingClientRect()) : null,
      };
    })()`,
  });
  console.log("LATE " + JSON.stringify(lateState.result.value));
  console.log(JSON.stringify({ earlyPath, latePath }));

  // Contrast in the hero text block: worst local background the copy sits on.
  const img = decodePng(readFileSync(latePath));
  const at = (x, y) => {
    const i = (y * img.width + x) * img.channels;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
  const r = lateState.result.value.heroRect;
  if (r) {
    let worst = 0, worstAt = null, sum = 0, n = 0;
    for (let y = r.y; y < r.y + r.h; y += 2) {
      for (let x = r.x; x < r.x + r.w; x += 2) {
        const [rr, gg, bb] = at(x, y);
        const l = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
        sum += l; n++;
        if (l > worst) { worst = l; worstAt = [x, y, rr, gg, bb]; }
      }
    }
    console.log(`hero box background luma: mean ${(sum / n).toFixed(1)}, max ${worst.toFixed(1)} at (${worstAt?.[0]},${worstAt?.[1]}) rgb(${worstAt?.slice(2).join(",")})`);
  }
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
