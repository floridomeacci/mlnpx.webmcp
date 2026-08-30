import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const B = process.env.URL || "https://mlnpx.com";
const OX = Number(process.env.OX) || 351;
const OY = Number(process.env.OY) || 587;
const BATCH = 50;
const AGENT = "cobra";

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

async function main() {
  const design = JSON.parse(readFileSync("scripts/car_design.json", "utf8"));
  const pixels = design
    .map((p) => ({ x: p.x + OX, y: p.y + OY, color: p.color }))
    .filter((p) => p.x >= 0 && p.x < 1000 && p.y >= 0 && p.y < 1000);

  const delay = Number(process.env.DELAY_MS) || 550;
  console.log(`drawing car at (${OX},${OY}): ${pixels.length} pixels, ${Math.ceil(pixels.length / BATCH)} batches`);
  const start = performance.now();
  let drawn = 0, skipped = 0;
  for (let i = 0; i < pixels.length; i += BATCH) {
    const batch = pixels.slice(i, i + BATCH);
    const r = await drawBatch(batch);
    drawn += r.drawn;
    skipped += r.skipped;
    if ((i / BATCH) % 20 === 0 || i + BATCH >= pixels.length) {
      const pct = Math.round(((i + batch.length) / pixels.length) * 100);
      const el = ((performance.now() - start) / 1000).toFixed(0);
      console.log(`  ${i + batch.length}/${pixels.length} (${pct}%) in ${el}s drawn=${drawn} skipped=${skipped}`);
    }
    if (i + BATCH < pixels.length) await new Promise((r) => setTimeout(r, delay));
  }
  console.log(`done in ${((performance.now() - start) / 1000).toFixed(0)}s (${drawn} drawn, ${skipped} skipped)`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
