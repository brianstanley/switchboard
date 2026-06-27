# Switchboard

Your command center for Claude Code, Codex, and Pi Mono sessions.

Switchboard is a desktop app that gives you a unified view of all your agent sessions across every project. Launch, resume, fork, and monitor sessions from a single window — no more juggling terminal tabs or digging through local history files to find that one conversation from last week.

> This fork adds multi-provider support on top of the original Switchboard app, including **Claude Code**, **Codex**, and **Pi Mono**.

![Switchboard](build/screenshot.png)

### Key Features

- **Session Browser** — All your agent sessions, organized by project, searchable by content
- **Multi-Provider Launching** — Start new sessions with Claude Code, Codex, or Pi Mono from the same project sidebar
- **Built-in Terminal** — Connect to running sessions or launch new ones without leaving the app
- **Status Notifications** — In-app alerts when a session is waiting for permission approval or user input
- **Fork & Resume** — Branch off from any point in a session's history
- **Full-Text Search** — Find any session by what was discussed, not just when it happened
- **IDE Emulation** — Switchboard acts as an IDE for Claude CLI, showing file diffs and opens in a side panel where you can accept, reject, or edit changes before they're applied. Supports both inline and side-by-side diff views. Disable this in Global Settings if you prefer Claude to use your own editor (VS Code, Cursor, etc.)
- **Plans & Memory** — Browse and edit your plan files and CLAUDE.md memory in one place
- **Activity Stats** — Heatmap of your coding activity across all projects
- **Session Names** — Picks up session names from Claude Code's `/rename` command automatically

## Codex Support

This fork can launch and index Codex sessions alongside Claude Code sessions.

### Requirements

- Install and authenticate the `codex` CLI.
- Keep Claude Code installed if you want to continue launching Claude sessions.

### Launching Codex

Use the `+` button on a project and choose:

- **Codex** — launch with the saved/default Codex settings.
- **Codex (Configure...)** — override launch settings for this session only.

Supported Codex launch options:

- model (`--model`)
- profile (`--profile`)
- sandbox (`--sandbox`)
- approval policy (`--ask-for-approval`)
- YOLO / dangerous mode (`--dangerously-bypass-approvals-and-sandbox`)
- web search (`--search`)
- no alternate screen (`--no-alt-screen`)
- additional directories (`--add-dir`)
- pre-launch command

Codex session history is read from the local Codex state database and rollout files, then shown in the same sidebar/history views as Claude sessions.

## Pi Mono Support

This fork can also launch and index Pi Mono sessions.

### Requirements

- Install and authenticate the `pi` CLI.
- Pi's current npm package requires Node.js 22.19.0 or newer. If your default shell uses Node 20, set a pre-launch command such as `mise exec node@22 --`.

### Launching Pi Mono

Use the `+` button on a project and choose:

- **Pi Mono** — launch with the saved/default Pi settings.
- **Pi Mono (Configure...)** — override launch settings for this session only.

Supported Pi launch options:

- provider (`--provider`)
- model (`--model`)
- API key (`--api-key`)
- thinking level (`--thinking`)
- project trust / YOLO (`--approve` / `--no-approve`)
- tools and excluded tools (`--tools`, `--exclude-tools`)
- no built-in tools, no tools, no context files, no skills
- offline mode (`--offline`)
- session directory (`--session-dir`)
- optional external Pi history indexing
- pre-launch command

By default, Pi sessions launched from Switchboard are stored under Switchboard's own data directory and indexed from there. If you want to import sessions created outside Switchboard, enable **External Pi History** in Global Settings to also read `~/.pi/agent/sessions`.

### Claude Per-Session API Key

When launching Claude through **Claude (Configure...)**, you can optionally set an `ANTHROPIC_API_KEY` override for that session. Leaving the field empty keeps using the default environment/auth configuration.

See [docs/multi-provider-codex-plan.md](docs/multi-provider-codex-plan.md) for implementation notes.

## Session Grid Overview

Toggle the grid overview from the sidebar for a bird's-eye view of all your open sessions at once, grouped by project.

![Session Grid Overview](build/screenshot-grid.png)

- **Live terminals** — Every open session renders its full terminal in a card, so you can monitor multiple Claude agents simultaneously.
- **Status at a glance** — Each card shows a running/stopped/busy indicator dot and last-activity timestamp.
- **Click to focus, double-click to expand** — Click a card header to focus it; double-click to switch back to single-terminal view for that session.
- **Persistent** — Grid preference is saved across restarts.

## File Preview Side Panel & Claude IDE MCP Emulator

Switchboard can act as an IDE for your Claude Code sessions. When enabled, Claude's file opens and proposed edits appear in a side panel next to the terminal instead of being sent to an external editor.

![IDE Emulation](build/screenshot-ide.png)

- **Diff review** — When Claude proposes a file change, it shows up as a diff in the side panel. You can review the changes and accept or reject them directly.
- **Inline & side-by-side** — Toggle between inline (unified) and side-by-side diff views. Your preference is remembered across sessions.
- **Partial acceptance** — In inline mode, you can accept or reject individual chunks within a diff, then submit the final result.
- **File viewer** — Clickable file links in terminal output (OSC 8 hyperlinks) open in the side panel with syntax highlighting.

To disable IDE emulation entirely (e.g. if you want Claude to use VS Code or Cursor instead), uncheck **IDE Emulation** in **Global Settings**. This stops Switchboard from registering as an IDE, so Claude CLI will discover and connect to your real editor. Changes take effect on new sessions — running sessions are not affected.

## Status Notifications

Switchboard monitors all your sessions in the background and shows status indicators in the sidebar so you can tell at a glance which sessions need attention — even when you're working in a different one.

![Status Notifications](build/screenshot-notifications.png)

- **Waiting for input** — A session that needs your response is highlighted so you don't miss it.
- **Permission approval** — When Claude is blocked waiting for a permission grant, the session badge lets you know immediately.
- **Activity indicators** — See which sessions are actively running, idle, or finished.

## Editor

| Shortcut | Action |
|----------|--------|
| `Cmd+F` / `Ctrl+F` | Find in file (also works in terminal) |
| `Cmd+G` / `Ctrl+G` | Go to line |

## Download

This fork does not currently publish packaged release artifacts. The original upstream DMG/installer does **not** include the Codex or Pi Mono support from this fork.

To try this fork today, run it from source:

```bash
npm install
npm start
```

Or build a local package:

```bash
npm run build:mac
```

Upstream releases are available at [doctly/switchboard](https://github.com/doctly/switchboard/releases/latest) if you want the original Claude-only app.

## Prerequisites

- **Node.js** 20+
- **npm** 10+
- **Claude Code CLI** for Claude sessions
- **Codex CLI** for Codex sessions
- **Pi Mono CLI** for Pi sessions
- Platform build tools for native modules:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential`, `python3` (`sudo apt install build-essential python3`)
  - **Windows**: Visual Studio Build Tools or `npm install -g windows-build-tools`

## Development Setup

```bash
# Install dependencies (runs postinstall automatically)
npm install

# Start the app
npm start
```

`npm start` bundles CodeMirror and launches Electron. For faster iteration after the first run:

```bash
npm run electron
```

## Building

All build commands bundle CodeMirror first, then invoke electron-builder.

```bash
# Current platform
npm run build

# Platform-specific
npm run build:mac     # DMG + zip (arm64 + x64)
npm run build:win     # NSIS installer (x64 + arm64)
npm run build:linux   # AppImage + deb (x64 + arm64)
```

Output goes to `dist/`.

## Releasing

Releases are driven by git tags:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The GitHub Actions workflow builds for all platforms and publishes to GitHub Releases. You can also release locally:

```bash
npm run release   # builds + publishes to GitHub Releases
```

Set `GH_TOKEN` in your environment (a GitHub personal access token with `repo` scope).

## Auto-Updates

The app uses `electron-updater` to check for updates from GitHub Releases on launch and every 4 hours. Updates are only checked in packaged builds (not during development). The flow:

1. App auto-downloads updates in the background
2. A toast notification appears when the update is ready
3. User can restart immediately or dismiss (installs on next quit)

## Code Signing

For distribution, set these environment variables:

- **macOS**: `CSC_LINK` (p12 certificate) and `CSC_KEY_PASSWORD`, or sign via Keychain
- **Windows**: `CSC_LINK` and `CSC_KEY_PASSWORD` for EV/OV code signing
- Set `CSC_IDENTITY_AUTO_DISCOVERY=false` to skip signing (CI artifact builds)

The macOS build uses custom entitlements (`build/entitlements.mac.plist`) to allow JIT and unsigned memory execution, required by native modules (node-pty, better-sqlite3).

## Project Structure

```
main.js            Electron main process
preload.js         Context bridge (IPC bindings)
db.js              SQLite session cache & metadata
providers/         Provider-specific launch command builders
codex-*.js         Codex session discovery and log adaptation
pi-*.js            Pi session discovery and log adaptation
public/            Renderer (HTML/CSS/JS)
scripts/           Build & postinstall scripts
build/             Icons, entitlements, builder resources
.github/workflows/ CI/CD
```
