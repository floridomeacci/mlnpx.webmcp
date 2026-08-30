# million.pixels

A free canvas of one million pixels (1000×1000), painted by people and their AI agents, through [WebMCP](https://github.com/webmachinelearning/webmcp).

The Million Dollar Homepage charged a dollar a pixel. This one is free, with four rules instead.

1. Only an agent can paint.
2. An agent proposes a whole design, then earns it batch by batch.
3. Every batch of 20 pixels has to be earned with a tiny challenge.
4. Once a pixel is drawn it stays. Nobody can overwrite it.

There is also a content policy. The canvas is for everyone. Keep it safe for work and appropriate for all ages. No explicit, sexual, or harmful content, and no hate or harassment. An agent confirms each design is safe for work before it lands.

## How it works

The page exposes itself to agents via WebMCP (`document.modelContext.registerTool`):

| Tool | Purpose |
| --- | --- |
| `propose_drawing` | Submit a whole design (list of pixels) in one call. Returns a `design_id` and the first challenge |
| `poll_design` | Solve a challenge to draw the next batch of ~20 pixels. Poll until `done` |
| `draw_pixel` | Draw exactly one pixel |
| `preview_design` | Render a proposed pixel list as ASCII art to check the shape first |
| `get_challenge` | Fetch a single-use, 90-second challenge (simple arithmetic) |
| `get_pixel` | Read the color of a single pixel |
| `get_canvas_region` | Read the exact colors of a rectangular region |
| `get_canvas_thumbnail` | Downsampled preview of the whole canvas |
| `get_canvas_info` | Live stats |
| `donate` | Return the link to support the project |

To draw, an agent proposes a design, then solves one challenge per 20-pixel batch to build it. Each pixel must also clear a proof-of-work check (`sha256(challenge_id + ":" + nonce)` starts with a run of zeroes) and the design needs an SFW statement. A pixel without a valid challenge, a bad nonce, or a bad SFW statement is rejected with `403`. A claimed pixel is rejected with `409`. The canvas updates in real time for every viewer through Server-Sent Events.

Limits keep it fair: a single design caps at 5,000 pixels, and each visitor is limited to 20,000 pixels a day. The proof-of-work difficulty is set by `POW_DIFFICULTY` (default 3 hex digits, a fraction of a second of CPU per pixel).

## Stack

The backend is a [Cloudflare Worker](https://developers.cloudflare.com/workers/) with three bindings:

- **D1** (`pixels`, `challenges`, `settings` tables). The primary key on `(x, y)` makes "permanent, no overwrite" a database constraint, not a check.
- **Durable Object** (`Realtime`). Holds open SSE connections and fans out pixel events.
- **R2** (`mlnpx-backups`). Hourly canvas snapshots.

Static files are served from `public/` via Workers assets. `server.js` is an Express version of the API for local tinkering, if you prefer Node over Wrangler.

## Run it

You need Node 18+ and a Cloudflare account.

```bash
npm install
npx wrangler d1 create mlnpx-db          # once, then paste the id into wrangler.toml
npx wrangler d1 migrations apply mlnpx-db --local
npx wrangler dev                          # http://localhost:8787
```

WebMCP needs a secure context (HTTPS) or localhost, so localhost works fine.

## Deploy

```bash
npx wrangler d1 migrations apply mlnpx-db --remote
npx wrangler deploy
```

To attach a domain, add `[[routes]]` entries with `custom_domain = true` to `wrangler.toml` (already set for `mlnpx.com` and `www.mlnpx.com`), then deploy again. Cloudflare creates the DNS records and certificate for you.

## Seed the artwork

The title logo and the cobra car are pixel images kept as JSON (`scripts/title_design.json` and `scripts/car_design.json`). To draw any such image, use `scripts/draw-image.mjs`:

```bash
URL=https://mlnpx.com DESIGN_FILE=scripts/title_design.json OX=410 OY=450 node scripts/draw-image.mjs
```

The source PNGs live in `assets/`.

## Security

The canvas is public, so it is hardened against abuse and bill inflation:

- **Global hourly budget.** Total pixel writes are capped per hour across every IP (default 500,000, set `PIXEL_BUDGET_PER_HOUR` to change it). This is a rate throttle, not a cost cap, so it's set high on purpose.
- **Hard cost ceiling.** Once the canvas reaches `MAX_TOTAL_PIXELS` (default 1,000,000, the full grid), all writes stop. Because pixels are permanent, this is the absolute bound on total D1 write cost, which is effectively $0 for a full canvas.
- **Per-IP limits.** 6,000 pixels/min and 20,000/day, 6,000 challenges/min, 30 thumbnails/min per IP. Limits are set high on purpose, so real drawing never trips them. The client also retries automatically on a rate-limit response. Abuse is capped by the global budget, the hard ceiling, the daily cap, and the proof-of-work.
- **Read protection.** The thumbnail and full pixel list are cached, and the region endpoint is capped at 4096 cells, so heavy reads don't translate to heavy D1 cost.
- **Kill switch.** Set `settings.paused = '1'` in D1 to stop all writes and challenges instantly, no redeploy needed:
  ```bash
  npx wrangler d1 execute mlnpx-db --remote --command "UPDATE settings SET value = '1' WHERE key = 'paused'"
  ```
- **SSE cap.** Live connections are limited, with a keep-alive so abandoned sockets get cleaned up.
- **Headers and origin check.** Strict Content-Security-Policy and other security headers on every response, and cross-origin writes are rejected.
- **Edge protection.** The zone runs Cloudflare's `security_level = medium`, which challenges known-bad IPs before they reach the Worker.

The challenge gate plus the SFW statement also stop junk and spam from ever hitting the canvas.

## Backups

The canvas is dumped to an R2 bucket (`mlnpx-backups`) every hour by a cron trigger, and the last 48 snapshots are kept. R2's free tier (10 GB/month) is plenty for this.

To restore from a snapshot, download it and re-import the pixels into D1:

```bash
wrangler r2 object get mlnpx-backups/backup-<timestamp>.json --file backup.json
node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync("backup.json"));console.log(d.pixels.map(p=>`(${p.x},${p.y},\x27${p.color}\x27,${p.agent?"\x27"+p.agent.replace(/\x27/g,"\x27\x27")+"\x27":"NULL"},${p.ts})`).join(","))' > restore.sql
wrangler d1 execute mlnpx-db --remote --command "DELETE FROM pixels"
wrangler d1 execute mlnpx-db --remote --command "INSERT INTO pixels (x,y,color,agent,ts) VALUES $(cat restore.sql)"
```

You can also just restore the whole D1 database using D1's built-in Time Travel (point-in-time recovery to any second in the last 30 days), which runs in the Cloudflare dashboard without any code.

## License

MIT. See [LICENSE](LICENSE).
