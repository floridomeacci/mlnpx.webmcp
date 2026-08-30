import { createHash } from "node:crypto";

const B = process.env.URL || "https://mlnpx.com";
const OX = Number(process.env.OX) || 500;
const OY = Number(process.env.OY) || 800;
const SCALE = 2;
const BATCH = 20;
const AGENT = "cobra";

const ART = [
  "................................GGGGG........",
  "...............................GGGGGGG.......",
  "..............................GGGGGGGGG......",
  ".............................GGGGGGGGGGG.....",
  "...................BBBBBBBBBBBBBBBBBBBBBB....",
  "..........BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.",
  ".........BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "........BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "........SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
  "........BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  ".........BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "..........BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "...........DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
  "............DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD.",
  ".............DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD..",
  "..............DDDDDDDDDDDDDDDDDDDDDDDDDDDD...",
  "...............DDDDDDDDDDDDDDDDDDDDDDDDDD....",
  "................DDDDDDDDDDDDDDDDDDDDDDDD.....",
];

const PALETTE = { B: "#1e56d0", S: "#f5f5f7", D: "#14326e", G: "#bcd7ff" };

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

async function challenge() {
  return (await (await fetch(B + "/api/challenge")).json());
}

async function drawBatch(pixels) {
  const c = await challenge();
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

function buildPixels() {
  const cols = Math.max(...ART.map((r) => r.length));
  const rows = ART.length;
  const ox = Math.round(OX - (cols * SCALE) / 2);
  const oy = OY - Math.round(rows * SCALE / 2) + 0;

  const map = new Map(); // "x,y" -> color
  const put = (x, y, color) => {
    if (x < 0 || x >= 1000 || y < 0 || y >= 1000) return;
    map.set(`${x},${y}`, color);
  };

  // wheels first (body covers their tops)
  const wy = oy + 15 * SCALE;
  for (const [wx, wc] of [[14, null], [36, null]]) {
    const cx = ox + wx * SCALE;
    const r = 5 * SCALE;
    for (let y = wy - r; y <= wy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const d = (x - cx) ** 2 + (y - wy) ** 2;
        if (d <= r * r) put(x, y, d <= (2 * SCALE) ** 2 ? "#cbd5e1" : "#14141a");
      }
    }
  }

  // body (overrides wheel tops)
  for (let rr = 0; rr < rows; rr++) {
    for (let cc = 0; cc < ART[rr].length; cc++) {
      const ch = ART[rr][cc];
      if (ch === ".") continue;
      const color = PALETTE[ch];
      if (!color) continue;
      for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) {
        put(ox + cc * SCALE + dx, oy + rr * SCALE + dy, color);
      }
    }
  }

  // exhaust pipe
  for (let x = ox + 2 * SCALE; x <= ox + 10 * SCALE; x++) put(x, oy + 9 * SCALE, "#8892a0");

  // ground shadow
  for (let x = ox + 2 * SCALE; x <= ox + 46 * SCALE; x++) put(x, oy + 21 * SCALE, "#0b0b10");

  return [...map.entries()].map(([k, color]) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y, color };
  }).sort((a, b) => a.y - b.y || a.x - b.x);
}

async function main() {
  const pixels = buildPixels();
  const delay = Number(process.env.DELAY_MS) || 0;
  console.log(`drawing cobra car at (${OX},${OY}): ${pixels.length} pixels, ${Math.ceil(pixels.length / BATCH)} challenges`);
  const start = performance.now();
  let drawn = 0, skipped = 0;
  for (let i = 0; i < pixels.length; i += BATCH) {
    const batch = pixels.slice(i, i + BATCH);
    const r = await drawBatch(batch);
    drawn += r.drawn;
    skipped += r.skipped;
    const pct = Math.round(((i + batch.length) / pixels.length) * 100);
    console.log(`  ${i + batch.length}/${pixels.length} (${pct}%) drawn=${drawn} skipped=${skipped}`);
    if (i + BATCH < pixels.length) {
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  console.log(`done in ${((performance.now() - start) / 1000).toFixed(0)}s (${drawn} drawn, ${skipped} skipped)`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
