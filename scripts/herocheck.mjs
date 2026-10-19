// Verifies the hero: reveal order, that the variable fonts actually loaded,
// the rotating line's behaviour under reduced motion, and mobile layout.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_BASE = process.argv[2] ?? "http://localhost:4185/";
const OUT = process.argv[3] ?? "hero.png";
const WAIT_MS = Number(process.argv[4] ?? 9000);

const profile = mkdtempSync(join(tmpdir(), "bh-hero2-"));
const PORT = 9227;

const chrome = spawn(process.env.CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "--enable-unsafe-webgpu",
  "--enable-features=Vulkan,WebGPU",
  "--use-angle=d3d11",
  "--window-size=" + (process.env.WINDOW ?? "1440,900"),
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
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
  return send;
}

try {
  const send = await connect();
  await sleep(WAIT_MS);

  const probe = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const shell = document.querySelector('[data-revealed]');
      const items = [...document.querySelectorAll('[data-reveal="item"]')];
      const read = (el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          text: el.textContent.trim().slice(0, 46),
          opacity: cs.opacity,
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          letterSpacing: cs.letterSpacing,
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        };
      };
      const lines = [...document.querySelectorAll('p')].filter((p) =>
        (p.textContent ?? '').startsWith('La complejidad') ||
        (p.textContent ?? '').startsWith('No escribo') ||
        (p.textContent ?? '').startsWith('Transformo'));
      const fontCheck = (family) => {
        const el = document.createElement('span');
        el.textContent = 'HAMBURGEFONTSIV';
        el.style.cssText = 'position:absolute;left:-9999px;font-size:64px';
        document.body.appendChild(el);
        const loaded = document.fonts.check('600 64px "' + family + '"');
        el.remove();
        return loaded;
      };
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const hero = document.querySelector('section');
      const content = hero?.firstElementChild;
      const name = document.querySelector('h1');
      return {
        viewport: [window.innerWidth, window.innerHeight],
        hero: box(hero),
        content: box(content),
        name: box(name),
        contentCenterY: content ? Math.round(content.getBoundingClientRect().y + content.getBoundingClientRect().height / 2) : null,
        revealed: shell?.getAttribute('data-revealed') ?? null,
        status: document.querySelector('[data-status]')?.getAttribute('data-status') ?? null,
        itemCount: items.length,
        items: items.map(read),
        rotating: lines.map((el) => ({
          text: el.textContent.trim(),
          active: el.getAttribute('data-active'),
          opacity: getComputedStyle(el).opacity,
          transform: getComputedStyle(el).transform,
          ariaHidden: el.getAttribute('aria-hidden'),
        })),
        fontsLoaded: {
          newsreader: fontCheck('Newsreader Variable'),
          geist: fontCheck('Geist Variable'),
          jetbrainsMono: fontCheck('JetBrains Mono Variable'),
        },
      };
    })()`,
  });
  console.log("HERO " + JSON.stringify(probe.result.value, null, 2));

  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("SAVED " + OUT);

  // Reduced motion: the rotation must never start.
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await send("Page.reload");
  await sleep(4000);
  const reduced = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const active = [...document.querySelectorAll('[data-active="true"]')]
        .map((el) => el.textContent.trim()).filter((t) => t.length > 20);
      return { revealed: document.querySelector('[data-revealed]')?.getAttribute('data-revealed'), visibleLines: active };
    })()`,
  });
  console.log("REDUCED " + JSON.stringify(reduced.result.value));
} catch (e) {
  console.error("FAILED " + String(e));
  process.exitCode = 1;
} finally {
  chrome.kill();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}