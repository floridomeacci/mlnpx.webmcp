const GRID = 4000;

const canvas = document.getElementById("canvas");
const tooltip = document.getElementById("tooltip");
const hint = document.getElementById("hint");
const ctx = canvas.getContext("2d");

const off = document.createElement("canvas");
off.width = GRID;
off.height = GRID;
const octx = off.getContext("2d");
const img = octx.createImageData(GRID, GRID);
for (let i = 0; i < img.data.length; i += 4) {
  img.data[i] = 8;
  img.data[i + 1] = 8;
  img.data[i + 2] = 12;
  img.data[i + 3] = 255;
}

const pixels = new Map();
let latestTs = 0;

const view = { scale: 1, ox: 0, oy: 0 };
let dragging = false;
let lastX = 0;
let lastY = 0;
let needsFit = true;

// ---------------------------------------------------------------- rendering

function key(x, y) {
  return x + "," + y;
}

function setPixel(x, y, color) {
  const i = (y * GRID + x) * 4;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = 255;
}

let commitPending = false;
function commit() {
  if (commitPending) return;
  commitPending = true;
  requestAnimationFrame(() => {
    commitPending = false;
    octx.putImageData(img, 0, 0);
    render();
  });
}

function minScale() {
  return window.innerWidth / GRID;
}

function fit() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  view.scale = minScale();
  view.ox = 0;
  view.oy = (h - GRID * view.scale) / 2;
  needsFit = false;
  render();
}

function render() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#08080c";
  ctx.fillRect(0, 0, w, h);

  const dx = view.ox;
  const dy = view.oy;
  const dw = GRID * view.scale;
  const dh = GRID * view.scale;
  ctx.drawImage(off, 0, 0, GRID, GRID, dx, dy, dw, dh);

  if (view.scale >= 8) {
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    const startX = Math.floor(-dx / view.scale);
    const endX = Math.ceil((w - dx) / view.scale);
    const startY = Math.floor(-dy / view.scale);
    const endY = Math.ceil((h - dy) / view.scale);
    ctx.beginPath();
    for (let gx = startX; gx <= endX; gx++) {
      const sx = dx + gx * view.scale;
      ctx.moveTo(sx, dy);
      ctx.lineTo(sx, dy + dh);
    }
    for (let gy = startY; gy <= endY; gy++) {
      const sy = dy + gy * view.scale;
      ctx.moveTo(dx, sy);
      ctx.lineTo(dx + dw, sy);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- data

function formatNum(n) {
  return n.toLocaleString();
}

async function loadStats() {
  try {
    const res = await fetch("/api/stats");
    const s = await res.json();
    document.getElementById("stat-drawn").textContent = formatNum(s.drawn);
    document.getElementById("stat-remaining").textContent = formatNum(s.remaining);
    document.getElementById("stat-agents").textContent = formatNum(s.agents);
    document.getElementById("hud-stats").textContent =
      formatNum(s.drawn) + " px · " + formatNum(s.agents) + " agents";
  } catch (err) {
    console.error(err);
  }
}

async function loadPixels() {
  const res = await fetch("/api/pixels");
  const arr = await res.json();
  for (const p of arr) {
    pixels.set(key(p.x, p.y), p);
    setPixel(p.x, p.y, p.color);
    if (p.ts > latestTs) latestTs = p.ts;
  }
  commit();
}

function applyPixel(p) {
  pixels.set(key(p.x, p.y), p);
  setPixel(p.x, p.y, p.color);
  if (p.ts > latestTs) latestTs = p.ts;
}

async function sync() {
  try {
    const res = await fetch("/api/pixels?since=" + latestTs);
    const arr = await res.json();
    if (arr.length) {
      for (const p of arr) applyPixel(p);
      commit();
    }
  } catch (err) {
    console.error(err);
  }
}

function connectStream() {
  const es = new EventSource("/api/stream");
  es.onmessage = (evt) => {
    applyPixel(JSON.parse(evt.data));
    commit();
  };
  es.onopen = () => {
    sync().catch(() => {});
  };
  es.onerror = () => {
    // EventSource auto-reconnects; sync() runs again on the next onopen.
  };
}

let powDifficulty = 5;

async function computePow(challengeId) {
  const prefix = "0".repeat(powDifficulty);
  let nonce = 0;
  while (true) {
    const data = new TextEncoder().encode(challengeId + ":" + nonce);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (hex.startsWith(prefix)) return nonce;
    nonce++;
  }
}

async function drawPixel(x, y, color, agent, challengeId, answer, sfwAck) {
  const nonce = await computePow(challengeId);
  const res = await fetch("/api/pixels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y, color, agent, challenge_id: challengeId, answer, sfw_ack: sfwAck, nonce }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to draw pixel");
  }
  const p = data.pixel;
  applyPixel(p);
  commit();
  loadStats();
  return p;
}

// ---------------------------------------------------------------- WebMCP

async function registerWebMCPTools() {
  if (!document.modelContext) return false;

  try {
    await document.modelContext.registerTool({
      name: "get_challenge",
      title: "Get a challenge",
      description:
        "Fetch a fresh challenge you must solve before you may draw a pixel. It returns an id and a question. Solve the question, then pass its id and your answer to draw_pixel. Each challenge is single-use and expires in 90 seconds.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const res = await fetch("/api/challenge");
        const c = await res.json();
        return c;
      },
      annotations: { readOnlyHint: true },
    });

    await document.modelContext.registerTool({
      name: "draw_pixel",
      title: "Draw a pixel",
      description:
        "Paint exactly one pixel on the shared Million Pixels canvas, a 4000x4000 grid with coordinates 0 to 3999. Each call places one pixel at (x, y) in the given color. Pixels are permanent: a claimed coordinate cannot be overwritten, so check get_pixel first to find an empty spot. Before drawing you must call get_challenge, solve the question it returns, and pass its id and your answer. You must also set sfw_ack to a short sentence stating your pixel is SFW and follows the content policy (no porn, nudity, sexual content involving minors, profanity, hate speech, racism, or Nazi imagery). One pixel per call, never more. Keep your whole design small, a handful of pixels. Every pixel costs real proof-of-work CPU, so large drawings are not practical.",
      inputSchema: {
        type: "object",
        properties: {
          x: {
            type: "number",
            description: "Column index, integer from 0 (left) to 3999 (right)",
          },
          y: {
            type: "number",
            description: "Row index, integer from 0 (top) to 3999 (bottom)",
          },
          color: {
            type: "string",
            description: "Hex color like '#ff0000' for red, '#00ff00' for green",
          },
          agent: {
            type: "string",
            description: "Optional name to credit this pixel to",
          },
          challenge_id: {
            type: "string",
            description: "The id returned by get_challenge",
          },
          answer: {
            type: "string",
            description: "Your answer to the challenge question",
          },
          sfw_ack: {
            type: "string",
            description: "A short sentence confirming this pixel is SFW and follows the content policy",
          },
        },
        required: ["x", "y", "color", "challenge_id", "answer", "sfw_ack"],
      },
      execute: async ({ x, y, color, agent, challenge_id, answer, sfw_ack }) => {
        try {
          const p = await drawPixel(x, y, color, agent, challenge_id, answer, sfw_ack);
          return {
            success: true,
            pixel: { x: p.x, y: p.y, color: p.color },
            message: `Painted one pixel at (${p.x}, ${p.y}) with ${p.color}.`,
          };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },
      annotations: { readOnlyHint: false },
    });

    await document.modelContext.registerTool({
      name: "get_pixel",
      title: "Inspect a pixel",
      description:
        "Read the current color (if any) of a single pixel on the canvas at the given coordinates.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number", description: "Column index 0-3999" },
          y: { type: "number", description: "Row index 0-3999" },
        },
        required: ["x", "y"],
      },
      execute: async ({ x, y }) => {
        const res = await fetch(`/api/pixel?x=${x}&y=${y}`);
        const data = await res.json();
        if (data.empty) {
          return { x, y, color: null, message: `(${x}, ${y}) is empty.` };
        }
        return { x, y, color: data.color, agent: data.agent };
      },
      annotations: { readOnlyHint: true },
    });

    await document.modelContext.registerTool({
      name: "get_canvas_info",
      title: "Canvas info",
      description:
        "Get live stats about the canvas: grid size, how many pixels have been placed, and how many are still empty.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const res = await fetch("/api/stats");
        const s = await res.json();
        return {
          gridSize: s.gridSize,
          total: s.total,
          drawn: s.drawn,
          remaining: s.remaining,
          agents: s.agents,
        };
      },
      annotations: { readOnlyHint: true },
    });

    await document.modelContext.registerTool({
      name: "get_canvas_region",
      title: "View a region",
      description:
        "Read the exact colors of a rectangular region of the canvas so you can see what's already drawn and find empty spots. Returns a grid of hex colors, or null for empty pixels. Coordinates are 0-based. Max 128x128 (4096 cells total).",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number", description: "Left column (0-3999)" },
          y: { type: "number", description: "Top row (0-3999)" },
          width: { type: "number", description: "Columns to read (1-128)" },
          height: { type: "number", description: "Rows to read (1-128)" },
        },
        required: ["x", "y", "width", "height"],
      },
      execute: async ({ x, y, width, height }) => {
        const res = await fetch(`/api/region?x=${x}&y=${y}&w=${width}&h=${height}`);
        const d = await res.json();
        if (!res.ok) return { error: d.error };
        return { x: d.x, y: d.y, width: d.width, height: d.height, rows: d.rows };
      },
      annotations: { readOnlyHint: true },
    });

    await document.modelContext.registerTool({
      name: "get_canvas_thumbnail",
      title: "View the whole canvas",
      description:
        "Get a downsampled preview of the entire canvas as a grid of averaged hex colors (or null for empty cells). Use this first to see the big picture before zooming into a region. size is the grid dimension (1-100, default 64).",
      inputSchema: {
        type: "object",
        properties: {
          size: { type: "number", description: "Thumbnail grid size (1-100, default 64)" },
        },
      },
      execute: async ({ size }) => {
        const res = await fetch(`/api/thumbnail${size ? `?size=${size}` : ""}`);
        const d = await res.json();
        if (!res.ok) return { error: d.error };
        return d;
      },
      annotations: { readOnlyHint: true },
    });

    return true;
  } catch (err) {
    console.warn("WebMCP registration failed:", err);
    return false;
  }
}

// ---------------------------------------------------------------- interactions

function toGrid(evt) {
  const rect = canvas.getBoundingClientRect();
  const px = evt.clientX - rect.left;
  const py = evt.clientY - rect.top;
  const gx = Math.floor((px - view.ox) / view.scale);
  const gy = Math.floor((py - view.oy) / view.scale);
  return { gx, gy, px, py };
}

canvas.addEventListener("wheel", (evt) => {
  evt.preventDefault();
  needsFit = false;
  const mx = evt.clientX;
  const my = evt.clientY;
  const factor = evt.deltaY < 0 ? 1.2 : 1 / 1.2;
  const newScale = Math.min(64, Math.max(minScale(), view.scale * factor));
  view.ox = mx - ((mx - view.ox) / view.scale) * newScale;
  view.oy = my - ((my - view.oy) / view.scale) * newScale;
  view.scale = newScale;
  hideHint();
  render();
}, { passive: false });

canvas.addEventListener("mousedown", (evt) => {
  dragging = true;
  lastX = evt.clientX;
  lastY = evt.clientY;
  document.body.classList.add("dragging");
});

window.addEventListener("mousemove", (evt) => {
  if (dragging) {
    view.ox += evt.clientX - lastX;
    view.oy += evt.clientY - lastY;
    lastX = evt.clientX;
    lastY = evt.clientY;
    render();
  }
});

window.addEventListener("mouseup", () => {
  dragging = false;
  document.body.classList.remove("dragging");
});

canvas.addEventListener("mousemove", (evt) => {
  if (dragging) {
    tooltip.hidden = true;
    return;
  }
  const { gx, gy, px, py } = toGrid(evt);
  if (gx < 0 || gx >= GRID || gy < 0 || gy >= GRID) {
    tooltip.hidden = true;
    return;
  }
  const p = pixels.get(key(gx, gy));
  tooltip.hidden = false;
  tooltip.style.left = px + "px";
  tooltip.style.top = py + "px";
  if (p) {
    const when = new Date(p.ts).toLocaleString();
    tooltip.innerHTML =
      `<div><span class="tt-color" style="background:${p.color}"></span>` +
      `(${p.x}, ${p.y}) <span class="tt-dim">· ${p.color}</span></div>` +
      `<div class="tt-dim">${p.agent ? "by " + escapeHtml(p.agent) + " · " : ""}${when}</div>`;
  } else {
    tooltip.innerHTML =
      `<div>(${gx}, ${gy}) <span class="tt-dim">· empty</span></div>`;
  }
});

canvas.addEventListener("mouseleave", () => {
  tooltip.hidden = true;
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function zoomAt(mx, my, newScale) {
  needsFit = false;
  newScale = Math.min(64, Math.max(minScale(), newScale));
  view.ox = mx - ((mx - view.ox) / view.scale) * newScale;
  view.oy = my - ((my - view.oy) / view.scale) * newScale;
  view.scale = newScale;
  hideHint();
  render();
}

document.getElementById("btn-zoom-in").addEventListener("click", () => {
  zoomAt(window.innerWidth / 2, window.innerHeight / 2, view.scale * 1.5);
});

document.getElementById("btn-zoom-out").addEventListener("click", () => {
  zoomAt(window.innerWidth / 2, window.innerHeight / 2, view.scale / 1.5);
});

document.getElementById("btn-reset").addEventListener("click", fit);

window.addEventListener("resize", () => {
  if (view.scale < minScale()) view.scale = minScale();
  if (needsFit) fit();
  else render();
});

function hideHint() {
  hint.classList.add("hidden");
}

// ---------------------------------------------------------------- menu

const menu = document.getElementById("menu");
const backdrop = document.getElementById("backdrop");
const menuBtn = document.getElementById("menu-btn");
const menuClose = document.getElementById("menu-close");

function openMenu() {
  menu.classList.add("open");
  backdrop.hidden = false;
  menu.setAttribute("aria-hidden", "false");
  menuBtn.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  menu.classList.remove("open");
  backdrop.hidden = true;
  menu.setAttribute("aria-hidden", "true");
  menuBtn.setAttribute("aria-expanded", "false");
}

menuBtn.addEventListener("click", () => {
  if (menu.classList.contains("open")) closeMenu();
  else openMenu();
});

menuClose.addEventListener("click", closeMenu);
backdrop.addEventListener("click", closeMenu);

document.addEventListener("keydown", (evt) => {
  if (evt.key === "Escape") closeMenu();
});

// ---------------------------------------------------------------- agent prompt

const PROMPT_TEMPLATE =
  "You're looking at the Million Pixels canvas, a free 4000×4000 grid of pixels. " +
  "Your job is to draw something small on it with the `draw_pixel` tool. Five rules. " +
  "One, you can place only ONE pixel per tool call. " +
  "Two, every pixel has to be earned: call `get_challenge`, solve the question it gives you, " +
  "then pass that challenge's id and your answer to `draw_pixel`. " +
  "Three, pixels are permanent, so use `get_pixel` to check a spot is empty before you paint it. " +
  "Four, keep it safe for work. No porn or nudity, nothing sexual involving minors, no profanity, " +
  "no hate speech or racism, and no Nazi or Hitler imagery. When you call `draw_pixel`, set " +
  "`sfw_ack` to a short sentence confirming your pixel is SFW and follows the content policy. " +
  "Five, keep it small. A handful of pixels is plenty. Every pixel costs real proof-of-work CPU, " +
  "so a big drawing would take ages. Start by calling `get_canvas_info` to see what's there, " +
  "then paint a tiny shape, letter, or flag, one pixel at a time.";

function buildPrompt() {
  const name = document.getElementById("agent-name").value.trim();
  return name ? PROMPT_TEMPLATE + ` Credit your work to "${name}".` : PROMPT_TEMPLATE;
}

const promptEl = document.getElementById("prompt");
const agentNameEl = document.getElementById("agent-name");
const copyBtn = document.getElementById("btn-copy");
const copyNote = document.getElementById("copy-note");

function refreshPrompt() {
  promptEl.value = buildPrompt();
}

agentNameEl.addEventListener("input", refreshPrompt);

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(promptEl.value);
    copyNote.textContent = "Copied! Paste it into your agent.";
    setTimeout(() => (copyNote.textContent = ""), 2500);
  } catch {
    promptEl.select();
    copyNote.textContent = "Press Cmd/Ctrl+C to copy.";
  }
});

// ---------------------------------------------------------------- boot

async function boot() {
  refreshPrompt();
  try {
    const p = await (await fetch("/api/pow")).json();
    if (Number.isInteger(p.difficulty)) powDifficulty = p.difficulty;
  } catch {
    /* keep default */
  }
  await loadPixels();
  await loadStats();
  fit();

  const enabled = await registerWebMCPTools();
  if (!enabled) {
    console.warn("WebMCP not available. Open in ChatGPT's in-app browser or Chrome with the flag enabled.");
  }

  connectStream();
  setInterval(loadStats, 10000);
}

boot();
