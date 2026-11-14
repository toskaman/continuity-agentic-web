# CONTINUITY design system

One visual language for the five independent sites of the ecosystem. Each site
is served from its own origin, so nothing is loaded cross-origin: the builder
copies a composed `styles.css`, `ui-kit.js` and the Inter font into every app.

```
node scripts/write_peer_styles.mjs          # rebuild all 5 sites
node scripts/write_peer_styles.mjs --check  # fail if a stylesheet drifted
```

| File | Role |
| --- | --- |
| `base.css` | Tokens (palette, type, space, radius, shadow), buttons, fields, cards, badges, notices, timeline/stepper, tables, tabs, Open Agentic runtime (`#agent-app`, `ns-*`) skin, review dialog, motion, responsive rules |
| `peer.css` | Layout shared by the four peers: hero, record card, choice cards, journey, activity log, developer card |
| `themes/*.css` | Per-site identity (accent colours and signature components) |
| `peer-ui-kit.js` | Presentation helpers. Wraps `page.render()` and re-reads `page.getState()`; never mutates business state |

## Identities

| Site | Personality | Accents |
| --- | --- | --- |
| CONTINUITY | Command center | Night blue · white · electric blue `#4263EB` · emerald |
| MoveCo Express | Human and practical | Deep blue `#2043C4` · warm orange `#F0661A` |
| PermitFlow Civic Prep | Institutional, reassuring | Civic blue `#1F4F8F` · soft green `#2E9D74` |
| HomeConnect Fiber | Premium telecom | Cyan `#0B6E8A` · navy · turquoise `#14B8A6` |
| PowerFlow Energy | Energy and trust | Deep green `#0E6B4D` · mint · navy |

## Rules

- Every status uses text or an icon as well as colour.
- `prefers-reduced-motion` disables all animation.
- Presentation code reads state; only the original `script.js` / runtime change it.
- Demo data is labelled as such on every site.

Font: Inter (SIL Open Font License 1.1, see `fonts/OFL.txt`).
