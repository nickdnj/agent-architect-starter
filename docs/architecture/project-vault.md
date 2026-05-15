# Project Vault — Architecture

**Status:** Design locked, Phase 0 (this doc) — 2026-05-15
**Owner:** Nick
**Companion to:** [Wiki Knowledge Base](./wiki-knowledge-base.md)

---

## Vision

Strip Agent Architect down to what it actually is: a **manager of agents** — the **Agent Father** — not a holder of project work. AA creates and manages teams; teams own projects; projects live in their own repos. Project data — heavy video assets, bulletin drafts, scratch workspaces — gets evicted from the AA repo, mirroring what the wiki did for memory.

Today AA is **54 GB**. The agent definitions, registries, scripts, and Architect skill are under 50 MB combined. Everything else is project payload that should never have lived inside a repo that also holds the code that creates and manages agents.

Goal: AA shrinks to its actual job. Projects live next to AA in `~/Workspaces/`, each with its own lifecycle, history, and GitHub repo, each **declaring back** to AA via a small `.aa.json` manifest so the ecosystem self-describes.

---

## Three tiers, three lifecycles

| Tier | Where | Lifecycle | Examples |
|---|---|---|---|
| **AA core** | `nickdnj/AgentArchitect` | Small, slow-evolving — agent/team definitions + scripts | `agents/`, `teams/*/team.json`, `scripts/`, `registry/`, `Architect/` |
| **Heavy projects** | `nickdnj/<project-id>`, one repo each | Per-project lifecycle, often public-ready | `jersey-stack-ep1-transistor`, `concurrent-3280`, `weedlabel`, `batterupli` |
| **Workspaces** | `nickdnj/workspaces`, one shared repo | Lightweight rolling work, sub-folders per item | YourTeam bulletins, ad hoc research, scratch experiments |

AA stays under 100 MB forever. Heavy projects scale to whatever they need without bloating AA. Workspaces consolidate the long tail of small ephemeral work into one place.

---

## Disk layout

```
~/Workspaces/
├── AgentArchitect/                ← AA core, lean
├── wiki/                          ← knowledge base (existing)
├── workspaces/                    ← NEW: shared lightweight repo
│   ├── wharfside-bulletins/
│   │   ├── may-bulletin/
│   │   ├── june-bulletin/
│   │   └── giuseppe-texts-archive/
│   ├── personal-assistant/
│   │   ├── elkay-3d/
│   │   └── mediterranean-diet-playbook.md
│   └── scratch/
├── jersey-stack-ep1-transistor/   ← own repo (heavy project)
├── concurrent-3280/               ← own repo
├── batterupli/                    ← own repo (exists)
├── weedlabel/                     ← own repo (exists)
├── stoveiq/                       ← own repo (exists)
└── vistterstream/                 ← own repo (exists)
```

**Convention:** project ID == directory name == repo name. Orchestrators resolve `<project-id>` → `~/Workspaces/<project-id>/`. No central config to drift; the disk is the registry of truth.

---

## Locked decisions

1. **Tiered architecture** — heavy projects get own repos, workspaces share one repo, AA stays lean
2. **Disk location** — `~/Workspaces/<project-id>/` for heavy, `~/Workspaces/workspaces/<slug>/` for light
3. **Git history preserved** — use `git filter-repo --subdirectory-filter` to extract project history from AA
4. **Shipped videos archived to Drive** — reclaim ~38 GB; write a manifest before deletion
5. **One shared workspaces repo** — not per-bulletin or per-scratch repo; sub-folders by team/topic
6. **AA holds a `registry/projects.json`** — index of every project Nick owns (AA-managed or not). Single source of "what projects exist." Lightweight to maintain.
7. **No Git LFS** — costs $5/mo per 50 GB pack past free tier; not worth it. Instead, binaries-on-Drive policy (see below).
8. **Binaries-on-Drive policy** — git tracks the **recipe** (scripts, narration text, storyboard JSON, image prompts, FFmpeg configs); Drive holds the **bake** (rendered WAVs, PNGs, MP4s). All bake outputs are reproducible from the recipe.
9. **Every project repo carries `.aa.json`** — small manifest in the project root declaring `project_id`, `team`, `aa_repo`, `wiki_index`. Projects self-identify and know how to call back to AA.
10. **Ambiguous-status video projects (massapequa-history, ocean-vs-space-dc) archive to Drive** — can be pulled back as active projects later if Nick decides to ship them.
11. **Saltwater work consolidates under a new `saltwater-cto` umbrella team** — existing `saltwater-ads` becomes one project beneath it; future Saltwater work (Triple Whale advisory, etc.) becomes sibling projects.

---

## How agents find projects

The orchestrator's job: when a user says "work on the May bulletin" or "continue the Jersey Stack episode," the orchestrator must `cd` to the project directory before delegating to a specialist.

### Resolution order

1. **Convention lookup** — try `~/Workspaces/<project-id>/`. If it exists, use it.
2. **Workspaces fallback** — try `~/Workspaces/workspaces/<slug>/`. If found, use it.
3. **Registry lookup** — read `registry/projects.json` for the canonical repo URL; if not cloned, clone it.

### Project registry (`registry/projects.json`)

```json
{
  "version": "1.0",
  "last_updated": "2026-05-14",
  "projects": [
    {
      "id": "jersey-stack-ep1-transistor",
      "name": "The Jersey Stack — Episode 1: The Transistor",
      "tier": "heavy",
      "repo": "git@github.com:nickdnj/jersey-stack-ep1-transistor.git",
      "local_path": "~/Workspaces/jersey-stack-ep1-transistor/",
      "team": "youtube-content",
      "wiki_index": "wiki/projects/jersey-stack-series.md",
      "status": "active",
      "created": "2026-04-26"
    },
    {
      "id": "may-bulletin",
      "name": "May 2026 YourTeam Bulletin",
      "tier": "workspace",
      "repo": "git@github.com:nickdnj/workspaces.git",
      "local_path": "~/Workspaces/workspaces/wharfside-bulletins/may-bulletin/",
      "team": "wharfside-board-assistant",
      "status": "in-progress",
      "created": "2026-04-28"
    }
  ]
}
```

Same trust model as `wiki_access`: paths constrain behavior via prompts and generation logic, not enforced at the tool layer.

### Wiki cross-reference

Each project's `wiki/projects/<slug>/_index.md` (or `wiki/teams/<team>/<project>/_index.md`) gains a frontmatter field:

```yaml
---
project_id: jersey-stack-ep1-transistor
repo: git@github.com:nickdnj/jersey-stack-ep1-transistor.git
local_path: ~/Workspaces/jersey-stack-ep1-transistor/
status: active
last_updated: 2026-05-15
---
```

So the wiki index page is the human-readable entry point; `registry/projects.json` is the machine-readable mirror.

### Project self-identification (`.aa.json`)

Every project repo carries an `.aa.json` manifest in its root, declaring its place in the AA ecosystem:

```json
{
  "aa_version": "1.0",
  "project_id": "jersey-stack-ep1-transistor",
  "team": "youtube-content",
  "aa_repo": "git@github.com:nickdnj/AgentArchitect.git",
  "wiki_index": "wiki/projects/jersey-stack-series.md",
  "tier": "heavy",
  "binaries_drive_folder": "https://drive.google.com/drive/folders/..."
}
```

This means **any project repo, anywhere on disk, knows how to call back to AA**. The user vision: AA is the Agent Father — every project repo it creates (or adopts) understands where it came from and how to act in concert with AA.

`registry/projects.json` and `.aa.json` are two views of the same truth: the registry is AA's index of all projects; each `.aa.json` is the project's self-declaration. They should agree; a lint check verifies.

---

## Migration mechanics

### For heavy projects (own repo, preserve history)

```bash
# 1. Mirror AA to a scratch location
git clone --no-local ~/Workspaces/AgentArchitect /tmp/aa-mirror
cd /tmp/aa-mirror

# 2. Filter history down to just the project subdirectory
#    (git-filter-repo: brew install git-filter-repo)
git filter-repo --subdirectory-filter teams/youtube-content/projects/jersey-stack-ep1-transistor

# 3. Move to final home
mv /tmp/aa-mirror ~/Workspaces/jersey-stack-ep1-transistor
cd ~/Workspaces/jersey-stack-ep1-transistor

# 4. Create GitHub repo and push
gh repo create nickdnj/jersey-stack-ep1-transistor --private --source . --push

# 5. Update registry/projects.json + wiki index page

# 6. Remove from AA in a separate commit
cd ~/Workspaces/AgentArchitect
git rm -r teams/youtube-content/projects/jersey-stack-ep1-transistor
git commit -m "migrate: jersey-stack-ep1-transistor extracted to standalone repo"
```

**Tooling:** wrap this in `scripts/migrate-project.js <project-id>` so the steps are repeatable and the registry update is automatic.

### For workspaces (one shared repo, fresh start OK)

```bash
# 1. Create workspaces repo
mkdir ~/Workspaces/workspaces && cd ~/Workspaces/workspaces
git init && gh repo create nickdnj/workspaces --private --source . --push

# 2. For each workspace item, move (history less critical for ephemeral work)
mkdir -p wharfside-bulletins
git -C ~/Workspaces/AgentArchitect mv teams/wharfside-board-assistant/workspace/may-bulletin ~/Workspaces/workspaces/wharfside-bulletins/may-bulletin
```

History preservation is optional for workspace items. If a particular bulletin/workspace has meaningful history worth keeping, use `git filter-repo` like a heavy project; otherwise plain `mv` is fine.

---

## Binaries-on-Drive policy

No Git LFS. Project repos commit only the **source-of-truth recipe**; rendered binaries live on Google Drive.

### What goes in git

- Scripts and narration text (`.txt`, `.md`)
- Storyboard configs (`storyboard-data.json`)
- Image generation prompts
- FFmpeg recipes, concat lists, assembly configs
- Per-scene metadata (durations, transitions)
- Code (Python, JS, shell)
- Documentation

### What goes on Drive (gitignored in the project repo)

- Generated audio (`.wav`, `.mp3`)
- Generated images (`.png`, `.jpg`)
- Rendered video (`.mp4`, `.mov`)
- Music tracks
- Large raw footage

### Mechanics

Each heavy project repo has a `.gitignore` that excludes the binary directories (typically `assets/audio/`, `assets/images/`, `output/`). A `binaries-manifest.md` in the repo root lists what's on Drive and where:

```markdown
# Binaries on Drive
**Drive folder:** https://drive.google.com/drive/folders/...

## audio/narration/
- scene-01.wav (1.2 MB) — narration for cold open
- scene-02.wav (1.8 MB) — narration for transistor intro
...
```

The recipe is enough to regenerate any binary; the manifest tells you whether the cached version exists on Drive before re-rendering.

---

## Shipped video archive flow

The ~38 GB of finished YouTube projects exists on Vimeo/YouTube already. Local copies are nice-to-have but not essential. Move them to Drive, write a manifest, delete local.

### Manifest location

`~/Workspaces/wiki/_archive/youtube/<project-id>.md`

### Manifest schema

```markdown
---
project_id: monmouth-beach-history
archived_date: 2026-05-14
archived_size_gb: 0.405
drive_folder: https://drive.google.com/drive/folders/...
youtube_url: https://www.youtube.com/watch?v=...
status: shipped
---

# Monmouth Beach Documentary — Archive Manifest

**Archived from:** `teams/youtube-content/projects/monmouth-beach-history/`
**Date archived:** 2026-05-14
**Reason:** Shipped, live on Vistter Two channel; reclaim local disk

## Drive folder
[Open in Drive](https://drive.google.com/drive/folders/...)
File ID: `1aBcDef...`

## File inventory (key assets)
- `final-cut.mp4` (147 MB)
- `narration/scene-*.wav` (12 files, 89 MB total)
- `assets/images/*.png` (28 files, 156 MB total)
- `assembly/concat-final.txt`
- `storyboard-data.json`
... (full file tree appended below)

## How to retrieve
1. Download the Drive folder to a scratch location
2. If you need git history, restore from AA pre-migration commit `<sha>`
3. Re-establish project per current Project Vault conventions

## Cross-references
- Wiki: [[project_monmouth-beach-video]]
- YouTube: <url>
```

The manifest stays in the wiki forever (it's tiny markdown). Drive holds the bytes. AA loses the bloat.

### Targets (shipped → archive)

| Project | Size | Status |
|---|---|---|
| `monmouth-beach-history` | 405 MB | Shipped — **pilot** |
| `jersey-shore-sharks-1916` | 904 MB | Shipped |
| `ocean-vs-space-dc` | 1.6 GB | Draft v7 — archive (can pull back later if shipped) |
| `seven-presidents-park` | 2.2 GB | Shipped (live) |
| `massapequa-history` | 3.0 GB | Never published — archive (can pull back later if Nick decides to ship) |
| `cold-plan-video` | 4.3 GB | Shipped (live) |
| `batter-up-history` | 4.5 GB | Uploaded unlisted, waiting on family review |
| **Total reclaimable** | **~17 GB** | |

Active projects to migrate (NOT archive):

| Project | Size | Status |
|---|---|---|
| `concurrent-3280` | 117 MB | Active — **pilot** |
| `vistter-brand-launch` | 132 MB | Active |
| `jersey-stack-ep1-transistor` | 21 GB | Active, in production — biggest, do last |

### Personal-assistant workspace disposition

`teams/personal-assistant/workspace/` is 3.5 GB total but the bulk is one item:

| Item | Size | Destination |
|---|---|---|
| `saltwater-ads-poc/` | 3.5 GB | Handled under `saltwater-cto` umbrella consolidation (separate task) |
| `elkay-3d/` | 4.3 MB | `workspaces/personal-assistant/elkay-3d/` |
| `infoage-cumberland-2026-05-06/` | 168 KB | `workspaces/personal-assistant/` |
| `bermuda-cruise-may2026/` | 28 KB | `workspaces/personal-assistant/` |
| Research markdowns (6 files) | ~76 KB | `workspaces/personal-assistant/` (or promote to wiki) |

---

## AA cleanup after migration

Once a project is migrated:

1. `git rm -r` its directory from AA
2. Commit with `migrate: <project-id> -> standalone repo` message
3. Update `registry/projects.json`

Once **all** projects are migrated, in AA:

1. Add to `.gitignore`:
   ```
   teams/*/projects/
   teams/*/workspace/
   ```
2. Remove empty `teams/*/projects/` and `teams/*/workspace/` directories
3. Update team orchestrator `SKILL.md` templates: replace `write to teams/<team>/workspace/...` with `resolve project path via registry/projects.json or convention, cd there, work in place`
4. Update CLAUDE.md routing to mention the projects registry

---

## Build order

### Phase 0 — Design (this doc) ✅
- Lock architecture
- Document migration mechanics
- Define registry schema

### Phase 1 — Pilot one of each
- **Archive pilot:** `monmouth-beach-history` (smallest shipped, 405 MB) — full flow: Drive upload, manifest write, AA removal
- **Migrate pilot:** `concurrent-3280` (smallest active, 117 MB) — full flow: filter-repo extraction, new GitHub repo, registry update, AA removal
- **Workspaces pilot:** YourTeam bulletins — create `nickdnj/workspaces` repo, move `may-bulletin/`, validate orchestrator can still find it
- **Goal:** ground the migration script in lived experience before doing the big ones

### Phase 2 — Tooling
Based on pilot pain points, build:
- `scripts/migrate-project.js <project-id> <tier>` — orchestrates filter-repo + GitHub create + registry update + AA removal
- `scripts/archive-video.js <project-id>` — orchestrates Drive upload + manifest write + AA removal
- `registry/projects.json` initial population

### Phase 3 — Bulk archive (shipped videos)
Run `archive-video.js` for each shipped project. Reclaim ~17 GB plus whatever else qualifies after status confirmation. Each gets its manifest in `wiki/_archive/youtube/`.

### Phase 4 — Bulk migrate (active projects)
Run `migrate-project.js` for each active project. Order by size, smallest first (de-risk). End with `jersey-stack-ep1-transistor` (21 GB, highest stakes).

### Phase 5 — Workspaces consolidation
Move all `teams/*/workspace/*` content into `nickdnj/workspaces` with team-prefixed sub-folders.

### Phase 6 — AA scaffolding cleanup
- `.gitignore` updates
- Remove empty project/workspace dirs
- Update orchestrator templates
- CLAUDE.md routing update
- Final repo-shrink commit

---

## Saltwater-CTO umbrella team (related work)

Decision: existing saltwater work in AA is scattered across eight locations and an external `saltwater-ai-ads` repo. Consolidate under a new `saltwater-cto` umbrella team. Current `saltwater-ads` becomes one project beneath it. Future Saltwater initiatives (Triple Whale advisory, brand strategy, customer journey work) become sibling projects.

Scope (tracked separately):
- New team folder: `teams/saltwater-cto/`
- Move `agents/saltwater-ads/hook-generator/` under saltwater-cto's roster
- Move `apps/saltwater-ads/` into the project's standalone repo
- Move `context-buckets/saltwater-brand/` into the project's wiki + drive structure
- Move `docs/saltwater-ads/` into the project's standalone repo
- Move `scripts/spikes/pi-ai-saltwater/` into the project's standalone repo
- Resolve `teams/personal-assistant/workspace/saltwater-ads-poc/` (3.5 GB) — likely archive once project repo is hydrated
- Promote email drafts in `teams/personal-assistant/outputs/email_joe_saltwater_*.md` to wiki notes

Out of scope for the initial Project Vault pilot; execute after pilot validates the migration mechanics.

---

## Bringing existing repos into AA (follow-on)

the user's vision: AA is the Agent Father. Every project repo — whether AA created it or it predates AA — should declare its team and how to act in concert.

Forty-plus repos already exist in `~/Workspaces/` (stoveiq, weedlabel, batterupli, VistterStream, cage-match, SignBoard, PopsBingo, etc.). Each needs:

1. Triage: active, dormant, or abandoned
2. Team assignment (most map cleanly: stoveiq → hardware-dev, weedlabel → personal-assistant, etc.)
3. Entry in `registry/projects.json`
4. `.aa.json` manifest added to the repo root
5. Wiki index page at `wiki/projects/<slug>/_index.md` (if not already present)

This is a sweep, not a pilot. Schedule after Phase 4.

---

## Open questions

1. **Cross-machine sync** — when projects live in their own GitHub repos, working from a second machine = `gh repo clone` on demand. Acceptable.
2. **`.aa.json` linting** — should a CI check (or nightly script) verify registry/projects.json and per-repo `.aa.json` files agree?
3. **What about projects that fail status triage** during the "bring existing repos into AA" sweep? Auto-archive to `nickdnj/abandoned-projects` or hold for manual review?

---

## Why this is worth doing

- **AA cloning is currently broken at scale** — 54 GB repo means new machines can't bootstrap fast. Lean AA = `gh repo clone` works in seconds.
- **Mixed lifecycles bite back** — a shipped video and an agent definition should not share a commit log. Each project gets its own history, its own visibility settings, its own collaborators.
- **Matches what already happened naturally** — `batterupli`, `weedlabel`, `stoveiq`, `vistterstream`, `saltwater-ads` already have their own repos. The video projects and bulletins are the outliers that broke the pattern.
- **Future-proofs for managed agents** — when YourTeam/Max migrate to hosted runtimes, the runtime pulls only AA + wiki, not 38 GB of finished videos.
- **Compounds with the wiki migration** — wiki holds knowledge, project repos hold work, AA holds agents. Three repos, three lifecycles, each one stays focused.
