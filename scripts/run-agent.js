#!/usr/bin/env node

/**
 * Shell runner for Agent Architect agents.
 *
 * Invokes a specialist agent non-interactively via the `claude -p` CLI,
 * inlining the agent's SKILL.md as the system prompt and building an
 * operation-specific user prompt. Designed so the user can run wiki-ingest
 * (and eventually other agents) from a terminal or cron without
 * launching an interactive Claude Code session.
 *
 * Usage:
 *   node scripts/run-agent.js wiki-ingest --operation lint --scope all
 *   node scripts/run-agent.js wiki-ingest --operation ingest --source raw/foo.md
 *   node scripts/run-agent.js wiki-ingest --operation query-as-write \
 *     --target teams/wharfside/foo.md --briefing "synthesis text"
 *
 * Options:
 *   --wiki-repo <path>   Override WIKI_REPO env var (default: ./wiki)
 *   --model <name>       Override the agent's default model
 *   --dry-run            Print the prompt + claude command, do not invoke
 *   --extra <text>       Extra context to append to the user prompt
 *
 * Currently supports operation handling for wiki-ingest. Other agents
 * can be added by extending buildUserPrompt().
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(REPO_ROOT, 'agents');

function usageAndExit(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(`Usage: node scripts/run-agent.js <agent-id> --operation <op> [options]

Examples:
  node scripts/run-agent.js wiki-ingest --operation lint --scope all
  node scripts/run-agent.js wiki-ingest --operation ingest --source raw/foo.md
  node scripts/run-agent.js wiki-ingest --operation query-as-write \\
    --target teams/wharfside/foo.md --briefing "synthesis text"

Options:
  --wiki-repo <path>   Override WIKI_REPO env var
  --model <name>       Override the agent's default model
  --dry-run            Print the prompt and exit without invoking claude
  --extra <text>       Extra context appended to the user prompt
`);
  process.exit(msg ? 2 : 0);
}

function parseArgs(argv) {
  const args = { _flags: {} };
  if (argv.length === 0) return args;
  args.agentId = argv[0];
  let i = 1;
  while (i < argv.length) {
    const tok = argv[i];
    if (tok === '--dry-run') { args._flags.dryRun = true; i++; continue; }
    if (!tok.startsWith('--')) { usageAndExit(`unexpected positional arg: ${tok}`); }
    const key = tok.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) {
      usageAndExit(`missing value for --${key}`);
    }
    args[key] = val;
    i += 2;
  }
  return args;
}

function resolveWikiRoot(cliArg) {
  if (cliArg) return path.resolve(cliArg);
  if (process.env.WIKI_REPO) return path.resolve(process.env.WIKI_REPO);
  return path.join(REPO_ROOT, 'wiki');
}

function loadAgent(agentId) {
  const dir = path.join(AGENTS_DIR, agentId);
  const skillPath = path.join(dir, 'SKILL.md');
  const configPath = path.join(dir, 'config.json');
  if (!fs.existsSync(skillPath) || !fs.existsSync(configPath)) {
    usageAndExit(`agent not found: agents/${agentId}/ (missing SKILL.md or config.json)`);
  }
  return {
    skill: fs.readFileSync(skillPath, 'utf-8'),
    config: JSON.parse(fs.readFileSync(configPath, 'utf-8')),
    dir,
  };
}

/**
 * Build the user prompt for a wiki-ingest operation.
 * Other agents would get their own switch case here as they're added.
 */
function buildWikiIngestPrompt(args, wikiRoot) {
  const op = args.operation;
  if (!op) usageAndExit('wiki-ingest requires --operation');

  const lines = [
    `You are being invoked via scripts/run-agent.js with the following operation. Follow your SKILL.md exactly.`,
    ``,
    `Wiki root: ${wikiRoot}`,
    ``,
  ];

  switch (op) {
    case 'ingest': {
      if (!args.source) usageAndExit('--operation ingest requires --source <path>');
      lines.push(
        `operation: ingest`,
        `source: ${args.source}`,
      );
      if (args.scope) lines.push(`scope: ${args.scope}`);
      break;
    }
    case 'lint': {
      if (!args.scope) usageAndExit('--operation lint requires --scope <all|teams/wharfside/|...>');
      lines.push(
        `operation: lint`,
        `scope: ${args.scope}`,
      );
      if (args.audit) lines.push(`audit: ${args.audit}`);
      break;
    }
    case 'query-as-write': {
      if (!args.target || !args.briefing) {
        usageAndExit('--operation query-as-write requires --target <path> and --briefing <text-or-@file>');
      }
      // Allow --briefing @path/to/file to read the briefing from disk
      let briefing = args.briefing;
      if (briefing.startsWith('@')) {
        const briefPath = briefing.slice(1);
        if (!fs.existsSync(briefPath)) usageAndExit(`briefing file not found: ${briefPath}`);
        briefing = fs.readFileSync(briefPath, 'utf-8');
      }
      lines.push(
        `operation: query-as-write`,
        `target: ${args.target}`,
        ``,
        `briefing:`,
        briefing,
      );
      break;
    }
    default:
      usageAndExit(`unknown operation: ${op} (expected: ingest, lint, query-as-write)`);
  }

  if (args.extra) {
    lines.push(``, `Additional context from operator:`, args.extra);
  }

  lines.push(
    ``,
    `Begin with the dry-run plan as your first user-facing output. Then apply changes and produce the changelog or lint report row per your SKILL.md.`,
  );

  return lines.join('\n');
}

function buildUserPrompt(agentId, args, wikiRoot) {
  switch (agentId) {
    case 'wiki-ingest':
      return buildWikiIngestPrompt(args, wikiRoot);
    default:
      usageAndExit(`run-agent.js does not yet have an operation handler for agent: ${agentId}. Add one in buildUserPrompt().`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.agentId) usageAndExit('agent-id required');

  const agent = loadAgent(args.agentId);
  const wikiRoot = resolveWikiRoot(args['wiki-repo']);
  const model = args.model || agent.config.execution?.model || 'sonnet';

  const userPrompt = buildUserPrompt(args.agentId, args, wikiRoot);

  // System prompt: agent's full SKILL.md so the CLI invocation carries the
  // agent's behavioral spec without depending on .claude/agents/ files being
  // regenerated.
  const systemPromptAddon = agent.skill;

  const claudeArgs = [
    '-p',
    '--model', model,
    '--allowedTools', 'Read Write Edit Bash Glob Grep',
    '--add-dir', wikiRoot,
    '--append-system-prompt', systemPromptAddon,
    userPrompt,
  ];

  if (args._flags.dryRun) {
    console.log('=== DRY RUN ===');
    console.log('Agent:', agent.config.name, `(${args.agentId})`);
    console.log('Model:', model);
    console.log('Wiki root:', wikiRoot);
    console.log('');
    console.log('--- USER PROMPT ---');
    console.log(userPrompt);
    console.log('');
    console.log('--- INVOCATION ---');
    console.log('claude', claudeArgs.slice(0, -2).join(' '), '<SKILL.md>', '<userPrompt>');
    process.exit(0);
  }

  const env = { ...process.env, WIKI_REPO: wikiRoot };
  const child = spawn('claude', claudeArgs, {
    stdio: 'inherit',
    env,
    cwd: REPO_ROOT,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
  child.on('error', (err) => {
    console.error(`Failed to spawn claude CLI: ${err.message}`);
    console.error(`Is ${HOME_PATH} on PATH?`);
    process.exit(1);
  });
}

if (require.main === module) {
  main();
}

module.exports = { buildWikiIngestPrompt, loadAgent, resolveWikiRoot };
