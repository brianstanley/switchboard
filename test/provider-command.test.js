const test = require('node:test');
const assert = require('node:assert/strict');
const codex = require('../providers/codex');
const claude = require('../providers/claude');

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
