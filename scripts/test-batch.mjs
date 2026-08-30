import { createHash } from "node:crypto";

const B = "https://mlnpx.com";

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

async function main() {
  const c = await (await fetch(B + "/api/challenge")).json();
  const a = solve(c.question);
  const pow = await (await fetch(B + "/api/pow")).json();
  const nonce = powNonce(c.id, pow.difficulty || 3);

  const pixels = [];
  for (let i = 0; i < 8; i++) pixels.push({ x: 700 + i, y: 400, color: "#ff0000" });

  const r = await fetch(B + "/api/pixels/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pixels, challenge_id: c.id, answer: a, sfw_ack: "SFW, appropriate for all ages", nonce }),
  });
  const d = await r.json();
  console.log("status", r.status, "drawn", d.drawn, "skipped", d.skipped, "pixels", (d.pixels || []).length);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
