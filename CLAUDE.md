# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Wiki First (load-bearing)

This repo ships with a **wiki knowledge layer** at `wiki/`. It is the authoritative source for:
- About you: people, networks, infrastructure, accumulated preferences (`wiki/spine/`)
- Team norms: each team's `_team.md` page (`wiki/teams/<team>/_team.md`)
- Project state: standalone projects (`wiki/projects/<slug>/`) and team-owned ones (`wiki/teams/<team>/<project>/`)
- Universal operating philosophy: `wiki/spine/preferences/seven-habits-of-effective-agents.md`

**Before answering a substantive question, check the wiki.** Every agent's `config.json` declares a `wiki_access` block with prefix-scoped read paths and `always_load` pages inlined into its prompt. Do not invent wiki pages that don't exist; verify with `ls wiki/<path>` or by reading the file.

Sole writer: only the **Wiki Ingest** agent writes to the wiki. Drop source material into `wiki/raw/` and invoke `wiki-ingest` to compile it. Hand-editing is acceptable for `_team.md` files, `spine/preferences/`, and one-off corrections — everything else flows through ingest.

The `WIKI_REPO` env var must resolve to the wiki root (typically `$(pwd)/wiki`). If unset, agents can't read; set it before running anything: `export WIKI_REPO="$(pwd)/wiki"`.

## Smart Routing

When the user starts a conversation without invoking a specific agent or team, route to the appropriate orchestrator. Do NOT bypass the orchestrator by calling specialist agents directly.

### Routing Table

| Topic Signals | Invoke Skill |
|---|---|
| Setup, onboarding, connect MCP, install server, first run, bootstrap wiki | `Skill(skill: "starter")` → Setup Concierge |
| Research, look up, find information, search | `Skill(skill: "starter")` → Researcher |
| Write, draft, report, proposal, memo, email | `Skill(skill: "starter")` → Writer |
| Ingest, curate, lint wiki, promote briefing to permanent page | `Skill(skill: "starter")` → Wiki Ingest |
| Build agent, create team, manage agents, new specialist | `Skill(skill: "architect")` |

### Routing Rules

1. Match keywords in the user's request to select a team
2. If ambiguous, ask which team they want
3. If clearly about agent/team management, use the Architect
4. **ALWAYS invoke the team orchestrator** — never call specialist subagents directly
5. The only exception is when the user explicitly invokes a specialist skill by name

## Getting Started

On your first run, say:

> /starter help me get set up

The Setup Concierge will walk you through (a) the wiki layer (set `WIKI_REPO`, read the conventions, seed your first spine entry) and (b) connecting Gmail (or another service) end-to-end. Once both are done, you have a curated knowledge layer and real tool access — the floor under everything else.

## Agent Management

To create or manage agents, load the Architect with `/architect`. Archie will guide you through:
1. Discovering what you need
2. Designing the agent or team
3. Writing the SKILL.md and config.json (including the `wiki_access` block)
4. Syncing to Claude Code native format

Do not directly create agents or teams without the Architect's guidance.

## Architecture

See `README.md` for the full overview. Key points:

- `agents/<agent-id>/` — source of truth for agent definitions
- `teams/<team-id>/` — source of truth for team definitions
- `wiki/` — the knowledge layer every agent reads from (set `WIKI_REPO` to point here)
- `.claude/agents/` and `.claude/skills/` — **generated**, do not edit directly
- Run `scripts/generate-agents.js` after any change to regenerate (inlines `always_load` wiki pages into each agent's system prompt)

## Commands

- `/architect` — load Archie to design new agents or teams
- `/starter` — invoke the Starter Team (Setup Concierge, Researcher, Writer, Wiki Ingest)
- `/sync-agents` or `node scripts/generate-agents.js` — regenerate Claude Code native files
- `node scripts/run-agent.js wiki-ingest --operation <ingest|lint|query-as-write> ...` — run wiki maintenance from the terminal (no LLM-in-the-loop required for the routine path)
