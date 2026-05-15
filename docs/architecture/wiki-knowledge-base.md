# Wiki Knowledge Base — Architecture

**Status:** Design locked, Phase 1 pending scaffolding
**Owner:** Nick
**Inspired by:** [Andrej Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) (Apr 2026)

---

## Vision

Replace Agent Architect's `context-buckets/` and `MEMORY.md`-style memory with a Karpathy-style **LLM-maintained personal knowledge base**: a separate, version-controlled markdown wiki that all agents attach to, fed by an `ingest` agent that compiles `raw/` source material and `_sessions/` logs into curated `wiki/` pages on a schedule.

Knowledge compounds across sessions instead of being re-derived from RAG every query. Maintenance burden shifts from human (which is why hand-rolled wikis die) to LLM (which never gets bored).

---

## Three layers, three lifecycles

| Layer | Where | Lifecycle | Agent role |
|---|---|---|---|
| `wiki/` | Private GitHub repo `nickdnj/wiki` | Small, dense, evolving | Read on every interaction; write only on ingest |
| `raw/` | Same repo | Append-only source material | Drop in; ingest agent consumes |
| `archive/` | Google Drive | Bulk, slow-moving, terabyte-scale | Reference by Drive URL only — bytes never enter the repo |

The wiki repo stays small forever. Source material is bounded. Bulk goes to Drive.

---

## Wiki shape

```
wiki/
├── spine/                        ← about Nick (replaces MEMORY.md)
│   ├── network/                  ← people, orgs, contacts
│   ├── infrastructure/           ← network, devices, credentials
│   └── preferences/              ← feedback memories
│
├── teams/
│   ├── wharfside/
│   │   ├── _team.md              ← roster, working norms, rhythms (CLAUDE.md for the team)
│   │   ├── bulletins/            ← team-owned project
│   │   ├── marina-business-plan/
│   │   ├── access-control/
│   │   └── _sessions/            ← raw session log firehose
│   │
│   ├── personal-assistant/       ← Max's team
│   ├── hardware-dev/
│   └── youtube-content/
│       ├── jersey-stack-ep1/
│       └── concurrent-3280-video/
│
└── projects/                     ← unaffiliated personal projects
    ├── stoveiq/
    ├── weedlabel/
    ├── pops-bingo/
    └── concurrent-3280-museum/   ← cross-references team projects
```

**Team ownership is structural** — encoded in path, not metadata. A YourTeam bulletin lives at `teams/wharfside/bulletins/`. The team affiliation is the directory.

**Each team has a `_team.md`** — the team's CLAUDE.md equivalent. Roster, working norms, current operating rhythms. Every agent on the team reads it.

**Cross-references are markdown links** — relative or repo-absolute. A bulletin page references `../_team.md` (roster), `/spine/network/eci.md` (Kathy), `/spine/preferences/board-comms-tone.md` (feedback). Same mechanism Karpathy uses, just multi-rooted.

---

## Locked decisions

1. **Wiki shape:** per-team + spine + standalone projects, ownership encoded in path
2. **Repo:** separate private GitHub `nickdnj/wiki` (different lifecycle from Agent Architect, different audience as managed-agent runtimes come online)
3. **Archive backend:** Google Drive (start). Mirrors wiki structure.
4. **First pilot:** Concurrent 3280 — small, active, cross-team, has clear source material, fast feedback

---

## How agents attach

Each agent's `config.json` gets a `wiki_access` block replacing `context_buckets.assigned`:

```json
"wiki_access": {
  "read": ["spine/", "teams/wharfside/"],
  "write": ["teams/wharfside/_sessions/", "teams/wharfside/bulletins/"]
}
```

**Initially trust-based.** Paths constrain agent behavior via prompts and generation logic; not enforced at the tool layer. Same model as today's `context_buckets.assigned`. We can layer enforcement (a wiki MCP server) later if we feel the pain.

**Generation flow** (`scripts/generate-agents.js` updates):
- Read `wiki_access` from each agent's config
- Materialize a small footer in `.claude/agents/<id>.md` listing the agent's wiki paths
- During migration: both `context_buckets.assigned` and `wiki_access` may coexist; `wiki_access` takes precedence

**Team orchestrators** read their team's `_team.md` and pull relevant subtree summaries into specialist briefings. Specialists read directly from their assigned wiki paths.

---

## Ingest agent (`wiki-ingest`)

A new specialist agent. Owns all writes to `wiki/`.

### Triggers

- **Manual:** "ingest this source", "update wiki for X", "lint YourTeam section"
- **Scheduled:** nightly cron (via `/schedule` or external scheduler) — reads recent `_sessions/` logs and any new `raw/` adds, updates affected `wiki/` pages

### Operations (Karpathy's three)

1. **Ingest** — Read new `raw/` material → identify affected wiki pages → update them with backlinks → write changelog entry to `wiki/_changelog/<date>.md`
2. **Query-as-write** — When an agent's synthesis is worth keeping, file the answer back to `wiki/` as a permanent page. Triggered by the team orchestrator after answering a non-trivial question.
3. **Lint** — Find contradictions, stale claims, orphaned pages, broken cross-references; flag for human review in `wiki/_lint/<date>.md`

### Implementation

- Specialist agent in Agent Architect: `agents/wiki-ingest/`
- Tools: Read, Write, Edit, Glob, Grep, Bash (git ops), gdrive MCP (for archive references)
- Model: Sonnet (cost-effective, sufficient for ingestion work; opus for lint passes that catch contradictions)
- Context: fork (own context window per ingest run)

### Session log capture

Each team orchestrator appends to `wiki/teams/<team>/_sessions/<YYYY-MM-DD>.md` after each non-trivial interaction. Format:

```markdown
## 14:32 — Bulletin May edition draft

User asked for May bulletin draft. Specialist: monthly-bulletin.
Touched: marina update, pool opening, RAB recap.
Output: teams/wharfside-board-assistant/workspace/may-bulletin/draft-v1.html
References: wiki/teams/wharfside/_team.md, wiki/spine/preferences/board-comms-tone.md
```

Cheap, append-only, no curation. Ingest agent compiles these into proper wiki updates.

---

## Archive on Google Drive

Drive folder structure mirrors wiki:

```
Drive/Wiki Archive/
├── teams/
│   ├── wharfside/
│   │   ├── bulletins/        ← past PDFs, audio recordings, RAB packets
│   │   ├── marina-business-plan/
│   │   └── governing-documents/
│   └── youtube-content/
│       └── jersey-stack-ep1/  ← master video, source PDFs, B-roll archive
└── projects/
    └── concurrent-3280-museum/   ← scanned manuals, photos, oral histories
```

**Reference pattern in wiki pages:**

```markdown
**Original Concurrent 3280 CPU manual** (PDF, 47MB):
[Drive: 3280-CPU-manual.pdf](https://drive.google.com/file/d/1aBcDef.../view)
File ID: `1aBcDef...`
```

Agents fetch on demand via `google-drive` / `gdrive-personal` MCP. Wiki repo stays small. Drive handles versioning, sharing, and storage costs.

**Bounded use:** Drive sync becomes painful past ~5GB single files. For very large video masters, a pointer to YouTube/Vimeo or cold storage (Backblaze B2) is better. Drive is the *starting* archive — escalate by file size as needed.

---

## Build order

### Phase 1 — Concurrent 3280 pilot (next)
- Create `nickdnj/wiki` repo, scaffold `wiki/`, `raw/`, `_sessions/` directories
- Inventory existing Concurrent 3280 sources scattered across `teams/youtube-content/projects/concurrent-3280/`, `teams/personal-assistant/workspace/`, and memory files
- Build `wiki/projects/concurrent-3280-museum/` with cross-references to `spine/career/concurrent.md`, `spine/network/yeager-john.md`, `teams/youtube-content/concurrent-3280-video/`
- Move bulk PDFs/scans to Drive `Wiki Archive/projects/concurrent-3280-museum/`
- Manually do one full ingest pass — observe what's tedious, what works
- **Goal:** ground the design in lived experience before generalizing

### Phase 2 — Ingest agent (after pilot insights)
- Spec based on what we learned manually
- Build `agents/wiki-ingest/`
- Set up scheduled lint pass via `/schedule`
- Wire team orchestrators to write `_sessions/` entries

### Phase 3 — YourTeam migration
Highest-volume context-bucket user. Migrate governing docs, bulletins, marina plan to wiki + archive. Update YourTeam agent configs to `wiki_access`.

### Phase 4 — Remaining teams
hardware-dev, youtube-content, personal-assistant, altium, software-project.

### Phase 5 — Decommission
Delete `context-buckets/`, archive `MEMORY.md` files into `wiki/spine/`, remove dual-config compat from `generate-agents.js`.

---

## Open questions

1. **Session log capture mechanism** — orchestrator appends, or specialist appends, or both? (Leaning: orchestrator appends a summary after specialist returns. Specialists shouldn't touch the wiki directly.)
2. **MEMORY.md → spine migration** — auto-translate or curate by hand? (Leaning: curate. Existing memories carry implicit organization that the wiki structure should make explicit, not just port.)
3. **Wiki MCP server for enforced access** — needed, or is path-based trust enough? (Defer until pain.)
4. **Drive auth from cloud agents** — when managed-agent runtimes arrive, how do they authenticate to Drive? Service account? Defer until that future is real.
5. **Cross-machine wiki access** — repo on GitHub solves multi-machine Claude Code. For long-running scheduled agents, a periodic `git pull` is enough. No live sync needed yet.

---

## Why this is worth doing

- **MEMORY.md is already a poor man's version of this** — 80+ memory files with implicit cross-references. Formalizing it makes the system inspectable and lintable.
- **Context-buckets duplicate effort** — same content sometimes appears in multiple buckets, drifts out of sync. Single source of truth fixes that.
- **Cross-project insights surface naturally** — Concurrent 3280 (volunteering) ↔ jersey-stack-ep1 (video) ↔ user_career (personal background) all reference the same spine entries.
- **Future-proofs for managed agents** — when YourTeam/Max migrate to hosted runtimes, they pull from a wiki repo over HTTPS instead of needing the full Agent Architect filesystem.
- **Karpathy-validated pattern** — multiple working implementations (Farzapedia, lucasastorian/llmwiki, OmegaWiki) prove it scales for the 10–150 source range we operate in.
