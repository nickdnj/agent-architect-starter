#!/bin/bash
# Wrapper script for Google Drive MCP Server (Personal Account)
# Bridges stdio between Claude and the Docker container

set -e

# Configuration
CONTAINER_NAME="mcp-gdrive-personal-$$"
IMAGE_NAME="mcp-gdrive:latest"
CREDS_DIR="${MCP_GDRIVE_PERSONAL_CREDS:-$HOME/.config/mcp-gdrive-personal}"

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
exec docker run \
    -i \
    --rm \
    --name "$CONTAINER_NAME" \
    -v "$CREDS_DIR:/mcp/credentials:rw" \
    -e "GDRIVE_CREDS_DIR=/mcp/credentials" \
    "$IMAGE_NAME"
