# raw/

Append-only source material. The `wiki-ingest` agent consumes from here.

## Conventions

- **Naming:** `<topic>-<source>-<YYYY-MM-DD>.md` (e.g., `meeting-notes-2026-05-14.md`)
- **Frontmatter is optional in raw** — the ingest agent will normalize on its way to the wiki
- **No editing after drop.** If you need to correct, append a new file or annotate via the ingest agent
- **Bulk content** — store videos, large PDFs, masters in an external archive (Drive, S3); reference by URL here

## Workflow

1. Drop source material here
2. Run: `node scripts/run-agent.js wiki-ingest --operation ingest --source raw/<file>.md`
3. The agent compiles into the correct `spine/`, `teams/`, or `projects/` location
4. Output recorded in `_changelog/<date>.md`
