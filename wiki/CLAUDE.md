# CLAUDE.md — Conventions for the Wiki

This file tells LLMs how to read, navigate, and write to this wiki. Every agent attached to this wiki should treat this as load-bearing.

## File conventions

- **Markdown only.** No HTML, no JSON, no YAML except frontmatter where noted.
- **Filenames:** `kebab-case.md`. Lowercase. No spaces.
- **Headers:** Start with `# Title` (one H1). Use H2/H3 for structure.
- **Date format:** ISO 8601 — `2026-05-14`, never relative dates ("yesterday", "last week").

## Page frontmatter

Every wiki page (not raw, not session logs) starts with:

```markdown
---
title: <human-readable title>
type: <person | org | project | concept | decision | reference>
status: <active | archived | draft>
last_updated: <YYYY-MM-DD>
sources:
  - <reference to raw/ file or external URL>
---
```

## Cross-references

Use markdown links with **repo-absolute paths** (start with `/`):

```markdown
The [board comms tone](/spine/preferences/board-comms-tone.md) preference applies here.
```

Repo-absolute paths survive moves and renames better than relative paths.

## Backlinks

When you write a claim about an entity, also update that entity's page with a backlink. The `wiki-ingest` agent maintains backlinks automatically. If you hand-edit a page, you can skip backlinks — the next lint pass will add them.

## Session logs

`teams/<team>/_sessions/<YYYY-MM-DD>.md` is the daily session firehose. Append-only. Format:

```markdown
## HH:MM — <one-line summary>

User asked for X. Specialist: <agent-id>.
Touched: <key topics>.
Output: <path or URL>
References: <wiki paths consulted>
```

These are NOT curated wiki content. The `wiki-ingest` agent reads them periodically and compiles relevant material into proper wiki pages.

## Archive references

Bulk content (videos, large PDFs, masters) should live in an external archive (Google Drive, S3, etc.), mirroring this directory structure. Reference format:

```markdown
**Original manual** (PDF, 47MB):
[Drive: example-manual.pdf](https://drive.google.com/file/d/<file-id>/view)
File ID: `<file-id>`
```

Never store bulk bytes in this repo.

## What goes where

| Content | Location |
|---|---|
| About you personally — career, contacts, infrastructure, preferences | `spine/` |
| Team-specific knowledge (roster, team norms) | `teams/<team>/_team.md` |
| Team-owned projects | `teams/<team>/<project>/` |
| Personal / unaffiliated projects | `projects/<name>/` |
| Source material to be ingested | `raw/` |
| Daily session logs | `teams/<team>/_sessions/<date>.md` |
| Ingest changelog | `_changelog/<date>.md` |
| Lint output | `_lint/<date>.md` |

## Editing rules

- **Don't hand-edit curated wiki pages** unless the ingest agent has flagged them for human review (look in `_lint/`).
- **Hand-editing OK for:** `_team.md` files, spine pages explicitly marked human-curated, one-off corrections.
- **Drop sources into `raw/`** and let the ingest agent compile.
- **Session logs are append-only** — never edit history.

## Status fields

- `active` — current, accurate, in use
- `archived` — superseded but kept for history
- `draft` — incomplete or not yet validated

## Don't

- Don't store credentials, API keys, or secrets here. Use a secrets manager.
- Don't put bulk bytes here. Use an external archive.
- Don't break cross-references. Use the lint pass output to find and fix.
- Don't write timestamps as "today" or "last week" — use ISO dates.
