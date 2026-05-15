#!/usr/bin/env bash
# Verification script for MCP Server Docker setup

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== MCP Server Docker Verification ==="
echo ""

ERRORS=0
WARNINGS=0

# Check Docker is running
echo "Checking Docker..."
if docker info > /dev/null 2>&1; then
    echo "  [OK] Docker is running"
else
    echo "  [ERROR] Docker is not running"
    ERRORS=$((ERRORS + 1))
fi

# Check images exist
check_image() {
    local img=$1
    local required=$2

    if docker image inspect "$img:latest" > /dev/null 2>&1; then
        size=$(docker image inspect "$img:latest" --format '{{.Size}}' | awk '{printf "%.1fMB", $1/1024/1024}')
        echo "  [OK] $img:latest ($size)"
    elif [ "$required" = "required" ]; then
        echo "  [ERROR] $img:latest not found. Run build.sh first."
        ERRORS=$((ERRORS + 1))
    else
        echo "  [INFO] $img:latest not built (optional)"
    fi
}

echo ""
echo "Checking Docker images..."
check_image "mcp-gmail" "required"
check_image "mcp-gdrive" "required"
check_image "mcp-google-docs" "optional"
check_image "mcp-chrome" "optional"
check_image "mcp-powerpoint" "optional"
check_image "mcp-github" "optional"

# Check wrapper scripts are executable
check_wrapper() {
    local script=$1
    local required=$2

    if [ -x "$PROJECT_DIR/wrappers/$script" ]; then
        echo "  [OK] $script"
    elif [ "$required" = "required" ]; then
        echo "  [ERROR] $script not found or not executable"
        ERRORS=$((ERRORS + 1))
    else
        if [ -f "$PROJECT_DIR/wrappers/$script" ]; then
            echo "  [WARN] $script not executable"
            WARNINGS=$((WARNINGS + 1))
        else
            echo "  [INFO] $script not created (optional)"
        fi
    fi
}

echo ""
echo "Checking wrapper scripts..."
check_wrapper "mcp-gmail-board.sh" "required"
check_wrapper "mcp-gmail-personal.sh" "required"
check_wrapper "mcp-gdrive-board.sh" "required"
check_wrapper "mcp-gdrive-personal.sh" "required"
check_wrapper "mcp-google-docs.sh" "optional"
check_wrapper "mcp-chrome.sh" "optional"
check_wrapper "mcp-powerpoint.sh" "optional"
check_wrapper "mcp-github.sh" "optional"

# Check credentials exist
echo ""
echo "Checking credentials..."

check_creds() {
    local name=$1
    local path=$2
    local required=$3

    # Expand ~ to $HOME
    local expanded_path="${path/#\~/$HOME}"

    if [ -e "$expanded_path" ]; then
        echo "  [OK] $name"
    elif [ "$required" = "required" ]; then
        echo "  [ERROR] $name not found at $path"
        ERRORS=$((ERRORS + 1))
    else
        echo "  [WARN] $name not found at $path"
        WARNINGS=$((WARNINGS + 1))
    fi
}

# Required credentials
check_creds "Gmail Board OAuth keys" "~/.config/mcp-gmail-board/gcp-oauth.keys.json" "required"
check_creds "Gmail Personal OAuth keys" "~/.config/mcp-gmail-personal/gcp-oauth.keys.json" "required"
check_creds "GDrive Board OAuth keys" "~/.config/mcp-gdrive-board/gcp-oauth.keys.json" "required"
check_creds "GDrive Personal OAuth keys" "~/.config/mcp-gdrive-personal/gcp-oauth.keys.json" "required"

# Optional credentials
check_creds "Google Docs credentials" "~/.config/mcp-google-docs/credentials.json" "optional"
check_creds "PowerPoint templates dir" "~/.config/mcp-powerpoint/templates" "optional"
check_creds "PowerPoint workspace dir" "~/.config/mcp-powerpoint/workspace" "optional"
check_creds "GitHub token" "~/.config/mcp-github/token" "optional"

# Test MCP protocol response for built images
echo ""
echo "Testing MCP server responses..."

test_mcp() {
    local name=$1
    local wrapper=$2
    local img=$3

    # Check if image exists
    if ! docker image inspect "$img:latest" > /dev/null 2>&1; then
        echo "  [SKIP] $name - image not built"
        return
    fi

    if [ ! -x "$wrapper" ]; then
        echo "  [SKIP] $name - wrapper not executable"
        return
    fi

    # Send initialize request and check for valid JSON response
    response=$(echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' | timeout 15 "$wrapper" 2>/dev/null | head -1)

    if echo "$response" | grep -q '"jsonrpc"'; then
        echo "  [OK] $name responds to MCP protocol"
    else
        echo "  [WARN] $name did not respond correctly (may need setup)"
        WARNINGS=$((WARNINGS + 1))
    fi
}

test_mcp "Gmail Board" "$PROJECT_DIR/wrappers/mcp-gmail-board.sh" "mcp-gmail"
test_mcp "GDrive Board" "$PROJECT_DIR/wrappers/mcp-gdrive-board.sh" "mcp-gdrive"
test_mcp "Google Docs" "$PROJECT_DIR/wrappers/mcp-google-docs.sh" "mcp-google-docs"
test_mcp "Chrome" "$PROJECT_DIR/wrappers/mcp-chrome.sh" "mcp-chrome"
test_mcp "PowerPoint" "$PROJECT_DIR/wrappers/mcp-powerpoint.sh" "mcp-powerpoint"
test_mcp "GitHub" "$PROJECT_DIR/wrappers/mcp-github.sh" "mcp-github"

# Summary
echo ""
echo "=== Verification Summary ==="
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "All checks passed!"
elif [ $ERRORS -eq 0 ]; then
    echo "Passed with $WARNINGS warning(s)"
else
    echo "$ERRORS error(s), $WARNINGS warning(s)"
    echo "Fix errors before using MCP servers"
    exit 1
fi
