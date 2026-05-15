# MCP Servers - Docker Configuration

Containerized MCP (Model Context Protocol) servers for use with Claude Desktop and Claude Code.

## Quick Start

```bash
# 1. Build Docker images
./scripts/build.sh

# 2. Initialize OAuth (run once per account)
./scripts/oauth-init.sh

# 3. Verify setup
./scripts/verify.sh

# 4. Update Claude Desktop config (see below)
```

## Architecture

```
Claude Desktop/Code
        │
        ▼ (spawns subprocess)
   Wrapper Script (wrappers/mcp-gmail-board.sh)
        │
        ▼ (docker run -i)
   Docker Container (mcp-gmail:latest)
        │
        ▼ (volume mount)
   Host OAuth Tokens (~/.config/mcp-*)
```

## Directory Structure

```
mcp-servers/
├── images/              # Dockerfiles
│   ├── gmail/
│   └── gdrive/
├── wrappers/            # Shell scripts that bridge Claude to Docker
├── scripts/             # Build, OAuth, and verification scripts
├── docker-compose.yml   # Container definitions
└── .env.example         # Environment template
```

## Available MCP Servers

| Server | Account | Wrapper Script |
|--------|---------|----------------|
| Gmail | Board (wharfside) | `wrappers/mcp-gmail-board.sh` |
| Gmail | Personal | `wrappers/mcp-gmail-personal.sh` |
| Google Drive | Board (wharfside) | `wrappers/mcp-gdrive-board.sh` |
| Google Drive | Personal | `wrappers/mcp-gdrive-personal.sh` |

## Native MCP Servers (No Docker)

| Server | Package | Auth |
|--------|---------|------|
| Apple Events | `mcp-server-apple-events` | macOS permissions |
| Apple Contacts | `contactbook` (custom Swift) | macOS permissions |
| OpenAI Image | `@lpenguin/openai-image-mcp` | `OPENAI_API_KEY` env var |

### OpenAI Image Generation

Generates and edits images using OpenAI models (gpt-image-1, DALL-E 3, etc.).

```bash
# Already configured via claude mcp add. Just needs OPENAI_API_KEY in environment.
npx -y @lpenguin/openai-image-mcp
```

Supports: gpt-image-1, gpt-image-1-mini, DALL-E 3, DALL-E 2. Features transparency, multiple formats (PNG/JPEG/WebP), and quality controls.

## Claude Desktop Configuration

Update `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "/Users/nickdemarco/AgentArchitect/mcp-servers/wrappers/mcp-gmail-board.sh",
      "args": [],
      "env": {}
    },
    "gmail-personal": {
      "command": "/Users/nickdemarco/AgentArchitect/mcp-servers/wrappers/mcp-gmail-personal.sh",
      "args": [],
      "env": {}
    },
    "gdrive": {
      "command": "/Users/nickdemarco/AgentArchitect/mcp-servers/wrappers/mcp-gdrive-board.sh",
      "args": [],
      "env": {}
    },
    "gdrive-personal": {
      "command": "/Users/nickdemarco/AgentArchitect/mcp-servers/wrappers/mcp-gdrive-personal.sh",
      "args": [],
      "env": {}
    }
  }
}
```

## Credentials Setup

OAuth credentials are stored on the host and mounted into containers:

```
~/.config/
├── mcp-gmail-board/
│   ├── credentials.json    # OAuth client credentials (from Google Cloud)
│   └── token.json          # OAuth token (created during auth)
├── mcp-gmail-personal/
│   ├── credentials.json
│   └── token.json
├── mcp-gdrive-board/
│   └── gcp-oauth.keys.json # OAuth client credentials
└── mcp-gdrive-personal/
    └── gcp-oauth.keys.json
```

## Troubleshooting

### Docker not running
```
ERROR: Docker is not running
```
Start Docker Desktop before using MCP servers.

### OAuth not initialized
```
WARNING: token.json not found
```
Run `./scripts/oauth-init.sh` to complete OAuth flow.

### Container fails to start
Check logs with:
```bash
docker logs mcp-gmail-board-<pid>
```

### Manual MCP test
```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | ./wrappers/mcp-gmail-board.sh
```
