#!/usr/bin/env node

/**
 * Agent Generation Script v2.0
 *
 * Generates Claude Code native agent files AND skill files from Agent Architect definitions.
 *
 * Source: agents/<agent-id>/SKILL.md + config.json, teams/<team-id>/team.json
 * Output:
 *   .claude/agents/<agent-id>.md       (native agent definitions)
 *   .claude/skills/<agent-id>/SKILL.md  (forked skill definitions for specialists)
 *   .claude/skills/<team-id>/SKILL.md   (orchestrator skill definitions for teams)
 *
 * Usage: node scripts/generate-agents.js [--agent <agent-id>] [--team <team-id>]
 */

const fs = require('fs');
const path = require('path');

// Configuration
const AGENTS_DIR = path.join(__dirname, '..', 'agents');
const TEAMS_DIR = path.join(__dirname, '..', 'teams');
const OUTPUT_AGENTS_DIR = path.join(__dirname, '..', '.claude', 'agents');
const OUTPUT_SKILLS_DIR = path.join(__dirname, '..', '.claude', 'skills');

// Wiki knowledge base root. Resolves WIKI_REPO env var, then ~/Workspaces/wiki.
function resolveWikiRoot() {
  if (process.env.WIKI_REPO) return process.env.WIKI_REPO;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, 'Workspaces', 'wiki');
}
const WIKI_ROOT = resolveWikiRoot();

// MCP Server mapping: Agent Architect config -> Claude Code tools
// All external services are accessed via Bash CLI commands (gog, python, curl).
// No MCP tool patterns needed. The mcp_servers field in config.json still
// documents which services an agent needs (for dependency tracking / CLI docs injection).
const MCP_SERVER_MAPPING = {
  // All map to Bash (already in BASE_TOOLS) — no special tool patterns.
};

// ============================================================================
// Agentskills.io spec validation (https://agentskills.io)
// Borrowed from badlogic/pi-mono packages/coding-agent/src/core/skills.ts
// ============================================================================

const MAX_AGENT_ID_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

/**
 * Validate that config.json + parent directory satisfy the agentskills.io
 * skill spec. Per spec: name (our config.id) must be lowercase kebab-case,
 * match parent directory, ≤ 64 chars; description required, ≤ 1024 chars.
 *
 * Lenient: returns warning strings, does not fail generation.
 */
function validateAgentSpec(config, parentDirName) {
  const warnings = [];
  const id = config.id;

  if (!id || typeof id !== 'string') {
    warnings.push(`config.id is missing or not a string`);
  } else {
    if (id !== parentDirName) {
      warnings.push(`config.id "${id}" does not match parent directory "${parentDirName}"`);
    }
    if (id.length > MAX_AGENT_ID_LENGTH) {
      warnings.push(`config.id exceeds ${MAX_AGENT_ID_LENGTH} characters (${id.length})`);
    }
    if (!/^[a-z0-9-]+$/.test(id)) {
      warnings.push(`config.id "${id}" contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`);
    }
    if (id.startsWith('-') || id.endsWith('-')) {
      warnings.push(`config.id "${id}" must not start or end with a hyphen`);
    }
    if (id.includes('--')) {
      warnings.push(`config.id "${id}" must not contain consecutive hyphens`);
    }
  }

  const desc = config.description;
  if (!desc || typeof desc !== 'string' || !desc.trim()) {
    warnings.push('config.description is required and must be non-empty');
  } else if (desc.length > MAX_DESCRIPTION_LENGTH) {
    warnings.push(`config.description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${desc.length})`);
  }

  return warnings;
}

// CLI tool documentation injected into generated skills/agents based on mcp_servers list.
// These tell agents HOW to use each service via CLI commands.
const CLI_TOOL_DOCS = {
  'gmail': `## Gmail CLI (gog)
Use \`gog\` via Bash for all email operations. Always use \`--json\` for parseable output.
- Search: \`gog gmail search 'query' --json --max 20 --account BOARD_EMAIL\`
- Read thread: \`gog gmail threads get <threadId> --json --account BOARD_EMAIL\`
- Send: \`gog gmail send --to addr --subject "..." --body "..." --account BOARD_EMAIL\`
- Draft: \`gog gmail drafts create --to addr --subject "..." --body "..." --account BOARD_EMAIL\`
- Labels: \`gog gmail labels list --json --account BOARD_EMAIL\`
- Attachments: \`gog gmail attachments download <messageId> --account BOARD_EMAIL\`
`,
  'gmail-personal': `## Gmail CLI - Personal (gog)
Same as Gmail CLI but use \`--account PERSONAL_EMAIL\` for the personal account.
`,
  'google-docs': `## Google Docs CLI (gog)
- Create: \`gog docs create --title "Document" --json --account BOARD_EMAIL\`
- Read: \`gog docs to-text <docId> --account BOARD_EMAIL\`
- Export: \`gog docs export <docId> --format pdf --out ./output.pdf --account BOARD_EMAIL\`
`,
  'gdrive': `## Google Drive CLI (gog)
- Search: \`gog drive search 'query' --json --account BOARD_EMAIL\`
- Download: \`gog drive download <fileId> --out ./file --account BOARD_EMAIL\`
- Upload: \`gog drive upload ./file --parent <folderId> --account BOARD_EMAIL\`
`,
  'pdfscribe': `## PDF Transcription (CLI)
Use the pdfscribe Python CLI directly:
- Transcribe: \`python pdfscribe_cli/pdfscribe_cli.py <pdf_file> -o <output.md>\`
- Split large PDF: \`python pdfscribe_cli/src/split_pdf.py <pdf> --pages-per-chunk 50\`
- RAG ingest: \`python pdfscribe_cli/src/rag.py ingest <file> --bucket <bucket_id>\`
- RAG search: \`python pdfscribe_cli/src/rag.py search 'query' --bucket <bucket_id>\`
`,
  'openai-image': `## Image Generation (OpenAI API)
Use curl or Python to generate images directly:
\`\`\`bash
curl -s https://api.openai.com/v1/images/generations \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"dall-e-3","prompt":"...","size":"1792x1024","quality":"hd","response_format":"url"}' \\
  | jq -r '.data[0].url'
\`\`\`
`,
  'powerpoint': `## PowerPoint (python-pptx)
Write and execute Python scripts using python-pptx for presentation creation:
\`\`\`python
from pptx import Presentation
from pptx.util import Inches, Pt
prs = Presentation('templates/YourOrg_TEMPLATE.pptx')
slide = prs.slides.add_slide(prs.slide_layouts[1])
slide.placeholders[0].text = "Title"
prs.save('output.pptx')
\`\`\`
`,
  'voicemode': `## Voice Mode
Local voice mode is available via the /voice-local skill command. Native Claude Code voice is available via /voice.
`,
  'chrome': `## Chrome Browser
Use the Chrome Browser agent via Task delegation for browser automation tasks.
`,
};

// Base tools that all agents should have access to
const BASE_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash',
  'Task',
  'WebFetch',
  'WebSearch',
];

/**
 * Read and parse an agent's config.json
 */
function readAgentConfig(agentDir) {
  const configPath = path.join(agentDir, 'config.json');
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Read an agent's SKILL.md content
 */
function readAgentSkill(agentDir) {
  const skillPath = path.join(agentDir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    return null;
  }
  return fs.readFileSync(skillPath, 'utf-8');
}

/**
 * Read a team's team.json
 */
function readTeamConfig(teamDir) {
  const configPath = path.join(teamDir, 'team.json');
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Map MCP servers from config to Claude Code tool patterns.
 * All external services are accessed via Bash CLI — always returns BASE_TOOLS only.
 */
function mapMcpServersToTools(mcpServers) {
  return [...BASE_TOOLS];
}

/**
 * Generate CLI tool documentation appendix based on agent's mcp_servers list.
 */
function generateCliToolDocs(mcpServers) {
  if (!mcpServers || !Array.isArray(mcpServers) || mcpServers.length === 0) {
    return '';
  }

  const sections = [];
  for (const server of mcpServers) {
    const doc = CLI_TOOL_DOCS[server];
    if (doc) {
      sections.push(doc);
    }
  }

  if (sections.length === 0) return '';

  return '\n\n---\n\n# CLI Tools Reference\n\n<!-- Generated from config.json mcp_servers -->\n\n' + sections.join('\n');
}

// ============================================================================
// Config Extractors - Generate actionable instructions from config.json
// ============================================================================

/**
 * Extract RAG configuration and generate search command section
 */
function extractRagConfig(config) {
  const rag = config.rag_integration || config.rag_config;
  if (!rag || rag.enabled === false) return null;

  const lines = ['### RAG Search Commands', ''];

  if (config.search_behavior?.primary_method === 'rag_semantic') {
    lines.push('**Primary method:** Semantic search via vector database');
    lines.push('');
  }

  // Build env var prefix for commands
  const envVars = rag.env_vars || {};
  const isApiBackend = envVars.RAG_BACKEND === 'api';
  let envPrefix;
  if (isApiBackend) {
    // API backend: use RAG_API_URL and RAG_API_KEY (read from environment at runtime)
    envPrefix = 'RAG_BACKEND=api RAG_API_URL=$RAG_API_URL RAG_API_KEY=$RAG_API_KEY';
  } else {
    envPrefix = Object.entries(envVars)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
  }
  const cmdPrefix = envPrefix ? `${envPrefix} ` : '';

  // Generate the search command
  const cliPath = rag.cli_path;
  const defaultBucket = rag.default_bucket;
  if (cliPath && defaultBucket) {
    lines.push('**Search command:**');
    lines.push('```bash');
    lines.push(`cd ${cliPath} && ${cmdPrefix}python -c "from src.rag import search_documents; results = search_documents('YOUR_QUERY', bucket_id='${defaultBucket}', limit=10, similarity_threshold=0.35); [print(f'[{r.similarity:.3f}] {r.source_file}\\\\n{r.chunk_text[:300]}\\\\n') for r in results]"`);
    lines.push('```');
    lines.push('');
    lines.push(`**Default Bucket:** \`${defaultBucket}\``);
  }

  // Show available buckets for multi-bucket agents
  const buckets = rag.available_buckets;
  if (buckets && buckets.length > 1) {
    lines.push('');
    lines.push('**Available Buckets:** ' + buckets.map(b => `\`${b}\``).join(', '));
    lines.push('');
    lines.push('To search a different bucket, replace the bucket_id parameter:');
    lines.push('```bash');
    const altBucket = buckets.find(b => b !== defaultBucket) || buckets[1];
    lines.push(`cd ${cliPath} && ${cmdPrefix}python -c "from src.rag import search_documents; results = search_documents('YOUR_QUERY', bucket_id='${altBucket}', limit=10, similarity_threshold=0.35); [print(f'[{r.similarity:.3f}] {r.source_file}\\\\n{r.chunk_text[:300]}\\\\n') for r in results]"`);
    lines.push('```');
  }

  // Add tools if available (from pdf-scribe style config)
  if (rag.tools) {
    lines.push('');
    lines.push('**RAG CLI Commands:**');
    for (const [name, cmd] of Object.entries(rag.tools)) {
      // Prepend env vars to each command
      lines.push(`- **${name}:** \`${cmdPrefix}${cmd}\``);
    }
  }

  if (config.search_behavior?.fallback_methods) {
    lines.push('');
    lines.push(`**Fallback methods:** ${config.search_behavior.fallback_methods.join(', ')}`);
  }

  lines.push('');
  lines.push('**Always run RAG search before Glob/Grep for policy queries.**');

  return lines.join('\n');
}

/**
 * Extract Gmail account configuration
 */
function extractGmailConfig(config) {
  const accounts = config.gmail_accounts;
  if (!accounts) return null;

  const lines = ['### Email Accounts', ''];

  for (const [key, account] of Object.entries(accounts)) {
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    lines.push(`**${label} Email:** ${account.address}`);
    lines.push(`- CLI account flag: \`--account ${account.address}\``);
    if (account.default) {
      lines.push('- **Default account**');
    }
    lines.push('');
  }

  lines.push('**Selection Rule:** Use board account for YourTeam matters, personal for general.');

  return lines.join('\n');
}

/**
 * Extract behavioral defaults
 */
function extractBehavioralDefaults(config) {
  const defaults = config.defaults;
  if (!defaults) return null;

  const lines = ['### Behavioral Defaults', ''];

  if (defaults.draft_only !== undefined) {
    lines.push(`- **Draft only:** ${defaults.draft_only ? 'Yes - create drafts, do not send' : 'No - can send emails'}`);
  }
  if (defaults.lookback_days !== undefined) {
    lines.push(`- **Email lookback:** ${defaults.lookback_days} days`);
  }
  if (defaults.max_emails_before_prompt !== undefined) {
    lines.push(`- **Max emails before prompt:** ${defaults.max_emails_before_prompt}`);
  }
  if (defaults.discovery_first !== undefined) {
    lines.push(`- **Discovery first:** ${defaults.discovery_first ? 'Always count before extracting' : 'Extract directly'}`);
  }
  if (defaults.pdf_processing !== undefined) {
    lines.push(`- **PDF processing:** ${defaults.pdf_processing}`);
  }
  if (defaults.working_file_path !== undefined) {
    lines.push(`- **Working files:** \`${defaults.working_file_path}\``);
  }

  return lines.join('\n');
}

/**
 * Extract storage paths configuration
 */
function extractStoragePaths(config) {
  const hasStorage = config.local_storage || config.output?.folder || config.portal_sync;
  if (!hasStorage) return null;

  const lines = ['### Storage Paths', ''];

  if (config.output?.folder) {
    lines.push(`- **Output folder:** \`${config.output.folder}\``);
  }

  if (config.local_storage) {
    const storage = config.local_storage;
    if (storage.base_path) {
      lines.push(`- **Google Drive:** \`${storage.base_path}\``);
    }
    if (storage.document_categories) {
      lines.push('- **Document categories:**');
      for (const [category, catPath] of Object.entries(storage.document_categories)) {
        lines.push(`  - ${category}: \`${catPath}\``);
      }
    }
  }

  if (config.portal_sync?.appfolio) {
    const appfolio = config.portal_sync.appfolio;
    lines.push(`- **AppFolio sync folder:** \`${appfolio.download_folder}\``);
    lines.push(`- **AppFolio URL:** ${appfolio.url}`);
    if (appfolio.notes && appfolio.notes.length > 0) {
      lines.push('- **AppFolio notes:**');
      for (const note of appfolio.notes) {
        lines.push(`  - ${note}`);
      }
    }
  }

  if (config.cli_tool?.path) {
    lines.push(`- **CLI tool path:** \`${config.cli_tool.path}\``);
  }

  return lines.join('\n');
}

/**
 * Extract collaboration configuration and generate Task() examples
 */
function extractCollaboration(config, allAgents) {
  const collab = config.collaboration;
  if (!collab) return null;

  const hasRequestFrom = collab.can_request_from && collab.can_request_from.length > 0;
  const hasProvidesTo = collab.provides_to && collab.provides_to.length > 0;

  if (!hasRequestFrom && !hasProvidesTo) return null;

  const lines = ['### Agent Delegation', ''];

  // Resolve agent IDs to names
  const resolveAgent = (agentId) => {
    if (agentId === 'all') return { id: agentId, name: 'All Agents' };
    const agent = allAgents[agentId];
    return agent ? { id: agentId, name: agent.name } : { id: agentId, name: agentId };
  };

  if (hasRequestFrom) {
    lines.push('**Can request from:**');
    for (const agentId of collab.can_request_from) {
      const agent = resolveAgent(agentId);
      const subagentType = agent.name.split(/[-\s]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const model = allAgents[agentId]?.execution?.model || 'sonnet';
      lines.push(`- **${agent.name}** (\`${agentId}\`): \`Task(prompt="...", subagent_type="${subagentType}", model="${model}")\``);
    }
    lines.push('');
  }

  if (hasProvidesTo) {
    lines.push('**This agent provides to:**');
    const names = collab.provides_to.map(id => resolveAgent(id).name);
    lines.push(`- ${names.join(', ')}`);
    lines.push('');
  }

  if (collab.handoff_format) {
    lines.push(`**Handoff format:** ${collab.handoff_format}`);
  }

  return lines.join('\n');
}

/**
 * Extract CLI tool configuration
 */
function extractCliTool(config) {
  const cli = config.cli_tool;
  if (!cli) return null;

  const lines = ['### CLI Tool Commands', ''];

  if (cli.path) {
    lines.push(`**Working directory:** \`${cli.path}\``);
    lines.push('');
  }

  if (cli.transcribe_command) {
    lines.push(`- **Transcribe:** \`${cli.transcribe_command}\``);
  }
  if (cli.website_command) {
    lines.push(`- **PDF to Website:** \`${cli.website_command}\``);
  }
  if (cli.split_command) {
    lines.push(`- **Split PDF:** \`${cli.split_command}\``);
  }
  if (cli.rag_command) {
    lines.push(`- **RAG operations:** \`${cli.rag_command}\``);
  }

  if (cli.requires_one_of) {
    lines.push('');
    lines.push(`**Requires one of:** ${cli.requires_one_of.join(' or ')}`);
  }
  if (cli.rag_requires) {
    lines.push(`**RAG requires:** ${cli.rag_requires.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Extract email output configuration
 */
function extractEmailConfig(config) {
  const email = config.email;
  const gmail = config.gmail;
  if (!email && !gmail) return null;

  const lines = ['### Email Configuration', ''];

  if (gmail) {
    lines.push(`- **Gmail account:** ${gmail.account}`);
    if (gmail.lookback_days) {
      lines.push(`- **Lookback days:** ${gmail.lookback_days}`);
    }
  }

  if (email) {
    if (email.to) {
      lines.push(`- **Default recipient:** ${email.to}`);
    }
    if (email.subject_format) {
      lines.push(`- **Subject format:** ${email.subject_format}`);
    }
    if (email.mime_type) {
      lines.push(`- **MIME type:** ${email.mime_type}`);
    }
  }

  if (config.output?.email_iteration?.enabled) {
    lines.push('- **Email iteration:** Enabled');
    if (config.output.email_iteration.template) {
      lines.push(`- **Template:** ${config.output.email_iteration.template}`);
    }
  }

  return lines.join('\n');
}

/**
 * Extract wiki_access block and emit read paths, write_via_ingest paths,
 * session_log location, and inline always_load file contents. Replaces
 * context_buckets.assigned during the wiki migration; both may coexist
 * (wiki_access wins with a compat warning logged).
 */
function extractWikiAccess(config) {
  const wiki = config.wiki_access;
  if (!wiki) return null;

  const lines = ['### Wiki Knowledge Base Access', ''];

  const repoRoot = wiki.repo_root && wiki.repo_root.includes('${WIKI_REPO}')
    ? wiki.repo_root.replace('${WIKI_REPO}', WIKI_ROOT)
    : (wiki.repo_root || WIKI_ROOT);
  lines.push(`**Wiki root:** \`${repoRoot}\``);
  lines.push('');

  if (Array.isArray(wiki.read) && wiki.read.length > 0) {
    lines.push('**Read paths (prefix-scoped):**');
    for (const p of wiki.read) {
      lines.push(`- \`${p}\``);
    }
    lines.push('');
  }

  if (Array.isArray(wiki.write_via_ingest) && wiki.write_via_ingest.length > 0) {
    lines.push('**Write paths (via wiki-ingest only):**');
    for (const p of wiki.write_via_ingest) {
      lines.push(`- \`${p}\``);
    }
    lines.push('');
    lines.push('When you need to write to these paths, do NOT write directly. Produce a structured briefing and delegate to the **wiki-ingest** specialist with operation `query-as-write` or `ingest`.');
    lines.push('');
  }

  if (wiki.session_log) {
    lines.push(`**Session log:** Append a brief summary of non-trivial work to \`${wiki.session_log}<YYYY-MM-DD>.md\`. Orchestrators do this after a specialist returns.`);
    lines.push('');
  }

  // Inline always_load file contents so philosophy/team docs are in the agent's prompt.
  if (Array.isArray(wiki.always_load) && wiki.always_load.length > 0) {
    lines.push('**Always loaded (read at every invocation):**');
    for (const relPath of wiki.always_load) {
      const absPath = path.join(repoRoot, relPath);
      lines.push('');
      lines.push(`#### \`${relPath}\``);
      lines.push('');
      try {
        const content = fs.readFileSync(absPath, 'utf-8');
        // Trim leading frontmatter for clarity but keep the body intact.
        lines.push('```markdown');
        lines.push(content.trim());
        lines.push('```');
      } catch (e) {
        lines.push(`*(file not found at generation time: \`${absPath}\`)*`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate the complete Operational Configuration appendix
 */
function generateOperationalAppendix(config, allAgents) {
  // Migration compat: warn if both wiki_access and context_buckets.assigned exist.
  if (config.wiki_access && config.context_buckets?.assigned?.length > 0) {
    console.warn(`Warning: Agent "${config.id}" defines both wiki_access and context_buckets.assigned — wiki_access takes precedence. Remove context_buckets.assigned once migration is verified.`);
  }

  const sections = [
    extractWikiAccess(config),
    extractRagConfig(config),
    extractGmailConfig(config),
    extractBehavioralDefaults(config),
    extractStoragePaths(config),
    extractCliTool(config),
    extractEmailConfig(config),
    extractCollaboration(config, allAgents),
  ].filter(Boolean);

  if (sections.length === 0) {
    return '';
  }

  return '\n\n---\n\n## Operational Configuration\n\n<!-- Generated from config.json - DO NOT EDIT -->\n\n' + sections.join('\n\n');
}

/**
 * Generate YAML frontmatter for the agent
 */
function generateFrontmatter(config, tools) {
  const lines = ['---'];
  lines.push(`name: ${config.name}`);
  lines.push(`description: ${config.description}`);

  // Add model preference if specified
  if (config.execution?.model) {
    lines.push(`model: ${config.execution.model}`);
  }

  lines.push('tools:');
  for (const tool of tools) {
    lines.push(`  - ${tool}`);
  }
  lines.push('---');
  return lines.join('\n');
}

/**
 * Generate metadata comments to preserve Agent Architect data
 */
function generateMetadataComments(config) {
  const lines = [
    '',
    '<!-- GENERATED BY AGENT ARCHITECT v2.0 - DO NOT EDIT DIRECTLY -->',
    `<!-- Source: agents/${config.id}/ -->`,
    '<!-- To modify: Edit SKILL.md and config.json, then run /sync-agents -->',
    `<!-- agent_type: ${config.agent_type || 'specialist'} -->`,
    `<!-- execution: ${JSON.stringify(config.execution || {})} -->`,
  ];

  // Preserve collaboration data
  if (config.collaboration) {
    lines.push(`<!-- collaboration: ${JSON.stringify(config.collaboration)} -->`);
  }

  // Preserve workflow position data
  if (config.workflow_position) {
    lines.push(`<!-- workflow: ${JSON.stringify(config.workflow_position)} -->`);
  }

  // Preserve expertise data
  if (config.expertise) {
    lines.push(`<!-- expertise: ${JSON.stringify(config.expertise)} -->`);
  }

  // Preserve context bucket assignments
  if (config.context_buckets) {
    lines.push(`<!-- context_buckets: ${JSON.stringify(config.context_buckets)} -->`);
  }

  // Preserve wiki_access block (wiki migration)
  if (config.wiki_access) {
    lines.push(`<!-- wiki_access: ${JSON.stringify(config.wiki_access)} -->`);
  }

  // Preserve delegation config (for orchestrators)
  if (config.delegation) {
    lines.push(`<!-- delegation: ${JSON.stringify(config.delegation)} -->`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Generate a complete Claude Code agent file
 */
function generateAgentFile(config, skillContent, allAgents = {}) {
  const tools = mapMcpServersToTools(config.mcp_servers);
  const frontmatter = generateFrontmatter(config, tools);
  const metadata = generateMetadataComments(config);
  const appendix = generateOperationalAppendix(config, allAgents);
  const cliDocs = generateCliToolDocs(config.mcp_servers);

  return `${frontmatter}${metadata}${skillContent}${appendix}${cliDocs}`;
}

// ============================================================================
// Skill Generation - Create .claude/skills/ entries for forked execution
// ============================================================================

/**
 * Generate a Claude Code skill file for a specialist agent.
 * Skills enable forked execution so specialists run in their own context window.
 */
function generateSpecialistSkill(config, allAgents) {
  const tools = mapMcpServersToTools(config.mcp_servers);
  const toolsList = tools.join(', ');

  const lines = [
    '---',
    `name: ${config.id}`,
    `description: ${config.description}`,
    'context: fork',
    `agent: ${config.name}`,
    `allowed-tools: ${toolsList}`,
    'user-invocable: false',
    '---',
    '',
    `<!-- GENERATED BY AGENT ARCHITECT v2.0 - DO NOT EDIT DIRECTLY -->`,
    `<!-- Source: agents/${config.id}/ -->`,
    '',
    `Perform the following task as the ${config.name} specialist:`,
    '',
    '$ARGUMENTS',
    '',
    'Return a concise briefing with:',
    '- **Key Findings** - What you discovered or produced',
    '- **Artifacts** - Paths to any files created',
    '- **Recommendations** - Next steps if applicable',
  ];

  return lines.join('\n');
}

/**
 * Generate a Claude Code skill file for a team orchestrator.
 * This is the team's entry point that routes to specialist subagents.
 */
function generateTeamOrchestratorSkill(teamConfig, allAgents) {
  const orch = teamConfig.orchestration || {};
  const routing = orch.routing || {};
  const members = teamConfig.members || [];

  // All tools accessed via Bash CLI — just use BASE_TOOLS
  const allTools = new Set(BASE_TOOLS);

  // Use skill_alias for the skill name if defined
  const skillName = teamConfig.skill_alias || teamConfig.id;

  const lines = [
    '---',
    `name: ${skillName}`,
    `description: ${teamConfig.description}`,
    `model: ${orch.execution?.model || 'opus'}`,
    `allowed-tools: ${Array.from(allTools).join(', ')}`,
    '---',
    '',
    `<!-- GENERATED BY AGENT ARCHITECT v2.0 - DO NOT EDIT DIRECTLY -->`,
    `<!-- Source: teams/${teamConfig.id}/ -->`,
    '',
    `# ${teamConfig.name} - Orchestrator`,
    '',
    `${teamConfig.description}`,
    '',
    '## Orchestration Strategy',
    '',
    orch.delegation_strategy || 'Delegate work to specialist subagents. Keep this context lean.',
    '',
  ];

  // Inject custom orchestrator instructions if present in team.json
  if (orch.orchestrator_instructions) {
    lines.push(orch.orchestrator_instructions);
    lines.push('');
  }

  // Build delegation rules with dynamic numbering
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
  lines.push(`${ruleNum}. **Craft a focused prompt** — give the specialist exactly what they need`);
  ruleNum++;
  lines.push(`${ruleNum}. **Run in parallel** when multiple specialists are needed simultaneously`);
  ruleNum++;
  lines.push(`${ruleNum}. **Synthesize results** — combine specialist outputs into a coherent response`);
  ruleNum++;
  if (orch.session_summary?.enabled) {
    lines.push(`${ruleNum}. **Write session log** — ALWAYS log the interaction (see Session Summary below)`);
  }
  lines.push('');
  lines.push('## Available Specialists');
  lines.push('');

  // Add each member agent with Task() invocation syntax
  for (const member of members) {
    const agentConfig = allAgents[member.agent_id];
    if (!agentConfig) continue;

    const model = agentConfig.execution?.model || 'sonnet';
    lines.push(`### ${agentConfig.name}`);
    lines.push(`- **Role:** ${member.role}`);
    lines.push(`- **Invoke:** \`Task(subagent_type="${agentConfig.name}", prompt="YOUR TASK HERE", model="${model}")\``);

    // Add description if available
    if (agentConfig.description) {
      lines.push(`- **Capabilities:** ${agentConfig.description}`);
    }
    lines.push('');
  }

  // Add routing table
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

  // Add workflow stages if defined
  if (teamConfig.workflow?.stages) {
    lines.push('## Workflow Stages');
    lines.push('');
    for (const stage of teamConfig.workflow.stages) {
      const stageAgents = stage.agents.map(id => allAgents[id]?.name || id).join(', ');
      const parallel = stage.parallel ? ' (parallel)' : '';
      lines.push(`${stage.name}${parallel}: ${stageAgents}`);
      if (stage.inputs) {
        lines.push(`  - Inputs: ${stage.inputs.join(', ')}`);
      }
      if (stage.outputs) {
        lines.push(`  - Outputs: ${stage.outputs.join(', ')}`);
      }
    }
    lines.push('');
  }

  // Add feedback loop instructions
  // Schema is defined in agents/_templates/feedback-schema.json (single source of truth)
  const feedbackLoop = teamConfig.feedback_loop || {};
  if (feedbackLoop.enabled && feedbackLoop.agents?.length > 0) {
    for (const agentId of feedbackLoop.agents) {
      const agentName = allAgents[agentId]?.name || agentId;
      const feedbackPath = (feedbackLoop.feedback_path || 'agents/{agent_id}/feedback.jsonl').replace('{agent_id}', agentId);
      const minEntries = feedbackLoop.min_entries_before_improve || 3;
      const rubric = feedbackLoop.rubric?.[agentId] || [];
      const improverName = allAgents[feedbackLoop.improver_agent]?.name || feedbackLoop.improver_agent || 'Agent Improver';

      if (rubric.length === 0) {
        console.warn(`Warning: Agent "${agentId}" is in feedback_loop.agents but has no rubric defined in feedback_loop.rubric. Feedback quality will be lower without evaluation criteria.`);
      }

      lines.push(`## Post-Task Feedback Capture (MANDATORY for ${agentId})`);
      lines.push('');
      lines.push(`After the **${agentName}** specialist returns a result, you MUST capture structured feedback before responding to the user. This feeds the self-improvement loop.`);
      lines.push('');
      lines.push(`**Append a JSON line to:** \`${feedbackPath}\``);
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
      lines.push(`LAST_IMPROVE=$(grep -n '"task":"improver-approved"\\|"task":"improver-rejected"' ${feedbackPath} 2>/dev/null | tail -1 | cut -d: -f1)`);
      lines.push(`TOTAL=$(wc -l < ${feedbackPath} 2>/dev/null | tr -d ' ')`);
      lines.push(`TOTAL=\${TOTAL:-0}`);
      lines.push(`if [ -z "$LAST_IMPROVE" ]; then SINCE_IMPROVE=$TOTAL; else SINCE_IMPROVE=$((TOTAL - LAST_IMPROVE)); fi`);
      lines.push(`echo "Total: $TOTAL, Since last improve: $SINCE_IMPROVE"`);
      lines.push('```');
      lines.push(`If \`SINCE_IMPROVE >= ${minEntries}\`, mention to the user:`);
      lines.push(`"The ${agentId} agent has {SINCE_IMPROVE} new feedback entries since the last improvement cycle. Run the Improver to see if there are improvement suggestions? (yes/no)"`);
      lines.push('');
      lines.push(`If yes, invoke: \`Task(subagent_type="${improverName}", prompt="Read agents/${agentId}/SKILL.md and agents/${agentId}/feedback.jsonl. Analyze patterns and propose improvements. Write your proposed changes to agents/${agentId}/SKILL.md.proposed. Then show the diff.")\``);
      lines.push('');
    }
  }

  // Add session summary instructions
  if (orch.session_summary?.enabled) {
    const logPath = orch.session_summary.output_path || 'context-buckets/session-logs/files/';
    lines.push('## Session Summary (MANDATORY)');
    lines.push('');
    lines.push('**ALWAYS write a session log after EVERY interaction**, not just complex ones.');
    lines.push('Do this as your FINAL step before responding to the user.');
    lines.push('');
    lines.push(`**Path:** \`${logPath}\``);
    lines.push(`**Filename:** \`YYYY-MM-DD_${teamConfig.id}_topic-slug.md\``);
    lines.push('');
    lines.push('**Template:**');
    lines.push('````markdown');
    lines.push(`# Session: [Brief Title]`);
    lines.push('');
    lines.push(`**Date:** YYYY-MM-DD`);
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

  // Add team-specific context
  if (teamConfig.gmail_accounts) {
    lines.push('## Email Accounts');
    lines.push('');
    for (const [key, value] of Object.entries(teamConfig.gmail_accounts)) {
      lines.push(`- **${key}:** ${value}`);
    }
    lines.push('');
  }

  lines.push('## User Request');
  lines.push('');
  lines.push('$ARGUMENTS');

  return lines.join('\n');
}

/**
 * Process a single agent - generate both agent file and skill file
 * @param {string} agentId - The agent ID
 * @param {Object} allAgents - Map of all agent configs for collaboration resolution
 * @param {Object} dirs - Optional custom directories for export
 * @param {string} dirs.agentsDir - Source agents directory
 * @param {string} dirs.outputAgentsDir - Output directory for agent .md files
 * @param {string} dirs.outputSkillsDir - Output directory for skill files
 */
function processAgent(agentId, allAgents = {}, dirs = {}) {
  const agentsDir = dirs.agentsDir || AGENTS_DIR;
  const outputAgentsDir = dirs.outputAgentsDir || OUTPUT_AGENTS_DIR;
  const outputSkillsDir = dirs.outputSkillsDir || OUTPUT_SKILLS_DIR;
  const agentDir = path.join(agentsDir, agentId);

  // Skip template directories
  if (agentId.startsWith('_')) {
    return { skipped: true, reason: 'template directory' };
  }

  // Check if directory exists
  if (!fs.existsSync(agentDir) || !fs.statSync(agentDir).isDirectory()) {
    return { error: `Agent directory not found: ${agentDir}` };
  }

  // Read config
  const config = readAgentConfig(agentDir);
  if (!config) {
    return { error: `config.json not found for agent: ${agentId}` };
  }

  // Skip archived agents
  if (config.status === 'archived') {
    return { skipped: true, reason: `archived: ${config.archived_reason || 'no reason given'}` };
  }

  // Validate against agentskills.io spec — lenient (warnings only, never fails)
  const specWarnings = validateAgentSpec(config, agentId);

  // Read SKILL.md
  const skillContent = readAgentSkill(agentDir);
  if (!skillContent) {
    return { error: `SKILL.md not found for agent: ${agentId}` };
  }

  // Generate agent file (.claude/agents/)
  const agentContent = generateAgentFile(config, skillContent, allAgents);
  const agentOutputPath = path.join(outputAgentsDir, `${agentId}.md`);
  fs.writeFileSync(agentOutputPath, agentContent, 'utf-8');

  // Generate skill file (.claude/skills/) for specialist and utility agents
  let skillGenerated = false;
  if (config.agent_type === 'specialist' || config.agent_type === 'utility') {
    const skillDir = path.join(outputSkillsDir, agentId);
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }
    const skillContent2 = generateSpecialistSkill(config, allAgents);
    const skillOutputPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillOutputPath, skillContent2, 'utf-8');
    skillGenerated = true;
  }

  return {
    success: true,
    agentId,
    name: config.name,
    agentType: config.agent_type || 'specialist',
    model: config.execution?.model || 'sonnet',
    agentOutputPath,
    skillGenerated,
    toolCount: mapMcpServersToTools(config.mcp_servers).length,
    specWarnings,
  };
}

/**
 * Process a team - generate orchestrator skill file
 * @param {string} teamId - The team ID
 * @param {Object} allAgents - Map of all agent configs for collaboration resolution
 * @param {Object} dirs - Optional custom directories for export
 * @param {string} dirs.teamsDir - Source teams directory
 * @param {string} dirs.outputSkillsDir - Output directory for skill files
 */
function processTeam(teamId, allAgents = {}, dirs = {}) {
  const teamsDir = dirs.teamsDir || TEAMS_DIR;
  const outputSkillsDir = dirs.outputSkillsDir || OUTPUT_SKILLS_DIR;
  const teamDir = path.join(teamsDir, teamId);

  if (!fs.existsSync(teamDir) || !fs.statSync(teamDir).isDirectory()) {
    return { error: `Team directory not found: ${teamDir}` };
  }

  const teamConfig = readTeamConfig(teamDir);
  if (!teamConfig) {
    return { error: `team.json not found for team: ${teamId}` };
  }

  // Generate orchestrator skill file
  // Use skill_alias if defined, otherwise fall back to team ID
  const skillName = teamConfig.skill_alias || teamId;
  const skillDir = path.join(outputSkillsDir, skillName);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  // Clean up old skill directory if alias changed the name
  if (teamConfig.skill_alias && teamConfig.skill_alias !== teamId) {
    const oldSkillDir = path.join(outputSkillsDir, teamId);
    if (fs.existsSync(oldSkillDir)) {
      fs.rmSync(oldSkillDir, { recursive: true });
    }
  }

  const skillContent = generateTeamOrchestratorSkill(teamConfig, allAgents);
  const skillOutputPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillOutputPath, skillContent, 'utf-8');

  return {
    success: true,
    teamId,
    skillName,
    name: teamConfig.name,
    memberCount: teamConfig.members?.length || 0,
    skillOutputPath,
  };
}

/**
 * Get list of all agent directories
 */
function getAllAgentIds() {
  if (!fs.existsSync(AGENTS_DIR)) {
    return [];
  }

  return fs.readdirSync(AGENTS_DIR)
    .filter(name => {
      const fullPath = path.join(AGENTS_DIR, name);
      return fs.statSync(fullPath).isDirectory() && !name.startsWith('_');
    });
}

/**
 * Get list of all team directories
 */
function getAllTeamIds() {
  if (!fs.existsSync(TEAMS_DIR)) {
    return [];
  }

  return fs.readdirSync(TEAMS_DIR)
    .filter(name => {
      const fullPath = path.join(TEAMS_DIR, name);
      return fs.statSync(fullPath).isDirectory() && !name.startsWith('_');
    });
}

/**
 * Load all agent configs for collaboration resolution
 */
function loadAllAgentConfigs() {
  const allAgents = {};
  const agentIds = getAllAgentIds();

  for (const agentId of agentIds) {
    const agentDir = path.join(AGENTS_DIR, agentId);
    const config = readAgentConfig(agentDir);
    if (config) {
      allAgents[agentId] = config;
    }
  }

  return allAgents;
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  let targetAgent = null;
  let targetTeam = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && args[i + 1]) {
      targetAgent = args[i + 1];
      i++;
    }
    if (args[i] === '--team' && args[i + 1]) {
      targetTeam = args[i + 1];
      i++;
    }
  }

  // Ensure output directories exist
  for (const dir of [OUTPUT_AGENTS_DIR, OUTPUT_SKILLS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Load all agent configs for collaboration name resolution
  const allAgents = loadAllAgentConfigs();

  console.log(`\nAgent Architect v2.0 -> Claude Code Generation`);
  console.log('='.repeat(55));

  // ---- Process Agents ----
  const agentIds = targetAgent ? [targetAgent] : getAllAgentIds();

  const agentResults = { success: [], skipped: [], errors: [] };

  if (agentIds.length > 0) {
    console.log(`\nProcessing ${agentIds.length} agent(s)...\n`);

    for (const agentId of agentIds) {
      const result = processAgent(agentId, allAgents);

      if (result.success) {
        agentResults.success.push(result);
        const skillLabel = result.skillGenerated ? ' + skill' : '';
        console.log(`  [OK] ${result.name} (${result.agentType}, ${result.model})${skillLabel}`);
        if (result.specWarnings && result.specWarnings.length > 0) {
          for (const w of result.specWarnings) {
            console.log(`       [WARN] ${w}`);
          }
        }
      } else if (result.skipped) {
        agentResults.skipped.push({ agentId, ...result });
      } else {
        agentResults.errors.push({ agentId, ...result });
        console.log(`  [ERROR] ${agentId}: ${result.error}`);
      }
    }
  }

  // ---- Process Teams ----
  const teamIds = targetTeam ? [targetTeam] : getAllTeamIds();

  const teamResults = { success: [], errors: [] };

  if (teamIds.length > 0 && !targetAgent) {
    console.log(`\nProcessing ${teamIds.length} team(s)...\n`);

    for (const teamId of teamIds) {
      const result = processTeam(teamId, allAgents);

      if (result.success) {
        teamResults.success.push(result);
        const aliasLabel = result.skillName !== result.teamId ? ` as /${result.skillName}` : '';
        console.log(`  [OK] ${result.name} (orchestrator, ${result.memberCount} members${aliasLabel})`);
      } else {
        teamResults.errors.push({ teamId, ...result });
        console.log(`  [ERROR] ${teamId}: ${result.error}`);
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(55));
  console.log(`Summary:`);
  console.log(`  Agents generated: ${agentResults.success.length}`);
  const skillCount = agentResults.success.filter(r => r.skillGenerated).length;
  console.log(`  Skills generated: ${skillCount} (specialists/utilities)`);
  console.log(`  Team orchestrators: ${teamResults.success.length}`);
  const totalSpecWarnings = agentResults.success.reduce((acc, r) => acc + (r.specWarnings?.length || 0), 0);
  if (totalSpecWarnings > 0) {
    console.log(`  Spec warnings: ${totalSpecWarnings} (agentskills.io compliance)`);
  }
  if (agentResults.errors.length + teamResults.errors.length > 0) {
    console.log(`  Errors: ${agentResults.errors.length + teamResults.errors.length}`);
  }
  console.log('\nGenerated files:');
  console.log('  Agents: .claude/agents/');
  console.log('  Skills: .claude/skills/');

  // Refresh dashboard data (skipped silently if the script isn't bundled — e.g. starter kit)
  const dashboardScript = path.join(__dirname, 'refresh-dashboard.py');
  if (fs.existsSync(dashboardScript)) {
    try {
      const { execSync } = require('child_process');
      console.log('\nRefreshing dashboard data...');
      execSync('python3 scripts/refresh-dashboard.py', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    } catch (e) {
      console.log('  [WARN] Dashboard refresh failed (non-fatal):', e.message);
    }
  }
  console.log('');

  // Exit with error code if there were errors
  if (agentResults.errors.length + teamResults.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Generate Claude Code native files for an export directory.
 * Reuses all generation logic with custom paths and filters.
 *
 * @param {Object} options
 * @param {string} options.agentsDir - Source agents directory (with SKILL.md + config.json)
 * @param {string} options.teamsDir - Source teams directory (with team.json)
 * @param {string} options.outputAgentsDir - Destination for .claude/agents/ agent files
 * @param {string} options.outputSkillsDir - Destination for .claude/skills/ skill files
 * @param {string[]} [options.agentFilter] - Only process these agent IDs (null = all)
 * @param {string[]} [options.teamFilter] - Only process these team IDs (null = all)
 */
function generateForExport(options) {
  const {
    agentsDir,
    teamsDir,
    outputAgentsDir,
    outputSkillsDir,
    agentFilter,
    teamFilter,
  } = options;

  // Ensure output directories exist
  for (const dir of [outputAgentsDir, outputSkillsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Load agent configs from the export's agents directory
  const allAgents = {};
  if (fs.existsSync(agentsDir)) {
    const ids = fs.readdirSync(agentsDir)
      .filter(name => {
        const fullPath = path.join(agentsDir, name);
        return fs.statSync(fullPath).isDirectory() && !name.startsWith('_');
      });
    for (const agentId of ids) {
      const config = readAgentConfig(path.join(agentsDir, agentId));
      if (config) allAgents[agentId] = config;
    }
  }

  const dirs = { agentsDir, outputAgentsDir, outputSkillsDir, teamsDir };

  // Process agents
  const agentIds = agentFilter || Object.keys(allAgents);
  const agentResults = { success: [], errors: [] };

  for (const agentId of agentIds) {
    const result = processAgent(agentId, allAgents, dirs);
    if (result.success) {
      agentResults.success.push(result);
    } else if (!result.skipped) {
      agentResults.errors.push({ agentId, ...result });
    }
  }

  // Process teams
  const teamResults = { success: [], errors: [] };
  if (fs.existsSync(teamsDir)) {
    const teamIds = teamFilter || fs.readdirSync(teamsDir)
      .filter(name => {
        const fullPath = path.join(teamsDir, name);
        return fs.statSync(fullPath).isDirectory() && !name.startsWith('_');
      });

    for (const teamId of teamIds) {
      const result = processTeam(teamId, allAgents, dirs);
      if (result.success) {
        teamResults.success.push(result);
      } else {
        teamResults.errors.push({ teamId, ...result });
      }
    }
  }

  return { agentResults, teamResults };
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  processAgent,
  processTeam,
  getAllAgentIds,
  getAllTeamIds,
  mapMcpServersToTools,
  generateAgentFile,
  generateSpecialistSkill,
  generateTeamOrchestratorSkill,
  generateOperationalAppendix,
  generateCliToolDocs,
  loadAllAgentConfigs,
  generateForExport,
};
