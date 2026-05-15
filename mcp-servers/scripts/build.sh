#!/usr/bin/env bash
# Build all MCP Server Docker images

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Building MCP Server Docker Images ==="
echo "Project directory: $PROJECT_DIR"
echo ""

# Track build results
BUILT=0
FAILED=0

build_image() {
    local name=$1
    local path=$2

    echo "Building $name:latest..."
    if [ -d "$path" ]; then
        if docker build -t "$name:latest" "$path"; then
            echo "  [OK] Built successfully"
            BUILT=$((BUILT + 1))
        else
            echo "  [FAILED] Build failed"
            FAILED=$((FAILED + 1))
        fi
    else
        echo "  [SKIP] Directory not found: $path"
    fi
    echo ""
}

# Build all images
build_image "mcp-gmail" "$PROJECT_DIR/images/gmail/"
build_image "mcp-gdrive" "$PROJECT_DIR/images/gdrive/"
build_image "mcp-google-docs" "$PROJECT_DIR/images/google-docs/"
build_image "mcp-chrome" "$PROJECT_DIR/images/chrome/"
build_image "mcp-powerpoint" "$PROJECT_DIR/images/powerpoint/"
build_image "mcp-gtasks" "$PROJECT_DIR/images/gtasks/"
build_image "mcp-github" "$PROJECT_DIR/images/github/"

echo "=== Build Summary ==="
echo "Built: $BUILT  Failed: $FAILED"
echo ""

if [ $FAILED -gt 0 ]; then
    echo "Some builds failed!"
    exit 1
fi

echo "Built images:"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep -E "^(REPOSITORY|mcp-)"
