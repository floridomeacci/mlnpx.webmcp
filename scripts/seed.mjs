const BASE = "http://localhost:3000";
const AGENT = "studio-agent";
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

function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function heartOutline(cx, cy, s) {
  const pts = [];
  for (let t = 0; t < Math.PI * 2; t += 0.003) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([Math.round(cx + s * x), Math.round(cy - s * y)]);
  }
  return pts;
}

async function filledHeart(cx, cy, s, color) {
  const poly = heartOutline(cx, cy, s);
  let xs = poly.map((p) => p[0]);
  let ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const jobs = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (inPoly(x + 0.5, y + 0.5, poly)) jobs.push([x, y]);
    }
  }
  await run(jobs, color);
}

async function filledCircle(cx, cy, r, color) {
  const jobs = [];
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) jobs.push([x, y]);
    }
  }
  await run(jobs, color);
}

async function arc(cx, cy, r, a0, a1, color, thickness = 1) {
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
  await run([...jobs].map((s) => s.split(",").map(Number)), color);
}

async function run(jobs, color) {
  const batch = [];
  for (const [x, y] of jobs) {
    batch.push(draw(x, y, color));
    if (batch.length >= 500) {
      await Promise.all(batch.splice(0));
    }
  }
  await Promise.all(batch);
}

async function main() {
  console.log("drawing heart…");
  await filledHeart(340, 420, 12, "#ff2d55");

  console.log("drawing smiley…");
  await filledCircle(660, 300, 64, "#ffcc00");
  await filledCircle(637, 278, 10, "#111111");
  await filledCircle(683, 278, 10, "#111111");
  await arc(660, 296, 42, Math.PI * 0.15, Math.PI * 0.85, "#111111", 4);

  console.log("drawing rainbow band…");
  const bands = [
    "#ff2d55", "#ff9500", "#ffcc00", "#34c759", "#5ac8fa", "#af52de",
  ];
  for (let i = 0; i < bands.length; i++) {
    const y0 = 60 + i * 14;
    const jobs = [];
    for (let y = y0; y < y0 + 14; y++) {
      for (let x = 40; x < 480; x++) {
        jobs.push([x, y]);
      }
    }
    await run(jobs, bands[i]);
  }

  const res = await fetch(`${BASE}/api/stats`);
  console.log("done:", await res.json());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
