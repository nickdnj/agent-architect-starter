# Agent Architect Starter

> *"Every great team starts with a blueprint."*

Welcome. You've cloned a starter kit for **Agent Architect** — a master AI agent that designs, builds, and orchestrates teams of specialized AI agents inside Claude Code.

This starter is intentionally minimal. It ships with:
- **Archie** — the Agent Architect himself, who helps you design new agents and teams
- **Starter Team** — one example team showing how specialists collaborate:
  - **Setup Concierge** — walks you through bootstrapping the wiki and connecting your first MCP server (Gmail by default)
  - **Researcher** — web research specialist
  - **Writer** — turns research into polished documents
  - **Wiki Ingest** — sole writer to the wiki knowledge layer; compiles raw source material into curated pages
- **Wiki knowledge layer** — a Karpathy-style ([gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)) LLM-maintained markdown wiki seeded at `wiki/`. Replaces the older `MEMORY.md` + `context_buckets` pattern. Every agent reads from here at startup.

From here, you're meant to add your own teams. That's the whole point.

---

## Quickstart

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Point at the bundled wiki:**
   ```bash
   export WIKI_REPO="$(pwd)/wiki"
   # add this to your shell rc to persist
   ```
   All starter agents resolve `wiki_access.repo_root` from this env var. Without it, they can't read the knowledge layer.

3. **Generate Claude Code native agent files:**
   ```bash
   node scripts/generate-agents.js
   ```

4. **Open this directory in Claude Code:**
   ```bash
   claude .
   ```

5. **Say hello to the Setup Concierge:**
   > /starter help me get set up

   The concierge will walk you through (a) the wiki layout + seeding your first spine entry, then (b) connecting Gmail (or another service) end-to-end.

6. **Or start designing your own team:**
   > /architect build me a team for [your use case]

---

## What's in the box

```
.
├── Architect/              # Archie — the meta-agent that designs other agents
├── agents/                 # Agent definitions (starts with 4 example agents)
│   ├── _templates/         # Templates for creating new agents
│   ├── setup-concierge/
│   ├── researcher/
│   ├── writer/
│   └── wiki-ingest/        # Sole writer to the wiki knowledge layer
├── teams/                  # Team definitions (starts with 1 example team)
│   └── starter/
├── wiki/                   # LLM-maintained markdown knowledge base (set WIKI_REPO to point here)
│   ├── Home.md             # Landing index
│   ├── CLAUDE.md           # Conventions agents follow when reading/writing the wiki
│   ├── README.md           # Human-facing overview of the layered model
│   ├── _templates/         # Page, person, team, daily templates
│   ├── spine/              # About you: network, infrastructure, preferences
│   ├── teams/              # Per-team pages and session logs
│   ├── projects/           # Standalone projects
│   ├── raw/                # Append-only intake; wiki-ingest consumes from here
│   ├── _changelog/         # Every wiki write logged with date
│   └── _lint/              # Contradiction + stale-claim + orphan reports
├── context-buckets/        # Optional RAG buckets for ephemeral working memory (coexists with wiki)
├── scripts/                # Generators that sync sources → Claude Code native files
├── mcp-servers/            # MCP server configuration scaffolding
├── docs/                   # Architecture documentation
└── registry/               # Indexes of agents, teams, and context buckets
```

## Core Concepts

| Concept | Description |
|---|---|
| **Agent** | Individual AI assistant defined by `SKILL.md` + `config.json` |
| **Team** | Collection of agents that collaborate through an orchestrator |
| **Wiki** | LLM-maintained markdown knowledge layer; agents attach via `wiki_access` in their config |
| **Raw** | Append-only intake folder under `wiki/raw/`; `wiki-ingest` compiles into curated pages |
| **Context Bucket** | Optional RAG / FTS bucket for ephemeral working memory (coexists with wiki) |
| **MCP Server** | External tool integration (Gmail, Drive, GitHub, etc.) |

## Agent Architect Pattern

```
agents/<agent-id>/              (SOURCE OF TRUTH — edit these)
├── SKILL.md                    → Behavioral instructions
└── config.json                 → Rich metadata

        ↓ generate (via scripts/generate-agents.js)

.claude/agents/<agent-id>.md    (GENERATED — native Claude Code format)
.claude/skills/<agent-id>/      (GENERATED — forked skill for specialists)
.claude/skills/<team-id>/       (GENERATED — orchestrator skill for teams)
```

**Never edit generated files** — they're regenerated every time you run `/sync-agents`.

## Next Steps

1. Set `WIKI_REPO` and seed your first spine entry (the Setup Concierge walks you through this)
2. Connect an MCP server (the Setup Concierge handles this too)
3. Try the Researcher: *"Researcher, what's the current state of X?"*
4. Try the Writer: *"Writer, turn that briefing into a one-page memo"*
5. Promote useful findings to permanent pages: `node scripts/run-agent.js wiki-ingest --operation ingest --source raw/<file>.md`
6. Open `/architect` and design your first custom team

## License

MIT — see `LICENSE`.

## Credits

Agent Architect was built by [Nick DeMarco](https://github.com/nickdnj). This starter kit is a stripped-down snapshot of the upstream repo intended for public distribution.
