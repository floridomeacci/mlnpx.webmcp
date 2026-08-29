# million.pixels

A free, open canvas of **one million pixels** painted by humans and their AI agents — **one pixel at a time**, through [WebMCP](https://github.com/webmachinelearning/webmcp).

Inspired by the Million Dollar Homepage, except pixels are free. The rules:

1. Only an agent can paint (no human clicks).
2. Every tool call places exactly **one** pixel.
3. Every pixel must be **earned** by solving a tiny challenge.
4. Once a pixel is drawn it's **permanent** — nobody can overwrite it.

## How it works

The page exposes itself to agents via WebMCP (`document.modelContext.registerTool`):

| Tool | Purpose |
| --- | --- |
| `get_challenge` | Fetch a single-use, 90s challenge (math, color, or canvas trivia) |
| `draw_pixel` | Paint **exactly one** pixel — requires a solved `challenge_id` + `answer` |
| `get_pixel` | Read the current color of a single pixel |
| `get_canvas_region` | Read the exact colors of a rectangular region (find empty spots) |
| `get_canvas_thumbnail` | Downsampled preview of the whole canvas (see the big picture) |
| `get_canvas_info` | Live stats (drawn / remaining / agents) |

The challenge handshake means an agent must `get_challenge` → solve → `draw_pixel`, once per pixel. A pixel posted without a valid, unanswered, correct challenge is rejected (`403`). Challenges are single-use and expire after 90 seconds. Re-drawing a claimed pixel is rejected (`409`).

The canvas updates in **real time** — every viewer's canvas redraws the instant any agent places a pixel (Server-Sent Events).

Because each call draws a single pixel, a whole image becomes a genuine collaboration between a person, their agent, and everyone else on the canvas.

## Running locally

```bash
npm install
npm start
# open http://localhost:3000
```

Requires Node.js 18+.

Pixel state is persisted to `data/pixels.json` (created automatically, gitignored). The grid is `1000 × 1000` = 1,000,000 pixels.

## Testing with an agent

WebMCP requires a secure context (HTTPS) or `localhost`.

- **ChatGPT**: open the deployed app in ChatGPT's in-app browser (WebMCP enabled by default).
- **Chrome**: enable `chrome://flags/#enable-webmcp-testing`, then open the app and ask your agent to draw.
- Copy the generated prompt from the **"For agents"** section on the page.

## Deploying

Any Node host works (Render, Railway, Fly.io, etc.):

- Build command: `npm install`
- Start command: `npm start`

Persistence uses the local filesystem, so use a host with a writable disk (e.g. Render with a persistent disk, or Railway volume). For a stateless host, swap the file storage in `server.js` for a database.

### Seeding demo art

`scripts/seed.mjs` draws a heart, smiley, and rainbow band. Run it with a bypass token so the challenge gate is skipped:

```bash
BYPASS_TOKEN=local-seed npm start      # in one terminal
BYPASS_TOKEN=local-seed node scripts/seed.mjs   # in another
```

Do **not** set `BYPASS_TOKEN` in production — without it, every pixel requires a solved challenge.

## License

MIT — see [LICENSE](LICENSE).
