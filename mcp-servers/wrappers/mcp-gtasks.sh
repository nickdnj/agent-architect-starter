#!/bin/bash
# Wrapper script for Google Tasks MCP Server
# Bridges stdio between Claude and the Docker container

set -e

# Configuration
CONTAINER_NAME="mcp-gtasks-$$"
IMAGE_NAME="mcp-gtasks:latest"
CREDS_DIR="${MCP_GTASKS_CREDS:-$HOME/.config/mcp-gtasks}"

# Ensure Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running" >&2
    exit 1
fi

# Ensure credentials exist
if [ ! -f "$CREDS_DIR/.env" ]; then
    echo "ERROR: .env not found at $CREDS_DIR/" >&2
    echo "Please set up Google Tasks OAuth credentials first" >&2
    echo "Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN" >&2
    exit 1
fi

# Run the container with stdio passthrough
# Mount credentials directory for env file access
exec docker run \
    -i \
    --rm \
    --name "$CONTAINER_NAME" \
    -v "$CREDS_DIR:/mcp/credentials:rw" \
    "$IMAGE_NAME"
