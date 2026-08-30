// Render a car bitmap as ASCII to eyeball the silhouette before drawing.
const ART = [
  "................................................",
  "...........................GGGGGG................",
  ".........................GGGGGGGGGGG............",
  "........................GGGGGGGGGGGGG...........",
  ".......................BBBBBBBBBBBBBBBBBB.......",
  "...........BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  ".........BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "........BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  ".......BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  ".......SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
  ".......BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "........BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  ".........BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "..........DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
  "...........DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD.",
  "............DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD..",
  ".............DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD....",
  "..............DDDDDDDDDDDDDDDDDDDDDDDDDDDD.....",
];

for (const row of ART) {
  console.log(row.replace(/\./g, " ").replace(/B/g, "#").replace(/S/g, "=").replace(/G/g, "%").replace(/D/g, "+"));
}
console.log("\ncols:", ART[0].length, "rows:", ART.length);
