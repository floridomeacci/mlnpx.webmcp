// Render a full car (body + wheels + stripe) as ASCII to eyeball it before drawing.
const W = 48, H = 22;

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

const grid = Array.from({ length: H }, () => Array(W).fill(" "));
for (let r = 0; r < ART.length; r++) {
  for (let c = 0; c < ART[r].length; c++) {
    const ch = ART[r][c];
    const map = { B: "#", S: "=", D: "+", G: "%" };
    if (map[ch]) grid[r][c] = map[ch];
  }
}

function wheel(cx, cy, r) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d <= r * r) grid[y][x] = d <= 2 * 2 ? "." : "O";
    }
  }
}

wheel(14, 15, 5);
wheel(36, 15, 5);

for (const row of grid) console.log(row.join(""));
console.log("\ncols:", W, "rows:", H);
