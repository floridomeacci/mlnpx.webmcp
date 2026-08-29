const BASE = "http://localhost:3000";
const AGENT = "florido";
const TOKEN = process.env.BYPASS_TOKEN;

async function draw(x, y, color) {
  const headers = { "Content-Type": "application/json" };
  if (TOKEN) headers.Authorization = "Bearer " + TOKEN;
  const res = await fetch(`${BASE}/api/pixels`, {
    method: "POST",
    headers,
    body: JSON.stringify({ x, y, color, agent: AGENT }),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(`${x},${y}: ${e.error}`);
  }
}

async function run(jobs) {
  const batch = [];
  for (const [x, y, color] of jobs) {
    batch.push(draw(x, y, color));
    if (batch.length >= 500) await Promise.all(batch.splice(0));
  }
  await Promise.all(batch);
}

const FONT = {
  " ": ["...", "...", "...", "...", "...", "...", "..."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".###.", "#....", "#....", ".###.", "....#", "....#", ".###."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
};

const PALETTE = [
  "#ff3b30", "#ff9500", "#ffcc00", "#34c759",
  "#00c7be", "#0a84ff", "#af52de", "#ff2d95",
];

function lighten(hex, t) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c) => Math.round(c + (255 - c) * t);
  return "#" + [mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

const TEXT = "FLORIDO WAS HERE";
const S = 9;
const ROWS = 7;

function build() {
  const chars = TEXT.split("");
  const glyphs = chars.map((ch) => FONT[ch] || FONT[" "]);
  const cols = glyphs.reduce((sum, g) => sum + g[0].length + 1, 0) - 1;

  const fill = new Map(); // scaled "x,y" -> color
  let c = 0;
  chars.forEach((ch, li) => {
    const g = glyphs[li];
    const base = ch === " " ? null : PALETTE[li % PALETTE.length];
    for (let r = 0; r < ROWS; r++) {
      for (let x = 0; x < g[r].length; x++) {
        if (g[r][x] !== "#") continue;
        const color = lighten(base, Math.max(0, 1 - r / 3) * 0.28);
        for (let dy = 0; dy < S; dy++) {
          for (let dx = 0; dx < S; dx++) {
            fill.set(`${(c + x) * S + dx},${r * S + dy}`, color);
          }
        }
      }
    }
    c += g[0].length + 1;
  });

  return { cols, fill };
}

function dilate(keys, radius) {
  const out = new Set();
  for (const k of keys) {
    const [x, y] = k.split(",").map(Number);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        out.add(`${x + dx},${y + dy}`);
      }
    }
  }
  return out;
}

async function main() {
  const { cols, fill } = build();
  const ox = Math.floor((1000 - cols * S) / 2);
  const oy = 690;

  const fillSet = new Set(fill.keys());
  const black = new Set([...dilate(fillSet, 2)].filter((k) => !fillSet.has(k)));
  const outlineSet = new Set([...fillSet, ...black]);
  const white = new Set([...dilate(outlineSet, 2)].filter((k) => !outlineSet.has(k)));

  const jobs = [];
  const put = (set, color) => {
    for (const k of set) {
      const [x, y] = k.split(",").map(Number);
      const px = ox + x;
      const py = oy + y;
      if (px < 0 || px >= 1000 || py < 0 || py >= 1000) continue;
      jobs.push([px, py, color]);
    }
  };

  put(white, "#ffffff");
  put(black, "#0a0a12");
  for (const [k, color] of fill) {
    const [x, y] = k.split(",").map(Number);
    const px = ox + x;
    const py = oy + y;
    if (px < 0 || px >= 1000 || py < 0 || py >= 1000) continue;
    jobs.push([px, py, color]);
  }

  console.log(`text "${TEXT}" at (${ox}, ${oy}) — ${jobs.length} pixels`);
  await run(jobs);

  const res = await fetch(`${BASE}/api/stats`);
  console.log("done:", await res.json());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
