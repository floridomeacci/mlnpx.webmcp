const GRID = 1000;

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

function clampView() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cw = GRID * view.scale;
  const ch = GRID * view.scale;
  if (cw >= w) {
    view.ox = Math.min(0, Math.max(w - cw, view.ox));
  } else {
    view.ox = (w - cw) / 2;
  }
  if (ch >= h) {
    view.oy = Math.min(0, Math.max(h - ch, view.oy));
  } else {
    view.oy = (h - ch) / 2;
  }
}

function render() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  clampView();
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

let powDifficulty = 3;

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

async function postPixel(x, y, color, agent, challengeId, answer, sfwAck) {
  const nonce = await computePow(challengeId);
  const body = JSON.stringify({ x, y, color, agent, challenge_id: challengeId, answer, sfw_ack: sfwAck, nonce });
  let res;
  let data;
  for (let attempt = 0; attempt < 8; attempt++) {
    res = await fetch("/api/pixels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    data = await res.json();
    if (res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  if (res.status === 409) return null; // already claimed
  if (!res.ok) {
    throw new Error(data.error || "Failed to draw pixel");
  }
  applyPixel(data.pixel);
  commit();
  loadStats();
  return data.pixel;
}

// a proposed design is held in memory across tool calls so the agent can
// submit it once and then poll it to completion by solving challenges.
const BATCH_SIZE = 20;
const MAX_DESIGN_PIXELS = 5000; // hard cap on a single drawing
const DESIGN_TTL_MS = 10 * 60 * 1000; // unfinished designs expire after 10 minutes

let pendingDesign = null;
let designCounter = 0;

async function fetchChallenge() {
  return (await (await fetch("/api/challenge")).json());
}

async function submitBatch(d, challengeId, answer) {
  const batch = d.pixels.slice(d.index, d.index + BATCH_SIZE);
  if (!batch.length) return null;
  const nonce = await computePow(challengeId);
  const res = await fetch("/api/pixels/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pixels: batch, challenge_id: challengeId, answer, sfw_ack: d.sfwAck, nonce, agent: d.agent }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to draw batch");
  for (const p of data.pixels || []) applyPixel(p);
  commit();
  loadStats();
  return data;
}

// ---------------------------------------------------------------- WebMCP

async function registerWebMCPTools() {
  if (!document.modelContext) return false;

  try {
    await document.modelContext.registerTool({
      name: "get_challenge",
      title: "Get a challenge",
      description:
        "Fetch a fresh challenge you must solve before you may draw. It returns an id and a simple math question. Solve the question, then pass its id and your answer to draw_pixel or poll_design. Each challenge is single-use and expires in 90 seconds.",
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
        "Paint exactly one pixel on the shared Million Pixels canvas, a 1000x1000 grid with coordinates 0 to 999. This tool draws exactly one pixel at (x, y) in the given color. Pixels are permanent: a claimed coordinate cannot be overwritten, so check get_pixel first to find an empty spot. Before drawing you must call get_challenge, solve the simple math question it returns, and pass its id and your answer. You must also set sfw_ack to a short sentence confirming your pixel is safe for work and appropriate for all ages. LIMITS: keep designs small; the daily limit is 20000 pixels per visitor. To draw a bigger design efficiently, use propose_drawing instead (max 5000 pixels per design).",
      inputSchema: {
        type: "object",
        properties: {
          x: {
            type: "number",
            description: "Column index, integer from 0 (left) to 999 (right)",
          },
          y: {
            type: "number",
            description: "Row index, integer from 0 (top) to 999 (bottom)",
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
          const p = await postPixel(x, y, color, agent, challenge_id, answer, sfw_ack);
          if (!p) {
            return { success: false, error: "That pixel is already claimed. Pick an empty spot." };
          }
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
          x: { type: "number", description: "Column index 0-999" },
          y: { type: "number", description: "Row index 0-999" },
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
          x: { type: "number", description: "Left column (0-999)" },
          y: { type: "number", description: "Top row (0-999)" },
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

    await document.modelContext.registerTool({
      name: "donate",
      title: "Support the project",
      description:
        "Return the link where a user can support this project. If the user is enjoying the canvas and wants to buy a coffee or donate, share this link with them.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        return {
          url: "https://buymeacoffee.com/floridomeacci",
          message:
            "This project is free and open source. If you would like to support it, you can buy a coffee at https://buymeacoffee.com/floridomeacci",
        };
      },
      annotations: { readOnlyHint: true },
    });

    await document.modelContext.registerTool({
      name: "preview_design",
      title: "Preview a design",
      description:
        "Render a proposed set of pixels as ASCII art so you can check the shape before committing it. Pass a list of pixels (x, y, hex color). Filled cells are #, empty cells are a dot.",
      inputSchema: {
        type: "object",
        properties: {
          pixels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                x: { type: "number" },
                y: { type: "number" },
                color: { type: "string" },
              },
              required: ["x", "y"],
            },
          },
        },
        required: ["pixels"],
      },
      execute: async ({ pixels }) => {
        const pts = (pixels || []).map((p) => [Number(p.x), Number(p.y)]);
        if (!pts.length) return { error: "No pixels provided." };
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const set = new Set(pts.map(([x, y]) => `${x},${y}`));
        const lines = [];
        for (let y = minY; y <= maxY; y++) {
          let line = "";
          for (let x = minX; x <= maxX; x++) line += set.has(`${x},${y}`) ? "#" : ".";
          lines.push(line);
        }
        return { width: maxX - minX + 1, height: maxY - minY + 1, art: lines.join("\n") };
      },
      annotations: { readOnlyHint: true },
    });

    await document.modelContext.registerTool({
      name: "propose_drawing",
      title: "Propose a drawing",
      description:
        "Submit a whole design in a single call. Pass a list of pixels (x, y, hex color) and an sfw_ack confirming the design is safe for work and appropriate for all ages. LIMITS: a design can be at most 5000 pixels (this call fails with an error if you exceed it), and each visitor is limited to 20000 pixels per day. Every 20 pixels requires one solved challenge, so a batch of 20 takes a second or two; keep designs small, tens or a few hundred pixels. The pixels are drawn in order, line by line from top to bottom. Returns a design_id and the first challenge; keep polling with poll_design and solving each challenge until done.",
      inputSchema: {
        type: "object",
        properties: {
          pixels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                x: { type: "number" },
                y: { type: "number" },
                color: { type: "string" },
              },
              required: ["x", "y", "color"],
            },
          },
          sfw_ack: {
            type: "string",
            description: "Confirm the whole design is safe for work and appropriate for all ages",
          },
          agent: { type: "string", description: "Optional name to credit" },
        },
        required: ["pixels", "sfw_ack"],
      },
      execute: async ({ pixels, sfw_ack, agent }) => {
        const sorted = [...(pixels || [])].sort((a, b) => a.y - b.y || a.x - b.x);
        if (!sorted.length) return { success: false, error: "No pixels provided." };
        if (sorted.length > MAX_DESIGN_PIXELS) {
          return { success: false, error: `This design is ${sorted.length} pixels, but the maximum is ${MAX_DESIGN_PIXELS}. Make it smaller and try again.` };
        }
        designCounter++;
        const c = await fetchChallenge();
        pendingDesign = {
          id: designCounter,
          pixels: sorted,
          index: 0,
          drawn: 0,
          skipped: 0,
          sfwAck: sfw_ack,
          agent: agent || null,
          challenge: { id: c.id, question: c.question },
          expiresAt: Date.now() + DESIGN_TTL_MS,
        };
        return {
          success: true,
          design_id: designCounter,
          total: sorted.length,
          totalChallenges: Math.ceil(sorted.length / BATCH_SIZE),
          message: "Design proposed. Poll it with poll_design and solve each challenge to build it. Unfinished designs expire after 10 minutes.",
          challenge: { id: c.id, question: c.question },
        };
      },
      annotations: { readOnlyHint: false },
    });

    await document.modelContext.registerTool({
      name: "poll_design",
      title: "Poll a design",
      description:
        "Poll a proposed design by its design_id. If you pass the challenge_id and answer of the challenge you just solved, the next batch of pixels is drawn and you get the next challenge. If you pass nothing, you get the current challenge again. Keep polling and solving until it returns done: true.",
      inputSchema: {
        type: "object",
        properties: {
          design_id: { type: "number", description: "The id returned by propose_drawing" },
          challenge_id: { type: "string", description: "The id of the challenge you solved (optional on first poll)" },
          answer: { type: "string", description: "Your answer to the challenge question" },
        },
        required: ["design_id"],
      },
      execute: async ({ design_id, challenge_id, answer }) => {
        if (!pendingDesign || pendingDesign.id !== design_id) {
          return { success: false, error: "No active design with that id. Call propose_drawing first." };
        }
        const d = pendingDesign;

        if (Date.now() > d.expiresAt) {
          pendingDesign = null;
          return { success: false, error: "This design expired. Propose it again." };
        }

        // just polling, no answer yet
        if (challenge_id == null && answer == null) {
          return {
            success: true,
            done: false,
            drawn: d.drawn,
            skipped: d.skipped,
            total: d.pixels.length,
            challenge: d.challenge,
          };
        }

        if (challenge_id !== d.challenge.id) {
          return { success: false, error: "That challenge is not the current one for this design. Poll again to get the current challenge." };
        }

        let result;
        try {
          result = await submitBatch(d, challenge_id, answer);
        } catch (err) {
          return { success: false, error: err.message, drawn: d.drawn, skipped: d.skipped, total: d.pixels.length };
        }

        d.drawn += result.drawn;
        d.skipped += result.skipped;
        d.index += Math.min(BATCH_SIZE, d.pixels.length - d.index);

        if (d.index >= d.pixels.length) {
          pendingDesign = null;
          return {
            success: true,
            done: true,
            drawn: d.drawn,
            skipped: d.skipped,
            total: d.pixels.length,
            message: "Design complete.",
          };
        }

        const c = await fetchChallenge();
        d.challenge = { id: c.id, question: c.question };
        d.expiresAt = Date.now() + DESIGN_TTL_MS;

        return {
          success: true,
          done: false,
          drawn: d.drawn,
          skipped: d.skipped,
          total: d.pixels.length,
          challenge: d.challenge,
        };
      },
      annotations: { readOnlyHint: false },
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

// touch: one finger pans, two fingers pinch-zoom
let touchList = [];
let pinchDist = 0;

canvas.addEventListener("touchstart", (evt) => {
  evt.preventDefault();
  needsFit = false;
  touchList = [...evt.touches];
  if (touchList.length === 1) {
    dragging = true;
    lastX = touchList[0].clientX;
    lastY = touchList[0].clientY;
    document.body.classList.add("dragging");
  } else if (touchList.length === 2) {
    dragging = false;
    document.body.classList.remove("dragging");
    pinchDist = Math.hypot(touchList[0].clientX - touchList[1].clientX, touchList[0].clientY - touchList[1].clientY);
  }
}, { passive: false });

canvas.addEventListener("touchmove", (evt) => {
  evt.preventDefault();
  touchList = [...evt.touches];
  if (touchList.length === 1 && dragging) {
    view.ox += touchList[0].clientX - lastX;
    view.oy += touchList[0].clientY - lastY;
    lastX = touchList[0].clientX;
    lastY = touchList[0].clientY;
    hideHint();
    render();
  } else if (touchList.length === 2) {
    const d = Math.hypot(touchList[0].clientX - touchList[1].clientX, touchList[0].clientY - touchList[1].clientY);
    if (pinchDist > 0) {
      const cx = (touchList[0].clientX + touchList[1].clientX) / 2;
      const cy = (touchList[0].clientY + touchList[1].clientY) / 2;
      const newScale = Math.min(64, Math.max(minScale(), view.scale * (d / pinchDist)));
      view.ox = cx - ((cx - view.ox) / view.scale) * newScale;
      view.oy = cy - ((cy - view.oy) / view.scale) * newScale;
      view.scale = newScale;
      hideHint();
      render();
    }
    pinchDist = d;
  }
}, { passive: false });

canvas.addEventListener("touchend", (evt) => {
  touchList = [...evt.touches];
  if (touchList.length <= 1) {
    dragging = false;
    document.body.classList.remove("dragging");
    pinchDist = 0;
  }
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
  "You are painting the Million Pixels canvas. First, open (browse to) https://mlnpx.com so its " +
  "WebMCP tools load, then draw something small on it. Four rules. " +
  "One, pixels are permanent, so use `get_pixel` or `get_canvas_region` to find an empty spot first. " +
  "Two, every pixel has to be earned: call `get_challenge`, solve the simple math question, " +
  "then pass the challenge id and your answer when you draw. " +
  "Three, keep it appropriate for all ages, and confirm each design is safe for work with an sfw_ack. " +
  "Four, keep it small. For a tiny mark of a few dozen pixels use `draw_pixel` one at a time. " +
  "For anything bigger, use `propose_drawing` to submit the whole design once, then `poll_design` " +
  "solving one challenge per 20 pixels until it is done. A design can be at most 5000 pixels, and " +
  "each visitor is limited to 20000 pixels per day. Start by calling `get_canvas_info` to see the " +
  "canvas, then paint something small: a shape, a letter, a flag. " +
  "If the drawing tools (propose_drawing, poll_design, draw_pixel) do not appear after you browse " +
  "to the page, WebMCP is not enabled in your current browser. Only then, tell the user to open the " +
  "page in Chrome with chrome://flags/#enable-webmcp-testing enabled, or in ChatGPT's in-app " +
  "browser, and ask again.";

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

  // register the WebMCP tools first, before any network work, so the agent
  // sees them the instant the page loads.
  const enabled = await registerWebMCPTools();
  if (!enabled) {
    console.warn("WebMCP not available. Open in ChatGPT's in-app browser or Chrome with the flag enabled.");
  }

  try {
    const p = await (await fetch("/api/pow")).json();
    if (Number.isInteger(p.difficulty)) powDifficulty = p.difficulty;
  } catch {
    /* keep default */
  }
  await loadPixels();
  await loadStats();
  fit();

  connectStream();
  setInterval(loadStats, 10000);
}

boot();
