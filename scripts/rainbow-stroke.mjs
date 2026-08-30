import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const B = process.env.URL || "https://mlnpx.com";
const OX = Number(process.env.OX) || 170;
const OY = Number(process.env.OY) || 650;
const BATCH = 50;
const AGENT = "rainbow";

function solve(q) {
  const m = String(q).match(/(\d+)\s*([+\-×])\s*(\d+)/);
  return String(m[2] === "+" ? +m[1] + +m[3] : m[2] === "-" ? +m[1] - +m[3] : +m[1] * +m[3]);
}
function powNonce(seed, difficulty) {
  const prefix = "0".repeat(difficulty);
  let nonce = 0;
  while (true) {
    const h = createHash("sha256").update(seed + ":" + nonce).digest("hex");
    if (h.startsWith(prefix)) return nonce;
    nonce++;
  }
}
async function drawBatch(pixels) {
  const c = await (await fetch(B + "/api/challenge")).json();
  const a = solve(c.question);
  const pow = await (await fetch(B + "/api/pow")).json();
  const nonce = powNonce(c.id, pow.difficulty || 3);
  const r = await fetch(B + "/api/pixels/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pixels, challenge_id: c.id, answer: a, sfw_ack: "SFW, appropriate for all ages", nonce, agent: AGENT }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${d.error || "batch failed"}`);
  return d;
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(255 * x).toString(16).padStart(2, "0")).join("");
}

function main() {
  const design = JSON.parse(readFileSync("scripts/car_design.json", "utf8"));
  const filled = new Set(design.map((p) => `${p.x + OX},${p.y + OY}`));

  // centroid of the car
  let cx = 0, cy = 0;
  for (const p of design) { cx += p.x + OX; cy += p.y + OY; }
  cx /= design.length; cy /= design.length;

  // outline = empty pixels adjacent (8-neighborhood) to the car
  const outline = new Map();
  const seen = new Set(filled);
  for (const k of filled) {
    const [x, y] = k.split(",").map(Number);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= 1000 || ny < 0 || ny >= 1000) continue;
        const nk = `${nx},${ny}`;
        if (seen.has(nk)) continue;
        seen.add(nk);
        const ang = Math.atan2(ny - cy, nx - cx);
        const hue = ((ang / (2 * Math.PI) + 1) % 1) * 360;
        outline.set(nk, { x: nx, y: ny, color: hslToHex(hue, 100, 55) });
      }
    }
  }

  const pixels = [...outline.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  console.log(`rainbow stroke: ${pixels.length} outline pixels`);
  return pixels;
}

async function run() {
  const pixels = main();
  const delay = Number(process.env.DELAY_MS) || 100;
  const start = performance.now();
  let drawn = 0, skipped = 0;
  for (let i = 0; i < pixels.length; i += BATCH) {
    const batch = pixels.slice(i, i + BATCH);
    const r = await drawBatch(batch);
    drawn += r.drawn; skipped += r.skipped;
    if (i + BATCH < pixels.length) await new Promise((res) => setTimeout(res, delay));
  }
  console.log(`done in ${((performance.now() - start) / 1000).toFixed(0)}s (${drawn} drawn, ${skipped} skipped)`);
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
