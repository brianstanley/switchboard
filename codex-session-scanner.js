const fs = require('fs');
const os = require('os');
const path = require('path');
const { encodeProjectPath } = require('./encode-project-path');

let Database = null;

function getDatabase() {
  if (!Database) Database = require('better-sqlite3');
  return Database;
}

function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function stateDbPath() {
  return path.join(codexHome(), 'state_5.sqlite');
}

function toIso(msValue, secondsValue) {
  const ms = Number(msValue || 0) || (Number(secondsValue || 0) * 1000);
  if (!ms) return new Date(0).toISOString();
  try { return new Date(ms).toISOString(); } catch { return new Date(0).toISOString(); }
}

function normalizeRolloutPath(rolloutPath) {
  if (!rolloutPath) return null;
  if (path.isAbsolute(rolloutPath)) return rolloutPath;
  return path.join(codexHome(), rolloutPath);
}

function isVisibleCodexThreadSource(source) {
  return String(source || '').trim() !== 'exec';
}

function scanCodexSessions() {
  const dbPath = stateDbPath();
  if (!fs.existsSync(dbPath)) return [];

  let db;
  try {
    db = new (getDatabase())(dbPath, { readonly: true, fileMustExist: true });
    const rows = db.prepare(`
      SELECT
        id, rollout_path, created_at, updated_at, created_at_ms, updated_at_ms,
        cwd, title, first_user_message, preview, tokens_used, git_branch,
        model, model_provider, approval_mode, sandbox_policy, archived,
        source, thread_source
      FROM threads
      WHERE archived = 0
        AND COALESCE(source, '') != 'exec'
        AND cwd IS NOT NULL
        AND cwd != ''
        AND (
          first_user_message != ''
          OR title != ''
          OR preview != ''
          OR tokens_used > 0
        )
      ORDER BY COALESCE(updated_at_ms, updated_at * 1000) DESC
    `).all();

    return rows.map(row => {
      const projectPath = row.cwd;
      const folder = 'codex:' + encodeProjectPath(projectPath);
      const firstPrompt = row.first_user_message || row.preview || row.title || row.id;
      const summary = row.title || firstPrompt;
      const modelInfo = [row.model, row.approval_mode, row.sandbox_policy].filter(Boolean).join('\n');
      return {
        sessionId: row.id,
        provider: 'codex',
        folder,
        projectPath,
        summary: String(summary || row.id).slice(0, 240),
        firstPrompt: String(firstPrompt || summary || row.id).slice(0, 8000),
        created: toIso(row.created_at_ms, row.created_at),
        modified: toIso(row.updated_at_ms, row.updated_at),
        messageCount: Math.max(1, Number(row.tokens_used || 0) > 0 ? 2 : 1),
        slug: null,
        aiTitle: row.title || null,
        filePath: normalizeRolloutPath(row.rollout_path),
        source: row.source || null,
        threadSource: row.thread_source || null,
        textContent: [firstPrompt, row.preview, row.title, modelInfo, row.git_branch].filter(Boolean).join('\n'),
      };
    });
  } catch {
    return [];
  } finally {
    try { if (db) db.close(); } catch {}
  }
}

function dateMs(value) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : 0;
}

function asSet(value) {
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value : []);
}

function findNewCodexSession(sessions, {
  projectPath,
  openedAt,
  knownThreadIds,
  activeThreadIds,
} = {}) {
  if (!projectPath) return null;
  const known = asSet(knownThreadIds);
  const active = asSet(activeThreadIds);
  const openedMs = Number(openedAt || 0);
  const floorMs = openedMs ? openedMs - 10000 : 0;

  const candidates = (sessions || [])
    .filter(session => {
      if (!session || !session.sessionId) return false;
      if (session.projectPath !== projectPath) return false;
      if (known.has(session.sessionId) || active.has(session.sessionId)) return false;
      const createdMs = dateMs(session.created);
      const modifiedMs = dateMs(session.modified);
      if (!floorMs) return true;
      return createdMs >= floorMs || modifiedMs >= floorMs;
    })
    .map(session => ({
      session,
      createdMs: dateMs(session.created) || dateMs(session.modified),
    }))
    .sort((a, b) => a.createdMs - b.createdMs);

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].session;

  if (!openedMs) return null;

  const scored = candidates
    .map(candidate => ({
      ...candidate,
      distanceMs: Math.abs(candidate.createdMs - openedMs),
    }))
    .sort((a, b) => a.distanceMs - b.distanceMs);

  const [best, second] = scored;
  if (best.distanceMs <= 120000 && (!second || second.distanceMs - best.distanceMs >= 15000)) {
    return best.session;
  }

  return null;
}

function codexModelKey(model) {
  return 'codex:' + (String(model || '').trim() || 'unknown');
}

function getCodexStats() {
  const dbPath = stateDbPath();
  if (!fs.existsSync(dbPath)) return null;

  let db;
  try {
    db = new (getDatabase())(dbPath, { readonly: true, fileMustExist: true });
    const rows = db.prepare(`
      SELECT
        COALESCE(NULLIF(model, ''), 'unknown') AS model,
        COALESCE(NULLIF(model_provider, ''), 'codex') AS model_provider,
        date(COALESCE(NULLIF(updated_at_ms, 0), updated_at * 1000) / 1000, 'unixepoch') AS date,
        COUNT(*) AS session_count,
        SUM(COALESCE(tokens_used, 0)) AS tokens
      FROM threads
      WHERE archived = 0
        AND COALESCE(source, '') != 'exec'
        AND COALESCE(tokens_used, 0) > 0
      GROUP BY model, model_provider, date
      ORDER BY date ASC
    `).all();

    if (!rows.length) return null;

    const modelUsage = {};
    const dailyByDate = new Map();
    let totalSessions = 0;
    let totalTokens = 0;

    for (const row of rows) {
      const model = row.model || 'unknown';
      const key = codexModelKey(model);
      const tokens = Number(row.tokens || 0);
      const sessionCount = Number(row.session_count || 0);
      totalSessions += sessionCount;
      totalTokens += tokens;

      if (!modelUsage[key]) {
        modelUsage[key] = {
          provider: 'codex',
          model,
          modelProvider: row.model_provider || 'codex',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          sessionCount: 0,
        };
      }
      modelUsage[key].totalTokens += tokens;
      modelUsage[key].sessionCount += sessionCount;

      if (!dailyByDate.has(row.date)) {
        dailyByDate.set(row.date, { date: row.date, tokensByModel: {} });
      }
      const daily = dailyByDate.get(row.date);
      daily.tokensByModel[key] = (daily.tokensByModel[key] || 0) + tokens;
    }

    return {
      modelUsage,
      dailyModelTokens: Array.from(dailyByDate.values()),
      totalSessions,
      totalTokens,
    };
  } catch {
    return null;
  } finally {
    try { if (db) db.close(); } catch {}
  }
}

module.exports = {
  scanCodexSessions,
  getCodexStats,
  stateDbPath,
  findNewCodexSession,
  isVisibleCodexThreadSource,
};
