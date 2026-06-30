const test = require('node:test');
const assert = require('node:assert/strict');
const { findNewCodexSession, isVisibleCodexThreadSource } = require('../codex-session-scanner');

function codexSession(sessionId, projectPath, createdOffsetMs) {
  const base = Date.parse('2026-06-30T13:00:00.000Z');
  return {
    sessionId,
    provider: 'codex',
    projectPath,
    created: new Date(base + createdOffsetMs).toISOString(),
    modified: new Date(base + createdOffsetMs).toISOString(),
  };
}

test('findNewCodexSession returns the only new thread for the project', () => {
  const openedAt = Date.parse('2026-06-30T13:00:00.000Z');
  const match = findNewCodexSession([
    codexSession('old', '/repo', -60000),
    codexSession('real', '/repo', 1200),
    codexSession('other-project', '/other', 1000),
  ], {
    projectPath: '/repo',
    openedAt,
    knownThreadIds: new Set(['old']),
  });

  assert.equal(match.sessionId, 'real');
});

test('findNewCodexSession ignores already active real thread ids', () => {
  const openedAt = Date.parse('2026-06-30T13:00:00.000Z');
  const match = findNewCodexSession([
    codexSession('already-active', '/repo', 1000),
  ], {
    projectPath: '/repo',
    openedAt,
    activeThreadIds: new Set(['already-active']),
  });

  assert.equal(match, null);
});

test('findNewCodexSession leaves ambiguous new threads unmapped', () => {
  const openedAt = Date.parse('2026-06-30T13:00:00.000Z');
  const match = findNewCodexSession([
    codexSession('first', '/repo', 1000),
    codexSession('second', '/repo', 3000),
  ], {
    projectPath: '/repo',
    openedAt,
  });

  assert.equal(match, null);
});

test('findNewCodexSession resolves a clearly closest thread', () => {
  const openedAt = Date.parse('2026-06-30T13:00:00.000Z');
  const match = findNewCodexSession([
    codexSession('closest', '/repo', 1000),
    codexSession('later', '/repo', 90000),
  ], {
    projectPath: '/repo',
    openedAt,
  });

  assert.equal(match.sessionId, 'closest');
});

test('isVisibleCodexThreadSource hides non-interactive exec threads', () => {
  assert.equal(isVisibleCodexThreadSource('exec'), false);
  assert.equal(isVisibleCodexThreadSource('cli'), true);
  assert.equal(isVisibleCodexThreadSource(null), true);
});
