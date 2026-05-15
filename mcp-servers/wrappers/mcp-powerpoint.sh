#!/bin/bash
# Wrapper script for PowerPoint MCP Server
# Bridges stdio between Claude and the Docker container

set -e

CONTAINER_NAME="mcp-powerpoint-$$"
IMAGE_NAME="mcp-powerpoint:latest"
TEMPLATES_DIR="${MCP_PPT_TEMPLATES:-$HOME/.config/mcp-powerpoint/templates}"
WORKSPACE_DIR="${MCP_PPT_WORKSPACE:-$HOME/.config/mcp-powerpoint/workspace}"

# Ensure Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running" >&2
    exit 1
fi

# Create directories if they don't exist
mkdir -p "$TEMPLATES_DIR" "$WORKSPACE_DIR"

# Run the container with stdio passthrough
exec docker run \
    -i \
    --rm \
    --name "$CONTAINER_NAME" \
    -v "$TEMPLATES_DIR:/mcp/templates:ro" \
    -v "$WORKSPACE_DIR:/mcp/workspace:rw" \
    "$IMAGE_NAME"
