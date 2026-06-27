const fs = require('fs');
const os = require('os');
const path = require('path');
const { encodeProjectPath } = require('./encode-project-path');

const MAX_TEXT_CONTENT = 8000;
const MAX_SCAN_DEPTH = 5;

function piAgentDir() {
  return process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent');
}

function piSessionsDir() {
  return process.env.PI_CODING_AGENT_SESSION_DIR || path.join(piAgentDir(), 'sessions');
}

function expandHome(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text === '~') return os.homedir();
  if (text.startsWith('~/')) return path.join(os.homedir(), text.slice(2));
  return text;
}

function safeJsonParse(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function textFromContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => {
    if (!part) return '';
    if (typeof part === 'string') return part;
    if (part.type === 'text') return part.text || '';
    if (part.type === 'thinking') return part.thinking || '';
    if (part.type === 'toolCall') return `${part.name || 'tool'} ${JSON.stringify(part.arguments || {})}`;
    if (part.type === 'image') return '[image]';
    return part.text || part.thinking || '';
  }).filter(Boolean).join('\n');
}

function textFromMessage(message) {
  if (!message || typeof message !== 'object') return '';
  if (message.role === 'bashExecution') {
    return [message.command, message.output].filter(Boolean).join('\n');
  }
  if (message.role === 'branchSummary') return message.summary || '';
  if (message.role === 'compactionSummary') return message.summary || '';
  return textFromContent(message.content);
}

function inferIdFromFilePath(filePath) {
  const base = path.basename(filePath, '.jsonl');
  const idx = base.indexOf('_');
  return idx >= 0 ? base.slice(idx + 1) : base;
}

function parsePiSessionFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length === 0) return null;

    const header = safeJsonParse(lines[0]);
    if (!header || header.type !== 'session') return null;

    const sessionId = header.id || inferIdFromFilePath(filePath);
    const projectPath = header.cwd || null;
    if (!sessionId || !projectPath) return null;

    let firstPrompt = '';
    let summary = '';
    let textContent = '';
    let messageCount = 0;
    let sessionName = null;
    let modelInfo = '';

    function appendSearchText(text) {
      if (!text || textContent.length >= MAX_TEXT_CONTENT) return;
      textContent += text.slice(0, 700) + '\n';
    }

    for (let i = 1; i < lines.length; i++) {
      const entry = safeJsonParse(lines[i]);
      if (!entry) continue;

      if (entry.type === 'session_info' && entry.name) {
        sessionName = String(entry.name).slice(0, 240);
        appendSearchText(sessionName);
        continue;
      }

      if (entry.type === 'model_change') {
        modelInfo = [entry.provider, entry.modelId].filter(Boolean).join(' ');
        appendSearchText(modelInfo);
        continue;
      }

      if (entry.type === 'thinking_level_change' && entry.thinkingLevel) {
        appendSearchText(`thinking ${entry.thinkingLevel}`);
        continue;
      }

      if (entry.type === 'compaction' || entry.type === 'branch_summary') {
        appendSearchText(entry.summary || '');
        continue;
      }

      if (entry.type === 'custom_message' && entry.display !== false) {
        const text = textFromContent(entry.content);
        appendSearchText(text);
        continue;
      }

      if (entry.type !== 'message') continue;
      const message = entry.message || {};
      const role = message.role;
      const text = textFromMessage(message);
      appendSearchText(text);

      if (role === 'user' || role === 'assistant') {
        messageCount++;
      }

      if (!firstPrompt && role === 'user' && text.trim()) {
        firstPrompt = text.trim();
        summary = firstPrompt.slice(0, 120);
      }
    }

    if (!summary) summary = sessionName || modelInfo || sessionId;

    return {
      sessionId,
      provider: 'pi',
      folder: 'pi:' + encodeProjectPath(projectPath),
      projectPath,
      summary: String(summary).slice(0, 240),
      firstPrompt: String(firstPrompt || summary || sessionId).slice(0, MAX_TEXT_CONTENT),
      created: header.timestamp || stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      messageCount,
      slug: null,
      customTitle: sessionName,
      aiTitle: null,
      filePath,
      textContent,
    };
  } catch {
    return null;
  }
}

function collectJsonlFiles(rootDir, maxDepth = MAX_SCAN_DEPTH) {
  const files = [];
  const visited = new Set();

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let realPath;
    try { realPath = fs.realpathSync(dir); } catch { return; }
    if (visited.has(realPath)) return;
    visited.add(realPath);

    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(fullPath);
      }
    }
  }

  if (rootDir && fs.existsSync(rootDir)) walk(rootDir, 0);
  return files;
}

function scanPiSessions({ root, roots } = {}) {
  const selectedRoots = roots || [root || piSessionsDir()];
  const byPath = new Map();
  for (const candidate of selectedRoots) {
    const scanRoot = expandHome(candidate);
    if (!scanRoot) continue;
    for (const filePath of collectJsonlFiles(scanRoot)) {
      if (!byPath.has(filePath)) byPath.set(filePath, parsePiSessionFile(filePath));
    }
  }
  return Array.from(byPath.values())
    .filter(Boolean)
    .sort((a, b) => new Date(b.modified) - new Date(a.modified));
}

module.exports = {
  scanPiSessions,
  parsePiSessionFile,
  piAgentDir,
  piSessionsDir,
  expandHome,
};
