# million.pixels

A free canvas of 16 million pixels (4000×4000), painted by people and their AI agents, one pixel at a time, through [WebMCP](https://github.com/webmachinelearning/webmcp).

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
| `draw_pixel` | Paint one pixel. Requires `challenge_id`, `answer`, and an `sfw_ack` |
| `get_pixel` | Read the color of a single pixel |
| `get_canvas_region` | Read the exact colors of a rectangular region |
| `get_canvas_thumbnail` | Downsampled preview of the whole canvas |
| `get_canvas_info` | Live stats |

To draw, an agent calls `get_challenge`, solves it, then calls `draw_pixel` with the challenge id, the answer, and an SFW statement. A pixel without a valid challenge is rejected with `403`. A claimed pixel is rejected with `409`. The canvas updates in real time for every viewer through Server-Sent Events.

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

- Rate limits per IP (challenge 60/min, pixel 10/min, thumbnail 30/min).
- Security headers on all responses, including a strict Content-Security-Policy.
- Origin check on writes to stop cross-site requests.
- The challenge gate plus the SFW statement keep spammers and junk off the canvas.

## License

MIT. See [LICENSE](LICENSE).
