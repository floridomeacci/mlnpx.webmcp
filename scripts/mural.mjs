const BASE = "http://localhost:3000";
const TOKEN = process.env.BYPASS_TOKEN;

// ---------------------------------------------------------------- helpers

function hex(c) {
  return parseInt(c.slice(1), 16);
}
function lighten(hexstr, t) {
  const r = parseInt(hexstr.slice(1, 3), 16);
  const g = parseInt(hexstr.slice(3, 5), 16);
  const b = parseInt(hexstr.slice(5, 7), 16);
  const m = (c) => Math.round(c + (255 - c) * t);
  return "#" + [m(r), m(g), m(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function mix(a, b, t) {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return "#" + [m(ar, br), m(ag, bg), m(ab, bb)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function key(x, y) {
  return x + "," + y;
}

const buf = new Map(); // canvas "x,y" -> color

function put(x, y, c) {
  if (x < 0 || x >= 1000 || y < 0 || y >= 1000) return;
  buf.set(key(x, y), c);
}
function paint(set, color, ox = 0, oy = 0) {
  for (const k of set) {
    const [x, y] = k.split(",").map(Number);
    put(x + ox, y + oy, color);
  }
}
function dilate(keys, r) {
  const out = new Set();
  for (const k of keys) {
    const [x, y] = k.split(",").map(Number);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) out.add(key(x + dx, y + dy));
  }
  return out;
}
function sub(a, b) {
  const out = new Set();
  for (const k of a) if (!b.has(k)) out.add(k);
  return out;
}

// ---------------------------------------------------------------- graffiti text

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

const TEXT = "FLORIDO WAS HERE";
const PALETTE = ["#ff2d95", "#ff6b35", "#ffd23f", "#34d399", "#22d3ee", "#8b5cf6"];
const SH = 0.32; // skew (italic slant)
const DEPTH = 16; // 3D extrusion depth (px)

function buildText() {
  const chars = TEXT.split("");
  const face = new Map(); // "x,y" -> color (abstract)
  let cx = 0;
  chars.forEach((ch, i) => {
    const g = FONT[ch] || FONT[" "];
    const base = ch === " " ? null : PALETTE[i % PALETTE.length];
    const S = [8, 9, 10][i % 3];
    const bounce = Math.round(Math.sin(i * 0.8) * 2) * 3;
    for (let r = 0; r < 7; r++) {
      for (let x = 0; x < g[r].length; x++) {
        if (g[r][x] !== "#") continue;
        const color = lighten(base, Math.max(0, 1 - r / 3) * 0.24);
        const px = Math.round((x + r * SH) * S);
        const py = Math.round(r * S) + bounce;
        for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
          face.set(key(cx + px + dx, py + dy), color);
        }
      }
    }
    cx += Math.round((g[0].length + 1) * S) + Math.round(SH * S);
  });
  return face;
}

function drawText(oy) {
  const face = buildText();
  const faceSet = new Set(face.keys());

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const k of faceSet) {
    const [x, y] = k.split(",").map(Number);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const ox = Math.floor((1000 - (maxX - minX)) / 2) - minX;

  // 3D extrusion (side)
  const side = new Map();
  for (const k of faceSet) {
    const [x, y] = k.split(",").map(Number);
    for (let d = 1; d <= DEPTH; d++) {
      const kk = key(x + d, y + d);
      if (faceSet.has(kk)) continue;
      if (!side.has(kk) || side.get(kk) > d) side.set(kk, d);
    }
  }
  for (const [k, d] of side) {
    const [x, y] = k.split(",").map(Number);
    put(x + ox, y + oy, mix("#3a3f5c", "#0d0f18", (d - 1) / (DEPTH - 1)));
  }

  const black = sub(dilate(faceSet, 2), faceSet);
  const outline = new Set([...faceSet, ...black]);
  const white = sub(dilate(outline, 2), outline);

  paint(white, "#ffffff", ox, oy);
  paint(black, "#0a0a12", ox, oy);
  for (const [k, c] of face) {
    const [x, y] = k.split(",").map(Number);
    put(x + ox, y + oy, c);
  }
}

// ---------------------------------------------------------------- panther

const PANTHER_HALF = [
  "......##............",
  ".....####...........",
  "....######...........",
  "....#######..........",
  "....#########........",
  "....##########.......",
  "....############.....",
  "....##############...",
  "....###############..",
  "....##################",
  "....##################",
  "....##################",
  "....##################",
  "....##################",
  "....##################",
  "....#################.",
  ".....#################",
  "......###############",
  ".......#############",
  "........###########",
  ".........#########",
  "..........#######",
  "...........#####",
  "............###",
  ".............##",
  "...............#",
];

function mirror(half) {
  return half.map((row) => row + row.split("").reverse().join(""));
}

function drawPanther(ox, oy, sc) {
  const rows = mirror(PANTHER_HALF);
  const body = new Set();
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === ".") continue;
      for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) {
        body.add(key(c * sc + dx, r * sc + dy));
      }
    }
  }

  const outline = sub(dilate(body, 2), body);
  paint(outline, "#5a5a6e", ox, oy);
  paint(body, "#14141c", ox, oy);

  const cx = ox + 22 * sc; // center x
  const eyeY = oy + 11 * sc;

  // glowing eyes
  const drawEye = (ex) => {
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 5; dx++) put(ex + dx, eyeY + dy, "#ffd60a");
    for (let dy = 1; dy < 3; dy++) for (let dx = 2; dx < 4; dx++) put(ex + dx, eyeY + dy, "#1a1a1a");
  };
  drawEye(cx - 30);
  drawEye(cx + 25);

  // nose
  for (let dy = 0; dy < 4; dy++) for (let dx = -3; dx <= 3; dx++) put(cx + dx, oy + 16 * sc + dy, "#3a3a46");

  // fangs
  const fangY = oy + 24 * sc;
  const drawFang = (fx) => {
    for (let k = 0; k < 8; k++) {
      const w = k < 3 ? 3 : k < 5 ? 2 : 1;
      for (let dx = 0; dx < w; dx++) put(fx - Math.floor(w / 2) + dx, fangY + k, "#f5f5f7");
    }
  };
  drawFang(cx - 8);
  drawFang(cx + 8);
}

// ---------------------------------------------------------------- cobra car

const CAR = [
  ".............................GGGGGGG.......................",
  "..........................GGGGGGGGGGGBBBBBBBBBBBBBBBBBBBBB",
  "....BBBBBBBBBBBBBB......BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "...BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "..BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  ".SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
  "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
  "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  ".BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "..BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "...BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.",
  "....DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD....",
  ".....DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD.....",
  "......DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD......",
  ".......DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD.......",
];

const CAR_PALETTE = {
  B: "#1e56d0",
  D: "#14326e",
  S: "#f5f5f7",
  G: "#bcd7ff",
};

function circle(cx, cy, r) {
  const s = new Set();
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) s.add(key(x, y));
  }
  return s;
}

function drawCar(ox, oy, sc) {
  // body
  const body = new Set();
  for (let r = 0; r < CAR.length; r++) {
    for (let c = 0; c < CAR[r].length; c++) {
      const ch = CAR[r][c];
      if (ch === ".") continue;
      for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) {
        const k = key(c * sc + dx, r * sc + dy);
        body.add(k);
        const [x, y] = k.split(",").map(Number);
        put(x + ox, y + oy, CAR_PALETTE[ch]);
      }
    }
  }

  // wheels
  const wheel1 = circle(15 * sc, 13 * sc, 5 * sc);
  const wheel2 = circle(46 * sc, 13 * sc, 5 * sc);
  const hub1 = circle(15 * sc, 13 * sc, 2 * sc);
  const hub2 = circle(46 * sc, 13 * sc, 2 * sc);
  paint(wheel1, "#14141a", ox, oy);
  paint(wheel2, "#14141a", ox, oy);
  paint(hub1, "#cbd5e1", ox, oy);
  paint(hub2, "#cbd5e1", ox, oy);

  // exhaust pipe
  for (let x = 2 * sc; x <= 13 * sc; x++) {
    for (let dy = 0; dy < sc; dy++) put(ox + x, oy + 11 * sc + dy, "#8892a0");
  }
  for (let x = 13 * sc; x <= 15 * sc; x++) put(ox + x, oy + 11 * sc, "#cbd5e1");

  // ground shadow
  for (let x = 2 * sc; x <= 58 * sc; x++) {
    for (let dy = 0; dy < sc; dy++) put(ox + x, oy + 19 * sc + dy, "#0b0b10");
  }
}

// ---------------------------------------------------------------- build mural

async function push() {
  const jobs = [];
  for (const [k, c] of buf) {
    const [x, y] = k.split(",").map(Number);
    jobs.push([x, y, c]);
  }
  console.log("total pixels:", jobs.length);

  const headers = { "Content-Type": "application/json" };
  if (TOKEN) headers.Authorization = "Bearer " + TOKEN;

  let done = 0;
  const batch = [];
  for (const [x, y, color] of jobs) {
    batch.push(
      fetch(`${BASE}/api/pixels`, {
        method: "POST",
        headers,
        body: JSON.stringify({ x, y, color, agent: "florido" }),
      }).then((r) => {
        if (!r.ok) throw new Error(`(${x},${y}) ${r.status}`);
        done++;
        if (done % 5000 === 0) console.log(`  … ${done}/${jobs.length}`);
      })
    );
    if (batch.length >= 500) await Promise.all(batch.splice(0));
  }
  await Promise.all(batch);
  console.log("pushed:", done);
}

async function main() {
  console.log("drawing graffiti text…");
  drawText(300);

  console.log("drawing panther…");
  drawPanther(90, 620, 6);

  console.log("drawing cobra car…");
  drawCar(520, 640, 5);

  await push();
  const res = await fetch(`${BASE}/api/stats`);
  console.log("done:", await res.json());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
