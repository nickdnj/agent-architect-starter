# MCP Server Setup

This directory holds configuration and optional wrappers for MCP (Model Context Protocol) servers used by your agents.

## First-time setup

The fastest way to connect your first MCP server is to ask the Setup Concierge:

```
/starter help me set up Gmail
```

The concierge walks you through Google Cloud project creation, OAuth consent, credential download, wiring into Claude Code, and a test query.

## Structure

- `registry/servers.json` — catalog of known MCP servers (what they do, typical use cases)
- `assignments.json` — which agents/teams are allowed to use which servers
- `scripts/` — helper scripts for server setup
- `wrappers/` — thin wrapper scripts if a server needs env vars or path munging

## Credentials

**Never commit credentials.** The default `.gitignore` already excludes `credentials.json`, `token.json`, and `.env*`.

Store credentials outside this directory if you can, or keep them here only if you're confident the ignore rules are working.

## Common MCPs

| Server | Purpose | Auth |
|---|---|---|
| Gmail | Email search, send, labels | Google OAuth |
| Google Drive | File search, read/write | Google OAuth |
| Google Calendar | Event read/write | Google OAuth |
| GitHub | Repo operations, issues, PRs | Personal access token |
| Chrome | Browser automation | No auth (local Chrome) |

Ask the Setup Concierge for the current best installation path for any of these.
