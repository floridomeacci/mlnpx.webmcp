const BASE = "http://localhost:3000";
const AGENT = "challenge-bot";

const COLOR_NAMES = {
  "#ff0000": "red", "#00ff00": "lime", "#0000ff": "blue", "#ffff00": "yellow",
  "#ff00ff": "magenta", "#00ffff": "cyan", "#ffffff": "white", "#000000": "black",
  "#ffa500": "orange", "#800080": "purple", "#ffc0cb": "pink", "#808080": "gray",
};
const NAME_HEX = Object.fromEntries(Object.entries(COLOR_NAMES).map(([h, n]) => [n, h]));

function solve(c) {
  if (c.kind === "math") {
    const m = c.question.match(/(\d+)\s*([+\-×])\s*(\d+)/);
    const a = Number(m[1]);
    const b = Number(m[3]);
    return String(m[2] === "+" ? a + b : m[2] === "-" ? a - b : a * b);
  }
  if (c.kind === "color") {
    if (c.question.includes("hex code")) {
      const name = c.question.match(/for the color "([a-z]+)"/)[1];
      return NAME_HEX[name];
    }
    const hex = c.question.match(/#[0-9a-f]{6}/i)[0].toLowerCase();
    return COLOR_NAMES[hex];
  }
  if (c.kind === "canvas") {
    if (c.question.includes("rows of this 1000-wide")) {
      return String(Number(c.question.match(/in (\d+) rows/)[1]) * 1000);
    }
    if (c.question.includes("already painted")) {
      return String(1000 - Number(c.question.match(/and (\d+) are already painted/)[1]));
    }
    const pct = Number(c.question.match(/If (\d+)%/)[1]);
    return String((1000000 * pct) / 100);
  }
  if (c.kind === "coordinate") {
    if (c.question.includes("top or the bottom")) return "top";
    const m = c.question.match(/at (column|row) (\d+)\. Which (?:column|row) is (\d+)/);
    return String(Number(m[2]) + Number(m[3]));
  }
  throw new Error("unknown challenge kind: " + c.kind);
}

async function drawWithChallenge(x, y, color) {
  const c = await (await fetch(`${BASE}/api/challenge`)).json();
  const answer = solve(c);
  const res = await fetch(`${BASE}/api/pixels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y, color, agent: AGENT, challenge_id: c.id, answer }),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(`(${x},${y}) ${c.kind} "${c.question}" answer=${answer}: ${e.error}`);
  }
}

async function run(jobs) {
  const batch = [];
  let done = 0;
  for (const [x, y, color] of jobs) {
    batch.push(
      drawWithChallenge(x, y, color).then(() => {
        done++;
        if (done % 500 === 0) console.log(`  … ${done}/${jobs.length} challenges solved`);
      })
    );
    if (batch.length >= 200) await Promise.all(batch.splice(0));
  }
  await Promise.all(batch);
}

async function filledCircle(cx, cy, r, color) {
  const jobs = [];
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) jobs.push([x, y, color]);
    }
  }
  return jobs;
}

function arc(cx, cy, r, a0, a1, color, thickness = 3) {
  const jobs = new Set();
  const steps = Math.ceil(r * (a1 - a0) * 2);
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const x = Math.round(cx + r * Math.cos(a));
    const y = Math.round(cy + r * Math.sin(a));
    for (let t = 0; t < thickness; t++) {
      jobs.add(`${x + t},${y}`);
      jobs.add(`${x},${y + t}`);
    }
  }
  return [...jobs].map((s) => {
    const [x, y] = s.split(",").map(Number);
    return [x, y, color];
  });
}

async function main() {
  const cx = 500;
  const cy = 855;
  const r = 48;

  console.log("drawing smiley — every pixel through the challenge gate (no bypass)");

  const body = await filledCircle(cx, cy, r, "#ffcc00");
  const eyeL = await filledCircle(cx - 18, cy - 18, 8, "#111111");
  const eyeR = await filledCircle(cx + 18, cy - 18, 8, "#111111");
  const mouth = arc(cx, cy + 6, 30, Math.PI * 0.15, Math.PI * 0.85, "#111111", 4);

  const all = [...body, ...eyeL, ...eyeR, ...mouth];
  console.log(`${all.length} pixels total`);
  await run(all);

  const res = await fetch(`${BASE}/api/stats`);
  console.log("done:", await res.json());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
