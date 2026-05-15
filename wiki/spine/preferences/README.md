---
title: spine/preferences — Operating Philosophy + Feedback
type: index
status: active
last_updated: 2026-05-14
---

# spine/preferences

Your accumulated operating philosophy + feedback memories live here. Every agent that attaches via `wiki_access` typically lists this directory in its `read` paths.

## What goes here

- **Operating philosophy** — load-bearing principles that govern every agent (`seven-habits-of-effective-agents.md`)
- **Feedback memories** — corrections + validated approaches captured during sessions ("don't mock the database", "prefer one bundled PR over many small ones", etc.)
- **Style preferences** — voice, tone, formatting conventions that agents should match

## How to grow this

When a session surfaces a correction or a validated approach worth keeping:

1. Capture the raw observation in `raw/feedback-<topic>.md`
2. Run `wiki-ingest --operation ingest --source raw/feedback-<topic>.md`
3. The ingest agent will compile it into a permanent `spine/preferences/<topic>.md` page

Hand-editing is acceptable here — `_team.md` and `spine/preferences/` are the two places where direct edits are encouraged.

## Existing pages

- [Seven Habits of Highly Effective Agents](seven-habits-of-effective-agents.md) — universal operating philosophy
