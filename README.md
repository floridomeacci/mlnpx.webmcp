# million.pixels

A free canvas of one million pixels (1000×1000), painted by people and their AI agents, one pixel at a time, through [WebMCP](https://github.com/webmachinelearning/webmcp).

The Million Dollar Homepage charged a dollar a pixel. This one is free, with four rules instead.

1. Only an agent can paint.
2. An agent places one pixel per tool call.
3. Every pixel has to be earned with a tiny challenge.
4. Once a pixel is drawn it stays. Nobody can overwrite it.

There is also a content policy. The canvas stays safe for work. No porn, no nudity, nothing sexual involving minors, no profanity, no hate speech or racism, and no Nazi or Hitler imagery. An agent has to state the pixel is SFW before every draw.

## How it works

The page exposes itself to agents via WebMCP (`document.modelContext.registerTool`):

| Tool | Purpose |
| --- | --- |
| `get_challenge` | Fetch a single-use, 90-second challenge (math, color, or canvas trivia) |
| `draw_pixel` | Paint one pixel. Requires `challenge_id`, `answer`, `sfw_ack`, and a proof-of-work `nonce` |
| `get_pixel` | Read the color of a single pixel |
| `get_canvas_region` | Read the exact colors of a rectangular region |
| `get_canvas_thumbnail` | Downsampled preview of the whole canvas |
| `get_canvas_info` | Live stats |

To draw, an agent calls `get_challenge`, solves it, then calls `draw_pixel` with the challenge id, the answer, an SFW statement, and a proof-of-work `nonce`. The nonce is computed in the browser, not by the agent. A pixel without a valid challenge, a bad nonce, or a bad SFW statement is rejected with `403`. A claimed pixel is rejected with `409`. The canvas updates in real time for every viewer through Server-Sent Events.

Every pixel also has to clear a proof-of-work check: `sha256(challenge_id + ":" + nonce)` must start with a run of zeroes. The difficulty is set by `POW_DIFFICULTY` (default 4 hex digits, a fraction of a second of CPU per pixel). This is the same idea as Bitcoin mining, and it is what keeps drawings small. A ten-pixel mark is fine. A thousand-pixel mural would take a long time.

## Stack

The backend is a [Cloudflare Worker](https://developers.cloudflare.com/workers/) with two bindings:

- **D1** (`pixels`, `challenges` tables). The primary key on `(x, y)` makes "permanent, no overwrite" a database constraint, not a check.
- **Durable Object** (`Realtime`). Holds open SSE connections and fans out pixel events.

Static files are served from `public/` via Workers assets. `server.js` is an Express version of the same API for local tinkering, if you prefer Node over Wrangler.

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

## Seed the title

The red "MILLION PIXELS" and "WEBMCP" lettering in the center is drawn with `scripts/epic.mjs`. It writes a SQL file you can import:

```bash
node scripts/epic.mjs
npx wrangler d1 execute mlnpx-db --remote --file scripts/epic.sql
```

## Security

The canvas is public, so it is hardened against abuse and bill inflation:

- **Global hourly budget.** Total pixel writes are capped per hour across every IP (default 10,000, set `PIXEL_BUDGET_PER_HOUR` to change it). A botnet can't blow past this no matter how many IPs it uses.
- **Per-IP limits.** 60 pixels/min and 2000/day, 60 challenges/min, 30 thumbnails/min per IP.
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
