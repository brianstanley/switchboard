function shellQuote(value) {
  return "'" + String(value ?? '').replace(/'/g, "'\"'\"'") + "'";
}

function splitCommaList(value) {
  if (!value) return [];
  return String(value).split(',').map(part => part.trim()).filter(Boolean);
}

function withPreLaunch(command, preLaunchCmd) {
  const prefix = String(preLaunchCmd || '').trim();
  return prefix ? `${prefix} ${command}` : command;
}

module.exports = { shellQuote, splitCommaList, withPreLaunch };
