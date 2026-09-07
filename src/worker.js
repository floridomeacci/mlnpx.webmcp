const GRID = 1000;
const TOTAL = GRID * GRID;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const CHALLENGE_TTL = 90_000;

// ---------------------------------------------------------------- challenges

const COLOR_NAMES = {
  "#ff0000": "red", "#00ff00": "lime", "#0000ff": "blue", "#ffff00": "yellow",
  "#ff00ff": "magenta", "#00ffff": "cyan", "#ffffff": "white", "#000000": "black",
  "#ffa500": "orange", "#800080": "purple", "#ffc0cb": "pink", "#808080": "gray",
};

function rand(n) {
  return Math.floor(Math.random() * n);
}
function pick(arr) {
  return arr[rand(arr.length)];
}

function gMath() {
  const op = pick(["+", "-", "*"]);
  let a, b, answer;
  if (op === "+") {
    a = rand(90) + 10; b = rand(90) + 10; answer = a + b;
    return { question: `Solve and reply with just the number: ${a} + ${b} = ?`, answer: String(answer), kind: "math" };
  }
  if (op === "-") {
    a = rand(90) + 20; b = rand(a - 1) + 1; answer = a - b;
    return { question: `Solve and reply with just the number: ${a} - ${b} = ?`, answer: String(answer), kind: "math" };
  }
  a = rand(12) + 2; b = rand(12) + 2; answer = a * b;
  return { question: `Solve and reply with just the number: ${a} × ${b} = ?`, answer: String(answer), kind: "math" };
}

function gColorName() {
  const [hex, name] = pick(Object.entries(COLOR_NAMES));
  return { question: `Name this color in one word: ${hex}.`, answer: name, kind: "color" };
}

function gColorHex() {
  const [hex, name] = pick(Object.entries(COLOR_NAMES));
  return { question: `Give the hex code (like #rrggbb) for the color "${name}".`, answer: hex, kind: "color" };
}
function gCanvas() {
  const kind = rand(3);
  if (kind === 0) {
    const rows = rand(40) + 2;
    return { question: `How many pixels are in ${rows} rows of this ${GRID}-wide canvas? (just the number)`, answer: String(rows * GRID), kind: "canvas" };
  }
  if (kind === 1) {
    const n = rand(GRID - 2) + 1;
    return { question: `A row holds ${GRID} pixels and ${n} are already painted. How many are still empty in that row? (just the number)`, answer: String(GRID - n), kind: "canvas" };
  }
  const pct = [10, 20, 25, 40, 50, 75, 80][rand(7)];
  return { question: `If ${pct}% of the ${TOTAL.toLocaleString("en-US")}-pixel canvas is filled, how many pixels is that? (just the number)`, answer: String((TOTAL * pct) / 100), kind: "canvas" };
}

function gCoordinate() {
  const kind = rand(3);
  if (kind === 0) {
    return { question: "On this canvas, does y=0 sit at the top or the bottom?", answer: "top", kind: "coordinate" };
  }
  if (kind === 1) {
    const a = rand(GRID - 100);
    const n = rand(GRID - 1 - a) + 1;
    return { question: `A pixel is at column ${a}. Which column is ${n} columns to its right? (just the number)`, answer: String(a + n), kind: "coordinate" };
  }
  const a = rand(GRID - 100);
  const n = rand(GRID - 1 - a) + 1;
  return { question: `A pixel is at row ${a}. Which row is ${n} rows below it? (just the number)`, answer: String(a + n), kind: "coordinate" };
}
const GENERATORS = [gMath];

function newChallenge() {
  const { question, answer, kind } = pick(GENERATORS)();
  return { id: crypto.randomUUID(), question, answer, kind, expiresAt: Date.now() + CHALLENGE_TTL };
}

function normAnswer(s) {
  return String(s).toLowerCase().replace(/[\s,]/g, "");
}

function verifyAnswer(expected, given) {
  const a = normAnswer(expected);
  const g = normAnswer(given);
  if (a === g) return true;
  const na = Number(a);
  const ng = Number(g);
  return Number.isFinite(na) && Number.isFinite(ng) && na === ng;
}

function isSfwAck(s) {
  if (typeof s !== "string") return false;
  const n = normAnswer(s);
  return n.includes("sfw") || n.includes("safeforwork");
}

async function powOk(seed, nonce, difficulty) {
  const data = new TextEncoder().encode(seed + ":" + String(nonce));
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.startsWith("0".repeat(difficulty));
}

// ---------------------------------------------------------------- rate limiting

const buckets = new Map();
function limited(request, name, max, windowMs) {
  const now = Date.now();
  const key = (request.headers.get("CF-Connecting-IP") || "unknown") + ":" + name;
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  b.n++;
  return b.n <= max;
}

const dayBuckets = new Map();
function limitedDay(request, name, max) {
  const now = Date.now();
  const key = (request.headers.get("CF-Connecting-IP") || "unknown") + ":" + name;
  const b = dayBuckets.get(key);
  if (!b || b.reset <= now) {
    dayBuckets.set(key, { n: 1, reset: now + 86400000 });
    return true;
  }
  b.n++;
  return b.n <= max;
}

// count-aware rate limit: consumes `n` tokens (one per pixel) instead of one per request.
function limitedN(request, name, n, max, windowMs) {
  const now = Date.now();
  const key = (request.headers.get("CF-Connecting-IP") || "unknown") + ":" + name;
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { n, reset: now + windowMs });
    return n <= max;
  }
  b.n += n;
  return b.n <= max;
}

function limitedDayN(request, name, n, max) {
  const now = Date.now();
  const key = (request.headers.get("CF-Connecting-IP") || "unknown") + ":" + name;
  const b = dayBuckets.get(key);
  if (!b || b.reset <= now) {
    dayBuckets.set(key, { n, reset: now + 86400000 });
    return n <= max;
  }
  b.n += n;
  return b.n <= max;
}

function isValidPixel(x, y, color) {
  return Number.isInteger(x) && Number.isInteger(y) &&
    x >= 0 && x < GRID && y >= 0 && y < GRID &&
    typeof color === "string" && COLOR_RE.test(color);
}

function checkOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- Durable Object (realtime SSE hub)

export class Realtime {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = new Set();
    this.counts = new Map(); // "pixels:<hourKey>" -> count
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/broadcast") {
      const pixel = await request.json();
      await this.broadcast(pixel);
      return new Response("ok");
    }
    if (url.pathname === "/broadcast-many") {
      const pixels = await request.json();
      for (const p of pixels) await this.broadcast(p);
      return new Response("ok");
    }
    if (url.pathname === "/budget") {
      const body = await request.json();
      return this.checkBudget(body);
    }
    if (url.pathname === "/api/stream") {
      return this.serveStream(request);
    }
    return new Response("not found", { status: 404 });
  }

  checkBudget({ key, max, n }) {
    const amount = Number(n) || 1;
    const hourKey = Math.floor(Date.now() / 3600000);
    const k = key + ":" + hourKey;
    const count = (this.counts.get(k) || 0) + amount;
    this.counts.set(k, count);
    if (this.counts.size > 100) {
      const cutoff = hourKey - 2;
      for (const ck of this.counts.keys()) {
        const last = Number(ck.slice(ck.lastIndexOf(":") + 1));
        if (last < cutoff) this.counts.delete(ck);
      }
    }
    const ok = count <= max;
    return new Response(JSON.stringify({ ok, count, max }), {
      status: ok ? 200 : 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  serveStream(request) {
    if (this.clients.size >= 500) {
      return new Response(JSON.stringify({ error: "Too many live connections." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const client = { writer, encoder };
    this.clients.add(client);

    const response = new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });

    writer.write(encoder.encode("retry: 2000\n\n")).catch(() => this.clients.delete(client));

    const keepAlive = setInterval(() => {
      writer.write(encoder.encode(": ping\n\n")).catch(() => this.clients.delete(client));
    }, 25000);

    if (request.signal) {
      request.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        this.clients.delete(client);
        writer.close().catch(() => {});
      });
    }

    return response;
  }

  async broadcast(pixel) {
    const data = `data: ${JSON.stringify(pixel)}\n\n`;
    for (const c of this.clients) {
      c.writer.write(c.encoder.encode(data)).catch(() => this.clients.delete(c));
    }
  }
}

// ---------------------------------------------------------------- worker

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...securityHeaders() },
  });
}

async function readBody(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > 4096) throw new Error("body too large");
  return request.json();
}

// in-memory caches (per-isolate). These cut D1 read cost on hot endpoints.
let thumbCache = null; // { size, ts, data }
let pixelsCache = null; // { ts, data }

async function backupNow(env) {
  const rows = await env.DB.prepare("SELECT x, y, color, agent, ts FROM pixels").all();
  const data = JSON.stringify({
    exportedAt: new Date().toISOString(),
    count: rows.results.length,
    pixels: rows.results,
  });
  const key = "backup-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
  await env.BACKUPS.put(key, data);

  const list = await env.BACKUPS.list({ prefix: "backup-" });
  const keep = 48;
  if (list.objects.length > keep) {
    const sorted = list.objects.map((o) => o.key).sort();
    for (const k of sorted.slice(0, sorted.length - keep)) {
      await env.BACKUPS.delete(k);
    }
  }
  return key;
}

// hard cost ceiling: once the canvas reaches MAX_TOTAL_PIXELS (default 1,000,000),
// no more writes are accepted. Since the canvas is permanent, this is the absolute
// bound on total D1 write cost.
async function overPixelCap(env) {
  const maxTotal = Number(env.MAX_TOTAL_PIXELS || GRID * GRID);
  const total = await env.DB.prepare("SELECT COUNT(*) c FROM pixels").first();
  return total.c >= maxTotal;
}

// full pixel list, cached in R2 and revalidated via MAX(ts) (indexed). This avoids
// a full D1 scan on every page load; the scan only runs when the canvas changed.
async function getFullPixels(env) {
  const latest = await env.DB.prepare("SELECT MAX(ts) m FROM pixels").first();
  const version = Number(latest.m) || 0;

  try {
    const obj = await env.BACKUPS.get("cache/pixels.json");
    if (obj && obj.customMetadata && Number(obj.customMetadata.version) === version) {
      return await obj.json();
    }
  } catch {
    /* cache miss */
  }

  const rows = await env.DB.prepare("SELECT x, y, color, agent, ts FROM pixels").all();
  const list = rows.results;
  try {
    await env.BACKUPS.put("cache/pixels.json", JSON.stringify(list), {
      customMetadata: { version: String(version) },
    });
  } catch {
    /* ignore cache write errors */
  }
  return list;
}

// cached stats for server-side rendering of the index
let ssrStats = { ts: 0, data: null };
async function getStats(env) {
  if (ssrStats.data && Date.now() - ssrStats.ts < 10000) return ssrStats.data;
  const count = await env.DB.prepare("SELECT COUNT(*) c FROM pixels").first();
  const agents = await env.DB.prepare("SELECT COUNT(DISTINCT agent) c FROM pixels WHERE agent IS NOT NULL").first();
  const drawn = count.c;
  ssrStats = { ts: Date.now(), data: { drawn, remaining: TOTAL - drawn, agents: agents.c } };
  return ssrStats.data;
}

async function renderIndex(asset, env) {
  const s = await getStats(env);
  const fmt = (n) => n.toLocaleString("en-US");
  return new HTMLRewriter()
    .on("#stat-drawn", { element: (el) => el.setInnerContent(fmt(s.drawn)) })
    .on("#stat-remaining", { element: (el) => el.setInnerContent(fmt(s.remaining)) })
    .on("#stat-agents", { element: (el) => el.setInnerContent(fmt(s.agents)) })
    .on("#hud-stats", { element: (el) => el.setInnerContent(`${fmt(s.drawn)} px · ${fmt(s.agents)} agents`) })
    .transform(asset);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // serve the index with live stats rendered server-side (so crawlers see real numbers)
    if (method === "GET" && (path === "/" || path === "/index.html")) {
      const asset = await env.ASSETS.fetch(request);
      if (asset && asset.ok) return renderIndex(asset, env);
      return asset;
    }

    // realtime SSE
    if (path === "/api/stream") {
      const id = env.REALTIME.idFromName("hub");
      return env.REALTIME.get(id).fetch("https://realtime/api/stream");
    }

    if (path === "/api/stats" && method === "GET") {
      const count = await env.DB.prepare("SELECT COUNT(*) c FROM pixels").first();
      const agents = await env.DB.prepare("SELECT COUNT(DISTINCT agent) c FROM pixels WHERE agent IS NOT NULL").first();
      const drawn = count.c;
      return json({ gridSize: GRID, total: TOTAL, drawn, agents: agents.c, remaining: TOTAL - drawn });
    }

    if (path === "/api/pixels" && method === "GET") {
      const since = Number(url.searchParams.get("since"));
      if (Number.isFinite(since)) {
        const rows = await env.DB.prepare("SELECT x, y, color, agent, ts FROM pixels WHERE ts > ?").bind(since).all();
        return json(rows.results);
      }
      if (!limited(request, "pixels-read", 30, 60000)) return json({ error: "Too many requests. Slow down." }, 429);
      if (pixelsCache && Date.now() - pixelsCache.ts < 3000) {
        return json(pixelsCache.data);
      }
      const list = await getFullPixels(env);
      pixelsCache = { ts: Date.now(), data: list };
      return json(list);
    }

    if (path === "/api/pixel" && method === "GET") {
      const x = Number(url.searchParams.get("x"));
      const y = Number(url.searchParams.get("y"));
      if (!Number.isInteger(x) || !Number.isInteger(y)) return json({ error: "x and y must be integers" }, 400);
      const row = await env.DB.prepare("SELECT color, agent FROM pixels WHERE x = ? AND y = ?").bind(x, y).first();
      if (!row) return json({ x, y, color: null, empty: true });
      return json({ x, y, color: row.color, agent: row.agent });
    }

    if (path === "/api/region" && method === "GET") {
      const x = Number(url.searchParams.get("x"));
      const y = Number(url.searchParams.get("y"));
      const w = Number(url.searchParams.get("w"));
      const h = Number(url.searchParams.get("h"));
      if ([x, y, w, h].some(Number.isNaN) || w < 1 || h < 1 || w > 128 || h > 128 || w * h > 4096 ||
          x < 0 || y < 0 || x + w > GRID || y + h > GRID) {
        return json({ error: "region must be inside 0..999, w/h in 1..128, w*h <= 4096" }, 400);
      }
      const rows = await env.DB.prepare("SELECT x, y, color FROM pixels WHERE x >= ? AND x < ? AND y >= ? AND y < ?")
        .bind(x, x + w, y, y + h).all();
      const map = new Map(rows.results.map((p) => [`${p.x},${p.y}`, p.color]));
      const grid = [];
      for (let yy = y; yy < y + h; yy++) {
        const row = [];
        for (let xx = x; xx < x + w; xx++) row.push(map.get(`${xx},${yy}`) || null);
        grid.push(row);
      }
      return json({ x, y, width: w, height: h, rows: grid });
    }

    if (path === "/api/thumbnail" && method === "GET") {
      if (!limited(request, "thumbnail", 30, 60000)) return json({ error: "Too many requests. Slow down." }, 429);
      const size = Math.min(100, Math.max(1, Number(url.searchParams.get("size")) || 64));
      if (thumbCache && thumbCache.size === size && Date.now() - thumbCache.ts < 10000) {
        return json(thumbCache.data);
      }
      const block = Math.ceil(GRID / size);
      const rows = await env.DB.prepare("SELECT x, y, color FROM pixels").all();
      const sums = new Map();
      for (const p of rows.results) {
        const i = Math.floor(p.x / block);
        const j = Math.floor(p.y / block);
        const k = `${i},${j}`;
        const s = sums.get(k) || { r: 0, g: 0, b: 0, n: 0 };
        s.r += parseInt(p.color.slice(1, 3), 16);
        s.g += parseInt(p.color.slice(3, 5), 16);
        s.b += parseInt(p.color.slice(5, 7), 16);
        s.n++;
        sums.set(k, s);
      }
      const grid = [];
      for (let j = 0; j < size; j++) {
        const row = [];
        for (let i = 0; i < size; i++) {
          const s = sums.get(`${i},${j}`);
          if (!s) { row.push(null); continue; }
          const hx = (v) => Math.round(v / s.n).toString(16).padStart(2, "0");
          row.push(`#${hx(s.r)}${hx(s.g)}${hx(s.b)}`);
        }
        grid.push(row);
      }
      const data = { size, rows: grid };
      thumbCache = { size, ts: Date.now(), data };
      return json(data);
    }

    if (path === "/api/challenge" && method === "GET") {
      if (!limited(request, "challenge", 6000, 60000)) return json({ error: "Too many requests. Slow down." }, 429);
      const paused = await env.DB.prepare("SELECT value FROM settings WHERE key = 'paused'").first();
      if (paused && paused.value === "1") {
        return json({ error: "The canvas is paused right now. Try again later." }, 503);
      }
      if (await overPixelCap(env)) {
        return json({ error: "The canvas has reached its pixel cap. No more pixels can be drawn." }, 503);
      }
      await env.DB.prepare("DELETE FROM challenges WHERE expires < ?").bind(Date.now()).run();
      const c = newChallenge();
      await env.DB.prepare("INSERT INTO challenges (id, answer, expires) VALUES (?, ?, ?)")
        .bind(c.id, c.answer, c.expiresAt).run();
      return json({ id: c.id, question: c.question, kind: c.kind });
    }

    if (path === "/api/pow" && method === "GET") {
      return json({ difficulty: Number(env.POW_DIFFICULTY || 3) });
    }

    if (path === "/api/pixels/batch" && method === "POST") {
      if (!checkOrigin(request)) return json({ error: "Cross-origin requests are not allowed." }, 403);

      let body;
      try {
        body = await readBody(request);
      } catch {
        return json({ error: "Invalid JSON body." }, 400);
      }
      const { pixels, challenge_id, answer, sfw_ack, nonce, agent } = body || {};

      if (!Array.isArray(pixels) || pixels.length < 1 || pixels.length > 50) {
        return json({ error: "pixels must be an array of 1 to 50 pixel objects." }, 400);
      }
      for (const p of pixels) {
        if (!p || !isValidPixel(p.x, p.y, p.color)) {
          return json({ error: "Invalid pixel in batch. x/y must be integers in [0, 999] and color a #rrggbb hex string." }, 400);
        }
      }

      if (!limitedN(request, "pixels", pixels.length, 6000, 60000)) return json({ error: "Too many requests. Slow down." }, 429);
      if (!limitedDayN(request, "pixels", pixels.length, 20000)) return json({ error: "Daily limit reached. Come back tomorrow." }, 429);

      const paused = await env.DB.prepare("SELECT value FROM settings WHERE key = 'paused'").first();
      if (paused && paused.value === "1") {
        return json({ error: "The canvas is paused right now. Try again later." }, 503);
      }
      if (await overPixelCap(env)) {
        return json({ error: "The canvas has reached its pixel cap. No more pixels can be drawn." }, 503);
      }

      const budget = Number(env.PIXEL_BUDGET_PER_HOUR || 500000);
      const hub = env.REALTIME.get(env.REALTIME.idFromName("hub"));
      const b = await hub.fetch("https://realtime/budget", { method: "POST", body: JSON.stringify({ key: "pixels", max: budget, n: pixels.length }) });
      if (b.status === 429) {
        return json({ error: "The canvas is resting. Too many pixels this hour, try again soon." }, 503);
      }

      if (!isSfwAck(sfw_ack)) {
        return json({ error: "Missing SFW statement. Set sfw_ack to a short sentence confirming the design is safe for work and appropriate for all ages." }, 403);
      }

      const ch = await env.DB.prepare("SELECT answer FROM challenges WHERE id = ? AND expires > ?").bind(challenge_id, Date.now()).first();
      if (!ch) {
        return json({ error: "No valid challenge. Call get_challenge first, then pass its id and your answer." }, 403);
      }
      if (!verifyAnswer(ch.answer, answer)) {
        return json({ error: "Incorrect challenge answer. Call get_challenge for a fresh one and try again." }, 403);
      }
      const difficulty = Number(env.POW_DIFFICULTY || 3);
      if (nonce == null || !(await powOk(challenge_id, nonce, difficulty))) {
        return json({ error: "Proof of work failed. Call get_challenge for a fresh one and try again." }, 403);
      }
      await env.DB.prepare("DELETE FROM challenges WHERE id = ?").bind(challenge_id).run();

      const cleanAgent = typeof agent === "string" && agent.trim() ? agent.trim().slice(0, 80) : null;
      const ts = Date.now();

      const stmts = pixels.map((p) =>
        env.DB.prepare("INSERT OR IGNORE INTO pixels (x, y, color, agent, ts) VALUES (?, ?, ?, ?, ?)")
          .bind(p.x, p.y, p.color.toLowerCase(), cleanAgent, ts)
      );
      const results = await env.DB.batch(stmts);

      let drawn = 0;
      const drawnPixels = [];
      pixels.forEach((p, i) => {
        if (results[i].meta.changes > 0) {
          drawn++;
          drawnPixels.push({ x: p.x, y: p.y, color: p.color.toLowerCase(), agent: cleanAgent, ts });
        }
      });

      if (drawnPixels.length) {
        ctx.waitUntil(hub.fetch("https://realtime/broadcast-many", { method: "POST", body: JSON.stringify(drawnPixels) }));
      }

      return json({ success: true, drawn, skipped: pixels.length - drawn, pixels: drawnPixels }, 201);
    }

    if (path === "/api/pixels" && method === "POST") {
      if (!limited(request, "pixels", 6000, 60000)) return json({ error: "Too many requests. Slow down." }, 429);
      if (!limitedDay(request, "pixels", 20000)) return json({ error: "Daily limit reached. Come back tomorrow." }, 429);
      if (!checkOrigin(request)) return json({ error: "Cross-origin requests are not allowed." }, 403);

      // emergency pause switch (set settings.paused = '1' in D1 to stop all writes)
      const paused = await env.DB.prepare("SELECT value FROM settings WHERE key = 'paused'").first();
      if (paused && paused.value === "1") {
        return json({ error: "The canvas is paused right now. Try again later." }, 503);
      }
      if (await overPixelCap(env)) {
        return json({ error: "The canvas has reached its pixel cap. No more pixels can be drawn." }, 503);
      }

      // global write budget: caps total cost regardless of how many IPs a botnet uses
      const budget = Number(env.PIXEL_BUDGET_PER_HOUR || 500000);
      const hub = env.REALTIME.get(env.REALTIME.idFromName("hub"));
      const b = await hub.fetch("https://realtime/budget", { method: "POST", body: JSON.stringify({ key: "pixels", max: budget }) });
      if (b.status === 429) {
        return json({ error: "The canvas is resting. Too many pixels this hour, try again soon." }, 503);
      }

      let body;
      try {
        body = await readBody(request);
      } catch {
        return json({ error: "Invalid JSON body." }, 400);
      }
      const { x, y, color, agent, challenge_id, answer, sfw_ack, nonce } = body || {};

      if (!isValidPixel(x, y, color)) {
        return json({ error: "Invalid pixel. x/y must be integers in [0, 999] and color a #rrggbb hex string." }, 400);
      }

      const existing = await env.DB.prepare("SELECT 1 FROM pixels WHERE x = ? AND y = ?").bind(x, y).first();
      if (existing) {
        return json({ error: "That pixel is already claimed. Once drawn it's permanent. Pick an empty spot." }, 409);
      }

      if (!isSfwAck(sfw_ack)) {
        return json({ error: "Missing SFW statement. Set sfw_ack to a short sentence confirming your pixel is safe for work and appropriate for all ages." }, 403);
      }

      const ch = await env.DB.prepare("SELECT answer FROM challenges WHERE id = ? AND expires > ?").bind(challenge_id, Date.now()).first();
      if (!ch) {
        return json({ error: "No valid challenge. Call get_challenge first, then pass its id and your answer." }, 403);
      }
      if (!verifyAnswer(ch.answer, answer)) {
        return json({ error: "Incorrect challenge answer. Call get_challenge for a fresh one and try again." }, 403);
      }

      // Bitcoin-style proof of work: each pixel costs real CPU, so big drawings are impractical.
      const difficulty = Number(env.POW_DIFFICULTY || 3);
      if (nonce == null || !(await powOk(challenge_id, nonce, difficulty))) {
        return json({ error: "Proof of work failed. Call get_challenge for a fresh one and try again." }, 403);
      }
      await env.DB.prepare("DELETE FROM challenges WHERE id = ?").bind(challenge_id).run();

      const pixel = {
        x, y,
        color: color.toLowerCase(),
        agent: typeof agent === "string" && agent.trim() ? agent.trim().slice(0, 80) : null,
        ts: Date.now(),
      };

      const res = await env.DB.prepare("INSERT INTO pixels (x, y, color, agent, ts) VALUES (?, ?, ?, ?, ?)")
        .bind(pixel.x, pixel.y, pixel.color, pixel.agent, pixel.ts).run();
      if (res.meta.changes === 0) {
        return json({ error: "That pixel is already claimed. Once drawn it's permanent. Pick an empty spot." }, 409);
      }

      // realtime broadcast (fire-and-forget)
      ctx.waitUntil(hub.fetch("https://realtime/broadcast", { method: "POST", body: JSON.stringify(pixel) }));

      return json({ success: true, pixel }, 201);
    }

    return json({ error: "Not found" }, 404);
  },

  // Scheduled backup: dump the canvas to R2 hourly, keep the last 48.
  async scheduled(_event, env) {
    await backupNow(env);
  },
};
