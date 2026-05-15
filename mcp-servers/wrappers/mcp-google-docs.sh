#!/bin/bash
# Wrapper script for Google Docs MCP Server
# Bridges stdio between Claude and the Docker container

set -e

CONTAINER_NAME="mcp-google-docs-$$"
IMAGE_NAME="mcp-google-docs:latest"
CREDS_FILE="${MCP_GOOGLE_DOCS_CREDS:-$HOME/.config/mcp-google-docs/credentials.json}"

# Ensure Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running" >&2
    exit 1
fi

# Check if jq is available
if ! command -v jq > /dev/null 2>&1; then
    echo "ERROR: jq is required but not installed" >&2
    exit 1
fi

# Load credentials from JSON file
if [ -f "$CREDS_FILE" ]; then
    CLIENT_ID=$(jq -r '.client_id // .installed.client_id // empty' "$CREDS_FILE" 2>/dev/null)
    CLIENT_SECRET=$(jq -r '.client_secret // .installed.client_secret // empty' "$CREDS_FILE" 2>/dev/null)
    REFRESH_TOKEN=$(jq -r '.refresh_token // empty' "$CREDS_FILE" 2>/dev/null)

    if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
        echo "ERROR: Could not extract client_id or client_secret from $CREDS_FILE" >&2
        exit 1
    fi

    if [ -z "$REFRESH_TOKEN" ]; then
        # Try loading from token file
        TOKEN_FILE="${CREDS_FILE%/*}/token.json"
        if [ -f "$TOKEN_FILE" ]; then
            REFRESH_TOKEN=$(jq -r '.refresh_token // empty' "$TOKEN_FILE" 2>/dev/null)
        fi
    fi

    if [ -z "$REFRESH_TOKEN" ]; then
        echo "ERROR: refresh_token not found. Run OAuth flow first." >&2
        exit 1
    fi
else
    echo "ERROR: Credentials file not found at $CREDS_FILE" >&2
    exit 1
fi

# Run the container with stdio passthrough
exec docker run \
    -i \
    --rm \
    --name "$CONTAINER_NAME" \
    -e "client_id=$CLIENT_ID" \
    -e "client_secret=$CLIENT_SECRET" \
    -e "refresh_token=$REFRESH_TOKEN" \
    "$IMAGE_NAME"
