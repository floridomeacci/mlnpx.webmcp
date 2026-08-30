import express from "express";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const GRID_SIZE = 1000;

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "pixels.json");

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// key "x,y" -> { x, y, color, agent, ts }
let pixels = new Map();

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    const arr = JSON.parse(readFileSync(DATA_FILE, "utf8"));
    pixels = new Map(arr.map((p) => [`${p.x},${p.y}`, p]));
    console.log(`Loaded ${pixels.size} pixels`);
  } catch (err) {
    console.error("Failed to load pixels:", err);
  }
}

let dirty = false;
let saveTimer = null;

function persist() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const arr = Array.from(pixels.values());
  const tmp = DATA_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(arr));
  renameSync(tmp, DATA_FILE);
}

function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty) return;
    dirty = false;
    persist();
  }, 1500);
}

function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (dirty) {
    dirty = false;
    persist();
  }
}

process.on("SIGINT", () => {
  flush();
  process.exit(0);
});
process.on("SIGTERM", () => {
  flush();
  process.exit(0);
});

function isValidPixel(x, y, color) {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < GRID_SIZE &&
    y >= 0 &&
    y < GRID_SIZE &&
    typeof color === "string" &&
    COLOR_RE.test(color)
  );
}

// ---------------------------------------------------------------- challenges
// Every pixel must be "earned" through a small, fun challenge so agents can't
// blindly flood the canvas in a loop. Each challenge is single-use and expires.

const CHALLENGE_TTL = 90_000;
const challenges = new Map(); // id -> { id, question, answer, kind, expiresAt, used }

const COLOR_NAMES = {
  "#ff0000": "red",
  "#00ff00": "lime",
  "#0000ff": "blue",
  "#ffff00": "yellow",
  "#ff00ff": "magenta",
  "#00ffff": "cyan",
  "#ffffff": "white",
  "#000000": "black",
  "#ffa500": "orange",
  "#800080": "purple",
  "#ffc0cb": "pink",
  "#808080": "gray",
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
    a = rand(90) + 10;
    b = rand(90) + 10;
    answer = a + b;
    return { question: `Solve and reply with just the number: ${a} + ${b} = ?`, answer: String(answer), kind: "math" };
  }
  if (op === "-") {
    a = rand(90) + 20;
    b = rand(a - 1) + 1;
    answer = a - b;
    return { question: `Solve and reply with just the number: ${a} - ${b} = ?`, answer: String(answer), kind: "math" };
  }
  a = rand(12) + 2;
  b = rand(12) + 2;
  answer = a * b;
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
    return { question: `How many pixels are in ${rows} rows of this ${GRID_SIZE}-wide canvas? (just the number)`, answer: String(rows * GRID_SIZE), kind: "canvas" };
  }
  if (kind === 1) {
    const n = rand(GRID_SIZE - 2) + 1;
    return { question: `A row holds ${GRID_SIZE} pixels and ${n} are already painted. How many are still empty in that row? (just the number)`, answer: String(GRID_SIZE - n), kind: "canvas" };
  }
  const pct = [10, 20, 25, 40, 50, 75, 80][rand(7)];
  return { question: `If ${pct}% of the ${(GRID_SIZE * GRID_SIZE).toLocaleString("en-US")}-pixel canvas is filled, how many pixels is that? (just the number)`, answer: String((GRID_SIZE * GRID_SIZE * pct) / 100), kind: "canvas" };
}

function gCoordinate() {
  const kind = rand(3);
  if (kind === 0) {
    return { question: "On this canvas, does y=0 sit at the top or the bottom?", answer: "top", kind: "coordinate" };
  }
  if (kind === 1) {
    const a = rand(GRID_SIZE - 100);
    const n = rand(GRID_SIZE - 1 - a) + 1;
    return { question: `A pixel is at column ${a}. Which column is ${n} columns to its right? (just the number)`, answer: String(a + n), kind: "coordinate" };
  }
  const a = rand(GRID_SIZE - 100);
  const n = rand(GRID_SIZE - 1 - a) + 1;
  return { question: `A pixel is at row ${a}. Which row is ${n} rows below it? (just the number)`, answer: String(a + n), kind: "coordinate" };
}

const GENERATORS = [gMath];

function pruneChallenges() {
  const now = Date.now();
  for (const [id, c] of challenges) {
    if (c.expiresAt < now) challenges.delete(id);
  }
}

function newChallenge() {
  pruneChallenges();
  const gen = pick(GENERATORS);
  const { question, answer, kind } = gen();
  const id = randomUUID();
  const record = { id, question, answer, kind, expiresAt: Date.now() + CHALLENGE_TTL, used: false };
  challenges.set(id, record);
  return record;
}

function normAnswer(s) {
  return String(s).toLowerCase().replace(/[\s,]/g, "");
}

function verifyAnswer(record, given) {
  const a = normAnswer(record.answer);
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

const POW_DIFFICULTY = Number(process.env.POW_DIFFICULTY || 3);

async function powOk(seed, nonce, difficulty) {
  const data = new TextEncoder().encode(seed + ":" + String(nonce));
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.startsWith("0".repeat(difficulty));
}

// Seeding/ops bypass: set BYPASS_TOKEN and send "Authorization: Bearer <token>".
const BYPASS = process.env.BYPASS_TOKEN;
function challengeRequired(req) {
  if (!BYPASS) return true;
  return req.get("Authorization") !== "Bearer " + BYPASS;
}

load();

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

// security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; " +
      "base-uri 'none'; form-action 'self'"
  );
  next();
});

app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------- rate limiting

const rateBuckets = new Map();
function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    const key = (req.ip || "unknown") + ":" + name;
    const b = rateBuckets.get(key);
    if (!b || b.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    b.count++;
    if (b.count > max) {
      return res.status(429).json({ error: "Too many requests. Slow down." });
    }
    next();
  };
}

// reject cross-origin writes (CSRF defense)
function checkOrigin(req, res, next) {
  const origin = req.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("Host")) {
        return res.status(403).json({ error: "Cross-origin requests are not allowed." });
      }
    } catch {
      return res.status(403).json({ error: "Invalid origin." });
    }
  }
  next();
}

// ---------------------------------------------------------------- realtime
const sseClients = new Set();

app.get("/api/stream", (req, res) => {
  if (sseClients.size >= 1000) {
    return res.status(503).json({ error: "Too many live connections." });
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("retry: 2000\n\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

function broadcast(pixel) {
  const data = `data: ${JSON.stringify(pixel)}\n\n`;
  for (const c of sseClients) {
    c.write(data);
  }
}

app.get("/api/stats", (_req, res) => {
  const agents = new Set();
  for (const p of pixels.values()) {
    if (p.agent) agents.add(p.agent);
  }
  res.json({
    gridSize: GRID_SIZE,
    total: GRID_SIZE * GRID_SIZE,
    drawn: pixels.size,
    agents: agents.size,
    remaining: GRID_SIZE * GRID_SIZE - pixels.size,
  });
});

app.get("/api/pixels", (req, res) => {
  const since = Number(req.query.since);
  const all = Array.from(pixels.values());
  if (Number.isFinite(since)) {
    return res.json(all.filter((p) => p.ts > since));
  }
  res.json(all);
});

app.get("/api/pixel", (req, res) => {
  const x = Number(req.query.x);
  const y = Number(req.query.y);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return res.status(400).json({ error: "x and y must be integers" });
  }
  const pixel = pixels.get(`${x},${y}`);
  res.json(pixel || { x, y, color: null, empty: true });
});

function intParam(v, def) {
  const n = Number(v);
  return Number.isInteger(n) ? n : def;
}

app.get("/api/region", (req, res) => {
  const x = intParam(req.query.x, NaN);
  const y = intParam(req.query.y, NaN);
  const w = intParam(req.query.w, NaN);
  const h = intParam(req.query.h, NaN);
  if (
    [x, y, w, h].some(Number.isNaN) ||
    w < 1 || h < 1 || w > 128 || h > 128 || w * h > 4096 ||
    x < 0 || y < 0 || x + w > GRID_SIZE || y + h > GRID_SIZE
  ) {
    return res.status(400).json({
      error: "region must be inside 0..999, w/h in 1..128, and w*h <= 4096",
    });
  }
  const rows = [];
  for (let yy = y; yy < y + h; yy++) {
    const row = [];
    for (let xx = x; xx < x + w; xx++) {
      const p = pixels.get(`${xx},${yy}`);
      row.push(p ? p.color : null);
    }
    rows.push(row);
  }
  res.json({ x, y, width: w, height: h, rows });
});

app.get("/api/thumbnail", (req, res) => {
  const size = Math.min(100, Math.max(1, intParam(req.query.size, 64)));
  const block = Math.ceil(GRID_SIZE / size);
  const sums = new Map();
  for (const p of pixels.values()) {
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
  const rows = [];
  for (let j = 0; j < size; j++) {
    const row = [];
    for (let i = 0; i < size; i++) {
      const s = sums.get(`${i},${j}`);
      if (!s) {
        row.push(null);
        continue;
      }
      const hx = (v) => Math.round(v / s.n).toString(16).padStart(2, "0");
      row.push(`#${hx(s.r)}${hx(s.g)}${hx(s.b)}`);
    }
    rows.push(row);
  }
  res.json({ size, rows });
});

app.get("/api/challenge", rateLimit("challenge", 600, 60000), (_req, res) => {
  const c = newChallenge();
  res.json({ id: c.id, question: c.question, kind: c.kind });
});

app.get("/api/pow", (_req, res) => {
  res.json({ difficulty: POW_DIFFICULTY });
});

app.post("/api/pixels", rateLimit("pixels", 600, 60000), checkOrigin, async (req, res) => {
  const { x, y, color, agent, challenge_id, answer, sfw_ack, nonce } = req.body ?? {};
  if (!isValidPixel(x, y, color)) {
    return res.status(400).json({
      error: "Invalid pixel. x/y must be integers in [0, 999] and color a #rrggbb hex string.",
    });
  }

  const key = `${x},${y}`;
  if (pixels.has(key)) {
    return res.status(409).json({
      error: "That pixel is already claimed. Once drawn it's permanent. Pick an empty spot.",
    });
  }

  if (!isSfwAck(sfw_ack)) {
    return res.status(403).json({
      error: "Missing SFW statement. Set sfw_ack to a short sentence confirming your pixel is safe for work and appropriate for all ages.",
    });
  }

  if (challengeRequired(req)) {
    const c = challenges.get(challenge_id);
    if (!c || c.used || c.expiresAt < Date.now()) {
      challenges.delete(challenge_id);
      return res.status(403).json({
        error: "No valid challenge. Call get_challenge first, then pass its id and your answer.",
      });
    }
    if (!verifyAnswer(c, answer)) {
      challenges.delete(challenge_id);
      return res.status(403).json({
        error: "Incorrect challenge answer. Call get_challenge for a fresh one and try again.",
      });
    }
    if (nonce == null || !(await powOk(challenge_id, nonce, POW_DIFFICULTY))) {
      return res.status(403).json({
        error: "Proof of work failed. Call get_challenge for a fresh one and try again.",
      });
    }
    c.used = true;
  }

  const pixel = {
    x,
    y,
    color: color.toLowerCase(),
    agent: typeof agent === "string" && agent.trim() ? agent.trim().slice(0, 80) : null,
    ts: Date.now(),
  };

  pixels.set(key, pixel);
  scheduleSave();
  broadcast(pixel);

  res.status(201).json({ success: true, pixel });
});

app.listen(PORT, () => {
  console.log(`Million Pixels running at http://localhost:${PORT}`);
  console.log(`Grid: ${GRID_SIZE}x${GRID_SIZE} = ${GRID_SIZE * GRID_SIZE} pixels`);
});
