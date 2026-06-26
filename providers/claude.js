const fs = require('fs');
const os = require('os');
const path = require('path');
const { shellQuote, splitCommaList, withPreLaunch } = require('./common');

const meta = {
  id: 'claude',
  label: 'Claude',
  command: 'claude',
  supportsMcp: true,
  color: '#d97757',
};

function buildCommand({ sessionId, isNew, options = {}, tempDir = os.tmpdir() }) {
  const args = ['claude'];

  if (options.forkFrom) {
    args.push('--resume', shellQuote(options.forkFrom), '--fork-session');
  } else if (isNew) {
    args.push('--session-id', shellQuote(sessionId));
  } else {
    args.push('--resume', shellQuote(sessionId));
  }

  if (options.dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions');
  } else if (options.permissionMode) {
    args.push('--permission-mode', shellQuote(options.permissionMode));
  }

  if (options.worktree) {
    args.push('--worktree');
    if (options.worktreeName) args.push(shellQuote(options.worktreeName));
  }

  if (options.chrome) args.push('--chrome');

  for (const dir of splitCommaList(options.addDirs)) {
    args.push('--add-dir', shellQuote(dir));
  }

  if (options.appendSystemPrompt) {
    const tmpPrompt = path.join(tempDir, `switchboard-prompt-${sessionId}.md`);
    fs.writeFileSync(tmpPrompt, options.appendSystemPrompt);
    args.push('--append-system-prompt', `"$(cat ${shellQuote(tmpPrompt)})"`);
  }

  if (options.mcpActive) args.push('--ide');

  return withPreLaunch(args.join(' '), options.preLaunchCmd);
}

module.exports = { meta, buildCommand };
