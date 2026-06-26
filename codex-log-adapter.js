function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => {
    if (!part) return '';
    if (typeof part === 'string') return part;
    return part.text || part.input_text || part.output_text || '';
  }).filter(Boolean).join('\n');
}

function parseArguments(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return { raw: String(value) }; }
}

function adaptCodexRollout(content) {
  const entries = [];

  for (const line of String(content || '').split('\n')) {
    if (!line.trim()) continue;
    let raw;
    try { raw = JSON.parse(line); } catch { continue; }

    const timestamp = raw.timestamp;
    const payload = raw.payload || {};

    if (raw.type === 'response_item' && payload.type === 'message') {
      if (payload.role !== 'user' && payload.role !== 'assistant') continue;
      const text = extractText(payload.content);
      if (!text.trim()) continue;
      entries.push({
        type: 'message',
        role: payload.role,
        timestamp,
        message: { content: [{ type: 'text', text }] },
      });
      continue;
    }

    if (raw.type === 'response_item' && payload.type === 'function_call') {
      entries.push({
        type: 'assistant',
        timestamp,
        message: {
          content: [{
            type: 'tool_use',
            id: payload.call_id || payload.id,
            name: payload.name || 'tool',
            input: parseArguments(payload.arguments),
          }],
        },
      });
      continue;
    }

    if (raw.type === 'response_item' && payload.type === 'function_call_output') {
      entries.push({
        type: 'user',
        timestamp,
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: payload.call_id,
            content: payload.output || '',
          }],
        },
      });
      continue;
    }

  }

  return entries;
}

module.exports = { adaptCodexRollout };
