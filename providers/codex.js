const { shellQuote, splitCommaList, withPreLaunch } = require('./common');

const meta = {
  id: 'codex',
  label: 'Codex',
  command: 'codex',
  supportsMcp: false,
  color: '#10a37f',
};

const SANDBOX_VALUES = new Set(['read-only', 'workspace-write', 'danger-full-access']);
const APPROVAL_VALUES = new Set(['untrusted', 'on-request', 'never']);

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

function buildCommand({ sessionId, projectPath, isNew, options = {} }) {
  const args = ['codex'];

  if (options.codexNoAltScreen !== false && options.noAltScreen !== false) {
    args.push('--no-alt-screen');
  }

  const model = cleanValue(options.codexModel || options.model);
  if (model) args.push('--model', shellQuote(model));

  const profile = cleanValue(options.codexProfile || options.profile);
  if (profile) args.push('--profile', shellQuote(profile));

  if (projectPath) args.push('--cd', shellQuote(projectPath));

  if (options.dangerouslySkipPermissions) {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  } else {
    const sandbox = cleanValue(options.codexSandbox || options.sandbox);
    if (sandbox && SANDBOX_VALUES.has(sandbox)) {
      args.push('--sandbox', shellQuote(sandbox));
    }

    const approval = cleanValue(options.codexApprovalPolicy || options.approvalPolicy);
    if (approval && APPROVAL_VALUES.has(approval)) {
      args.push('--ask-for-approval', shellQuote(approval));
    }
  }

  if (options.codexWebSearch || options.webSearch) args.push('--search');

  for (const dir of splitCommaList(options.addDirs)) {
    args.push('--add-dir', shellQuote(dir));
  }

  if (options.forkFrom) {
    args.push('fork', shellQuote(options.forkFrom));
  } else if (!isNew) {
    args.push('resume', shellQuote(sessionId));
  }

  return withPreLaunch(args.join(' '), options.preLaunchCmd);
}

module.exports = { meta, buildCommand };
