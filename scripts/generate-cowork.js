#!/usr/bin/env node

/**
 * Cowork Skill Generation Script v1.0
 *
 * Generates Cowork-compatible orchestrator files from Agent Architect definitions.
 * This is the bridge/sync companion to generate-agents.js (which outputs Claude Code format).
 *
 * Source: agents/<agent-id>/SKILL.md + config.json, teams/<team-id>/team.json
 * Output:
 *   cowork/skills/<team-skill-alias>/SKILL.md  (orchestrator instructions for teams)
 *   cowork/skills/architect/SKILL.md            (management instructions)
 *   cowork/ROUTING.md                           (CLAUDE.md routing section for Cowork)
 *
 * The generated files live in AgentArchitect/cowork/ and are loaded via CLAUDE.md routing.
 * Cowork's .skills/ directory is read-only, so we route through CLAUDE.md Read instructions
 * instead of registering as native Cowork skills.
 *
 * Usage: node scripts/generate-cowork.js [--team <team-id>]
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const AGENTS_DIR = path.join(__dirname, '..', 'agents');
const TEAMS_DIR = path.join(__dirname, '..', 'teams');
const ARCHITECT_DIR = path.join(__dirname, '..', 'Architect');
const REGISTRY_DIR = path.join(__dirname, '..', 'registry');

// Output directory for generated Cowork orchestrator files
const COWORK_OUTPUT_DIR = path.join(__dirname, '..', 'cowork', 'skills');

// Workspace-relative path prefix for generated skills to reference source files
const AA_WORKSPACE_PATH = 'AgentArchitect';

// RAG configuration for offline FTS5 backend (Cowork-compatible)
const RAG_CONFIG = {
  clientScript: 'AgentArchitect/cowork/rag-client-fts.py',
  dbPath: 'AgentArchitect/data/rag-fts.db',
  buckets: [
    'wharfside-docs', 'research-cache', 'session-logs', 'altium-playbook',
    'personal-notes', 'ai-journey', 'altium-presentation-guide',
  ],
};

// Cowork MCP tool reference - native tools available in Cowork
const COWORK_MCP_TOOLS = {
  'gmail': {
    label: 'Gmail',
    tools: [
      'gmail_search_messages — search emails with Gmail query syntax',
      'gmail_read_message — read a specific message by ID',
      'gmail_read_thread — read an entire email thread',
      'gmail_create_draft — create an email draft',
      'gmail_get_profile — get authenticated user profile',
      'gmail_list_labels — list all Gmail labels',
      'gmail_list_drafts — list saved drafts',
    ],
  },
  'gmail-personal': {
    label: 'Gmail (Personal)',
    tools: [
      'Same tools as Gmail above — these are globally available',
    ],
    note: 'In Cowork, there is one Gmail connection. Use the q parameter to filter by account.',
  },
  'gcal': {
    label: 'Google Calendar',
    tools: [
      'gcal_list_events — list events in a time range',
      'gcal_create_event — create a new event',
      'gcal_update_event — modify an existing event',
      'gcal_delete_event — delete an event',
      'gcal_get_event — get event details',
      'gcal_find_meeting_times — find available slots for multiple attendees',
      'gcal_find_my_free_time — find free time on your calendar',
      'gcal_list_calendars — list subscribed calendars',
      'gcal_respond_to_event — RSVP to an invitation',
    ],
  },
  'gdrive': {
    label: 'Google Drive',
    tools: [
      'gdrive_search — search files in Google Drive',
      'gdrive_read_file — read file contents',
      'gsheets_read — read spreadsheet data',
      'gsheets_update_cell — update a cell value',
    ],
  },
  'chrome': {
    label: 'Chrome Browser (Claude in Chrome)',
    tools: [
      'computer — mouse/keyboard/screenshot actions',
      'read_page — get accessibility tree of page',
      'find — find elements by natural language',
      'navigate — go to URL or back/forward',
      'javascript_tool — execute JS in page context',
      'form_input — set form values',
      'get_page_text — extract text from page',
      'tabs_context_mcp — get tab group context',
    ],
  },
};

// ============================================================================
// File I/O Helpers (reuse patterns from generate-agents.js)
// ============================================================================

function readAgentConfig(agentDir) {
  const configPath = path.join(agentDir, 'config.json');
  if (!fs.existsSync(configPath)) return null;
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function readAgentSkill(agentDir) {
  const skillPath = path.join(agentDir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  return fs.readFileSync(skillPath, 'utf-8');
}

function readTeamConfig(teamDir) {
  const configPath = path.join(teamDir, 'team.json');
  if (!fs.existsSync(configPath)) return null;
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function getAllAgentIds() {
  if (!fs.existsSync(AGENTS_DIR)) return [];
  return fs.readdirSync(AGENTS_DIR).filter(name => {
    const fullPath = path.join(AGENTS_DIR, name);
    return fs.statSync(fullPath).isDirectory() && !name.startsWith('_');
  });
}

function getAllTeamIds() {
  if (!fs.existsSync(TEAMS_DIR)) return [];
  return fs.readdirSync(TEAMS_DIR).filter(name => {
    const fullPath = path.join(TEAMS_DIR, name);
    return fs.statSync(fullPath).isDirectory() && !name.startsWith('_');
  });
}

function loadAllAgentConfigs() {
  const allAgents = {};
  for (const agentId of getAllAgentIds()) {
    const config = readAgentConfig(path.join(AGENTS_DIR, agentId));
    if (config) allAgents[agentId] = config;
  }
  return allAgents;
}

// ============================================================================
// RAG Chrome Bridge Generation
// ============================================================================

/**
 * Check if a team has any members that use RAG/semantic search.
 * Returns true if any member has rag-search capabilities or context_buckets.
 */
function teamUsesRag(teamConfig, allAgents) {
  for (const member of (teamConfig.members || [])) {
    const config = allAgents[member.agent_id];
    if (!config) continue;
    // Check if agent is the RAG search agent itself
    if (member.agent_id === 'rag-search') return true;
    // Check if agent has context buckets (likely needs RAG)
    if (config.context_buckets?.assigned?.length > 0) return true;
    // Check collaboration rules for RAG delegation
    if (config.collaboration?.can_delegate_to?.includes('rag-search')) return true;
  }
  return false;
}

/**
 * Generate RAG local search instructions for a team's orchestrator skill.
 * Uses the local SQLite database via a Python client script.
 */
function generateRagBridgeSection(teamConfig) {
  const defaultBucket = getTeamDefaultBucket(teamConfig);

  return `## RAG Full-Text Search (Offline FTS5)

Search governing documents, session logs, and other indexed content via the offline FTS5 database.
This uses keyword-based BM25 ranking (no network or external dependencies required).

### How to Perform a RAG Search

Run the FTS5 client via Bash:

\`\`\`bash
python ${RAG_CONFIG.clientScript} search "YOUR SEARCH QUERY" --bucket ${defaultBucket || 'wharfside-docs'} --limit 10
\`\`\`

### Commands

\`\`\`bash
# Search with optional bucket filter
python ${RAG_CONFIG.clientScript} search "query" --bucket <bucket-id> --limit 10

# List available buckets
python ${RAG_CONFIG.clientScript} buckets

# Database statistics
python ${RAG_CONFIG.clientScript} stats
\`\`\`

### Available RAG Buckets

${RAG_CONFIG.buckets.map(b => `- \`${b}\``).join('\n')}

### Tips for Better Results

- Use specific keywords, not natural language (FTS5 is keyword-based)
- Multi-word queries match documents containing ALL terms
- Use OR for alternatives: "parking OR vehicles"
- Use * for prefix matching: "insur*" matches insurance, insured, etc.
- Stemming is enabled: "parking" also matches "parked", "parks"
- Combine RAG search with email research for comprehensive coverage
`;
}

/**
 * Get the default RAG bucket for a team based on its shared context.
 */
function getTeamDefaultBucket(teamConfig) {
  const buckets = teamConfig.shared_context?.buckets || [];
  if (buckets.includes('wharfside-docs')) return 'wharfside-docs';
  if (buckets.includes('altium-playbook')) return 'altium-playbook';
  if (buckets.length > 0) return buckets[0];
  return null;
}

// ============================================================================
// Cowork Skill Generation
// ============================================================================

/**
 * Build a "pushy" description for Cowork skill triggering.
 * Cowork uses the description field as the primary trigger mechanism.
 */
function buildPushyDescription(teamConfig) {
  const base = teamConfig.description;
  const routing = teamConfig.orchestration?.routing || {};
  const keywords = Object.keys(routing).map(k => k.replace(/-/g, ' '));

  // Add trigger keywords from routing table
  const triggers = keywords.length > 0
    ? `\n  - TRIGGER KEYWORDS: ${keywords.join(', ')}`
    : '';

  // Add member capabilities summary
  const memberRoles = (teamConfig.members || [])
    .map(m => m.role.split(' - ')[0].trim())
    .join(', ');
  const memberHint = memberRoles
    ? `\n  - CAPABILITIES: ${memberRoles}`
    : '';

  return `${base}${triggers}${memberHint}`;
}

/**
 * Generate the MCP tools reference section for Cowork.
 * Maps agent's mcp_servers config to native Cowork MCP tool names.
 */
function generateCoworkToolsReference(mcpServers) {
  if (!mcpServers || mcpServers.length === 0) return '';

  const lines = ['## MCP Tools Available in Cowork', ''];
  lines.push('In Cowork, MCP tools are available natively (no CLI wrappers needed).', '');

  // Collect unique tool categories needed
  const seen = new Set();
  for (const server of mcpServers) {
    // Normalize server names to tool categories
    const category = server.replace('-personal', '');
    if (COWORK_MCP_TOOLS[category] && !seen.has(category)) {
      seen.add(category);
      const info = COWORK_MCP_TOOLS[category];
      lines.push(`### ${info.label}`);
      for (const tool of info.tools) {
        lines.push(`- ${tool}`);
      }
      if (info.note) {
        lines.push(`\n> ${info.note}`);
      }
      lines.push('');
    }
  }

  // Always include Chrome since it's available in Cowork
  if (!seen.has('chrome')) {
    const chromeInfo = COWORK_MCP_TOOLS['chrome'];
    lines.push(`### ${chromeInfo.label} (available for browser tasks)`);
    for (const tool of chromeInfo.tools) {
      lines.push(`- ${tool}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Collect all unique MCP servers used by team members.
 */
function collectTeamMcpServers(teamConfig, allAgents) {
  const servers = new Set();
  for (const member of (teamConfig.members || [])) {
    const config = allAgents[member.agent_id];
    if (config?.mcp_servers) {
      for (const s of config.mcp_servers) servers.add(s);
    }
  }
  return Array.from(servers);
}

/**
 * Generate context bucket paths section for a specialist.
 */
function getContextBucketPaths(agentConfig) {
  const buckets = agentConfig.context_buckets;
  if (!buckets || !buckets.assigned || buckets.assigned.length === 0) return '';

  const lines = ['## Context Buckets'];
  for (const bucket of buckets.assigned) {
    const bucketId = typeof bucket === 'string' ? bucket : bucket.id;
    const access = typeof bucket === 'object' ? bucket.access || 'read-only' : 'read-only';
    lines.push(`- \`${AA_WORKSPACE_PATH}/context-buckets/${bucketId}/\` (${access})`);
  }
  return lines.join('\n');
}

/**
 * Generate a Cowork orchestrator skill for a team.
 */
function generateCoworkOrchestratorSkill(teamConfig, allAgents) {
  const orch = teamConfig.orchestration || {};
  const routing = orch.routing || {};
  const members = teamConfig.members || [];
  const skillName = teamConfig.skill_alias || teamConfig.id;

  const description = buildPushyDescription(teamConfig);

  const lines = [
    '---',
    `name: ${skillName}`,
    `description: "${description.replace(/"/g, '\\"')}"`,
    '---',
    '',
    `<!-- GENERATED BY AGENT ARCHITECT v2.0 (Cowork) - DO NOT EDIT DIRECTLY -->`,
    `<!-- Source: ${AA_WORKSPACE_PATH}/teams/${teamConfig.id}/ -->`,
    `<!-- Re-generate: node ${AA_WORKSPACE_PATH}/scripts/generate-cowork.js -->`,
    '',
    `# ${teamConfig.name} - Orchestrator`,
    '',
    teamConfig.description,
    '',
    '## Orchestration Strategy',
    '',
    orch.delegation_strategy || 'Delegate work to specialist subagents. Keep this context lean.',
    '',
  ];

  // Custom orchestrator instructions (e.g., YouTube Creative Brief)
  if (orch.orchestrator_instructions) {
    lines.push(orch.orchestrator_instructions);
    lines.push('');
  }

  // Delegation rules — adapted for Cowork's Agent tool
  const hasCustomInstructions = !!orch.orchestrator_instructions;
  lines.push('## CRITICAL: Delegation Rules');
  lines.push('');

  let ruleNum = 1;
  if (hasCustomInstructions) {
    lines.push(`${ruleNum}. **Run any pre-delegation phases first** (see above) — do NOT jump straight to specialists`);
    ruleNum++;
  }
  lines.push(`${ruleNum}. **NEVER do deep analysis yourself** — always delegate to a specialist subagent`);
  ruleNum++;
  lines.push(`${ruleNum}. **Parse the request** — understand what type of work is needed`);
  ruleNum++;
  lines.push(`${ruleNum}. **Select specialist(s)** — choose the right agent(s) from the roster below`);
  ruleNum++;
  lines.push(`${ruleNum}. **For each specialist, use the Agent tool:**`);
  lines.push(`   a. Read the specialist's SKILL.md from the path shown in their roster entry`);
  lines.push(`   b. Construct an Agent tool call with subagent_type="general-purpose"`);
  lines.push(`   c. Include the SKILL.md content, context bucket paths, and the task in the prompt`);
  lines.push(`   d. Set the model parameter to match the specialist's preferred model`);
  ruleNum++;
  lines.push(`${ruleNum}. **Run multiple Agent calls in parallel** when specialists are independent — use a single message with multiple Agent tool calls`);
  ruleNum++;
  lines.push(`${ruleNum}. **Synthesize results** — combine specialist outputs into a coherent response for the user`);
  ruleNum++;
  if (orch.session_summary?.enabled) {
    lines.push(`${ruleNum}. **Write session log** — ALWAYS log the interaction (see Session Summary below)`);
    ruleNum++;
  }
  lines.push('');

  // Delegation template
  lines.push('## How to Invoke a Specialist');
  lines.push('');
  lines.push('For each specialist delegation, follow this pattern:');
  lines.push('');
  lines.push('```');
  lines.push('1. Read the specialist\'s SKILL.md file using the Read tool');
  lines.push('2. Call the Agent tool:');
  lines.push('   Agent(');
  lines.push('     subagent_type="general-purpose",');
  lines.push('     model="<specialist model>",');
  lines.push('     description="<3-5 word task summary>",');
  lines.push('     prompt="You are the <Name> specialist.\\n\\n<SKILL.md content>\\n\\n');
  lines.push('       ## Context Buckets\\n<paths from roster>\\n\\n');
  lines.push('       ## Task\\n<YOUR TASK HERE>\\n\\n');
  lines.push('       Return a concise briefing with:\\n');
  lines.push('       - Key Findings\\n- Artifacts created\\n- Recommendations"');
  lines.push('   )');
  lines.push('```');
  lines.push('');

  // Available specialists roster
  lines.push('## Available Specialists');
  lines.push('');

  for (const member of members) {
    const agentConfig = allAgents[member.agent_id];
    if (!agentConfig) continue;

    const model = agentConfig.execution?.model || 'sonnet';
    const bucketPaths = getContextBucketPaths(agentConfig);

    lines.push(`### ${agentConfig.name}`);
    lines.push(`- **Role:** ${member.role}`);
    lines.push(`- **SKILL.md:** \`${AA_WORKSPACE_PATH}/agents/${member.agent_id}/SKILL.md\``);
    lines.push(`- **Model:** ${model}`);

    // Context buckets
    if (agentConfig.context_buckets?.assigned?.length > 0) {
      const bucketList = agentConfig.context_buckets.assigned.map(b => {
        const id = typeof b === 'string' ? b : b.id;
        return `\`${AA_WORKSPACE_PATH}/context-buckets/${id}/\``;
      }).join(', ');
      lines.push(`- **Context Buckets:** ${bucketList}`);
    }

    // Capabilities
    if (agentConfig.description) {
      lines.push(`- **Capabilities:** ${agentConfig.description}`);
    }

    lines.push('');
  }

  // Routing table
  if (Object.keys(routing).length > 0) {
    lines.push('## Routing Table');
    lines.push('');
    lines.push('| Request Type | Route To |');
    lines.push('|---|---|');
    for (const [taskType, agentIds] of Object.entries(routing)) {
      const names = agentIds.map(id => allAgents[id]?.name || id).join(', ');
      lines.push(`| ${taskType} | ${names} |`);
    }
    lines.push('');
  }

  // Workflow stages
  if (teamConfig.workflow?.stages) {
    lines.push('## Workflow Stages');
    lines.push('');
    for (const stage of teamConfig.workflow.stages) {
      const stageAgents = stage.agents.map(id => allAgents[id]?.name || id).join(', ') || 'Orchestrator';
      const parallel = stage.parallel ? ' (parallel)' : '';
      lines.push(`**${stage.name}**${parallel}: ${stageAgents}`);
      if (stage.inputs) {
        lines.push(`  - Inputs: ${stage.inputs.join(', ')}`);
      }
      if (stage.outputs) {
        lines.push(`  - Outputs: ${stage.outputs.join(', ')}`);
      }
      if (stage.notes) {
        lines.push(`  - Notes: ${stage.notes}`);
      }
    }
    lines.push('');
  }

  // Add feedback loop instructions (Cowork version)
  // Schema is defined in agents/_templates/feedback-schema.json (single source of truth)
  const feedbackLoop = teamConfig.feedback_loop || {};
  if (feedbackLoop.enabled && feedbackLoop.agents?.length > 0) {
    for (const agentId of feedbackLoop.agents) {
      const agentName = allAgents[agentId]?.name || agentId;
      const feedbackPath = (feedbackLoop.feedback_path || 'agents/{agent_id}/feedback.jsonl').replace('{agent_id}', agentId);
      const minEntries = feedbackLoop.min_entries_before_improve || 3;
      const rubric = feedbackLoop.rubric?.[agentId] || [];
      const improverAgent = feedbackLoop.improver_agent || 'improver';

      if (rubric.length === 0) {
        console.warn(`Warning: Agent "${agentId}" is in feedback_loop.agents but has no rubric defined in feedback_loop.rubric. Feedback quality will be lower without evaluation criteria.`);
      }

      lines.push(`## Post-Task Feedback Capture (MANDATORY for ${agentId})`);
      lines.push('');
      lines.push(`After the **${agentName}** specialist returns a result, you MUST capture structured feedback before responding to the user. This feeds the self-improvement loop.`);
      lines.push('');
      lines.push(`**Append a JSON line to:** \`${AA_WORKSPACE_PATH}/${feedbackPath}\``);
      lines.push('');
      lines.push('**Schema** (see `agents/_templates/feedback-schema.json` for full definition):');
      lines.push('```json');
      lines.push('{');
      lines.push('  "schema_v": 1,');
      lines.push('  "ts": "ISO-8601 timestamp",');
      lines.push(`  "agent": "${agentId}",`);
      lines.push('  "task": "brief description of what was asked",');
      lines.push('  "outcome": "success | partial | failure",');
      lines.push('  "what_worked": "specific behaviors that went well",');
      lines.push('  "what_struggled": "specific behaviors that were problematic",');
      lines.push('  "duration_s": 0');
      lines.push('}');
      lines.push('```');
      lines.push('');

      if (rubric.length > 0) {
        lines.push('**Evaluation rubric — answer these for every task:**');
        for (let i = 0; i < rubric.length; i++) {
          lines.push(`${i + 1}. ${rubric[i]}`);
        }
        lines.push('');
      }

      lines.push('**Quality rules:**');
      lines.push('- BAD feedback: `"what_struggled": "Had some issues"` — teaches nothing');
      lines.push('- GOOD feedback: `"what_struggled": "Generated raw SQL instead of using the ORM. Had to rewrite 3 queries."` — specific, actionable');
      lines.push('- BAD: `"what_worked": "Did a good job"` — generic');
      lines.push('- GOOD: `"what_worked": "Correctly split component into container/presentational pattern without being asked"` — names the behavior');
      lines.push('');
      lines.push('If you can\'t assess quality (e.g., the task was a quick lookup, not implementation), set outcome to "success" and note "what_worked": "Quick task, no implementation to evaluate".');
      lines.push('');
      lines.push(`**Trigger the Improver:** After logging feedback, check if enough new entries have accumulated since the last improvement cycle:`);
      lines.push('```bash');
      lines.push(`LAST_IMPROVE=$(grep -n '"task":"improver-approved"\\|"task":"improver-rejected"' ${AA_WORKSPACE_PATH}/${feedbackPath} 2>/dev/null | tail -1 | cut -d: -f1)`);
      lines.push(`TOTAL=$(wc -l < ${AA_WORKSPACE_PATH}/${feedbackPath} 2>/dev/null | tr -d ' ')`);
      lines.push(`TOTAL=\${TOTAL:-0}`);
      lines.push(`if [ -z "$LAST_IMPROVE" ]; then SINCE_IMPROVE=$TOTAL; else SINCE_IMPROVE=$((TOTAL - LAST_IMPROVE)); fi`);
      lines.push(`echo "Total: $TOTAL, Since last improve: $SINCE_IMPROVE"`);
      lines.push('```');
      lines.push(`If \`SINCE_IMPROVE >= ${minEntries}\`, mention to the user:`);
      lines.push(`"The ${agentId} agent has {SINCE_IMPROVE} new feedback entries since the last improvement cycle. Run the Improver to see if there are improvement suggestions? (yes/no)"`);
      lines.push('');
      lines.push(`If yes, read \`${AA_WORKSPACE_PATH}/agents/${improverAgent}/SKILL.md\` and invoke via:`);
      lines.push(`\`Agent(subagent_type="general-purpose", prompt="[Improver SKILL.md content] + Read agents/${agentId}/SKILL.md and agents/${agentId}/feedback.jsonl. Analyze patterns and propose improvements. Write your proposed changes to agents/${agentId}/SKILL.md.proposed. Then show the diff.")\``);
      lines.push('');
    }
  }

  // Session summary
  if (orch.session_summary?.enabled) {
    const logPath = orch.session_summary.output_path || 'context-buckets/session-logs/files/';
    lines.push('## Session Summary (MANDATORY)');
    lines.push('');
    lines.push('**ALWAYS write a session log after EVERY interaction**, not just complex ones.');
    lines.push('Do this as your FINAL step before responding to the user.');
    lines.push('');
    lines.push(`**Path:** \`${AA_WORKSPACE_PATH}/${logPath}\``);
    lines.push(`**Filename:** \`YYYY-MM-DD_${teamConfig.id}_topic-slug.md\``);
    lines.push('');
    lines.push('**Template:**');
    lines.push('````markdown');
    lines.push('# Session: [Brief Title]');
    lines.push('');
    lines.push('**Date:** YYYY-MM-DD');
    lines.push(`**Team:** ${teamConfig.id}`);
    lines.push('**Specialists Invoked:** [list]');
    lines.push('');
    lines.push('## Request');
    lines.push('[What the user asked]');
    lines.push('');
    lines.push('## Actions');
    lines.push('- [Specialist] — [what it did, key findings]');
    lines.push('');
    lines.push('## Artifacts');
    lines.push('- [paths to any files created, or "None"]');
    lines.push('');
    lines.push('## Key Findings');
    lines.push('[Summary of results delivered to user]');
    lines.push('````');
    lines.push('');
  }

  // Email accounts
  if (teamConfig.gmail_accounts) {
    lines.push('## Email Accounts');
    lines.push('');
    for (const [key, value] of Object.entries(teamConfig.gmail_accounts)) {
      lines.push(`- **${key}:** ${value}`);
    }
    lines.push('');
  }

  // Branding
  if (teamConfig.branding) {
    lines.push('## Branding');
    lines.push('');
    if (teamConfig.branding.logo_url) {
      lines.push(`- **Logo:** ${teamConfig.branding.logo_url}`);
    }
    if (teamConfig.branding.colors) {
      for (const [name, hex] of Object.entries(teamConfig.branding.colors)) {
        lines.push(`- **${name}:** ${hex}`);
      }
    }
    if (teamConfig.branding.location) {
      lines.push(`- **Location:** ${teamConfig.branding.location}`);
    }
    lines.push('');
  }

  // MCP tools reference
  const teamMcpServers = collectTeamMcpServers(teamConfig, allAgents);
  const toolsRef = generateCoworkToolsReference(teamMcpServers);
  if (toolsRef) {
    lines.push(toolsRef);
  }

  // RAG Chrome Bridge (if team uses RAG/semantic search)
  if (teamUsesRag(teamConfig, allAgents)) {
    lines.push(generateRagBridgeSection(teamConfig));
  }

  // Shared context buckets
  if (teamConfig.shared_context?.buckets?.length > 0) {
    lines.push('## Shared Context');
    lines.push('');
    for (const bucketId of teamConfig.shared_context.buckets) {
      lines.push(`- \`${AA_WORKSPACE_PATH}/context-buckets/${bucketId}/\``);
    }
    if (teamConfig.shared_context.outputs_folder) {
      lines.push(`- **Outputs:** \`${AA_WORKSPACE_PATH}/${teamConfig.shared_context.outputs_folder}/\``);
    }
    lines.push('');
  }

  // User request placeholder
  lines.push('## User Request');
  lines.push('');
  lines.push('$ARGUMENTS');

  return lines.join('\n');
}

/**
 * Generate the Architect management skill for Cowork.
 */
function generateArchitectSkill() {
  const lines = [
    '---',
    'name: architect',
    'description: "Agent Architect - manage agent teams, create agents, edit configurations, sync skills. Use when you need to build agents, create teams, manage context buckets, or regenerate Cowork skills from Agent Architect definitions."',
    '---',
    '',
    '<!-- GENERATED BY AGENT ARCHITECT v2.0 (Cowork) - DO NOT EDIT DIRECTLY -->',
    `<!-- Source: ${AA_WORKSPACE_PATH}/Architect/ -->`,
    `<!-- Re-generate: node ${AA_WORKSPACE_PATH}/scripts/generate-cowork.js -->`,
    '',
    '# Agent Architect - Management Console',
    '',
    'Master agent for building and managing agent teams in the Agent Architect system.',
    '',
    '## Quick Commands',
    '',
    '| Action | How |',
    '|--------|-----|',
    `| **List agents** | Read \`${AA_WORKSPACE_PATH}/registry/agents.json\` |`,
    `| **List teams** | Read \`${AA_WORKSPACE_PATH}/registry/teams.json\` |`,
    `| **List buckets** | Read \`${AA_WORKSPACE_PATH}/registry/buckets.json\` |`,
    `| **View agent** | Read \`${AA_WORKSPACE_PATH}/agents/<agent-id>/config.json\` and \`SKILL.md\` |`,
    `| **View team** | Read \`${AA_WORKSPACE_PATH}/teams/<team-id>/team.json\` |`,
    `| **Edit agent** | Edit files in \`${AA_WORKSPACE_PATH}/agents/<agent-id>/\` |`,
    `| **Edit team** | Edit \`${AA_WORKSPACE_PATH}/teams/<team-id>/team.json\` |`,
    `| **Re-sync Cowork** | Run \`node ${AA_WORKSPACE_PATH}/scripts/generate-cowork.js\` |`,
    `| **Re-sync Claude Code** | Run \`node ${AA_WORKSPACE_PATH}/scripts/generate-agents.js\` |`,
    '',
    '## Workflow',
    '',
    '1. **Explore** — Read registries and existing definitions to understand current state',
    '2. **Create/Edit** — Modify agent configs, SKILL.md files, or team.json files',
    '3. **Update Registry** — Update the appropriate registry JSON file',
    '4. **Sync** — Run the generator to update Cowork skills',
    '',
    '## Creating a New Agent',
    '',
    '1. Create directory: `AgentArchitect/agents/<agent-id>/`',
    '2. Create `config.json` with: id, name, description, agent_type, execution, mcp_servers, context_buckets, collaboration',
    '3. Create `SKILL.md` with behavioral instructions',
    '4. Add to `registry/agents.json`',
    '5. Add to appropriate team in `teams/<team-id>/team.json`',
    '6. Run sync: `node AgentArchitect/scripts/generate-cowork.js`',
    '',
    '## Creating a New Team',
    '',
    '1. Create directory: `AgentArchitect/teams/<team-id>/`',
    '2. Create `team.json` with: id, name, description, members, orchestration, shared_context',
    '3. Add to `registry/teams.json`',
    '4. Run sync: `node AgentArchitect/scripts/generate-cowork.js`',
    '',
    `## Source of Truth: \`${AA_WORKSPACE_PATH}/\``,
    '',
    'All agent and team definitions live in the AgentArchitect workspace folder.',
    'Cowork skills are GENERATED from these definitions — never edit generated skills directly.',
    '',
    '## User Request',
    '',
    '$ARGUMENTS',
  ];

  return lines.join('\n');
}

// ============================================================================
// Routing File Generation
// ============================================================================

/**
 * Generate the ROUTING.md file that provides CLAUDE.md-compatible routing
 * instructions for Cowork. This replaces the manifest.json approach since
 * Cowork's .skills/ directory is read-only.
 */
function generateRoutingFile(generatedSkills, allAgents) {
  const lines = [
    '# Cowork Routing Configuration',
    '',
    '<!-- GENERATED BY AGENT ARCHITECT v2.0 (Cowork) - DO NOT EDIT DIRECTLY -->',
    `<!-- Re-generate: node AgentArchitect/scripts/generate-cowork.js -->`,
    `<!-- Generated: ${new Date().toISOString()} -->`,
    '',
    '## Smart Routing (MANDATORY)',
    '',
    'When the user starts a conversation without invoking a specific agent or team,',
    'you MUST route to the appropriate orchestrator by **reading its SKILL.md file**.',
    'The orchestrator handles routing and delegation to specialist subagents.',
    '',
    '| Topic Signals | Action |',
    '|---|---|',
  ];

  // Build routing table from team configs
  for (const skill of generatedSkills) {
    if (skill.teamConfig) {
      const routing = skill.teamConfig.orchestration?.routing || {};
      const keywords = Object.keys(routing).map(k => k.replace(/-/g, ' '));
      // Also add team-level keywords
      const teamKeywords = skill.keywords || [];
      const allKeywords = [...new Set([...teamKeywords, ...keywords])].slice(0, 8);
      const keywordStr = allKeywords.join(', ');
      lines.push(`| ${keywordStr} | Read \`AgentArchitect/cowork/skills/${skill.skillId}/SKILL.md\` and follow its orchestration instructions |`);
    }
  }

  // Add architect
  lines.push('| Build agent, create team, manage agents, modify agent, bucket, sync | Read `AgentArchitect/cowork/skills/architect/SKILL.md` and follow its instructions |');

  lines.push('');
  lines.push('## Routing Rules');
  lines.push('');
  lines.push('1. Match on keywords in the user\'s request');
  lines.push('2. If ambiguous, ask which team they want');
  lines.push('3. If clearly about agent/team management, use the Architect');
  lines.push('4. **ALWAYS read the orchestrator file** — never call specialist agents directly');
  lines.push('5. The orchestrator will delegate to the right specialist(s) via the Agent tool');
  lines.push('');
  lines.push('## Available Teams');
  lines.push('');

  for (const skill of generatedSkills) {
    if (skill.teamConfig) {
      const memberCount = skill.teamConfig.members?.length || 0;
      lines.push(`- **${skill.teamConfig.name}** (${memberCount} specialists) — \`AgentArchitect/cowork/skills/${skill.skillId}/SKILL.md\``);
    }
  }

  lines.push(`- **Agent Architect** (management) — \`AgentArchitect/cowork/skills/architect/SKILL.md\``);
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Main Execution
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  let targetTeam = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--team' && args[i + 1]) {
      targetTeam = args[i + 1];
      i++;
    }
  }

  // Ensure output directory exists
  if (!fs.existsSync(COWORK_OUTPUT_DIR)) {
    fs.mkdirSync(COWORK_OUTPUT_DIR, { recursive: true });
  }

  // Load all agent configs
  const allAgents = loadAllAgentConfigs();

  console.log(`\nAgent Architect v2.0 -> Cowork Skill Generation`);
  console.log('='.repeat(55));
  console.log(`Output directory: ${COWORK_OUTPUT_DIR}`);
  console.log(`Agents loaded: ${Object.keys(allAgents).length}`);

  // ---- Process Teams ----
  const teamIds = targetTeam ? [targetTeam] : getAllTeamIds();
  const results = { success: [], errors: [] };
  const generatedSkills = [];

  console.log(`\nProcessing ${teamIds.length} team(s)...\n`);

  // Team-level keyword mapping for routing
  const TEAM_KEYWORDS = {





  };

  for (const teamId of teamIds) {
    const teamDir = path.join(TEAMS_DIR, teamId);
    if (!fs.existsSync(teamDir)) {
      results.errors.push({ teamId, error: `Team directory not found: ${teamDir}` });
      console.log(`  [ERROR] ${teamId}: directory not found`);
      continue;
    }

    const teamConfig = readTeamConfig(teamDir);
    if (!teamConfig) {
      results.errors.push({ teamId, error: 'team.json not found' });
      console.log(`  [ERROR] ${teamId}: team.json not found`);
      continue;
    }

    const skillName = teamConfig.skill_alias || teamId;
    const skillOutputDir = path.join(COWORK_OUTPUT_DIR, skillName);

    if (!fs.existsSync(skillOutputDir)) {
      fs.mkdirSync(skillOutputDir, { recursive: true });
    }

    // Generate orchestrator skill
    const content = generateCoworkOrchestratorSkill(teamConfig, allAgents);
    const outputPath = path.join(skillOutputDir, 'SKILL.md');
    fs.writeFileSync(outputPath, content, 'utf-8');

    generatedSkills.push({
      skillId: skillName,
      teamConfig,
      keywords: TEAM_KEYWORDS[teamId] || [],
    });

    results.success.push({
      teamId,
      skillName,
      name: teamConfig.name,
      memberCount: teamConfig.members?.length || 0,
      outputPath,
    });

    const aliasLabel = skillName !== teamId ? ` as ${skillName}` : '';
    console.log(`  [OK] ${teamConfig.name} (${teamConfig.members?.length || 0} members${aliasLabel})`);
  }

  // ---- Generate Architect Skill ----
  console.log(`\nGenerating Architect skill...`);
  const architectDir = path.join(COWORK_OUTPUT_DIR, 'architect');
  if (!fs.existsSync(architectDir)) {
    fs.mkdirSync(architectDir, { recursive: true });
  }
  const architectContent = generateArchitectSkill();
  fs.writeFileSync(path.join(architectDir, 'SKILL.md'), architectContent, 'utf-8');
  console.log('  [OK] Architect (management console)');

  // ---- Generate Routing File ----
  console.log(`\nGenerating routing file...`);
  const routingContent = generateRoutingFile(generatedSkills, allAgents);
  const routingPath = path.join(__dirname, '..', 'cowork', 'ROUTING.md');
  fs.writeFileSync(routingPath, routingContent, 'utf-8');
  console.log(`  [OK] ${routingPath}`);

  // ---- Summary ----
  console.log('\n' + '='.repeat(55));
  console.log('Summary:');
  console.log(`  Team orchestrators: ${results.success.length}`);
  console.log(`  Architect skill: 1`);
  console.log(`  Routing file: cowork/ROUTING.md`);
  if (results.errors.length > 0) {
    console.log(`  Errors: ${results.errors.length}`);
  }
  console.log(`\nGenerated orchestrators:`);
  for (const r of results.success) {
    console.log(`  ${r.skillName} — ${r.name} (${r.memberCount} specialists)`);
  }
  console.log(`  architect — Agent Architect (management)`);
  console.log(`\nOutput: AgentArchitect/cowork/`);
  console.log(`\nNext: Update CLAUDE.md to include the routing instructions.`);
  console.log('');

  if (results.errors.length > 0) {
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  generateCoworkOrchestratorSkill,
  generateArchitectSkill,
  generateRoutingFile,
  buildPushyDescription,
  loadAllAgentConfigs,
};
