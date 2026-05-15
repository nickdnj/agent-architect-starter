#!/bin/bash
# Wrapper script for Gmail MCP Server (Board Account)
# Bridges stdio between Claude and the Docker container

set -e

# Configuration
CONTAINER_NAME="mcp-gmail-board-$$"
IMAGE_NAME="mcp-gmail:latest"
CREDS_DIR="${MCP_GMAIL_BOARD_CREDS:-$HOME/.config/mcp-gmail-board}"

# Ensure Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running" >&2
    exit 1
fi

# Ensure OAuth keys exist
if [ ! -f "$CREDS_DIR/gcp-oauth.keys.json" ]; then
    echo "ERROR: gcp-oauth.keys.json not found at $CREDS_DIR/" >&2
    echo "Please set up OAuth credentials first" >&2
    exit 1
fi

# Run the container with stdio passthrough
# Mount entire credentials directory for OAuth token storage
exec docker run \
    -i \
    --rm \
    --name "$CONTAINER_NAME" \
    -v "$CREDS_DIR:/mcp/credentials:rw" \
    "$IMAGE_NAME"
