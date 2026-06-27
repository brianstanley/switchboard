const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parsePiSessionFile, scanPiSessions } = require('../pi-session-scanner');
const { adaptPiSession } = require('../pi-log-adapter');

function writePiSession(root) {
  const dir = path.join(root, '--tmp-project--');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, '2026-06-26T10-00-00-000Z_pi-session-1.jsonl');
  const lines = [
    { type: 'session', version: 3, id: 'pi-session-1', timestamp: '2026-06-26T10:00:00.000Z', cwd: '/tmp/project' },
    { type: 'session_info', id: 'info1', parentId: null, timestamp: '2026-06-26T10:00:01.000Z', name: 'Named Pi session' },
    { type: 'model_change', id: 'model1', parentId: 'info1', timestamp: '2026-06-26T10:00:02.000Z', provider: 'anthropic', modelId: 'claude-sonnet-4-5' },
    { type: 'message', id: 'user1', parentId: 'model1', timestamp: '2026-06-26T10:00:03.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Review the billing code' }] } },
    { type: 'message', id: 'assistant1', parentId: 'user1', timestamp: '2026-06-26T10:00:04.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'I will read it.' }, { type: 'toolCall', id: 'tool-1', name: 'read', arguments: { path: '/tmp/project/billing.js' } }] } },
    { type: 'message', id: 'tool1', parentId: 'assistant1', timestamp: '2026-06-26T10:00:05.000Z', message: { role: 'toolResult', toolCallId: 'tool-1', toolName: 'read', content: [{ type: 'text', text: 'const total = 1;' }], isError: false } },
  ];
  fs.writeFileSync(filePath, lines.map(line => JSON.stringify(line)).join('\n') + '\n');
  return filePath;
}

test('parsePiSessionFile maps Pi JSONL into cached session metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-pi-'));
  const filePath = writePiSession(root);

  const session = parsePiSessionFile(filePath);

  assert.equal(session.sessionId, 'pi-session-1');
  assert.equal(session.provider, 'pi');
  assert.equal(session.projectPath, '/tmp/project');
  assert.equal(session.summary, 'Review the billing code');
  assert.equal(session.customTitle, 'Named Pi session');
  assert.equal(session.messageCount, 2);
  assert.equal(session.filePath, filePath);
  assert.match(session.textContent, /claude-sonnet-4-5/);
});

test('scanPiSessions discovers nested Pi JSONL files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-pi-'));
  writePiSession(root);

  const sessions = scanPiSessions({ root });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionId, 'pi-session-1');
});

test('adaptPiSession renders messages and tool results for the viewer', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-pi-'));
  const filePath = writePiSession(root);
  const entries = adaptPiSession(fs.readFileSync(filePath, 'utf8'));

  assert.equal(entries[0].type, 'custom-title');
  const toolUse = entries.find(entry => entry.role === 'assistant' && entry.message.content.some(block => block.type === 'tool_use'));
  const toolResult = entries.find(entry => entry.role === 'user' && entry.message.content.some(block => block.type === 'tool_result'));

  assert.ok(toolUse);
  assert.ok(toolResult);
  assert.equal(toolUse.message.content[1].name, 'Read');
  assert.equal(toolUse.message.content[1].input.file_path, '/tmp/project/billing.js');
  assert.equal(toolResult.message.content[0].tool_use_id, 'tool-1');
});
