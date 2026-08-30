import { createHash } from "node:crypto";

const B = process.env.URL || "https://mlnpx.com";
const OX = Number(process.env.OX) || 500;
const OY = Number(process.env.OY) || 780;
const SCALE = 2;
const AGENT = "cobra";

function solve(c) {
  if (c.kind === "math") {
    const m = c.question.match(/(\d+)\s*([+\-×])\s*(\d+)/);
    return String(m[2] === "+" ? +m[1] + +m[3] : m[2] === "-" ? +m[1] - +m[3] : +m[1] * +m[3]);
  }
  if (c.kind === "canvas") {
    if (c.question.includes("rows of this 1000-wide")) return String(+c.question.match(/in (\d+) rows/)[1] * 1000);
    if (c.question.includes("already painted")) return String(1000 - +c.question.match(/and (\d+) are already painted/)[1]);
    return String((1000000 * +c.question.match(/If (\d+)%/)[1]) / 100);
  }
  if (c.kind === "coordinate") {
    if (c.question.includes("top or the bottom")) return "top";
    const m = c.question.match(/at (column|row) (\d+)\. Which (?:column|row) is (\d+)/);
    return String(+m[2] + +m[3]);
  }
  const NAMES = { red: "#ff0000", lime: "#00ff00", blue: "#0000ff", yellow: "#ffff00", magenta: "#ff00ff", cyan: "#00ffff", white: "#ffffff", black: "#000000", orange: "#ffa500", purple: "#800080", pink: "#ffc0cb", gray: "#808080" };
  if (c.question.includes("hex code")) return NAMES[c.question.match(/for the color "([a-z]+)"/)[1]];
  const NAME = Object.fromEntries(Object.entries(NAMES).map(([n, h]) => [h, n]));
  return NAME[c.question.match(/#[0-9a-f]{6}/i)[0].toLowerCase()];
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

async function draw(x, y, color) {
  const c = await (await fetch(B + "/api/challenge")).json();
  const a = solve(c);
  const pow = await (await fetch(B + "/api/pow")).json();
  const nonce = powNonce(c.id, pow.difficulty || 4);
  const r = await fetch(B + "/api/pixels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y, color, agent: AGENT, challenge_id: c.id, answer: a, sfw_ack: "SFW, appropriate for all ages", nonce }),
  });
  if (r.status === 409) return;
  if (r.status !== 201) throw new Error(`(${x},${y}) ${r.status} ${JSON.stringify(await r.json())}`);
}

function circle(cx, cy, r, color) {
  const pts = [];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) pts.push([x, y, color]);
  }
  return pts;
}

// Cobra car side view (facing right). 40 cols x 12 rows.
const ART = [
  ".......................GGGGGGGGG",
  "..................GGGGGGGGGGGGGGGGG",
  "....BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "..BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  ".BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
  "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  ".BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "..BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "...DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
  "....DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD..",
];

const PALETTE = { B: "#1e56d0", S: "#f5f5f7", D: "#14326e", G: "#bcd7ff" };

function buildCar() {
  const cols = ART[0].length;
  const rows = ART.length;
  const ox = Math.round(OX - (cols * SCALE) / 2);
  const oy = OY - Math.round(rows * SCALE / 2);

  const jobs = new Map(); // "x,y" -> color (later draw order: wheels, body, exhaust, shadow)

  const add = (x, y, color) => {
    if (x < 0 || x >= 1000 || y < 0 || y >= 1000) return;
    jobs.set(`${x},${y}`, color);
  };

  // wheels first (under the body)
  const wheelY = oy + Math.round(11 * SCALE);
  const wheelR = 3 * SCALE;
  for (const [wx, wy, wc] of [
    ...circle(ox + 10 * SCALE, wheelY, wheelR, "#14141a"),
    ...circle(ox + 30 * SCALE, wheelY, wheelR, "#14141a"),
  ]) add(wx, wy, wc);
  for (const [wx, wy, wc] of [
    ...circle(ox + 10 * SCALE, wheelY, Math.round(1.4 * SCALE), "#cbd5e1"),
    ...circle(ox + 30 * SCALE, wheelY, Math.round(1.4 * SCALE), "#cbd5e1"),
  ]) add(wx, wy, wc);

  // body
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = ART[r][c];
      if (ch === ".") continue;
      const color = PALETTE[ch];
      for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) {
        add(ox + c * SCALE + dx, oy + r * SCALE + dy, color);
      }
    }
  }

  // exhaust pipe (left side, under body)
  for (let x = ox + 1 * SCALE; x <= ox + 8 * SCALE; x++) add(x, oy + 9 * SCALE, "#8892a0");

  // ground shadow
  for (let x = ox + 1 * SCALE; x <= ox + 39 * SCALE; x++) add(x, oy + 14 * SCALE, "#0b0b10");

  return jobs;
}

async function main() {
  const jobs = [...buildCar().entries()].map(([k, color]) => {
    const [x, y] = k.split(",").map(Number);
    return [x, y, color];
  });
  console.log(`drawing cobra car at (${OX},${OY}): ${jobs.length} pixels`);
  const delay = Number(process.env.DELAY_MS) || 600;
  const start = performance.now();
  for (let i = 0; i < jobs.length; i++) {
    const [x, y, color] = jobs[i];
    await draw(x, y, color);
    if ((i + 1) % 50 === 0 || i === jobs.length - 1) {
      const e = (performance.now() - start) / 1000;
      console.log(`  ${i + 1}/${jobs.length} (${e.toFixed(0)}s)`);
    }
    if (delay > 0 && i < jobs.length - 1) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  console.log(`done in ${((performance.now() - start) / 1000).toFixed(0)}s`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
