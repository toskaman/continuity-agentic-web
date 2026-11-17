# Give each provider its own origin (5 sites → 5 origins)

**Today:** CONTINUITY is on `toskaman.github.io`; the four providers are separate repositories under one GitHub user, so they share the host `gpaschercher-sudo.github.io` (cross-origin from the coordinator, same origin as each other). All our copy says this honestly ("loaded cross-origin", "5 separately deployed websites").

**Why change it:** with one origin per company, the browser itself isolates every provider (storage, cookies, `postMessage` sources). The claim "each company runs its own website" becomes literally true and visible in every address bar — a strong point for the *Idea* and *Technology* criteria.

## Option A — four free GitHub organisations (recommended, 15 min, free)
1. Signed in as `gpaschercher-sudo`, create four free organisations (github.com → *Your organizations* → *New organization* → *Free*), for example: `moveco-express-demo`, `permitflow-civic-demo`, `homeconnect-fiber-demo`, `powerflow-energy-demo`.
2. In each organisation create a public repository named `<org>.github.io` (e.g. `moveco-express-demo.github.io`). GitHub serves it at `https://moveco-express-demo.github.io/` — its own origin.
3. Tell Claude the four names. Claude then updates `scripts/deploy_public_github.mjs` (peer → repo map) and `scripts/configure_origins.mjs`, redeploys the four sites, rebuilds the coordinator network (`tools`, `allowed_peers`, links), runs the 117 tests and the live 9-point audit, and updates README/Devpost/video copy.

## Option B — Cloudflare Pages (free, 20 min)
Create four Pages projects (`moveco-agentic-peer.pages.dev`, …) connected to the four existing repositories; the configure script already documents this mode (`--moveco https://moveco-agentic-peer.pages.dev …`).

## Rollback
Keep the old `gpaschercher-sudo.github.io/<peer>` repositories online until the new origins pass the live audit.
