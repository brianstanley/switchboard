const test = require('node:test');
const assert = require('node:assert/strict');
const codex = require('../providers/codex');
const claude = require('../providers/claude');
const pi = require('../providers/pi');

test('codex command includes configured launch flags', () => {
  const command = codex.buildCommand({
    sessionId: 'session-1',
    projectPath: '/tmp/project one',
    isNew: true,
    options: {
      codexModel: 'gpt-5.5',
      codexProfile: 'work',
      codexSandbox: 'workspace-write',
      codexApprovalPolicy: 'on-request',
      codexWebSearch: true,
      codexNoAltScreen: true,
      addDirs: '/tmp/extra one,/tmp/extra-two',
    },
  });

  assert.match(command, /^codex --no-alt-screen/);
  assert.match(command, /--model 'gpt-5\.5'/);
  assert.match(command, /--profile 'work'/);
  assert.match(command, /--cd '\/tmp\/project one'/);
  assert.match(command, /--sandbox 'workspace-write'/);
  assert.match(command, /--ask-for-approval 'on-request'/);
  assert.match(command, /--search/);
  assert.match(command, /--add-dir '\/tmp\/extra one'/);
});

test('codex yolo overrides approval and sandbox flags', () => {
  const command = codex.buildCommand({
    sessionId: 'session-1',
    projectPath: '/tmp/project',
    isNew: false,
    options: {
      dangerouslySkipPermissions: true,
      codexSandbox: 'read-only',
      codexApprovalPolicy: 'never',
    },
  });

  assert.match(command, /--dangerously-bypass-approvals-and-sandbox/);
  assert.doesNotMatch(command, /--sandbox/);
  assert.doesNotMatch(command, /--ask-for-approval/);
  assert.match(command, /resume 'session-1'$/);
});

test('codex fork uses fork subcommand', () => {
  const command = codex.buildCommand({
    sessionId: 'new-session',
    projectPath: '/tmp/project',
    isNew: true,
    options: { forkFrom: 'old-session' },
  });

  assert.match(command, / fork 'old-session'$/);
  assert.doesNotMatch(command, /resume 'new-session'/);
});

test('claude command keeps existing permission flags', () => {
  const command = claude.buildCommand({
    sessionId: 'session-1',
    isNew: false,
    options: {
      permissionMode: 'acceptEdits',
      worktree: true,
      worktreeName: 'feature/demo',
      chrome: true,
      addDirs: '/tmp/extra',
      mcpActive: true,
    },
  });

  assert.match(command, /^claude --resume 'session-1'/);
  assert.match(command, /--permission-mode 'acceptEdits'/);
  assert.match(command, /--worktree 'feature\/demo'/);
  assert.match(command, /--chrome/);
  assert.match(command, /--add-dir '\/tmp\/extra'/);
  assert.match(command, /--ide$/);
});

test('pi command includes configured launch flags', () => {
  const command = pi.buildCommand({
    sessionId: 'session-1',
    isNew: true,
    options: {
      piProvider: 'anthropic',
      piModel: 'claude-sonnet-4-5',
      piApiKey: 'secret key',
      piThinking: 'high',
      piProjectTrust: 'approve',
      piTools: 'read,bash',
      piExcludeTools: 'write',
      piNoBuiltinTools: true,
      piOffline: true,
      piSessionDir: '/tmp/pi sessions',
      preLaunchCmd: 'mise exec node@22 --',
    },
  });

  assert.match(command, /^mise exec node@22 -- pi /);
  assert.match(command, /--provider 'anthropic'/);
  assert.match(command, /--model 'claude-sonnet-4-5'/);
  assert.match(command, /--api-key 'secret key'/);
  assert.match(command, /--thinking 'high'/);
  assert.match(command, /--tools 'read,bash'/);
  assert.match(command, /--exclude-tools 'write'/);
  assert.match(command, /--no-builtin-tools/);
  assert.match(command, /--offline/);
  assert.match(command, /--session-dir '\/tmp\/pi sessions'/);
  assert.match(command, /--approve/);
  assert.match(command, /--session-id 'session-1'$/);
});

test('pi yolo maps to approve unless trust is explicit', () => {
  const command = pi.buildCommand({
    sessionId: 'session-1',
    isNew: false,
    options: {
      dangerouslySkipPermissions: true,
      piProjectTrust: 'no-approve',
      filePath: '/tmp/pi-session.jsonl',
    },
  });

  assert.match(command, /--no-approve/);
  assert.doesNotMatch(command, /(?:^| )--approve(?: |$)/);
  assert.match(command, /--session '\/tmp\/pi-session\.jsonl'$/);
});

test('pi fork prefers the persisted file path', () => {
  const command = pi.buildCommand({
    sessionId: 'new-session',
    isNew: true,
    options: {
      forkFrom: 'old-session',
      forkFromFilePath: '/tmp/old-session.jsonl',
    },
  });

  assert.match(command, /^pi --fork '\/tmp\/old-session\.jsonl'$/);
  assert.doesNotMatch(command, /--session-id/);
});
