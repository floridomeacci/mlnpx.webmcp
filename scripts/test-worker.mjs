const B = process.env.URL || "http://localhost:8787";

function solve(c) {
  if (c.kind === "math") {
    const m = c.question.match(/(\d+)\s*([+\-×])\s*(\d+)/);
    return String(m[2] === "+" ? +m[1] + +m[3] : m[2] === "-" ? +m[1] - +m[3] : +m[1] * +m[3]);
  }
  if (c.kind === "canvas") {
    if (c.question.includes("rows of this 1000-wide")) return String(+c.question.match(/in (\d+) rows/)[1] * 1000);
    if (c.question.includes("already painted")) return String(1000 - +c.question.match(/and (\d+) are already painted/)[1]);
    return String((1000000 * +c.question.match(/If (\d+)%/)[1]) / 100);
  }
  if (c.kind === "coordinate") {
    if (c.question.includes("top or the bottom")) return "top";
    const m = c.question.match(/at (column|row) (\d+)\. Which (?:column|row) is (\d+)/);
    return String(+m[2] + +m[3]);
  }
  const NAMES = { red: "#ff0000", lime: "#00ff00", blue: "#0000ff", yellow: "#ffff00", magenta: "#ff00ff", cyan: "#00ffff", white: "#ffffff", black: "#000000", orange: "#ffa500", purple: "#800080", pink: "#ffc0cb", gray: "#808080" };
  if (c.kind === "color") {
    if (c.question.includes("hex code")) return NAMES[c.question.match(/for the color "([a-z]+)"/)[1]];
    const NAME = Object.fromEntries(Object.entries(NAMES).map(([n, h]) => [h, n]));
    return NAME[c.question.match(/#[0-9a-f]{6}/i)[0].toLowerCase()];
  }
  throw new Error("unknown kind " + c.kind);
}

async function main() {
  let got = null;
  const r = await fetch(B + "/api/stream");
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  (async () => {
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop();
      for (const p of parts) {
        if (p.startsWith("data:")) {
          const d = JSON.parse(p.slice(5).trim());
          if (d.x === 55 && d.y === 55) got = d;
        }
      }
    }
  })();

  await new Promise((x) => setTimeout(x, 300));
  const c = await (await fetch(B + "/api/challenge")).json();
  const a = solve(c);
  const rr = await fetch(B + "/api/pixels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: 55, y: 55, color: "#0000ff", challenge_id: c.id, answer: a }),
  });
  console.log("draw status:", rr.status);
  await new Promise((x) => setTimeout(x, 500));
  console.log("SSE received:", JSON.stringify(got));
  reader.cancel();
}

main().catch((e) => { console.error(e); process.exit(1); });
