const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_SCAN_DEPTH = 4;
const DESCRIPTION_LIMIT = 220;

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return {};
  const end = content.indexOf('\n---', 3);
  if (end === -1) return {};
  const block = content.slice(3, end).trim();
  const data = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    data[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return data;
}

function firstMarkdownHeading(content) {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : '';
}

function truncateDescription(description) {
  const text = String(description || '').replace(/\s+/g, ' ').trim();
  if (text.length <= DESCRIPTION_LIMIT) return text;
  return text.slice(0, DESCRIPTION_LIMIT - 1).trimEnd() + '…';
}

function readSkillFile(filePath, rootDir, source) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const frontmatter = parseFrontmatter(content);
    const skillDir = path.dirname(filePath);
    const fallbackName = path.basename(skillDir);
    const relativePath = path.relative(rootDir, filePath);
    return {
      name: frontmatter.name || fallbackName,
      description: truncateDescription(frontmatter.description || firstMarkdownHeading(content) || ''),
      source,
      path: filePath,
      relativePath,
    };
  } catch {
    return null;
  }
}

function scanSkillRoot(rootDir, source, maxDepth = MAX_SCAN_DEPTH) {
  const skills = [];
  const visited = new Set();

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let realPath;
    try {
      realPath = fs.realpathSync(dir);
    } catch {
      return;
    }
    if (visited.has(realPath)) return;
    visited.add(realPath);

    const skillFile = path.join(dir, 'SKILL.md');
    if (fs.existsSync(skillFile)) {
      const skill = readSkillFile(skillFile, rootDir, source);
      if (skill) skills.push(skill);
    }

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      if (entry.name.startsWith('.') && depth === 0) continue;
      walk(path.join(dir, entry.name), depth + 1);
    }
  }

  if (rootDir && fs.existsSync(rootDir)) walk(rootDir, 0);
  return skills;
}

function skillRootsForProvider(provider, projectPath) {
  const home = os.homedir();
  const roots = [];

  if (provider === 'codex') {
    roots.push({ dir: path.join(home, '.codex', 'skills'), source: 'Codex user' });
    roots.push({ dir: path.join(home, '.agents', 'skills'), source: 'Agents user' });
    if (projectPath) {
      roots.push({ dir: path.join(projectPath, '.codex', 'skills'), source: 'Project Codex' });
      roots.push({ dir: path.join(projectPath, '.agents', 'skills'), source: 'Project agents' });
    }
    return roots;
  }

  roots.push({ dir: path.join(home, '.claude', 'skills'), source: 'Claude user' });
  if (projectPath) {
    roots.push({ dir: path.join(projectPath, '.claude', 'skills'), source: 'Project Claude' });
  }
  return roots;
}

function listSessionSkills({ provider = 'claude', projectPath = '' } = {}) {
  const normalizedProvider = provider === 'codex' ? 'codex' : 'claude';
  const seen = new Set();
  const skills = [];

  for (const root of skillRootsForProvider(normalizedProvider, projectPath)) {
    for (const skill of scanSkillRoot(root.dir, root.source)) {
      const key = `${skill.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      skills.push(skill);
    }
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return {
    provider: normalizedProvider,
    projectPath,
    skills,
  };
}

module.exports = {
  listSessionSkills,
  parseFrontmatter,
  scanSkillRoot,
};
