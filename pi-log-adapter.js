function normalizePiToolName(name) {
  const map = {
    read: 'Read',
    bash: 'Bash',
    edit: 'Edit',
    write: 'Write',
    grep: 'Grep',
    find: 'Glob',
  };
  return map[name] || name || 'tool';
}

function normalizePiToolInput(name, input = {}) {
  if (!input || typeof input !== 'object') return {};
  if (name === 'read' && input.path && !input.file_path) {
    return { ...input, file_path: input.path };
  }
  if ((name === 'edit' || name === 'write') && input.path && !input.file_path) {
    return { ...input, file_path: input.path };
  }
  if (name === 'find' && input.pattern) {
    return { ...input };
  }
  return input;
}

function normalizeContent(content) {
  if (!content) return [];
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (!Array.isArray(content)) return [];

  const blocks = [];
  for (const part of content) {
    if (!part) continue;
    if (typeof part === 'string') {
      blocks.push({ type: 'text', text: part });
      continue;
    }
    if (part.type === 'text') {
      blocks.push({ type: 'text', text: part.text || '' });
    } else if (part.type === 'thinking') {
      blocks.push({ type: 'thinking', thinking: part.thinking || '' });
    } else if (part.type === 'toolCall') {
      blocks.push({
        type: 'tool_use',
        id: part.id,
        name: normalizePiToolName(part.name),
        input: normalizePiToolInput(part.name, part.arguments || {}),
      });
    } else if (part.type === 'image') {
      blocks.push({
        type: 'text',
        text: `[Image: ${part.mimeType || 'image'}]`,
      });
    }
  }
  return blocks;
}

function normalizeToolResultContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content || '';
  return content.map(part => {
    if (!part) return '';
    if (typeof part === 'string') return part;
    if (part.type === 'text') return part.text || '';
    if (part.type === 'image') return `[Image: ${part.mimeType || 'image'}]`;
    return part.text || '';
  }).filter(Boolean).join('\n');
}

function adaptPiMessage(entry) {
  const message = entry.message || {};
  const timestamp = entry.timestamp || message.timestamp;

  if (message.role === 'user') {
    const content = normalizeContent(message.content);
    if (!content.length) return null;
    return { type: 'message', role: 'user', timestamp, message: { content } };
  }

  if (message.role === 'assistant') {
    const content = normalizeContent(message.content);
    if (!content.length) return null;
    return { type: 'message', role: 'assistant', timestamp, message: { content } };
  }

  if (message.role === 'toolResult') {
    return {
      type: 'message',
      role: 'user',
      timestamp,
      message: {
        content: [{
          type: 'tool_result',
          tool_use_id: message.toolCallId,
          content: normalizeToolResultContent(message.content),
          is_error: !!message.isError,
        }],
      },
    };
  }

  if (message.role === 'bashExecution') {
    const content = `<bash-input>${message.command || ''}</bash-input>\n<bash-stdout>${message.output || ''}</bash-stdout>`;
    return {
      type: 'message',
      role: 'assistant',
      timestamp,
      message: { content: [{ type: 'text', text: content }] },
    };
  }

  if (message.role === 'custom' && message.display !== false) {
    const content = normalizeContent(message.content);
    if (!content.length) return null;
    return { type: 'message', role: 'user', timestamp, message: { content } };
  }

  if (message.role === 'branchSummary' || message.role === 'compactionSummary') {
    return {
      type: 'message',
      role: 'assistant',
      timestamp,
      message: { content: [{ type: 'text', text: message.summary || '' }] },
    };
  }

  return null;
}

function adaptPiSession(content) {
  const entries = [];

  for (const line of String(content || '').split('\n')) {
    if (!line.trim()) continue;
    let raw;
    try { raw = JSON.parse(line); } catch { continue; }

    if (raw.type === 'session_info' && raw.name) {
      entries.push({ type: 'custom-title', timestamp: raw.timestamp, customTitle: raw.name });
      continue;
    }

    if (raw.type === 'model_change') {
      entries.push({
        type: 'message',
        role: 'assistant',
        timestamp: raw.timestamp,
        message: { content: [{ type: 'text', text: `Model changed to ${[raw.provider, raw.modelId].filter(Boolean).join(' / ')}` }] },
      });
      continue;
    }

    if (raw.type === 'compaction' || raw.type === 'branch_summary') {
      entries.push({
        type: 'message',
        role: 'assistant',
        timestamp: raw.timestamp,
        message: { content: [{ type: 'text', text: raw.summary || '' }] },
      });
      continue;
    }

    if (raw.type === 'custom_message' && raw.display !== false) {
      const contentBlocks = normalizeContent(raw.content);
      if (contentBlocks.length) {
        entries.push({ type: 'message', role: 'user', timestamp: raw.timestamp, message: { content: contentBlocks } });
      }
      continue;
    }

    if (raw.type !== 'message') continue;
    const adapted = adaptPiMessage(raw);
    if (adapted) entries.push(adapted);
  }

  return entries;
}

module.exports = { adaptPiSession, normalizeContent };
