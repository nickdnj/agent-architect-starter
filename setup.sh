#!/usr/bin/env bash
set -euo pipefail

# Agent Architect Starter — first-run setup

cd "$(dirname "$0")"

echo "================================================"
echo "  Agent Architect Starter — Setup"
echo "================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required. Install from https://nodejs.org"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required."
  exit 1
fi

echo "Installing dependencies..."
npm install

# Point at the bundled wiki for this run so always_load inlining works on first run
# even before the user persists WIKI_REPO in their shell rc.
export WIKI_REPO="$(pwd)/wiki"

echo ""
echo "Generating Claude Code native agent files..."
echo "  WIKI_REPO=\$WIKI_REPO"
node scripts/generate-agents.js

echo ""
echo "================================================"
echo "  Setup complete."
echo "================================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Point WIKI_REPO at the bundled wiki (add to your shell rc to persist):"
echo "     export WIKI_REPO=\"\$(pwd)/wiki\""
echo ""
echo "2. Open this directory in Claude Code:"
echo "   claude ."
echo ""
echo "3. Meet the Setup Concierge - they will bootstrap the wiki and connect your first MCP server:"
echo "   /starter help me get set up"
echo ""
echo "4. Or design your own team with Archie:"
echo "   /architect"
echo ""
