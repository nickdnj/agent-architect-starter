# Wiki — Your LLM-Maintained Knowledge Base

A Karpathy-style ([gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)) personal knowledge base. Markdown only. Maintained by an LLM ingest agent. Read by every Agent Architect agent that attaches.

## Layers

| Layer | What | Lifecycle |
|---|---|---|
| `wiki/` content (this folder) | Curated, interlinked markdown — the knowledge layer | Small, dense, evolving |
| `raw/` | Source material dropped in for ingestion | Append-only, bounded |
| External archive (Drive, S3, etc.) | Bulk deliverables (videos, large PDFs, masters) | Slow-moving, terabyte-scale |

The wiki stays small forever. Bulk goes to an external archive, referenced by URL only.

## Shape

```
spine/                  ← about you (people, infra, preferences)
  network/              ← people, orgs, contacts
  infrastructure/       ← networks, devices, credentials
  preferences/          ← your accumulated operating philosophy

teams/<team>/
  _team.md              ← team's CLAUDE.md (roster, norms, rhythms)
  <project>/            ← team-owned projects
  _sessions/            ← session log firehose

projects/               ← unaffiliated personal projects
raw/                    ← source material, ingest agent consumes
_changelog/             ← ingest agent's writelog
_lint/                  ← lint pass output (contradictions, stale claims)
```

Team ownership is encoded in path. Cross-references are markdown links.

## How it's maintained

The `wiki-ingest` specialist agent (in Agent Architect: `agents/wiki-ingest/`) owns all writes here. It runs:

- **Manually** when you invoke it (`node scripts/run-agent.js wiki-ingest --operation ingest`)
- **Nightly** via a scheduled lint pass (optional — see `wiki-ingest` SKILL.md)
- **After non-trivial specialist briefings** when an orchestrator promotes findings to a permanent page

Every write produces a row in `_changelog/<date>.md`. Every lint produces `_lint/<date>.md`. Trust but verify.

## Connecting agents to the wiki

Each Agent Architect agent's `config.json` has a `wiki_access` block:

```json
"wiki_access": {
  "repo_root": "${WIKI_REPO}",
  "read": ["spine/preferences/", "spine/network/", "teams/<your-team>/"],
  "write_via_ingest": [],
  "session_log": "teams/<your-team>/_sessions/<agent-id>/",
  "always_load": ["spine/preferences/seven-habits-of-effective-agents.md"]
}
```

- `read` — path prefixes the agent is trusted to read
- `write_via_ingest` — paths the agent may **request** writes to (only `wiki-ingest` actually writes)
- `session_log` — where this agent appends its session firehose
- `always_load` — pages inlined into the agent's system prompt at generation time

Set `WIKI_REPO` to the absolute path of this folder (e.g., `export WIKI_REPO=$(pwd)/wiki`).

## Operating principle

- **Wiki** = curated stable knowledge ("ECI is the property manager")
- **Raw** = ephemeral working memory ("April 2026 ECI proposal comparison")
- The wiki replaces traditional `context_buckets` + `MEMORY.md` patterns

## Getting started

1. Set `WIKI_REPO` in your environment: `export WIKI_REPO=$(pwd)/wiki`
2. Fill in `spine/network/` with the people and orgs you work with
3. Fill in `spine/infrastructure/` with your networks, devices, and accounts
4. Read `spine/preferences/seven-habits-of-effective-agents.md` — it's the operating philosophy every agent loads at startup
5. Drop source material into `raw/` and run `wiki-ingest` to compile it
