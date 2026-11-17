# Inviting another team's Open Agentic Website into CONTINUITY

**Why:** the strongest possible proof for the challenge theme is CONTINUITY coordinating a site **we did not build**. One external site in the mesh turns "an open agentic web" from a claim into a fact.

## Message (paste in the challenge community channel, a Devpost project comment or a GitHub issue on their repo)

> Hi! We built **CONTINUITY** for the Open Agentic Web Challenge — an open agentic website that re-plans a life change across *other* agentic websites (live: https://toskaman.github.io/continuity-agentic-web/?demo=1).
>
> We'd love to show your site as a real, independent partner in our network. All we need is your public `agent-manifest.json` URL. In return:
> - a free **9-point MVP 0.2 conformance report** of your site (our Builder Kit, zero backend — also exports SARIF for your CI): https://toskaman.github.io/continuity-agentic-web/community-kit.html
> - your site credited in our demo, README and video, with a link;
> - nothing changes on your side: we only call your published network after the visitor consents, and we send no personal data.
>
> If you'd like it to work both ways, your assistant can also consult ours (`https://toskaman.github.io/continuity-agentic-web/continuity_coordinator`). Happy to help with either direction!

## What we do when someone says yes (≈1 h)
1. Run their manifest through the Builder Kit 9-point audit; send them the report.
2. Add their network URL to the coordinator's partner tools (`apps/continuity-web/continuity_coordinator.hocon`, `peer_network_specialist.tools`) and their origin to `allowed_peers`; `npm run build:networks`.
3. Add one line to the demo copy: which booking/service their site covers (e.g. a restaurant reservation moved with the date).
4. Run `npm test`, deploy, record a 5-second clip of their site answering inside CONTINUITY for the video.

## Where to find candidates
The challenge's Devpost project gallery and its community channels; search GitHub for `agent-manifest.json` + `open-agentic-web`. Prefer sites whose service has a date or a booking (events, restaurants, travel, health, deliveries).
