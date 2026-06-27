/**
 * viewer-panel.js — Unified viewer component for CodeMirror-based panels.
 *
 * A single component used by plan viewer, memory viewer, and file panel.
 * Manages toolbar, editor, preview area, and all interactions.
 * Watches files for external changes and reloads automatically.
 *
 * Toolbar buttons are shown/hidden automatically based on file type:
 *   - Preview: shown for markdown and HTML files
 *   - Wrap: always shown (defaults on for markdown, off for others)
 *   - Save: shown if onSave is provided
 *   - Close: shown if onClose is provided
 *   - Copy path/content: shown if opted in
 *
 * Depends on: viewer-toolbar.js, codemirror-bundle.js
 */

class ViewerPanel {
  /**
   * @param {HTMLElement} container - Parent element to render into
   * @param {Object} opts
   * @param {Function}  opts.onSave       - async (filePath, content) => result
   * @param {Function}  opts.onClose      - () => void
   * @param {boolean}   opts.copyPath     - Show copy-path button
   * @param {boolean}   opts.copyContent  - Show copy-content button
   * @param {string}    opts.language     - 'markdown' or 'auto' (default 'markdown')
   * @param {string}    opts.storageKey   - localStorage key for preview mode persistence
   * @param {boolean}   opts.preferPreview - Open previewable files in preview mode by default
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;

    // State
    this.filePath = '';
    this.editorView = null;
    this.editorLanguageKey = '';
    this.previewMode = false;
    this.previewKind = 'none';
    this.wrapMode = false;
    this._watchedPath = null;
    this._saving = false;

    // Create toolbar — always include preview, wrap, save; visibility managed in open()
    this.toolbar = window.createViewerToolbar({
      copyPath: !!opts.copyPath,
      copyContent: !!opts.copyContent,
      preview: true,
      wrap: true,
      gotoLine: true,
      save: !!opts.onSave,
      close: !!opts.onClose,
    });
    container.insertBefore(this.toolbar.el, container.firstChild);

    // Hide preview initially (shown in open() for previewable file types)
    if (this.toolbar.previewBtn) this.toolbar.previewBtn.style.display = 'none';

    // Create editor area
    this.editorEl = document.createElement('div');
    this.editorEl.className = 'viewer-panel-editor';
    container.appendChild(this.editorEl);

    // Create preview area
    this.previewEl = document.createElement('div');
    this.previewEl.className = 'markdown-preview';
    this.previewEl.style.display = 'none';
    container.appendChild(this.previewEl);

    // Wire toolbar events
    this._wireEvents();

    // Listen for Cmd/Ctrl+S from CM editors
    container.addEventListener('cm-save', () => this._save());

    // Listen for file changes from main process
    this._onFileChanged = (changedPath) => {
      if (changedPath === this._watchedPath && !this._saving) {
        this._reloadFromDisk();
      }
    };
    if (window.api.onFileChanged) {
      window.api.onFileChanged(this._onFileChanged);
    }
  }

  _wireEvents() {
    const { toolbar, opts } = this;

    if (toolbar.previewBtn) {
      toolbar.previewBtn.addEventListener('click', () => this._togglePreview());
    }

    if (toolbar.wrapBtn) {
      toolbar.wrapBtn.addEventListener('click', () => this._toggleWrap());
    }

    if (toolbar.gotoLineBtn) {
      toolbar.gotoLineBtn.addEventListener('click', () => {
        if (this.editorView && window.cmOpenGotoLine) {
          window.cmOpenGotoLine(this.editorView);
        }
      });
    }

    if (toolbar.saveBtn && opts.onSave) {
      toolbar.saveBtn.addEventListener('click', () => this._save());
    }

    if (toolbar.closeBtn && opts.onClose) {
      toolbar.closeBtn.addEventListener('click', () => opts.onClose());
    }

    if (toolbar.copyPathBtn) {
      toolbar.copyPathBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(this.filePath);
        toolbar.flashCopyPath();
      });
    }

    if (toolbar.copyContentBtn) {
      toolbar.copyContentBtn.addEventListener('click', () => {
        const content = this.getContent();
        navigator.clipboard.writeText(content);
        toolbar.flashCopyContent();
      });
    }
  }

  /**
   * Open a file in the viewer.
   */
  open(title, filePath, content) {
    this._unwatchFile();

    this.filePath = filePath;
    this.toolbar.setTitle(title);
    this.toolbar.setPath(filePath);

    this.previewKind = this._previewKind(filePath);
    const isMd = this.previewKind === 'markdown';
    const isPreviewable = this.previewKind !== 'none';

    // Reset to edit mode before updating content (without touching localStorage)
    this._showEditor({ persist: false });

    // Show/hide preview button based on file type
    if (this.toolbar.previewBtn) {
      this.toolbar.previewBtn.style.display = isPreviewable ? '' : 'none';
      this._setPreviewButtonTitle(false);
    }

    const wantPreview = isPreviewable && this._shouldOpenPreview();

    // Create or update editor
    const languageKey = this._languageKey(filePath);
    if (!this.editorView || this.editorLanguageKey !== languageKey) {
      this._destroyEditor();
      this.editorLanguageKey = languageKey;
      this._createEditor(content, filePath);
    } else {
      this.editorView.dispatch({
        changes: { from: 0, to: this.editorView.state.doc.length, insert: content },
      });
    }

    // Set wrap default based on file type
    this.wrapMode = isMd;
    this.toolbar.setWrapMode(this.wrapMode);
    if (this.editorView && this.editorView._wrapCompartment) {
      this.editorView.dispatch({
        effects: this.editorView._wrapCompartment.reconfigure(
          this.wrapMode ? window.CMEditorView.lineWrapping : []
        ),
      });
    }

    // Re-apply preview preference
    if (wantPreview) {
      this._setPreview(true);
    }

    // Watch for external changes
    this._watchFile(filePath);
  }

  _createEditor(content, filePath) {
    if (this.opts.language === 'auto') {
      this.editorView = window.createEditableViewer(
        this.editorEl, content, filePath, { wrap: this.wrapMode },
      );
    } else {
      this.editorView = window.createPlanEditor(this.editorEl);
      if (content) {
        this.editorView.dispatch({
          changes: { from: 0, to: this.editorView.state.doc.length, insert: content },
        });
      }
    }
  }

  _togglePreview() {
    if (this.previewKind === 'none') return;
    if (this.previewMode) {
      this._showEditor({ persist: true });
    } else {
      this._showPreview({ persist: true });
    }
  }

  _setPreview(show) {
    if (this.previewMode === show) return;
    if (show) this._showPreview({ persist: true });
    else this._showEditor({ persist: true });
  }

  _showPreview({ persist = false } = {}) {
    if (this.previewKind === 'none' || !this.editorView) return;

    const content = this.getContent();
    if (this.previewKind === 'markdown') {
      this.previewEl.className = 'markdown-preview';
      this.previewEl.innerHTML = window.marked.parse(content);
      this.previewEl.style.display = 'block';
    } else if (this.previewKind === 'html') {
      this._renderHtmlPreview(content);
      this.previewEl.style.display = 'flex';
    }

    this.editorEl.style.display = 'none';
    this.previewMode = true;
    if (this.toolbar.previewBtn) {
      this.toolbar.previewBtn.classList.add('active');
      this._setPreviewButtonTitle(true);
    }
    if (persist && this.opts.storageKey) localStorage.setItem(this.opts.storageKey, 'true');
  }

  _showEditor({ persist = false } = {}) {
    this.previewEl.style.display = 'none';
    this.editorEl.style.display = '';
    this.previewMode = false;
    if (this.toolbar.previewBtn) {
      this.toolbar.previewBtn.classList.remove('active');
      this._setPreviewButtonTitle(false);
    }
    if (persist && this.opts.storageKey) localStorage.setItem(this.opts.storageKey, 'false');
  }

  _renderHtmlPreview(content) {
    this.previewEl.className = 'html-preview';
    this.previewEl.innerHTML = '';

    const frame = document.createElement('iframe');
    frame.className = 'html-preview-frame';
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.referrerPolicy = 'no-referrer';
    frame.srcdoc = this._htmlWithBase(content);

    this.previewEl.appendChild(frame);
  }

  _htmlWithBase(content) {
    const html = String(content || '');
    if (/<base\s/i.test(html)) return html;

    const baseHref = this._fileDirUrl(this.filePath);
    const baseTag = baseHref ? `<base href="${this._escapeAttr(baseHref)}">` : '';
    if (!baseTag) return html;

    if (/<head\b[^>]*>/i.test(html)) {
      return html.replace(/<head\b([^>]*)>/i, `<head$1>${baseTag}`);
    }
    if (/<html\b[^>]*>/i.test(html)) {
      return html.replace(/<html\b([^>]*)>/i, `<html$1><head>${baseTag}</head>`);
    }
    return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`;
  }

  _fileDirUrl(filePath) {
    if (!filePath) return '';
    const normalized = String(filePath).replace(/\\/g, '/');
    const slash = normalized.lastIndexOf('/');
    if (slash < 0) return '';
    const dir = normalized.slice(0, slash + 1);
    const encoded = dir
      .split('/')
      .map((part, index) => (index === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)))
      .join('/');
    if (/^[A-Za-z]:\//.test(dir)) return `file:///${encoded}`;
    return `file://${encoded}`;
  }

  _escapeAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  _setPreviewButtonTitle(active) {
    if (!this.toolbar.previewBtn) return;
    if (active) {
      this.toolbar.previewBtn.title = 'Back to editor';
      return;
    }
    this.toolbar.previewBtn.title = this.previewKind === 'html'
      ? 'Toggle HTML preview'
      : 'Toggle markdown preview';
  }

  _shouldOpenPreview() {
    if (this.opts.storageKey) {
      return localStorage.getItem(this.opts.storageKey) === 'true';
    }
    return !!this.opts.preferPreview;
  }

  _toggleWrap() {
    if (!this.editorView || !this.editorView._wrapCompartment) return;
    this.wrapMode = !this.wrapMode;
    this.editorView.dispatch({
      effects: this.editorView._wrapCompartment.reconfigure(
        this.wrapMode ? window.CMEditorView.lineWrapping : []
      ),
    });
    this.toolbar.setWrapMode(this.wrapMode);
  }

  async _save() {
    if (!this.opts.onSave || !this.filePath) return;
    this._saving = true;
    const content = this.getContent();
    try {
      const result = await this.opts.onSave(this.filePath, content);
      if (result && result.ok !== false) {
        this.toolbar.flashSave();
      }
    } finally {
      setTimeout(() => { this._saving = false; }, 500);
    }
  }

  getContent() {
    return this.editorView ? this.editorView.state.doc.toString() : '';
  }

  destroy() {
    this._unwatchFile();
    this._destroyEditor();
    this.previewEl.innerHTML = '';
    this.previewEl.style.display = 'none';
    this.previewMode = false;
    this.previewKind = 'none';
  }

  _destroyEditor() {
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }
    this.editorLanguageKey = '';
    // Clear stale search/goto-line bar references so they get recreated with the new editor
    delete this.editorEl._cmSearchBar;
    delete this.editorEl._cmGotoLine;
    this.editorEl.innerHTML = '';
  }

  // ── File Watching ──────────────────────────────────────────────────

  _watchFile(filePath) {
    if (!filePath || !window.api.watchFile) return;
    this._watchedPath = filePath;
    window.api.watchFile(filePath);
  }

  _unwatchFile() {
    if (this._watchedPath && window.api.unwatchFile) {
      window.api.unwatchFile(this._watchedPath);
      this._watchedPath = null;
    }
  }

  async _reloadFromDisk() {
    if (!this.filePath || !window.api.readFileForPanel) return;
    const result = await window.api.readFileForPanel(this.filePath);
    if (!result.ok) return;

    const newContent = result.content;
    const currentContent = this.getContent();
    if (newContent === currentContent) return;

    if (this.editorView) {
      this.editorView.dispatch({
        changes: { from: 0, to: this.editorView.state.doc.length, insert: newContent },
      });
    }

    if (this.previewMode) {
      if (this.previewKind === 'markdown') {
        this.previewEl.innerHTML = window.marked.parse(newContent);
      } else if (this.previewKind === 'html') {
        this._renderHtmlPreview(newContent);
      }
    }
  }

  _previewKind(filePath) {
    if (this._isMarkdown(filePath)) return 'markdown';
    if (this._isHtml(filePath)) return 'html';
    return 'none';
  }

  _isMarkdown(filePath) {
    if (!filePath) return this.opts.language === 'markdown';
    const ext = filePath.split('.').pop()?.toLowerCase();
    return ext === 'md' || ext === 'mdx' || ext === 'markdown';
  }

  _isHtml(filePath) {
    if (!filePath) return false;
    const ext = filePath.split('.').pop()?.toLowerCase();
    return ext === 'html' || ext === 'htm';
  }

  _languageKey(filePath) {
    if (this.opts.language !== 'auto') return this.opts.language || 'markdown';
    return filePath ? (filePath.split('.').pop()?.toLowerCase() || '') : '';
  }
}

window.ViewerPanel = ViewerPanel;
