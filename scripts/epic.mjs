import { writeFileSync } from "node:fs";

const GRID = 4000;
const OUT = "scripts/epic.sql";

const FONT = {
  " ": ["...", "...", "...", "...", "...", "...", "..."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  S: [".###.", "#....", "#....", ".###.", "....#", "....#", ".###."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
};

// fire gradient: bright core up top, deep red at the base
const FIRE = ["#fff3b0", "#ffd23f", "#ff9d2e", "#ff5a1f", "#f22d1d", "#c81e2e", "#8f1420"];

function mix(a, b, t) {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return "#" + [m(ar, br), m(ag, bg), m(ab, bb)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

const key = (x, y) => `${x},${y}`;

function buildLine(text, S, skew) {
  const chars = text.split("");
  const face = new Map(); // local x,y -> color
  let cx = 0;
  let width = 0;
  for (const ch of chars) {
    const g = FONT[ch] || FONT[" "];
    for (let r = 0; r < 7; r++) {
      for (let x = 0; x < g[r].length; x++) {
        if (g[r][x] !== "#") continue;
        const color = FIRE[r];
        const px = Math.round((x + r * skew) * S);
        const py = r * S;
        for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
          face.set(key(cx + px + dx, py + dy), color);
        }
      }
    }
    cx += Math.round((g[0].length + 1) * S) + Math.round(skew * S);
  }
  width = cx - Math.round(skew * S);
  return { face, width, height: 7 * S };
}

function dilate(keys, r) {
  const out = new Set();
  for (const k of keys) {
    const [x, y] = k.split(",").map(Number);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) out.add(key(x + dx, y + dy));
  }
  return out;
}

const buf = new Map(); // "x,y" -> color (canvas coords)

function paint(set, color, ox, oy) {
  for (const k of set) {
    const [x, y] = k.split(",").map(Number);
    const px = x + ox, py = y + oy;
    if (px < 0 || px >= GRID || py < 0 || py >= GRID) continue;
    buf.set(key(px, py), color);
  }
}

function placeLine(text, S, skew, cy) {
  const { face, width, height } = buildLine(text, S, skew);
  const ox = Math.floor((GRID - width) / 2);
  const oy = Math.floor(cy - height / 2);

  const faceSet = new Set(face.keys());

  // halo (soft glow behind)
  const halo = new Set([...dilate(faceSet, 12)].filter((k) => !faceSet.has(k)));
  paint(halo, "#241010", ox, oy);
  const halo2 = new Set([...dilate(faceSet, 6)].filter((k) => !faceSet.has(k)));
  paint(halo2, "#361313", ox, oy);

  // 3D extrusion (down-right)
  const side = new Map();
  for (const k of faceSet) {
    const [x, y] = k.split(",").map(Number);
    for (let d = 1; d <= 10; d++) {
      const kk = key(x + d, y + d);
      if (faceSet.has(kk)) continue;
      if (!side.has(kk) || side.get(kk) > d) side.set(kk, d);
    }
  }
  for (const [k, d] of side) {
    const [x, y] = k.split(",").map(Number);
    paint(new Set([k]), mix("#4a0d10", "#160404", (d - 1) / 9), ox, oy);
  }

  // black outline
  const outline = new Set([...dilate(faceSet, 1)].filter((k) => !faceSet.has(k)));
  paint(outline, "#0a0a12", ox, oy);

  // face fill
  for (const [k, color] of face) {
    const [x, y] = k.split(",").map(Number);
    const px = x + ox, py = y + oy;
    if (px < 0 || px >= GRID || py < 0 || py >= GRID) continue;
    buf.set(key(px, py), color);
  }

  return { ox, oy, width, height };
}

function main() {
  const skew = 0.25;

  const l1 = placeLine("MILLION PIXELS", 15, skew, 2000 - 120);
  const l2 = placeLine("WEBMCP", 22, skew, 2000 + 120);

  const ts = Date.now();

  const rows = [];
  for (const [k, color] of buf) {
    const [x, y] = k.split(",").map(Number);
    rows.push(`(${x}, ${y}, '${color}', NULL, ${ts})`);
  }

  const stmts = [];
  for (let i = 0; i < rows.length; i += 200) {
    stmts.push(
      `INSERT OR IGNORE INTO pixels (x, y, color, agent, ts) VALUES ${rows.slice(i, i + 200).join(", ")};`
    );
  }

  writeFileSync(OUT, stmts.join("\n") + "\n");
  console.log(`line1 "${"MILLION PIXELS"}" at y ${l1.oy}..${l1.oy + l1.height} (${l1.width}px wide)`);
  console.log(`line2 "WEBMCP" at y ${l2.oy}..${l2.oy + l2.height} (${l2.width}px wide)`);
  console.log(`total pixels: ${rows.length}`);
  console.log(`wrote ${OUT} (${stmts.length} statements)`);
}

main();
