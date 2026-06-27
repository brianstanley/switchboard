// Settings panel component
// Manages the global and project settings viewer UI.

(function () {
  const settingsViewer = document.getElementById('settings-viewer');
  const settingsViewerTitle = document.getElementById('settings-viewer-title');
  const settingsViewerBody = document.getElementById('settings-viewer-body');

  function closeSettingsViewer() {
    settingsViewer.style.display = 'none';
    const terminalArea = document.getElementById('terminal-area');
    const terminalHeader = document.getElementById('terminal-header');
    const placeholder = document.getElementById('placeholder');
    const gridViewActive = localStorage.getItem('gridViewActive') === '1';
    const activeSessionId = sessionStorage.getItem('activeSessionId') || null;
    // Check if there's an active session with an open terminal
    if (activeSessionId && window._openSessions && window._openSessions.has(activeSessionId)) {
      terminalArea.style.display = '';
      terminalHeader.style.display = '';
    } else if (gridViewActive) {
      terminalArea.style.display = '';
    } else {
      placeholder.style.display = '';
    }
  }

  async function openSettingsViewer(scope, projectPath) {
    const isProject = scope === 'project';
    const settingsKey = isProject ? 'project:' + projectPath : 'global';
    const current = (await window.api.getSetting(settingsKey)) || {};
    const globalSettings = isProject ? ((await window.api.getSetting('global')) || {}) : {};

    const shortName = isProject
      ? projectPath.split('/').filter(Boolean).slice(-2).join('/')
      : 'Global';

    settingsViewerTitle.textContent = (isProject ? 'Project Settings — ' : 'Global Settings — ') + shortName;

    // Show settings viewer, hide others
    document.getElementById('placeholder').style.display = 'none';
    document.getElementById('terminal-area').style.display = 'none';
    document.getElementById('plan-viewer').style.display = 'none';
    document.getElementById('stats-viewer').style.display = 'none';
    document.getElementById('memory-viewer').style.display = 'none';
    document.getElementById('jsonl-viewer').style.display = 'none';
    settingsViewer.style.display = 'flex';

    function useGlobalCheckbox(fieldName) {
      if (!isProject) return '';
      const useGlobal = current[fieldName] === undefined || current[fieldName] === null;
      return `<label class="settings-use-global"><input type="checkbox" data-field="${fieldName}" class="use-global-cb" ${useGlobal ? 'checked' : ''}> Use global default</label>`;
    }

    function fieldValue(fieldName, fallback) {
      if (isProject && (current[fieldName] === undefined || current[fieldName] === null)) {
        return globalSettings[fieldName] !== undefined ? globalSettings[fieldName] : fallback;
      }
      return current[fieldName] !== undefined ? current[fieldName] : fallback;
    }

    function fieldDisabled(fieldName) {
      if (!isProject) return '';
      return (current[fieldName] === undefined || current[fieldName] === null) ? 'disabled' : '';
    }

    const permModeValue = fieldValue('permissionMode', '');
    const dangerousSkipValue = fieldValue('dangerouslySkipPermissions', false);
    const worktreeValue = fieldValue('worktree', false);
    const worktreeNameValue = fieldValue('worktreeName', '');
    const chromeValue = fieldValue('chrome', false);
    const defaultProviderValue = fieldValue('defaultProvider', 'claude');
    const codexModelValue = fieldValue('codexModel', '');
    const codexProfileValue = fieldValue('codexProfile', '');
    const codexSandboxValue = fieldValue('codexSandbox', '');
    const codexApprovalValue = fieldValue('codexApprovalPolicy', '');
    const codexWebSearchValue = fieldValue('codexWebSearch', false);
    const codexNoAltScreenValue = fieldValue('codexNoAltScreen', true);
    const piProviderValue = fieldValue('piProvider', '');
    const piModelValue = fieldValue('piModel', '');
    const piApiKeyValue = fieldValue('piApiKey', '');
    const piThinkingValue = fieldValue('piThinking', '');
    const piProjectTrustValue = fieldValue('piProjectTrust', '');
    const piToolsValue = fieldValue('piTools', '');
    const piExcludeToolsValue = fieldValue('piExcludeTools', '');
    const piNoBuiltinToolsValue = fieldValue('piNoBuiltinTools', false);
    const piNoToolsValue = fieldValue('piNoTools', false);
    const piNoContextFilesValue = fieldValue('piNoContextFiles', false);
    const piNoSkillsValue = fieldValue('piNoSkills', false);
    const piOfflineValue = fieldValue('piOffline', false);
    const piSessionDirValue = fieldValue('piSessionDir', '');
    const piIndexExternalSessionsValue = fieldValue('piIndexExternalSessions', false);
    const preLaunchValue = fieldValue('preLaunchCmd', '');
    const addDirsValue = fieldValue('addDirs', '');
    const visCountValue = fieldValue('visibleSessionCount', 10);
    const maxAgeValue = fieldValue('sessionMaxAgeDays', 3);
    const themeValue = fieldValue('terminalTheme', 'switchboard');
    const mcpEmulationValue = fieldValue('mcpEmulation', true);
    const shellProfileValue = fieldValue('shellProfile', 'auto');

    // Discover available shell profiles
    let shellProfiles = [];
    try { shellProfiles = await window.api.getShellProfiles(); } catch {};

    settingsViewerBody.innerHTML = `
    <div class="settings-form">
      <div class="settings-section">
        <div class="settings-section-title">Claude CLI Options</div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Permission Mode</span>
              ${useGlobalCheckbox('permissionMode')}
            </div>
            <div class="settings-description">Permission mode passed to the <code>claude</code> command</div>
          </div>
          <div class="settings-field-control">
            <select class="settings-select" id="sv-perm-mode" ${fieldDisabled('permissionMode')}>
              <option value="">Default (none)</option>
              <option value="acceptEdits" ${permModeValue === 'acceptEdits' ? 'selected' : ''}>Accept Edits</option>
              <option value="plan" ${permModeValue === 'plan' ? 'selected' : ''}>Plan Mode</option>
              <option value="dontAsk" ${permModeValue === 'dontAsk' ? 'selected' : ''}>Don't Ask</option>
              <option value="bypassPermissions" ${permModeValue === 'bypassPermissions' ? 'selected' : ''}>Bypass</option>
            </select>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Worktree</span>
              ${useGlobalCheckbox('worktree')}
            </div>
            <div class="settings-description">Enable worktree for new sessions</div>
          </div>
          <div class="settings-field-control">
            <label class="settings-toggle"><input type="checkbox" id="sv-worktree" ${worktreeValue ? 'checked' : ''} ${fieldDisabled('worktree')}><span class="settings-toggle-slider"></span></label>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Worktree Name</span>
              ${useGlobalCheckbox('worktreeName')}
            </div>
            <div class="settings-description">Custom name for worktree branches</div>
          </div>
          <div class="settings-field-control">
            <input type="text" class="settings-input" id="sv-worktree-name" placeholder="auto" value="${escapeHtml(worktreeNameValue)}" ${fieldDisabled('worktreeName')} style="width:140px">
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Chrome</span>
              ${useGlobalCheckbox('chrome')}
            </div>
            <div class="settings-description">Enable Chrome browser automation</div>
          </div>
          <div class="settings-field-control">
            <label class="settings-toggle"><input type="checkbox" id="sv-chrome" ${chromeValue ? 'checked' : ''} ${fieldDisabled('chrome')}><span class="settings-toggle-slider"></span></label>
          </div>
        </div>

        <div class="settings-field settings-field-wide">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Additional Directories</span>
              ${useGlobalCheckbox('addDirs')}
            </div>
            <div class="settings-description">Extra directories to include in Claude sessions</div>
          </div>
          <div class="settings-field-control">
            <input type="text" class="settings-input" id="sv-add-dirs" placeholder="/path/to/dir1, /path/to/dir2" value="${escapeHtml(addDirsValue)}" ${fieldDisabled('addDirs')}>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Codex CLI Options</div>

        <div class="settings-field settings-field-wide">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Model</span>
              ${useGlobalCheckbox('codexModel')}
            </div>
            <div class="settings-description">Optional <code>--model</code> override for Codex</div>
          </div>
          <div class="settings-field-control">
            <input type="text" class="settings-input" id="sv-codex-model" placeholder="e.g. gpt-5.5" value="${escapeHtml(codexModelValue)}" ${fieldDisabled('codexModel')}>
          </div>
        </div>

        <div class="settings-field settings-field-wide">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Profile</span>
              ${useGlobalCheckbox('codexProfile')}
            </div>
            <div class="settings-description">Optional <code>--profile</code> config profile for Codex</div>
          </div>
          <div class="settings-field-control">
            <input type="text" class="settings-input" id="sv-codex-profile" placeholder="profile name" value="${escapeHtml(codexProfileValue)}" ${fieldDisabled('codexProfile')}>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Sandbox</span>
              ${useGlobalCheckbox('codexSandbox')}
            </div>
            <div class="settings-description">Codex sandbox policy</div>
          </div>
          <div class="settings-field-control">
            <select class="settings-select" id="sv-codex-sandbox" ${fieldDisabled('codexSandbox')}>
              <option value="">Default</option>
              <option value="read-only" ${codexSandboxValue === 'read-only' ? 'selected' : ''}>Read Only</option>
              <option value="workspace-write" ${codexSandboxValue === 'workspace-write' ? 'selected' : ''}>Workspace Write</option>
              <option value="danger-full-access" ${codexSandboxValue === 'danger-full-access' ? 'selected' : ''}>Danger Full Access</option>
            </select>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Approval Mode</span>
              ${useGlobalCheckbox('codexApprovalPolicy')}
            </div>
            <div class="settings-description">Codex <code>--ask-for-approval</code> policy</div>
          </div>
          <div class="settings-field-control">
            <select class="settings-select" id="sv-codex-approval" ${fieldDisabled('codexApprovalPolicy')}>
              <option value="">Default</option>
              <option value="untrusted" ${codexApprovalValue === 'untrusted' ? 'selected' : ''}>Untrusted</option>
              <option value="on-request" ${codexApprovalValue === 'on-request' ? 'selected' : ''}>On Request</option>
              <option value="never" ${codexApprovalValue === 'never' ? 'selected' : ''}>Never</option>
            </select>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Web Search</span>
              ${useGlobalCheckbox('codexWebSearch')}
            </div>
            <div class="settings-description">Enable Codex live web search</div>
          </div>
          <div class="settings-field-control">
            <label class="settings-toggle"><input type="checkbox" id="sv-codex-web-search" ${codexWebSearchValue ? 'checked' : ''} ${fieldDisabled('codexWebSearch')}><span class="settings-toggle-slider"></span></label>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">No Alt Screen</span>
              ${useGlobalCheckbox('codexNoAltScreen')}
            </div>
            <div class="settings-description">Run Codex inline and preserve scrollback</div>
          </div>
          <div class="settings-field-control">
            <label class="settings-toggle"><input type="checkbox" id="sv-codex-no-alt" ${codexNoAltScreenValue ? 'checked' : ''} ${fieldDisabled('codexNoAltScreen')}><span class="settings-toggle-slider"></span></label>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Pi Mono CLI Options</div>

        <div class="settings-field settings-field-wide">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Provider</span>
              ${useGlobalCheckbox('piProvider')}
            </div>
            <div class="settings-description">Optional <code>--provider</code> override for Pi</div>
          </div>
          <div class="settings-field-control">
            <input type="text" class="settings-input" id="sv-pi-provider" placeholder="e.g. anthropic, openai" value="${escapeHtml(piProviderValue)}" ${fieldDisabled('piProvider')}>
          </div>
        </div>

        <div class="settings-field settings-field-wide">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Model</span>
              ${useGlobalCheckbox('piModel')}
            </div>
            <div class="settings-description">Optional <code>--model</code> override for Pi</div>
          </div>
          <div class="settings-field-control">
            <input type="text" class="settings-input" id="sv-pi-model" placeholder="e.g. claude-sonnet-4-5" value="${escapeHtml(piModelValue)}" ${fieldDisabled('piModel')}>
          </div>
        </div>

        <div class="settings-field settings-field-wide">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">API Key</span>
              ${useGlobalCheckbox('piApiKey')}
            </div>
            <div class="settings-description">Optional <code>--api-key</code> override for Pi</div>
          </div>
          <div class="settings-field-control">
            <input type="password" class="settings-input" id="sv-pi-api-key" placeholder="Use Pi default auth" value="${escapeHtml(piApiKeyValue)}" ${fieldDisabled('piApiKey')} autocomplete="off" spellcheck="false">
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Thinking</span>
              ${useGlobalCheckbox('piThinking')}
            </div>
            <div class="settings-description">Pi reasoning level</div>
          </div>
          <div class="settings-field-control">
            <select class="settings-select" id="sv-pi-thinking" ${fieldDisabled('piThinking')}>
              <option value="">Default</option>
              <option value="off" ${piThinkingValue === 'off' ? 'selected' : ''}>Off</option>
              <option value="minimal" ${piThinkingValue === 'minimal' ? 'selected' : ''}>Minimal</option>
              <option value="low" ${piThinkingValue === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${piThinkingValue === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${piThinkingValue === 'high' ? 'selected' : ''}>High</option>
              <option value="xhigh" ${piThinkingValue === 'xhigh' ? 'selected' : ''}>X High</option>
            </select>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Project Trust</span>
              ${useGlobalCheckbox('piProjectTrust')}
            </div>
            <div class="settings-description">Pi project trust flag</div>
          </div>
          <div class="settings-field-control">
            <select class="settings-select" id="sv-pi-trust" ${fieldDisabled('piProjectTrust')}>
              <option value="">Default</option>
              <option value="approve" ${piProjectTrustValue === 'approve' ? 'selected' : ''}>Approve</option>
              <option value="no-approve" ${piProjectTrustValue === 'no-approve' ? 'selected' : ''}>No Approve</option>
            </select>
          </div>
        </div>

        <div class="settings-field settings-field-wide">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Tools</span>
              ${useGlobalCheckbox('piTools')}
            </div>
            <div class="settings-description">Comma-separated list for <code>--tools</code></div>
          </div>
          <div class="settings-field-control">
            <input type="text" class="settings-input" id="sv-pi-tools" placeholder="read,bash,edit,write" value="${escapeHtml(piToolsValue)}" ${fieldDisabled('piTools')}>
          </div>
        </div>

        <div class="settings-field settings-field-wide">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Exclude Tools</span>
              ${useGlobalCheckbox('piExcludeTools')}
            </div>
            <div class="settings-description">Comma-separated list for <code>--exclude-tools</code></div>
          </div>
          <div class="settings-field-control">
            <input type="text" class="settings-input" id="sv-pi-exclude-tools" placeholder="bash,write" value="${escapeHtml(piExcludeToolsValue)}" ${fieldDisabled('piExcludeTools')}>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">No Built-in Tools</span>
              ${useGlobalCheckbox('piNoBuiltinTools')}
            </div>
            <div class="settings-description">Pass <code>--no-builtin-tools</code></div>
          </div>
          <div class="settings-field-control">
            <label class="settings-toggle"><input type="checkbox" id="sv-pi-no-builtin-tools" ${piNoBuiltinToolsValue ? 'checked' : ''} ${fieldDisabled('piNoBuiltinTools')}><span class="settings-toggle-slider"></span></label>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">No Tools</span>
              ${useGlobalCheckbox('piNoTools')}
            </div>
            <div class="settings-description">Pass <code>--no-tools</code></div>
          </div>
          <div class="settings-field-control">
            <label class="settings-toggle"><input type="checkbox" id="sv-pi-no-tools" ${piNoToolsValue ? 'checked' : ''} ${fieldDisabled('piNoTools')}><span class="settings-toggle-slider"></span></label>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">No Context Files</span>
              ${useGlobalCheckbox('piNoContextFiles')}
            </div>
            <div class="settings-description">Pass <code>--no-context-files</code></div>
          </div>
          <div class="settings-field-control">
            <label class="settings-toggle"><input type="checkbox" id="sv-pi-no-context-files" ${piNoContextFilesValue ? 'checked' : ''} ${fieldDisabled('piNoContextFiles')}><span class="settings-toggle-slider"></span></label>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">No Skills</span>
              ${useGlobalCheckbox('piNoSkills')}
            </div>
            <div class="settings-description">Pass <code>--no-skills</code></div>
          </div>
          <div class="settings-field-control">
            <label class="settings-toggle"><input type="checkbox" id="sv-pi-no-skills" ${piNoSkillsValue ? 'checked' : ''} ${fieldDisabled('piNoSkills')}><span class="settings-toggle-slider"></span></label>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Offline</span>
              ${useGlobalCheckbox('piOffline')}
            </div>
            <div class="settings-description">Pass <code>--offline</code></div>
          </div>
          <div class="settings-field-control">
            <label class="settings-toggle"><input type="checkbox" id="sv-pi-offline" ${piOfflineValue ? 'checked' : ''} ${fieldDisabled('piOffline')}><span class="settings-toggle-slider"></span></label>
          </div>
        </div>

        <div class="settings-field settings-field-wide">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Session Directory</span>
              ${useGlobalCheckbox('piSessionDir')}
            </div>
            <div class="settings-description">Leave empty to use Switchboard's Pi session store</div>
          </div>
          <div class="settings-field-control">
            <input type="text" class="settings-input" id="sv-pi-session-dir" placeholder="Switchboard managed" value="${escapeHtml(piSessionDirValue)}" ${fieldDisabled('piSessionDir')}>
          </div>
        </div>

        ${!isProject ? `<div class="settings-field">
          <div class="settings-field-info">
            <span class="settings-label">External Pi History</span>
            <div class="settings-description">Also index existing sessions from <code>~/.pi/agent/sessions</code></div>
          </div>
          <div class="settings-field-control">
            <label class="settings-toggle"><input type="checkbox" id="sv-pi-index-external" ${piIndexExternalSessionsValue ? 'checked' : ''}><span class="settings-toggle-slider"></span></label>
          </div>
        </div>` : ''}
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Session Launch</div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Default Provider</span>
              ${useGlobalCheckbox('defaultProvider')}
            </div>
            <div class="settings-description">Provider used by default launch actions</div>
          </div>
          <div class="settings-field-control">
            <select class="settings-select" id="sv-default-provider" ${fieldDisabled('defaultProvider')}>
              <option value="claude" ${defaultProviderValue === 'claude' ? 'selected' : ''}>Claude</option>
              <option value="codex" ${defaultProviderValue === 'codex' ? 'selected' : ''}>Codex</option>
              <option value="pi" ${defaultProviderValue === 'pi' ? 'selected' : ''}>Pi Mono</option>
            </select>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Dangerous / YOLO</span>
              ${useGlobalCheckbox('dangerouslySkipPermissions')}
            </div>
            <div class="settings-description">Bypass safety prompts for the selected provider</div>
          </div>
          <div class="settings-field-control">
            <label class="settings-toggle"><input type="checkbox" id="sv-dangerous-skip" ${dangerousSkipValue ? 'checked' : ''} ${fieldDisabled('dangerouslySkipPermissions')}><span class="settings-toggle-slider"></span></label>
          </div>
        </div>

        <div class="settings-field settings-field-wide">
          <div class="settings-field-info">
            <div class="settings-field-header">
              <span class="settings-label">Pre-launch Command</span>
              ${useGlobalCheckbox('preLaunchCmd')}
            </div>
            <div class="settings-description">Prepended to the selected provider command (e.g. "aws-vault exec profile --")</div>
          </div>
          <div class="settings-field-control">
            <input type="text" class="settings-input" id="sv-pre-launch" placeholder="e.g. aws-vault exec profile --" value="${escapeHtml(preLaunchValue)}" ${fieldDisabled('preLaunchCmd')}>
          </div>
        </div>
      </div>

      ${!isProject ? `<div class="settings-section">
        <div class="settings-section-title">Application</div>

        <div class="settings-field">
          <div class="settings-field-info">
            <span class="settings-label">Terminal Theme</span>
            <div class="settings-description">Color theme for terminal sessions</div>
          </div>
          <div class="settings-field-control">
            <select class="settings-select" id="sv-terminal-theme">
              ${Object.entries(TERMINAL_THEMES).map(([key, t]) =>
                `<option value="${key}" ${themeValue === key ? 'selected' : ''}>${escapeHtml(t.label)}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <span class="settings-label">Shell Profile</span>
            <div class="settings-description">Shell used for terminal and provider sessions. Changes take effect for new sessions only.</div>
          </div>
          <div class="settings-field-control">
            <select class="settings-select" id="sv-shell-profile">
              <option value="auto" ${shellProfileValue === 'auto' ? 'selected' : ''}>Auto (detect)</option>
              ${shellProfiles.map(p =>
                `<option value="${escapeHtml(p.id)}" ${shellProfileValue === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <span class="settings-label">Max Visible Sessions</span>
            <div class="settings-description">Show up to this many sessions before collapsing the rest behind "+N older"</div>
          </div>
          <div class="settings-field-control">
            <input type="number" class="settings-input settings-input-compact" id="sv-visible-count" min="1" max="100" value="${visCountValue}">
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <span class="settings-label">Session Max Age (days)</span>
            <div class="settings-description">Sessions older than this are hidden behind "+N older" even if under the count limit</div>
          </div>
          <div class="settings-field-control">
            <input type="number" class="settings-input settings-input-compact" id="sv-max-age" min="1" max="365" value="${maxAgeValue}">
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-info">
            <span class="settings-label">IDE Emulation</span>
            <div class="settings-description">Emulate an IDE so Claude can open files and diffs in a side panel. Disable to use your own IDE instead. Changes take effect for new sessions only.</div>
          </div>
          <div class="settings-field-control">
            <label class="settings-toggle"><input type="checkbox" id="sv-mcp-emulation" ${mcpEmulationValue ? 'checked' : ''}><span class="settings-toggle-slider"></span></label>
          </div>
        </div>
      </div>` : ''}

      ${!isProject ? `<div class="settings-section">
        <div class="settings-section-title">Updates</div>
        <div class="settings-field">
          <div class="settings-field-info">
            <span class="settings-label">Version</span>
            <div class="settings-description"><span id="sv-current-version"></span> <span id="sv-update-status"></span></div>
          </div>
          <div class="settings-field-control">
            <button class="settings-check-updates-btn" id="sv-check-updates-btn">Check for Updates</button>
          </div>
        </div>
      </div>` : ''}

      <div class="settings-btn-row">
        <button class="settings-cancel-btn" id="sv-cancel-btn">Cancel</button>
        <button class="settings-save-btn" id="sv-save-btn">Save Settings</button>
        ${isProject ? '<button class="settings-remove-btn" id="sv-remove-btn">Hide Project</button>' : ''}
      </div>
    </div>
  `;

    // Use-global checkboxes toggle field disabled state
    settingsViewerBody.querySelectorAll('.use-global-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const field = cb.dataset.field;
        const fieldMap = {
          defaultProvider: 'sv-default-provider',
          dangerouslySkipPermissions: 'sv-dangerous-skip',
          permissionMode: 'sv-perm-mode',
          worktree: 'sv-worktree',
          worktreeName: 'sv-worktree-name',
          chrome: 'sv-chrome',
          codexModel: 'sv-codex-model',
          codexProfile: 'sv-codex-profile',
          codexSandbox: 'sv-codex-sandbox',
          codexApprovalPolicy: 'sv-codex-approval',
          codexWebSearch: 'sv-codex-web-search',
          codexNoAltScreen: 'sv-codex-no-alt',
          piProvider: 'sv-pi-provider',
          piModel: 'sv-pi-model',
          piApiKey: 'sv-pi-api-key',
          piThinking: 'sv-pi-thinking',
          piProjectTrust: 'sv-pi-trust',
          piTools: 'sv-pi-tools',
          piExcludeTools: 'sv-pi-exclude-tools',
          piNoBuiltinTools: 'sv-pi-no-builtin-tools',
          piNoTools: 'sv-pi-no-tools',
          piNoContextFiles: 'sv-pi-no-context-files',
          piNoSkills: 'sv-pi-no-skills',
          piOffline: 'sv-pi-offline',
          piSessionDir: 'sv-pi-session-dir',
          preLaunchCmd: 'sv-pre-launch',
          addDirs: 'sv-add-dirs',
        };
        const input = settingsViewerBody.querySelector('#' + fieldMap[field]);
        if (input) input.disabled = cb.checked;
      });
    });

    // Save button
    settingsViewerBody.querySelector('#sv-save-btn').addEventListener('click', async () => {
      let settings = {};

      if (isProject) {
        // Only save fields where "use global" is unchecked
        settingsViewerBody.querySelectorAll('.use-global-cb').forEach(cb => {
          if (!cb.checked) {
            const field = cb.dataset.field;
            const fieldMap = {
              defaultProvider: () => settingsViewerBody.querySelector('#sv-default-provider').value || 'claude',
              dangerouslySkipPermissions: () => settingsViewerBody.querySelector('#sv-dangerous-skip').checked,
              permissionMode: () => settingsViewerBody.querySelector('#sv-perm-mode').value || null,
              worktree: () => settingsViewerBody.querySelector('#sv-worktree').checked,
              worktreeName: () => settingsViewerBody.querySelector('#sv-worktree-name').value.trim(),
              chrome: () => settingsViewerBody.querySelector('#sv-chrome').checked,
              codexModel: () => settingsViewerBody.querySelector('#sv-codex-model').value.trim(),
              codexProfile: () => settingsViewerBody.querySelector('#sv-codex-profile').value.trim(),
              codexSandbox: () => settingsViewerBody.querySelector('#sv-codex-sandbox').value || null,
              codexApprovalPolicy: () => settingsViewerBody.querySelector('#sv-codex-approval').value || null,
              codexWebSearch: () => settingsViewerBody.querySelector('#sv-codex-web-search').checked,
              codexNoAltScreen: () => settingsViewerBody.querySelector('#sv-codex-no-alt').checked,
              piProvider: () => settingsViewerBody.querySelector('#sv-pi-provider').value.trim(),
              piModel: () => settingsViewerBody.querySelector('#sv-pi-model').value.trim(),
              piApiKey: () => settingsViewerBody.querySelector('#sv-pi-api-key').value.trim(),
              piThinking: () => settingsViewerBody.querySelector('#sv-pi-thinking').value || null,
              piProjectTrust: () => settingsViewerBody.querySelector('#sv-pi-trust').value || null,
              piTools: () => settingsViewerBody.querySelector('#sv-pi-tools').value.trim(),
              piExcludeTools: () => settingsViewerBody.querySelector('#sv-pi-exclude-tools').value.trim(),
              piNoBuiltinTools: () => settingsViewerBody.querySelector('#sv-pi-no-builtin-tools').checked,
              piNoTools: () => settingsViewerBody.querySelector('#sv-pi-no-tools').checked,
              piNoContextFiles: () => settingsViewerBody.querySelector('#sv-pi-no-context-files').checked,
              piNoSkills: () => settingsViewerBody.querySelector('#sv-pi-no-skills').checked,
              piOffline: () => settingsViewerBody.querySelector('#sv-pi-offline').checked,
              piSessionDir: () => settingsViewerBody.querySelector('#sv-pi-session-dir').value.trim(),
              preLaunchCmd: () => settingsViewerBody.querySelector('#sv-pre-launch').value.trim(),
              addDirs: () => settingsViewerBody.querySelector('#sv-add-dirs').value.trim(),
            };
            if (fieldMap[field]) settings[field] = fieldMap[field]();
          }
        });
      } else {
        settings.defaultProvider = settingsViewerBody.querySelector('#sv-default-provider').value || 'claude';
        settings.dangerouslySkipPermissions = settingsViewerBody.querySelector('#sv-dangerous-skip').checked;
        settings.permissionMode = settingsViewerBody.querySelector('#sv-perm-mode').value || null;
        settings.worktree = settingsViewerBody.querySelector('#sv-worktree').checked;
        settings.worktreeName = settingsViewerBody.querySelector('#sv-worktree-name').value.trim();
        settings.chrome = settingsViewerBody.querySelector('#sv-chrome').checked;
        settings.codexModel = settingsViewerBody.querySelector('#sv-codex-model').value.trim();
        settings.codexProfile = settingsViewerBody.querySelector('#sv-codex-profile').value.trim();
        settings.codexSandbox = settingsViewerBody.querySelector('#sv-codex-sandbox').value || null;
        settings.codexApprovalPolicy = settingsViewerBody.querySelector('#sv-codex-approval').value || null;
        settings.codexWebSearch = settingsViewerBody.querySelector('#sv-codex-web-search').checked;
        settings.codexNoAltScreen = settingsViewerBody.querySelector('#sv-codex-no-alt').checked;
        settings.piProvider = settingsViewerBody.querySelector('#sv-pi-provider').value.trim();
        settings.piModel = settingsViewerBody.querySelector('#sv-pi-model').value.trim();
        settings.piApiKey = settingsViewerBody.querySelector('#sv-pi-api-key').value.trim();
        settings.piThinking = settingsViewerBody.querySelector('#sv-pi-thinking').value || null;
        settings.piProjectTrust = settingsViewerBody.querySelector('#sv-pi-trust').value || null;
        settings.piTools = settingsViewerBody.querySelector('#sv-pi-tools').value.trim();
        settings.piExcludeTools = settingsViewerBody.querySelector('#sv-pi-exclude-tools').value.trim();
        settings.piNoBuiltinTools = settingsViewerBody.querySelector('#sv-pi-no-builtin-tools').checked;
        settings.piNoTools = settingsViewerBody.querySelector('#sv-pi-no-tools').checked;
        settings.piNoContextFiles = settingsViewerBody.querySelector('#sv-pi-no-context-files').checked;
        settings.piNoSkills = settingsViewerBody.querySelector('#sv-pi-no-skills').checked;
        settings.piOffline = settingsViewerBody.querySelector('#sv-pi-offline').checked;
        settings.piSessionDir = settingsViewerBody.querySelector('#sv-pi-session-dir').value.trim();
        settings.piIndexExternalSessions = settingsViewerBody.querySelector('#sv-pi-index-external').checked;
        settings.preLaunchCmd = settingsViewerBody.querySelector('#sv-pre-launch').value.trim();
        settings.addDirs = settingsViewerBody.querySelector('#sv-add-dirs').value.trim();
        settings.visibleSessionCount = parseInt(settingsViewerBody.querySelector('#sv-visible-count').value) || 10;
        settings.sessionMaxAgeDays = parseInt(settingsViewerBody.querySelector('#sv-max-age').value) || 3;
        settings.terminalTheme = settingsViewerBody.querySelector('#sv-terminal-theme').value || 'switchboard';
        settings.mcpEmulation = settingsViewerBody.querySelector('#sv-mcp-emulation').checked;
        settings.shellProfile = settingsViewerBody.querySelector('#sv-shell-profile').value || 'auto';
      }

      // Merge form values into existing settings to preserve keys not managed by the form
      if (!isProject) {
        const existing = (await window.api.getSetting('global')) || {};
        settings = { ...existing, ...settings };
      }

      await window.api.setSetting(settingsKey, settings);

      // Update visibleSessionCount, sessionMaxAgeDays, and theme
      if (!isProject) {
        if (settings.visibleSessionCount && typeof window._setVisibleSessionCount === 'function') {
          window._setVisibleSessionCount(settings.visibleSessionCount);
        }
        if (settings.sessionMaxAgeDays && typeof window._setSessionMaxAge === 'function') {
          window._setSessionMaxAge(settings.sessionMaxAgeDays);
        }
        if (settings.terminalTheme && typeof window._applyTerminalTheme === 'function') {
          window._applyTerminalTheme(settings.terminalTheme);
        }
        if (typeof refreshSidebar === 'function') refreshSidebar();
      }

      // Notify if IDE Emulation changed
      if (!isProject && settings.mcpEmulation !== mcpEmulationValue) {
        const notice = document.createElement('div');
        notice.className = 'settings-notice';
        notice.textContent = 'IDE Emulation setting changed. New sessions will use the updated setting \u2014 running sessions are not affected.';
        const saveBtn = settingsViewerBody.querySelector('#sv-save-btn');
        saveBtn.parentElement.insertBefore(notice, saveBtn);
        setTimeout(() => notice.remove(), 8000);
      }

      const saveBtn = settingsViewerBody.querySelector('#sv-save-btn');
      saveBtn.textContent = '✓ Saved';
      saveBtn.style.background = '#2ea043';
      saveBtn.style.color = '#fff';
      setTimeout(() => closeSettingsViewer(), 600);
    });

    // Cancel button
    settingsViewerBody.querySelector('#sv-cancel-btn').addEventListener('click', () => {
      closeSettingsViewer();
    });

    // Check for updates button + current version + inline status
    const checkUpdatesBtn = settingsViewerBody.querySelector('#sv-check-updates-btn');
    if (checkUpdatesBtn) {
      const updateStatusEl = settingsViewerBody.querySelector('#sv-update-status');
      window.api.getAppVersion().then(v => {
        const el = settingsViewerBody.querySelector('#sv-current-version');
        if (el) el.textContent = `v${v}`;
      });
      const settingsUpdaterHandler = (type, data) => {
        if (!updateStatusEl) return;
        switch (type) {
          case 'checking': updateStatusEl.textContent = '\u2014 checking\u2026'; break;
          case 'update-available': updateStatusEl.textContent = `\u2014 v${data.version} available`; break;
          case 'update-not-available': updateStatusEl.textContent = '\u2014 up to date'; break;
          case 'download-progress': updateStatusEl.textContent = `\u2014 downloading ${Math.round(data.percent)}%`; break;
          case 'update-downloaded': updateStatusEl.textContent = `\u2014 v${data.version} ready, restart to update`; break;
          case 'error': updateStatusEl.textContent = '\u2014 check failed'; break;
        }
      };
      window.api.onUpdaterEvent(settingsUpdaterHandler);
      checkUpdatesBtn.addEventListener('click', () => {
        window.api.updaterCheck();
      });
    }

    // Remove project button
    const removeBtn = settingsViewerBody.querySelector('#sv-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', async () => {
        if (!confirm(`Hide project "${shortName}" from Switchboard?\n\nThis hides the project from the sidebar. Your session files are not deleted.`)) return;
        await window.api.removeProject(projectPath);
        settingsViewer.style.display = 'none';
        document.getElementById('placeholder').style.display = 'flex';
        if (typeof loadProjects === 'function') loadProjects();
      });
    }
  }

  // Expose globally
  window.openSettingsViewer = openSettingsViewer;
  window.closeSettingsViewer = closeSettingsViewer;
})();
