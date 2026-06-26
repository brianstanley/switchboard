# Multi-Provider Codex Plan

## Goal

Switchboard should keep Claude as the default provider while allowing sessions to be launched, resumed, forked, configured, indexed, searched, and viewed for additional agent providers. The first additional provider is Codex.

## Implemented Shape

1. Provider registry
   - `providers/index.js` resolves provider metadata and command builders.
   - `providers/claude.js` preserves existing Claude launch flags.
   - `providers/codex.js` maps Switchboard options to Codex CLI flags.

2. Shared settings
   - `defaultProvider` chooses Claude or Codex for default launch flows.
   - `dangerouslySkipPermissions` is a provider-neutral dangerous mode:
     - Claude: `--dangerously-skip-permissions`
     - Codex: `--dangerously-bypass-approvals-and-sandbox`
   - Shared launch settings remain `preLaunchCmd` and `addDirs`.

3. Codex settings
   - `codexModel` -> `--model`
   - `codexProfile` -> `--profile`
   - `codexSandbox` -> `--sandbox`
   - `codexApprovalPolicy` -> `--ask-for-approval`
   - `codexWebSearch` -> `--search`
   - `codexNoAltScreen` -> `--no-alt-screen`

4. Session indexing
   - Claude continues to index `~/.claude/projects`.
   - Codex scans `~/.codex/state_5.sqlite` and stores rows in the existing cache with `provider = 'codex'`.
   - Codex cache folders are prefixed with `codex:` to avoid collisions with Claude folder refresh/delete logic.

5. History viewing
   - Claude JSONL files are read as before.
   - Codex rollout JSONL files are adapted into the message/tool shape already used by the history viewer.

## Current Limits

- New Codex sessions use a temporary Switchboard id while the CLI is running because Codex owns the real session id. On process exit, Switchboard refreshes the Codex index and the persisted real session appears.
- Codex does not use Switchboard's Claude MCP/IDE emulation bridge.
- Message counts for Codex are approximate from indexed state metadata, not a full rollout parse.

## Testing Alongside The Installed App

Development runs use `~/.switchboard-dev/switchboard.db` by default when launched through Electron's default app, so they do not share the installed app's `~/.switchboard/switchboard.db`.

You can also force any separate data directory:

```bash
SWITCHBOARD_DATA_DIR=/tmp/switchboard-codex-dev npm start
```

This keeps Switchboard settings/cache isolated while still letting the development app read the normal Claude and Codex session stores under `~/.claude` and `~/.codex`.

## Next Steps

1. Add a live Codex state watcher so sessions launched outside Switchboard appear without waiting for the next project refresh.
2. Detect the real Codex session id while a new Codex process is still running and re-key the temporary terminal entry.
3. Generalize the settings UI from hardcoded Claude/Codex sections to provider metadata if more providers are added.
4. Add integration tests around cache migrations and Codex state scanning once native dependencies are installed in CI.
