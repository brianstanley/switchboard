const { shellQuote, splitCommaList, withPreLaunch } = require('./common');

const meta = {
  id: 'pi',
  label: 'Pi Mono',
  command: 'pi',
  supportsMcp: false,
  color: '#8b5cf6',
};

const THINKING_VALUES = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);
const TRUST_VALUES = new Set(['approve', 'no-approve']);

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

function addCsvFlag(args, flag, value) {
  const items = splitCommaList(value);
  if (items.length > 0) args.push(flag, shellQuote(items.join(',')));
}

function buildCommand({ sessionId, isNew, options = {} }) {
  const args = ['pi'];

  const provider = cleanValue(options.piProvider);
  if (provider) args.push('--provider', shellQuote(provider));

  const model = cleanValue(options.piModel || options.model);
  if (model) args.push('--model', shellQuote(model));

  const apiKey = cleanValue(options.piApiKey || options.apiKey);
  if (apiKey) args.push('--api-key', shellQuote(apiKey));

  const thinking = cleanValue(options.piThinking || options.thinking);
  if (thinking && THINKING_VALUES.has(thinking)) {
    args.push('--thinking', shellQuote(thinking));
  }

  const sessionDir = cleanValue(options.piSessionDir || options.sessionDir);
  if (sessionDir) args.push('--session-dir', shellQuote(sessionDir));

  addCsvFlag(args, '--tools', options.piTools || options.tools);
  addCsvFlag(args, '--exclude-tools', options.piExcludeTools || options.excludeTools);

  if (options.piNoBuiltinTools || options.noBuiltinTools) args.push('--no-builtin-tools');
  if (options.piNoTools || options.noTools) args.push('--no-tools');
  if (options.piNoContextFiles || options.noContextFiles) args.push('--no-context-files');
  if (options.piNoSkills || options.noSkills) args.push('--no-skills');
  if (options.piOffline || options.offline) args.push('--offline');

  const trust = cleanValue(options.piProjectTrust || options.projectTrust);
  if (trust && TRUST_VALUES.has(trust)) {
    args.push(`--${trust}`);
  } else if (options.dangerouslySkipPermissions) {
    args.push('--approve');
  }

  const name = cleanValue(options.piSessionName || options.name);
  if (name) args.push('--name', shellQuote(name));

  if (options.forkFrom) {
    args.push('--fork', shellQuote(options.forkFromFilePath || options.forkFrom));
  } else if (isNew) {
    args.push('--session-id', shellQuote(sessionId));
  } else {
    args.push('--session', shellQuote(options.filePath || sessionId));
  }

  return withPreLaunch(args.join(' '), options.preLaunchCmd);
}

module.exports = { meta, buildCommand };
