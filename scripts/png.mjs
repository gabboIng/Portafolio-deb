// Decodes a PNG screenshot and samples pixels. The vision agent is good at
// reading the page but it is not a pixel probe, and "is this canvas actually
// compositing" needs ground truth, not a description.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error("only 8-bit supported, got " + bitDepth);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error("unsupported colorType " + colorType);

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

const [, , file, ...rest] = process.argv;
const img = decodePng(readFileSync(file));
console.log(
  `PNG ${img.width}x${img.height} ch=${img.channels}`
);

const px = (x, y) => {
  const i = (y * img.width + x) * img.channels;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

if (rest.length === 2) {
  const [x, y] = rest.map(Number);
  console.log(`(${x},${y}) = rgb(${px(x, y).join(",")})`);
} else {
  // Grid summary across the frame.
  const cols = 8, rows = 5;
  for (let gy = 0; gy < rows; gy++) {
    const y = Math.floor((img.height / rows) * gy + img.height / rows / 2);
    const cells = [];
    for (let gx = 0; gx < cols; gx++) {
      const x = Math.floor((img.width / cols) * gx + img.width / cols / 2);
      const [r, g, b] = px(x, y);
      cells.push(`${String(x).padStart(4)},${String(y).padStart(3)} rgb(${r},${g},${b})`);
    }
    console.log(cells.join("  |  "));
  }
  let maxL = -1, maxAt = null, redPx = 0, brightPx = 0;
  for (let y = 0; y < img.height; y += 3) {
    for (let x = 0; x < img.width; x += 3) {
      const [r, g, b] = px(x, y);
      const l = r + g + b;
      if (l > maxL) { maxL = l; maxAt = [x, y, r, g, b]; }
      if (r > 200 && r > g + 80 && r > b + 80) redPx++;
      if (l > 150) brightPx++;
    }
  }
  console.log(`brightest: ${maxAt ? `(${maxAt[0]},${maxAt[1]}) rgb(${maxAt[2]},${maxAt[3]},${maxAt[4]})` : "none"}`);
  console.log(`near-red px: ${redPx}   bright px (sum>150): ${brightPx}`);
}
