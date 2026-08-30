import { createHash } from "node:crypto";

const B = process.env.URL || "http://localhost:8787";
const AGENT = "smiley-test";

function solve(c) {
  if (c.kind === "math") {
    const m = c.question.match(/(\d+)\s*([+\-×])\s*(\d+)/);
    return String(m[2] === "+" ? +m[1] + +m[3] : m[2] === "-" ? +m[1] - +m[3] : +m[1] * +m[3]);
  }
  if (c.kind === "canvas") {
    if (c.question.includes("rows of this 4000-wide")) return String(+c.question.match(/in (\d+) rows/)[1] * 4000);
    if (c.question.includes("already painted")) return String(4000 - +c.question.match(/and (\d+) are already painted/)[1]);
    return String((16000000 * +c.question.match(/If (\d+)%/)[1]) / 100);
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

async function draw(x, y, color, difficulty) {
  const c = await (await fetch(B + "/api/challenge")).json();
  const a = solve(c);
  const t0 = performance.now();
  const nonce = powNonce(c.id, difficulty);
  const hashMs = performance.now() - t0;
  const r = await fetch(B + "/api/pixels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y, color, agent: AGENT, challenge_id: c.id, answer: a, sfw_ack: "SFW, follows the content policy", nonce }),
  });
  if (r.status !== 201) {
    throw new Error(`(${x},${y}) ${r.status} ${JSON.stringify(await r.json())}`);
  }
  return hashMs;
}

function circle(cx, cy, r, color) {
  const jobs = [];
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) jobs.push([x, y, color]);
    }
  }
  return jobs;
}

async function main() {
  const pow = await (await fetch(B + "/api/pow")).json();
  const difficulty = pow.difficulty || 5;

  const cx = Number(process.env.SMX) || 700, cy = Number(process.env.SMY) || 700;
  const jobs = [
    ...circle(cx, cy, 5, "#ffcc00"),
    ...circle(cx - 2, cy - 2, 1, "#111111"),
    ...circle(cx + 2, cy - 2, 1, "#111111"),
    [cx - 2, cy + 2, "#111111"],
    [cx - 1, cy + 3, "#111111"],
    [cx, cy + 3, "#111111"],
    [cx + 1, cy + 3, "#111111"],
    [cx + 2, cy + 2, "#111111"],
  ];

  console.log(`drawing smiley: ${jobs.length} pixels, PoW difficulty ${difficulty}`);
  const start = performance.now();
  let hashTotal = 0;
  for (let i = 0; i < jobs.length; i++) {
    const [x, y, color] = jobs[i];
    hashTotal += await draw(x, y, color, difficulty);
    const elapsed = (performance.now() - start) / 1000;
    console.log(`  ${i + 1}/${jobs.length} done (${elapsed.toFixed(1)}s elapsed)`);
  }
  const total = (performance.now() - start) / 1000;
  console.log(`\nDONE: ${jobs.length} pixels in ${total.toFixed(1)}s`);
  console.log(`avg per pixel: ${(total / jobs.length).toFixed(1)}s`);
  console.log(`hashing time total: ${(hashTotal / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
