const claude = require('./claude');
const codex = require('./codex');

const providers = new Map([
  [claude.meta.id, claude],
  [codex.meta.id, codex],
]);

function getProvider(id) {
  return providers.get(id || 'claude') || providers.get('claude');
}

function getProviderMeta() {
  return Array.from(providers.values()).map(provider => ({ ...provider.meta }));
}

module.exports = { getProvider, getProviderMeta };
