---
title: Starter — Team
type: team
status: active
last_updated: 2026-05-14
---

# Starter Team

## Mission

The Starter Team is the first team a new Agent Architect user meets. It demonstrates the orchestrator → specialist pattern with a minimal but useful capability set: onboarding (Setup Concierge), web research (Researcher), and prose synthesis (Writer).

Replace this team with your own once you've cloned the starter and want to build your real workflow.

## Roster

| Role | Agent | Notes |
|---|---|---|
| Onboarding | [setup-concierge](../../../agents/setup-concierge/) | Walks new users through their first MCP setup |
| Research | [researcher](../../../agents/researcher/) | Web search + structured briefings |
| Writing | [writer](../../../agents/writer/) | Turns briefings into polished prose |

## Working norms

- **Orchestrator first** — never call specialists directly; `/starter` routes
- **Briefings, not raw data** — specialists hand off via structured-summary, not transcript dumps
- **Wiki sessions** — every specialist appends a session log under `_sessions/<agent-id>/`

## Active projects

None yet — this is the template. Add your first project page in `teams/starter/<project>/` (or rename `starter/` to your real team).

## Recurring obligations

- Run `wiki-ingest --operation lint` periodically to catch drift
- Promote useful session findings to permanent spine pages via `wiki-ingest`

## Cross-references

- [Seven Habits of Effective Agents](/spine/preferences/seven-habits-of-effective-agents.md)
- [Wiki conventions](/CLAUDE.md)
