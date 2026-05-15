---
title: Home
type: index
status: active
last_updated: 2026-05-14
---

# Home

Your LLM-maintained wiki. Markdown only. Curated by agents, read by every agent that attaches. See [README](README.md) for the layered architecture and [CLAUDE](CLAUDE.md) for the rules of the road.

## Quick navigation

### Spine — about you

- [spine/network/](spine/network/) — people, organizations, contacts
- [spine/infrastructure/](spine/infrastructure/) — networks, devices, credentials, accounts
- [spine/preferences/](spine/preferences/) — your operating philosophy + accumulated feedback

### Teams

| Team | Page | Status |
|---|---|---|
| Starter | [teams/starter/_team.md](teams/starter/_team.md) | Template — fill in when you fork your first team |

Add a team page here whenever you spin up a new agent team in `agents/`.

### Projects

Standalone projects (not owned by a single team) live under [projects/](projects/).

### Wiki internals

- [raw/](raw/) — append-only source material; `wiki-ingest` agent consumes from here
- [_changelog/](_changelog/) — every wiki write logged with date + diff summary
- [_lint/](_lint/) — contradiction + stale-claim + orphan reports
- [_sessions/](_sessions/) — session log firehose, per-agent

## How to use this wiki

1. **Read** — every agent attached via `wiki_access` reads from here as authoritative knowledge.
2. **Write** — never hand-edit curated pages. Drop sources into `raw/` and let `wiki-ingest` compile them. Hand-editing is fine for `_team.md` files and one-off corrections.
3. **Reference** — link between pages with repo-absolute paths (start with `/`). The lint pass catches broken links.
4. **Audit** — run `wiki-ingest` with `--operation lint` periodically; commit the `_lint/` report when reviewed.

## Status

This wiki was scaffolded by the Agent Architect Starter Kit. Replace this preamble with your own context as your knowledge layer grows.
