const B = process.env.URL || "http://localhost:8787";

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

async function draw(x, y, color) {
  const c = await (await fetch(B + "/api/challenge")).json();
  const a = solve(c);
  const r = await fetch(B + "/api/pixels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y, color, challenge_id: c.id, answer: a, sfw_ack: "SFW, follows the content policy" }),
  });
  return { status: r.status, body: await r.json() };
}

async function main() {
  const [x, y] = [Number(process.argv[2]), Number(process.argv[3])];
  const color = process.argv[4] || "#00ff00";
  const r = await draw(x, y, color);
  console.log(r.status, JSON.stringify(r.body));
  process.exit(0);
}

main();
