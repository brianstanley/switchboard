// --- Sidebar rendering ---
// Depends on globals: sidebarContent, openSessions, activeSessionId, activePtyIds,
// pendingSessions, sessionMap, lastActivityTime, sortedOrder, searchMatchIds,
// searchMatchProjectPaths, showStarredOnly, showRunningOnly, showTodayOnly,
// visibleSessionCount, sessionMaxAgeDays, attentionSessions, responseReadySessions,
// sessionBusyState, cachedProjects, cachedAllProjects, gridCards, gridViewActive,
// customProjectOrder, scheduleProjectOrderSave (app.js)
// Depends on: cleanDisplayName, formatDate, escapeHtml (utils.js), ICONS (icons.js),
// showSession (terminal-manager.js), confirmAndStopSession, pollActiveSessions,
// showNewSessionPopover, openSettingsViewer, showResumeSessionDialog,
// showSessionSkillsDialog, showJsonlViewer, forkSession, openSession, loadProjects (app.js/dialogs.js)

const deletingSessionIds = new Set();
const deletingProjectPaths = new Set();
const sessionSkillsCache = new Map();
const SKILL_CACHE_TTL_MS = 30000;
const CONFIRM_LABEL_MAX = 72;
let draggingProjectPath = null;
let suppressProjectHeaderClick = false;

function confirmLabel(value, fallback = 'Untitled') {
  const label = cleanDisplayName(value || fallback) || fallback;
  if (label.length <= CONFIRM_LABEL_MAX) return label;
  return label.slice(0, CONFIRM_LABEL_MAX - 3).trimEnd() + '...';
}

function setSessionDeleting(item, sessionId, deleting) {
  if (!item) return;
  if (deleting) {
    deletingSessionIds.add(sessionId);
    item.classList.add('deleting');
    item.setAttribute('aria-busy', 'true');
    const row = item.querySelector('.session-row');
    if (row && !row.querySelector('.session-delete-loading')) {
      const overlay = document.createElement('div');
      overlay.className = 'session-delete-loading';
      overlay.innerHTML = '<span class="session-delete-spinner"></span><span>Deleting...</span>';
      row.appendChild(overlay);
    }
  } else {
    deletingSessionIds.delete(sessionId);
    item.classList.remove('deleting');
    item.removeAttribute('aria-busy');
    item.querySelector('.session-delete-loading')?.remove();
  }
}

function skillCacheKey(session) {
  return `${session?.provider || 'claude'}:${session?.projectPath || ''}`;
}

async function getSkillsForSession(session, { force = false } = {}) {
  if (!session || session.type === 'terminal' || !window.api?.getSessionSkills) return [];
  const key = skillCacheKey(session);
  const cached = sessionSkillsCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = window.api.getSessionSkills({
    provider: session.provider || 'claude',
    projectPath: session.projectPath || '',
  }).then(result => result?.skills || []).catch(() => []);

  sessionSkillsCache.set(key, {
    promise,
    expiresAt: Date.now() + SKILL_CACHE_TTL_MS,
  });
  return promise;
}

function applySkillsState(item, skills) {
  const btn = item?.querySelector('.session-skills-btn');
  if (!btn) return;
  const count = skills?.length || 0;
  item.classList.toggle('has-skills', count > 0);
  btn.title = count === 1 ? 'View 1 available skill' : `View ${count} available skills`;
  btn.setAttribute('aria-label', btn.title);
  btn.dataset.skillCount = String(count);
}

function updateSessionSkillButtons() {
  sidebarContent.querySelectorAll('.session-item').forEach(item => {
    const session = sessionMap.get(item.dataset.sessionId);
    if (!session || session.type === 'terminal') return;
    getSkillsForSession(session).then(skills => {
      const currentItem = sidebarContent.querySelector(`[data-session-id="${session.sessionId}"]`);
      if (currentItem) applySkillsState(currentItem, skills);
    });
  });
}

function canDragProjectGroups() {
  return activeTab === 'sessions'
    && searchMatchIds === null
    && !showStarredOnly
    && !showRunningOnly
    && !showTodayOnly;
}

function getTopLevelProjectGroups() {
  return Array.from(sidebarContent.querySelectorAll(':scope > .project-group[data-project-path]'));
}

function getProjectGroupByPath(projectPath) {
  return getTopLevelProjectGroups().find(group => group.dataset.projectPath === projectPath) || null;
}

function syncSortedOrderProjectOrder(projectOrder) {
  const previous = new Map(sortedOrder.map(entry => [entry.projectPath, entry]));
  const topLevel = new Set(projectOrder);
  const reordered = projectOrder.map(projectPath => previous.get(projectPath) || { projectPath, itemIds: [] });
  for (const entry of sortedOrder) {
    if (!topLevel.has(entry.projectPath)) reordered.push(entry);
  }
  sortedOrder = reordered;
}

function persistProjectOrderFromDom() {
  const projectOrder = getTopLevelProjectGroups()
    .map(group => group.dataset.projectPath)
    .filter(Boolean);
  if (projectOrder.length === 0) return;
  const hiddenOrder = customProjectOrder.filter(projectPath => !projectOrder.includes(projectPath));
  customProjectOrder = [...projectOrder, ...hiddenOrder];
  syncSortedOrderProjectOrder(projectOrder);
  scheduleProjectOrderSave(customProjectOrder);
}

function clearProjectDragState() {
  getTopLevelProjectGroups().forEach(group => {
    group.classList.remove('dragging', 'drag-over-before', 'drag-over-after');
  });
}

function suppressProjectClickOnce() {
  suppressProjectHeaderClick = true;
  setTimeout(() => { suppressProjectHeaderClick = false; }, 120);
}

function bindProjectDragEvents() {
  const enabled = canDragProjectGroups();
  getTopLevelProjectGroups().forEach(group => {
    const header = group.querySelector(':scope > .project-header');
    group.draggable = false;
    group.classList.toggle('project-draggable', enabled);
    if (header) {
      header.draggable = enabled;
      header.classList.toggle('drag-enabled', enabled);
      header.ondragstart = null;
      header.ondragend = null;
    }

    group.ondragover = null;
    group.ondragleave = null;
    group.ondrop = null;
    if (!enabled || !header) return;

    header.ondragstart = (e) => {
      if (e.target.closest('button,input,textarea,select,a')) {
        e.preventDefault();
        return;
      }
      draggingProjectPath = group.dataset.projectPath;
      group.classList.add('dragging');
      suppressProjectClickOnce();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggingProjectPath);
      if (typeof e.dataTransfer.setDragImage === 'function') {
        e.dataTransfer.setDragImage(group, 12, 12);
      }
    };

    group.ondragover = (e) => {
      if (!draggingProjectPath || draggingProjectPath === group.dataset.projectPath) return;
      e.preventDefault();
      const rect = group.getBoundingClientRect();
      const insertBefore = e.clientY < rect.top + (rect.height / 2);
      group.classList.toggle('drag-over-before', insertBefore);
      group.classList.toggle('drag-over-after', !insertBefore);
      e.dataTransfer.dropEffect = 'move';
    };

    group.ondragleave = () => {
      group.classList.remove('drag-over-before', 'drag-over-after');
    };

    group.ondrop = (e) => {
      if (!draggingProjectPath || draggingProjectPath === group.dataset.projectPath) return;
      e.preventDefault();
      const source = getProjectGroupByPath(draggingProjectPath);
      if (!source || source === group) return;
      const rect = group.getBoundingClientRect();
      const insertBefore = e.clientY < rect.top + (rect.height / 2);
      sidebarContent.insertBefore(source, insertBefore ? group : group.nextSibling);
      persistProjectOrderFromDom();
      clearProjectDragState();
      suppressProjectClickOnce();
    };

    header.ondragend = () => {
      draggingProjectPath = null;
      clearProjectDragState();
      suppressProjectClickOnce();
    };
  });
}

function slugId(slug) {
  return 'slug-' + slug.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function folderId(projectPath) {
  return 'project-' + projectPath.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function buildSlugGroup(slug, sessions) {
  const group = document.createElement('div');
  const id = slugId(slug);
  const expanded = getExpandedSlugs().has(id);
  group.className = expanded ? 'slug-group' : 'slug-group collapsed';
  group.id = id;

  const mostRecent = sessions.reduce((a, b) => {
    const aTime = lastActivityTime.get(a.sessionId) || new Date(a.modified);
    const bTime = lastActivityTime.get(b.sessionId) || new Date(b.modified);
    return bTime > aTime ? b : a;
  });
  const displayName = cleanDisplayName(mostRecent.name || mostRecent.aiTitle || mostRecent.summary || slug);
  const mostRecentTime = lastActivityTime.get(mostRecent.sessionId) || new Date(mostRecent.modified);
  const timeStr = formatDate(mostRecentTime);

  const header = document.createElement('div');
  header.className = 'slug-group-header';

  const row = document.createElement('div');
  row.className = 'slug-group-row';

  const expand = document.createElement('span');
  expand.className = 'slug-group-expand';
  expand.innerHTML = '<span class="arrow">&#9654;</span>';

  const info = document.createElement('div');
  info.className = 'slug-group-info';

  const nameEl = document.createElement('div');
  nameEl.className = 'slug-group-name';
  nameEl.textContent = displayName;

  const hasRunning = sessions.some(s => activePtyIds.has(s.sessionId));

  const meta = document.createElement('div');
  meta.className = 'slug-group-meta';
  meta.innerHTML = `<span class="slug-group-dot${hasRunning ? ' running' : ''}"></span><span class="slug-group-count">${sessions.length} sessions</span> ${escapeHtml(timeStr)}`;

  const archiveSlugBtn = document.createElement('button');
  archiveSlugBtn.className = 'slug-group-archive-btn';
  archiveSlugBtn.title = 'Archive all sessions in group';
  archiveSlugBtn.innerHTML = ICONS.archive(14);

  info.appendChild(nameEl);
  info.appendChild(meta);
  row.appendChild(expand);
  row.appendChild(info);
  row.appendChild(archiveSlugBtn);
  header.appendChild(row);

  const sessionsContainer = document.createElement('div');
  sessionsContainer.className = 'slug-group-sessions';

  const promoted = [];
  const rest = [];
  for (const session of sessions) {
    if (activePtyIds.has(session.sessionId)) {
      promoted.push(session);
    } else {
      rest.push(session);
    }
  }

  if (promoted.length > 0) {
    group.classList.add('has-promoted');
    for (const session of promoted) {
      sessionsContainer.appendChild(buildSessionItem(session));
    }
    if (rest.length > 0) {
      const moreBtn = document.createElement('div');
      moreBtn.className = 'slug-group-more';
      moreBtn.id = 'sgm-' + id;
      moreBtn.textContent = `+ ${rest.length} more`;

      const olderDiv = document.createElement('div');
      olderDiv.className = 'slug-group-older';
      olderDiv.id = 'sgo-' + id;
      for (const session of rest) {
        olderDiv.appendChild(buildSessionItem(session));
      }

      sessionsContainer.appendChild(moreBtn);
      sessionsContainer.appendChild(olderDiv);
    }
  } else {
    for (const session of sessions) {
      sessionsContainer.appendChild(buildSessionItem(session));
    }
  }

  group.appendChild(header);
  group.appendChild(sessionsContainer);
  return group;
}

function renderProjects(projects, resort) {
  const newSidebar = document.createElement('div');

  // Sort project groups using the manual order first, then the in-memory render order.
  const projectOrder = customProjectOrder.length > 0
    ? customProjectOrder
    : (resort ? [] : sortedOrder.map(entry => entry.projectPath));
  if (projectOrder.length > 0) {
    const orderIndex = new Map(projectOrder.map((projectPath, i) => [projectPath, i]));
    projects = [...projects].sort((a, b) => {
      const aPos = orderIndex.get(a.projectPath);
      const bPos = orderIndex.get(b.projectPath);
      if (aPos !== undefined && bPos !== undefined) return aPos - bPos;
      if (aPos === undefined && bPos !== undefined) return -1;
      if (aPos !== undefined && bPos === undefined) return 1;
      return 0;
    });
  }
  // projects are now in the correct order (data order for resort, preserved/manual order otherwise)

  // Detect worktree projects and group them under their parent
  const worktreePattern = /^(.+?)\/\.claude\/worktrees\/([^/]+)\/?$/;
  const worktreeMap = new Map(); // parentPath → [worktreeProject, ...]
  const worktreeSet = new Set();
  for (const project of projects) {
    const match = project.projectPath.match(worktreePattern);
    if (match) {
      const parentPath = match[1];
      if (!worktreeMap.has(parentPath)) worktreeMap.set(parentPath, []);
      worktreeMap.get(parentPath).push(project);
      worktreeSet.add(project.projectPath);
    }
  }

  const newSortedOrder = [];

  // Process a project's sessions: filter, sort, slug-group, order, and truncate.
  // Returns { filtered, visible, older, sortOrderEntry } or null if project should be skipped.
  function processProjectSessions(project, resort) {
    let filtered = project.sessions;
    if (showStarredOnly) filtered = filtered.filter(s => s.starred);
    if (showRunningOnly) filtered = filtered.filter(s => activePtyIds.has(s.sessionId));
    if (showTodayOnly) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      filtered = filtered.filter(s => {
        if (!s.modified) return false;
        const d = new Date(s.modified);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayStr;
      });
    }
    const anyFilterActive = showStarredOnly || showRunningOnly || showTodayOnly || searchMatchIds !== null;
    if (filtered.length === 0 && !project._projectMatchedOnly && (project.sessions.length > 0 || anyFilterActive)) return null;

    // Sort
    filtered = [...filtered].sort((a, b) => {
      const aRunning = activePtyIds.has(a.sessionId) || pendingSessions.has(a.sessionId);
      const bRunning = activePtyIds.has(b.sessionId) || pendingSessions.has(b.sessionId);
      const aPri = (a.starred && aRunning ? 3 : aRunning ? 2 : a.starred ? 1 : 0);
      const bPri = (b.starred && bRunning ? 3 : bRunning ? 2 : b.starred ? 1 : 0);
      if (aPri !== bPri) return bPri - aPri;
      return new Date(b.modified) - new Date(a.modified);
    });

    // Slug grouping
    const slugMap = new Map();
    const ungrouped = [];
    for (const session of filtered) {
      if (session.slug) {
        if (!slugMap.has(session.slug)) slugMap.set(session.slug, []);
        slugMap.get(session.slug).push(session);
      } else {
        ungrouped.push(session);
      }
    }
    const allItems = [];
    for (const session of ungrouped) {
      const isRunning = activePtyIds.has(session.sessionId) || pendingSessions.has(session.sessionId);
      allItems.push({ sortTime: new Date(session.modified).getTime(), pinned: !!session.starred, running: isRunning, element: buildSessionItem(session) });
    }
    for (const [slug, sessions] of slugMap) {
      const mostRecentTime = Math.max(...sessions.map(s => new Date(s.modified).getTime()));
      const hasRunning = sessions.some(s => activePtyIds.has(s.sessionId) || pendingSessions.has(s.sessionId));
      const hasPinned = sessions.some(s => s.starred);
      const element = sessions.length === 1 ? buildSessionItem(sessions[0]) : buildSlugGroup(slug, sessions);
      allItems.push({ sortTime: mostRecentTime, pinned: hasPinned, running: hasRunning, element });
    }

    // Sort render items
    const prevEntry = sortedOrder.find(e => e.projectPath === project.projectPath);
    if (resort || !prevEntry) {
      allItems.sort((a, b) => {
        const aPri = (a.pinned && a.running ? 3 : a.running ? 2 : a.pinned ? 1 : 0);
        const bPri = (b.pinned && b.running ? 3 : b.running ? 2 : b.pinned ? 1 : 0);
        if (aPri !== bPri) return bPri - aPri;
        return b.sortTime - a.sortTime;
      });
    } else {
      const orderIndex = new Map(prevEntry.itemIds.map((id, i) => [id, i]));
      allItems.sort((a, b) => {
        const aPos = orderIndex.get(a.element.id);
        const bPos = orderIndex.get(b.element.id);
        if (aPos !== undefined && bPos !== undefined) return aPos - bPos;
        if (aPos === undefined && bPos !== undefined) return -1;
        if (aPos !== undefined && bPos === undefined) return 1;
        return b.sortTime - a.sortTime;
      });
    }

    // Truncate
    let visible = [];
    let older = [];
    if (searchMatchIds !== null || showStarredOnly || showRunningOnly || showTodayOnly) {
      visible = allItems;
    } else {
      let count = 0;
      const ageCutoff = Date.now() - sessionMaxAgeDays * 86400000;
      for (const item of allItems) {
        if (item.running || item.pinned || (count < visibleSessionCount && item.sortTime >= ageCutoff)) {
          visible.push(item);
          count++;
        } else {
          older.push(item);
        }
      }
      if (visible.length === 0 && older.length > 0) { visible = older; older = []; }
    }

    return {
      filtered, visible, older,
      sortOrderEntry: { projectPath: project.projectPath, itemIds: allItems.map(item => item.element.id) },
    };
  }

  // Build the sessions list DOM (shared between projects and worktrees)
  function buildSessionsList(fId, visible, older) {
    const sessionsList = document.createElement('div');
    sessionsList.className = 'project-sessions';
    sessionsList.id = 'sessions-' + fId;
    for (const item of visible) sessionsList.appendChild(item.element);
    if (older.length > 0) {
      const moreBtn = document.createElement('div');
      moreBtn.className = 'sessions-more-toggle';
      moreBtn.id = 'older-' + fId;
      moreBtn.textContent = `+ ${older.length} older`;
      const olderList = document.createElement('div');
      olderList.className = 'sessions-older';
      olderList.id = 'older-list-' + fId;
      olderList.style.display = 'none';
      for (const item of older) olderList.appendChild(item.element);
      sessionsList.appendChild(moreBtn);
      sessionsList.appendChild(olderList);
    }
    return sessionsList;
  }

  for (const project of projects) {
    // Skip worktree projects — they'll be rendered nested under their parent
    if (worktreeSet.has(project.projectPath)) continue;

    const result = processProjectSessions(project, resort);
    if (!result) continue;
    const { filtered, visible, older, sortOrderEntry } = result;
    newSortedOrder.push(sortOrderEntry);
    const fId = folderId(project.projectPath);

    // Build DOM
    const group = document.createElement('div');
    group.className = 'project-group';
    group.id = fId;
    group.dataset.projectPath = project.projectPath;
    if (canDragProjectGroups()) group.classList.add('project-draggable');

    const header = document.createElement('div');
    header.className = 'project-header';
    if (canDragProjectGroups()) {
      header.classList.add('drag-enabled');
      header.draggable = true;
    }
    header.id = 'ph-' + fId;
    const shortName = project.projectPath.split('/').filter(Boolean).slice(-2).join('/');
    header.innerHTML = `<span class="arrow">&#9660;</span> <span class="project-name">${shortName}</span>`;

    const scheduleBtn = document.createElement('button');
    scheduleBtn.className = 'project-schedule-btn';
    scheduleBtn.title = 'Create scheduled task';
    scheduleBtn.innerHTML = ICONS.schedule(16);
    header.appendChild(scheduleBtn);

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'project-settings-btn';
    settingsBtn.title = 'Project settings';
    settingsBtn.innerHTML = ICONS.gear(16);
    header.appendChild(settingsBtn);

    const archiveGroupBtn = document.createElement('button');
    archiveGroupBtn.className = 'project-archive-btn';
    archiveGroupBtn.title = 'Archive all sessions';
    archiveGroupBtn.innerHTML = ICONS.archive(18);
    header.appendChild(archiveGroupBtn);

    const deleteProjectBtn = document.createElement('button');
    deleteProjectBtn.className = 'project-delete-btn';
    deleteProjectBtn.title = 'Delete folder from Switchboard';
    deleteProjectBtn.innerHTML = ICONS.trash(15);
    header.appendChild(deleteProjectBtn);

    const newBtn = document.createElement('button');
    newBtn.className = 'project-new-btn';
    newBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>';
    newBtn.title = 'New session';
    header.appendChild(newBtn);

    const sessionsList = buildSessionsList(fId, visible, older);

    // Auto-collapse if most recent session is older than threshold, or project matched with no sessions
    if (project._projectMatchedOnly) {
      header.classList.add('collapsed');
    } else if (searchMatchIds === null && !showStarredOnly && !showRunningOnly) {
      const mostRecent = filtered[0]?.modified;
      if (mostRecent && (Date.now() - new Date(mostRecent)) > sessionMaxAgeDays * 86400000) {
        header.classList.add('collapsed');
      }
    }

    group.appendChild(header);
    group.appendChild(sessionsList);

    // Render nested worktree sub-groups
    const childWorktrees = worktreeMap.get(project.projectPath) || [];
    for (const wt of childWorktrees) {
      const wtResult = processProjectSessions(wt, resort);
      if (!wtResult) continue;
      newSortedOrder.push(wtResult.sortOrderEntry);

      const wtName = wt.projectPath.match(worktreePattern)?.[2] || wt.projectPath.split('/').pop();
      const wtFId = folderId(wt.projectPath);

      const wtGroup = document.createElement('div');
      wtGroup.className = 'worktree-group';
      wtGroup.id = wtFId;

      const wtHeader = document.createElement('div');
      wtHeader.className = 'worktree-header';
      wtHeader.id = 'ph-' + wtFId;
      wtHeader.innerHTML = `<span class="worktree-branch-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"/><path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35"/><path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"/></svg></span> <span class="worktree-name">${escapeHtml(wtName)}</span>`;

      const wtHideBtn = document.createElement('button');
      wtHideBtn.className = 'worktree-hide-btn';
      wtHideBtn.title = 'Hide worktree';
      wtHideBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      wtHeader.appendChild(wtHideBtn);

      const wtNewBtn = document.createElement('button');
      wtNewBtn.className = 'project-new-btn worktree-new-btn';
      wtNewBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>';
      wtNewBtn.title = 'New session in worktree';
      wtHeader.appendChild(wtNewBtn);

      const wtSessionsList = buildSessionsList(wtFId, wtResult.visible, wtResult.older);
      wtSessionsList.className = 'worktree-sessions';

      // Auto-collapse worktree if stale
      if (searchMatchIds === null && !showStarredOnly && !showRunningOnly) {
        const mostRecent = wtResult.filtered[0]?.modified;
        if (mostRecent && (Date.now() - new Date(mostRecent)) > sessionMaxAgeDays * 86400000) {
          wtHeader.classList.add('collapsed');
        }
      }

      wtGroup.appendChild(wtHeader);
      wtGroup.appendChild(wtSessionsList);
      sessionsList.appendChild(wtGroup);
    }

    newSidebar.appendChild(group);
  }

  // Re-apply active state
  if (activeSessionId) {
    const activeItem = newSidebar.querySelector(`[data-session-id="${activeSessionId}"]`);
    if (activeItem) activeItem.classList.add('active');
  }

  morphdom(sidebarContent, newSidebar, {
    childrenOnly: true,
    onBeforeElUpdated(fromEl, toEl) {
      // Skip updating session items that have an active rename input
      if (fromEl.classList.contains('session-item') && fromEl.querySelector('.session-rename-input')) {
        return false;
      }
      if (fromEl.classList.contains('project-header')) {
        if (fromEl.classList.contains('collapsed')) {
          toEl.classList.add('collapsed');
        } else {
          toEl.classList.remove('collapsed');
        }
      }
      if (fromEl.classList.contains('slug-group') || fromEl.classList.contains('worktree-header')) {
        if (fromEl.classList.contains('collapsed')) {
          toEl.classList.add('collapsed');
        } else {
          toEl.classList.remove('collapsed');
        }
      }
      if (fromEl.classList.contains('sessions-older') && fromEl.style.display !== 'none') {
        toEl.style.display = '';
      }
      if (fromEl.classList.contains('sessions-more-toggle') && fromEl.classList.contains('expanded')) {
        toEl.classList.add('expanded');
        toEl.textContent = '- hide older';
      }
      if (fromEl.classList.contains('slug-group-older') && fromEl.style.display !== 'none') {
        toEl.style.display = '';
      }
      if (fromEl.classList.contains('slug-group-more') && fromEl.classList.contains('expanded')) {
        toEl.classList.add('expanded');
      }
      return true;
    },
    getNodeKey(node) {
      return node.id || undefined;
    }
  });

  // Save the full sorted order (project order + item order) as source of truth
  sortedOrder = newSortedOrder;

  rebindSidebarEvents(projects);
  updateSessionSkillButtons();

  // Restore terminal focus after morphdom DOM updates, but not if the user is
  // interacting with an input/textarea (search box, rename input, dialogs, etc.)
  const ae = document.activeElement;
  const isUserTyping = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable || ae.closest('.modal-overlay'));
  if (activeSessionId && openSessions.has(activeSessionId) && !isUserTyping) {
    openSessions.get(activeSessionId).terminal.focus();
  }
}

function rebindSidebarEvents(projects) {
  for (const project of projects) {
    const fId = folderId(project.projectPath);
    const header = document.getElementById('ph-' + fId);
    if (!header) continue;
    const newBtn = header.querySelector('.project-new-btn');
    if (newBtn) {
      newBtn.onclick = (e) => { e.stopPropagation(); showNewSessionPopover(project, newBtn); };
    }
    const scheduleBtn = header.querySelector('.project-schedule-btn');
    if (scheduleBtn) {
      scheduleBtn.onclick = (e) => { e.stopPropagation(); launchScheduleCreator(project); };
    }
    const settingsBtn = header.querySelector('.project-settings-btn');
    if (settingsBtn) {
      settingsBtn.onclick = (e) => { e.stopPropagation(); openSettingsViewer('project', project.projectPath); };
    }
    const archiveGroupBtn = header.querySelector('.project-archive-btn');
    if (archiveGroupBtn) {
      archiveGroupBtn.onclick = async (e) => {
        e.stopPropagation();
        const sessions = project.sessions.filter(s => !s.archived);
        if (sessions.length === 0) return;
        const shortName = project.projectPath.split('/').filter(Boolean).slice(-2).join('/');
        if (!confirm(`Archive all ${sessions.length} session${sessions.length > 1 ? 's' : ''} in ${shortName}?`)) return;
        for (const s of sessions) {
          if (activePtyIds.has(s.sessionId)) {
            await window.api.stopSession(s.sessionId);
          }
          await window.api.archiveSession(s.sessionId, 1);
          s.archived = 1;
        }
        pollActiveSessions();
        loadProjects();
      };
    }
    const deleteProjectBtn = header.querySelector('.project-delete-btn');
    if (deleteProjectBtn) {
      deleteProjectBtn.onclick = async (e) => {
        e.stopPropagation();
        if (deletingProjectPaths.has(project.projectPath)) return;

        const shortName = confirmLabel(project.projectPath.split('/').filter(Boolean).slice(-2).join('/') || project.projectPath, 'folder');
        if (!confirm(`Delete folder "${shortName}" from Switchboard?\n\nThis permanently deletes the saved session history under it. Project files are not deleted.`)) return;

        const group = header.closest('.project-group');
        deletingProjectPaths.add(project.projectPath);
        deleteProjectBtn.disabled = true;
        header.setAttribute('aria-busy', 'true');
        group?.classList.add('deleting');

        try {
          const result = await window.api.deleteProject(project.projectPath);
          if (!result?.ok) {
            alert('Could not delete folder: ' + (result?.error || 'unknown error'));
            return;
          }

          const deletedIds = result.deletedSessionIds?.length
            ? result.deletedSessionIds
            : project.sessions.map(session => session.sessionId);
          for (const sessionId of deletedIds) {
            if (openSessions.has(sessionId)) destroySession(sessionId);
            pendingSessions.delete(sessionId);
            sessionMap.delete(sessionId);
            activePtyIds.delete(sessionId);
          }
          await pollActiveSessions();
          await loadProjects();
        } catch (err) {
          alert('Could not delete folder: ' + (err?.message || 'unknown error'));
        } finally {
          deletingProjectPaths.delete(project.projectPath);
          deleteProjectBtn.disabled = false;
          header.removeAttribute('aria-busy');
          group?.classList.remove('deleting');
        }
      };
    }
    header.onclick = (e) => {
      if (suppressProjectHeaderClick) {
        e.preventDefault();
        return;
      }
      if (e.target.closest('.project-new-btn') || e.target.closest('.project-archive-btn') || e.target.closest('.project-delete-btn') || e.target.closest('.project-settings-btn') || e.target.closest('.project-schedule-btn')) return;
      header.classList.toggle('collapsed');
    };
  }

  bindProjectDragEvents();

  // Bind worktree header events
  sidebarContent.querySelectorAll('.worktree-header').forEach(wtHeader => {
    const wtFId = wtHeader.id.replace('ph-', '');
    const wtProject = projects.find(p => folderId(p.projectPath) === wtFId);
    if (!wtProject) return;

    const wtNewBtn = wtHeader.querySelector('.worktree-new-btn');
    if (wtNewBtn) {
      wtNewBtn.onclick = (e) => { e.stopPropagation(); showNewSessionPopover(wtProject, wtNewBtn); };
    }
    const wtHideBtn = wtHeader.querySelector('.worktree-hide-btn');
    if (wtHideBtn) {
      wtHideBtn.onclick = async (e) => {
        e.stopPropagation();
        const name = wtProject.projectPath.split('/').pop();
        if (!confirm(`Hide worktree "${name}"?\n\nSession files are not deleted.`)) return;
        await window.api.removeProject(wtProject.projectPath);
        loadProjects();
      };
    }
    wtHeader.onclick = (e) => {
      if (e.target.closest('.worktree-new-btn') || e.target.closest('.worktree-hide-btn')) return;
      wtHeader.classList.toggle('collapsed');
    };
  });

  sidebarContent.querySelectorAll('.slug-group-header').forEach(header => {
    const archiveBtn = header.querySelector('.slug-group-archive-btn');
    if (archiveBtn) {
      archiveBtn.onclick = async (e) => {
        e.stopPropagation();
        const group = header.parentElement;
        const sessionItems = group.querySelectorAll('.session-item');
        for (const item of sessionItems) {
          const sid = item.dataset.sessionId;
          const session = sessionMap.get(sid);
          if (!session || session.archived) continue;
          if (activePtyIds.has(sid)) await window.api.stopSession(sid);
          await window.api.archiveSession(sid, 1);
          session.archived = 1;
        }
        pollActiveSessions();
        loadProjects();
      };
    }
    header.onclick = (e) => {
      if (e.target.closest('.slug-group-archive-btn')) return;
      header.parentElement.classList.toggle('collapsed');
      saveExpandedSlugs();
    };
  });

  sidebarContent.querySelectorAll('.slug-group-more').forEach(moreBtn => {
    moreBtn.onclick = () => {
      const group = moreBtn.closest('.slug-group');
      if (group) {
        group.classList.remove('collapsed');
        saveExpandedSlugs();
      }
    };
  });

  sidebarContent.querySelectorAll('.sessions-more-toggle').forEach(moreBtn => {
    const olderList = moreBtn.nextElementSibling;
    if (!olderList || !olderList.classList.contains('sessions-older')) return;
    const count = olderList.children.length;
    moreBtn.onclick = () => {
      const showing = olderList.style.display !== 'none';
      olderList.style.display = showing ? 'none' : '';
      moreBtn.classList.toggle('expanded', !showing);
      moreBtn.textContent = showing ? `+ ${count} older` : '- hide older';
    };
  });

  sidebarContent.querySelectorAll('.session-item').forEach(item => {
    const sessionId = item.dataset.sessionId;
    const session = sessionMap.get(sessionId);
    if (!session) return;

    item.onclick = () => {
      if (deletingSessionIds.has(session.sessionId)) return;
      openSession(session);
    };

    const pin = item.querySelector('.session-pin');
    if (pin) {
      pin.onclick = async (e) => {
        e.stopPropagation();
        const { starred } = await window.api.toggleStar(session.sessionId);
        session.starred = starred;
        refreshSidebar({ resort: true });
      };
    }

    const summaryEl = item.querySelector('.session-summary');
    if (summaryEl) {
      summaryEl.ondblclick = (e) => { e.stopPropagation(); startRename(summaryEl, session); };
    }

    const stopBtn = item.querySelector('.session-stop-btn');
    if (stopBtn) {
      stopBtn.onclick = (e) => {
        e.stopPropagation();
        confirmAndStopSession(session.sessionId);
      };
    }

    const skillsBtn = item.querySelector('.session-skills-btn');
    if (skillsBtn) {
      skillsBtn.onclick = async (e) => {
        e.stopPropagation();
        const skills = await getSkillsForSession(session);
        showSessionSkillsDialog(session, skills);
      };
    }

    const launchConfigBtn = item.querySelector('.session-launch-config-btn');
    if (launchConfigBtn) {
      launchConfigBtn.onclick = (e) => {
        e.stopPropagation();
        showResumeSessionDialog(session);
      };
    }

    const forkBtn = item.querySelector('.session-fork-btn');
    if (forkBtn) {
      forkBtn.onclick = async (e) => {
        e.stopPropagation();
        // Find the project for this session
        const project = [...cachedAllProjects, ...cachedProjects].find(p =>
          p.sessions.some(s => s.sessionId === session.sessionId)
        );
        if (project) {
          forkSession(session, project);
        }
      };
    }

    const jsonlBtn = item.querySelector('.session-jsonl-btn');
    if (jsonlBtn) {
      jsonlBtn.onclick = (e) => {
        e.stopPropagation();
        showJsonlViewer(session);
      };
    }

    const archiveBtn = item.querySelector('.session-archive-btn');
    if (archiveBtn) {
      archiveBtn.onclick = async (e) => {
        e.stopPropagation();
        const newVal = session.archived ? 0 : 1;
        if (newVal && activePtyIds.has(session.sessionId)) {
          await window.api.stopSession(session.sessionId);
          pollActiveSessions();
        }
        await window.api.archiveSession(session.sessionId, newVal);
        session.archived = newVal;
        loadProjects();
      };
    }

    const deleteBtn = item.querySelector('.session-delete-btn');
    if (deleteBtn) {
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        if (deletingSessionIds.has(session.sessionId)) return;
        const displayName = confirmLabel(session.name || session.aiTitle || session.summary || session.sessionId, 'session');
        if (!confirm(`Delete session "${displayName}"?\n\nThis permanently deletes the saved session history.`)) return;

        setSessionDeleting(item, session.sessionId, true);

        try {
          const result = await window.api.deleteSession(session.sessionId);
          if (!result?.ok) {
            alert('Could not delete session: ' + (result?.error || 'unknown error'));
            setSessionDeleting(item, session.sessionId, false);
            return;
          }

          if (openSessions.has(session.sessionId)) {
            destroySession(session.sessionId);
          }
          pendingSessions.delete(session.sessionId);
          sessionMap.delete(session.sessionId);
          activePtyIds.delete(session.sessionId);
          await pollActiveSessions();
          await loadProjects();
          deletingSessionIds.delete(session.sessionId);
        } catch (err) {
          alert('Could not delete session: ' + (err?.message || 'unknown error'));
          setSessionDeleting(item, session.sessionId, false);
        }
      };
    }
  });

  // Auto-expand slug group if it contains the active session
  if (activeSessionId) {
    const activeItem = sidebarContent.querySelector(`[data-session-id="${activeSessionId}"]`);
    const collapsedGroup = activeItem?.closest('.slug-group.collapsed');
    if (collapsedGroup) {
      collapsedGroup.classList.remove('collapsed');
      saveExpandedSlugs();
    }
  }
}

function buildSessionItem(session) {
  const item = document.createElement('div');
  item.className = 'session-item';
  item.id = 'si-' + session.sessionId;
  if (session.type === 'terminal') item.classList.add('is-terminal');
  if (session.archived) item.classList.add('archived-item');
  if (deletingSessionIds.has(session.sessionId)) {
    item.classList.add('deleting');
    item.setAttribute('aria-busy', 'true');
  }
  if (activePtyIds.has(session.sessionId)) item.classList.add('has-running-pty');
  if (attentionSessions.has(session.sessionId)) item.classList.add('needs-attention');
  if (responseReadySessions.has(session.sessionId)) item.classList.add('response-ready');
  if (sessionBusyState.get(session.sessionId)) item.classList.add('cli-busy');
  item.dataset.sessionId = session.sessionId;

  const modified = lastActivityTime.get(session.sessionId) || new Date(session.modified);
  const timeStr = formatDate(modified);
  const displayName = cleanDisplayName(session.name || session.aiTitle || session.summary);

  const row = document.createElement('div');
  row.className = 'session-row';

  // Pin
  const pin = document.createElement('span');
  pin.className = 'session-pin' + (session.starred ? ' pinned' : '');
  pin.dataset.tooltip = session.starred ? 'Unpin session' : 'Pin session';
  pin.setAttribute('role', 'button');
  pin.setAttribute('aria-label', pin.dataset.tooltip);
  pin.innerHTML = session.starred
    ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707c-.28-.28-.576-.49-.888-.656L10.073 9.333l-.07 3.181a.5.5 0 0 1-.853.354l-3.535-3.536-4.243 4.243a.5.5 0 1 1-.707-.707l4.243-4.243L1.372 5.11a.5.5 0 0 1 .354-.854l3.18-.07L8.37 .722A3.37 3.37 0 0 1 9.12.074a.5.5 0 0 1 .708.002l-.707.707z"/></svg>'
    : '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707c-.28-.28-.576-.49-.888-.656L10.073 9.333l-.07 3.181a.5.5 0 0 1-.853.354l-3.535-3.536-4.243 4.243a.5.5 0 1 1-.707-.707l4.243-4.243L1.372 5.11a.5.5 0 0 1 .354-.854l3.18-.07L8.37 .722A3.37 3.37 0 0 1 9.12.074a.5.5 0 0 1 .708.002l-.707.707z"/></svg>';

  // Running status dot
  const dot = document.createElement('span');
  dot.className = 'session-status-dot' + (activePtyIds.has(session.sessionId) ? ' running' : '');

  // Info block
  const info = document.createElement('div');
  info.className = 'session-info';

  const summaryEl = document.createElement('div');
  summaryEl.className = 'session-summary';
  summaryEl.textContent = displayName;

  const idEl = document.createElement('div');
  idEl.className = 'session-id';
  idEl.textContent = session.sessionId;

  const metaEl = document.createElement('div');
  metaEl.className = 'session-meta';
  metaEl.textContent = timeStr + (session.messageCount ? ' \u00b7 ' + session.messageCount + ' msgs' : '');

  if (session.type === 'terminal') {
    const badge = document.createElement('span');
    badge.className = 'terminal-badge';
    badge.dataset.tooltip = 'Terminal';
    badge.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>';
    summaryEl.prepend(badge);
  } else if (session.provider === 'codex') {
    const badge = document.createElement('span');
    badge.className = 'provider-badge codex-badge';
    badge.dataset.tooltip = 'Codex';
    badge.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5l-5 7 5 7"/><path d="M16 5l5 7-5 7"/><path d="M14 4l-4 16"/></svg>';
    summaryEl.prepend(badge);
  } else if (session.provider === 'pi') {
    const badge = document.createElement('span');
    badge.className = 'provider-badge pi-badge';
    badge.dataset.tooltip = 'Pi Mono';
    badge.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5h10"/><path d="M9 5v14"/><path d="M15 5v14"/><path d="M5 12h14"/></svg>';
    summaryEl.prepend(badge);
  }
  info.appendChild(summaryEl);
  info.appendChild(idEl);
  info.appendChild(metaEl);

  // Action buttons container
  const actions = document.createElement('div');
  actions.className = 'session-actions';

  const stopBtn = document.createElement('button');
  stopBtn.className = 'session-stop-btn';
  stopBtn.title = 'Stop session';
  stopBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1"/></svg>';

  const skillsBtn = document.createElement('button');
  skillsBtn.className = 'session-skills-btn';
  skillsBtn.title = 'View available skills';
  skillsBtn.setAttribute('aria-label', 'View available skills');
  skillsBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5"/><path d="M12 12v9"/><path d="M12 12L4 7.5"/></svg>';

  const archiveBtn = document.createElement('button');
  archiveBtn.className = 'session-archive-btn';
  archiveBtn.title = session.archived ? 'Unarchive' : 'Archive';
  archiveBtn.innerHTML = ICONS.archive(16);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'session-delete-btn';
  deleteBtn.title = 'Delete from history';
  deleteBtn.innerHTML = ICONS.trash(14);

  const forkBtn = document.createElement('button');
  forkBtn.className = 'session-fork-btn';
  forkBtn.title = 'Fork session';
  forkBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M8 3h-5v5"/><path d="M21 3l-7.536 7.536a5 5 0 0 0-1.464 3.534v6.93"/><path d="M3 3l7.536 7.536a5 5 0 0 1 1.464 3.534v.93"/></svg>';

  const jsonlBtn = document.createElement('button');
  jsonlBtn.className = 'session-jsonl-btn';
  jsonlBtn.title = 'View messages';
  jsonlBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/></svg>';

  const launchConfigBtn = document.createElement('button');
  launchConfigBtn.className = 'session-launch-config-btn';
  launchConfigBtn.title = 'Edit launch config';
  launchConfigBtn.setAttribute('aria-label', 'Edit launch config');
  launchConfigBtn.innerHTML = ICONS.launchConfig(14);

  actions.appendChild(stopBtn);
  if (session.type !== 'terminal') {
    actions.appendChild(launchConfigBtn);
    actions.appendChild(skillsBtn);
    actions.appendChild(forkBtn);
    actions.appendChild(jsonlBtn);
    actions.appendChild(archiveBtn);
    actions.appendChild(deleteBtn);
  }

  row.appendChild(pin);
  row.appendChild(dot);
  row.appendChild(info);
  row.appendChild(actions);
  if (deletingSessionIds.has(session.sessionId)) {
    const deletingOverlay = document.createElement('div');
    deletingOverlay.className = 'session-delete-loading';
    deletingOverlay.innerHTML = '<span class="session-delete-spinner"></span><span>Deleting...</span>';
    row.appendChild(deletingOverlay);
  }
  item.appendChild(row);

  return item;
}

function startRename(summaryEl, session) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'session-rename-input';
  input.value = session.name || session.aiTitle || session.summary;

  summaryEl.replaceWith(input);
  input.focus();
  input.select();

  const save = async () => {
    const newName = input.value.trim();
    const fallback = session.aiTitle || session.summary;
    const nameToSave = (newName && newName !== fallback) ? newName : null;
    await window.api.renameSession(session.sessionId, nameToSave);
    session.name = nameToSave;

    const newSummary = document.createElement('div');
    newSummary.className = 'session-summary';
    newSummary.textContent = nameToSave || fallback;
    newSummary.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRename(newSummary, session);
    });
    input.replaceWith(newSummary);
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      input.removeEventListener('blur', save);
      const restored = document.createElement('div');
      restored.className = 'session-summary';
      restored.textContent = session.name || session.aiTitle || session.summary;
      restored.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        startRename(restored, session);
      });
      input.replaceWith(restored);
    }
  });
}
