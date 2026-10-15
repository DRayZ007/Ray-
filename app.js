(function (global) {
  'use strict';

  var STORAGE_KEY = 'mark-notes:v1';
  var THEME_KEY = 'mark-notes:theme';
  var APP_TITLE_KEY = 'mark-notes:app-title';
  var titleCollator = typeof Intl !== 'undefined' && Intl.Collator
    ? new Intl.Collator('zh-CN', { sensitivity: 'base', numeric: true })
    : null;

  function isString(value) {
    return typeof value === 'string';
  }

  function isValidNote(value) {
    return value && typeof value === 'object' && isString(value.id) && isString(value.title) && isString(value.content);
  }

  function createId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return 'note-' + global.crypto.randomUUID();
    }

    return 'note-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function createNote(overrides) {
    overrides = overrides || {};
    var now = typeof overrides.now === 'number' ? overrides.now : Date.now();
    var title = isString(overrides.title) ? overrides.title : '无标题笔记';
    var content = isString(overrides.content) ? overrides.content : '';

    return {
      id: isString(overrides.id) ? overrides.id : createId(),
      title: title || '无标题笔记',
      content: content,
      createdAt: typeof overrides.createdAt === 'number' ? overrides.createdAt : now,
      updatedAt: typeof overrides.updatedAt === 'number' ? overrides.updatedAt : now,
      pinned: Boolean(overrides.pinned)
    };
  }

  function updateNote(note, patch, options) {
    options = options || {};
    var shouldTouch = options.touch !== false;
    var updatedAt = note.updatedAt;

    if (shouldTouch) {
      updatedAt = typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now();
    }

    return {
      id: note.id,
      title: isString(patch.title) ? patch.title : note.title,
      content: isString(patch.content) ? patch.content : note.content,
      createdAt: note.createdAt,
      updatedAt: updatedAt,
      pinned: typeof patch.pinned === 'boolean' ? patch.pinned : note.pinned
    };
  }

  function deleteNote(notes, id) {
    return notes.filter(function (note) {
      return note.id !== id;
    });
  }

  function sortNotes(notes, mode) {
    if (mode === 'title') {
      return notes.slice().sort(function (a, b) {
        if (a.pinned !== b.pinned) {
          return a.pinned ? -1 : 1;
        }

        if (titleCollator) {
          return titleCollator.compare(a.title, b.title);
        }

        return a.title.localeCompare(b.title);
      });
    }

    var direction = mode === 'created' ? 'createdAt' : 'updatedAt';

    return notes.slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }

      return b[direction] - a[direction];
    });
  }

  function filterNotes(notes, query) {
    var needle = isString(query) ? query.trim().toLowerCase() : '';

    if (!needle) {
      return notes.slice();
    }

    return notes.filter(function (note) {
      return note.title.toLowerCase().indexOf(needle) !== -1 || note.content.toLowerCase().indexOf(needle) !== -1;
    });
  }

  function getDisplayTitle(note) {
    var title = note && isString(note.title) ? note.title.trim() : '';
    return title || '无标题笔记';
  }

  function getSnippet(content, maxLength) {
    var text = isString(content) ? content : '';
    var limit = typeof maxLength === 'number' ? maxLength : 120;
    var normalized = text.replace(/\s+/g, ' ').trim();

    if (normalized.length <= limit) {
      return normalized || '暂无内容';
    }

    return normalized.slice(0, limit) + '…';
  }

  function getWordCount(text) {
    var normalized = isString(text) ? text.trim() : '';

    if (!normalized) {
      return 0;
    }

    var cjk = normalized.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || [];
    var latinText = normalized.replace(/[\u3400-\u4dbf\u4e00-\u9fff]/g, ' ');
    var latinWords = latinText.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || [];

    return cjk.length + latinWords.length;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatDate(timestamp) {
    var date = new Date(timestamp);
    return date.getFullYear() + '/' + pad(date.getMonth() + 1) + '/' + pad(date.getDate());
  }

  function formatRelativeDate(timestamp, now) {
    var current = typeof now === 'number' ? now : Date.now();
    var diff = Math.max(0, current - timestamp);
    var minutes = Math.floor(diff / 60000);

    if (minutes < 1) {
      return '刚刚';
    }

    if (minutes < 60) {
      return minutes + ' 分钟前';
    }

    if (diff < 86400000) {
      return Math.floor(minutes / 60) + ' 小时前';
    }

    return formatDate(timestamp);
  }

  function createMemoryStorage() {
    var store = Object.create(null);

    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      setItem: function (key, value) {
        store[key] = String(value);
      },
      removeItem: function (key) {
        delete store[key];
      },
      clear: function () {
        store = Object.create(null);
      }
    };
  }

  function serializeNotes(notes) {
    return JSON.stringify(notes || []);
  }

  function deserializeNotes(raw) {
    if (!raw) {
      return [];
    }

    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isValidNote) : [];
    } catch (error) {
      return [];
    }
  }

  function loadNotes(storage) {
    return deserializeNotes(storage.getItem(STORAGE_KEY));
  }

  function saveNotes(storage, notes) {
    storage.setItem(STORAGE_KEY, serializeNotes(notes));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  function sanitizeUrl(value) {
    var url = String(value || '').trim();
    return /^(https?:|mailto:|#)/i.test(url) ? escapeHtml(url) : '#';
  }

  function renderMarkdownInline(text) {
    var placeholders = [];

    function stash(html) {
      var marker = '\u0000' + placeholders.length + '\u0000';
      placeholders.push(html);
      return marker;
    }

    function restore(value) {
      return value.replace(/\u0000(\d+)\u0000/g, function (match, index) {
        return placeholders[Number(index)] || '';
      });
    }

    var html = escapeHtml(text);

    html = html.replace(/`([^`\n]+)`/g, function (match, code) {
      return stash('<code>' + code + '</code>');
    });

    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+".*?")?\)/g, function (match, label, url) {
      return stash(
        '<a href="' + sanitizeUrl(url) + '" target="_blank" rel="noopener noreferrer">' +
          renderMarkdownInline(label) +
          '</a>'
      );
    });

    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    html = html.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

    return restore(html);
  }

  function isMarkdownBlockStart(line) {
    return (
      /^```/.test(line) ||
      /^#{1,6}\s+/.test(line) ||
      /^(-{3,}|\*{3,}|_{3,})$/.test(line) ||
      /^>/.test(line) ||
      /^([-*+])\s+/.test(line) ||
      /^\d+\.\s+/.test(line)
    );
  }

  function parseMarkdown(markdown) {
    var source = isString(markdown) ? markdown.replace(/\r\n?/g, '\n') : '';
    var lines = source.split('\n');
    var output = [];
    var index = 0;

    function push(tag, content) {
      output.push('<' + tag + '>' + content + '</' + tag + '>');
    }

    while (index < lines.length) {
      var line = lines[index];
      var trimmed = line.trim();

      if (!trimmed) {
        index += 1;
        continue;
      }

      var heading = trimmed.match(/^(#{1,6})\s+(.+)$/);

      if (heading) {
        var level = heading[1].length;
        push('h' + level, renderMarkdownInline(heading[2]));
        index += 1;
        continue;
      }

      if (/^```/.test(trimmed)) {
        var codeLines = [];
        index += 1;

        while (index < lines.length && !/^```/.test(lines[index].trim())) {
          codeLines.push(lines[index]);
          index += 1;
        }

        if (index < lines.length) {
          index += 1;
        }

        output.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        output.push('<hr>');
        index += 1;
        continue;
      }

      if (/^>/.test(trimmed)) {
        var quoteLines = [];

        while (index < lines.length && /^>/.test(lines[index].trim())) {
          quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
          index += 1;
        }

        push('blockquote', renderMarkdownInline(quoteLines.join(' ')));
        continue;
      }

      var unordered = trimmed.match(/^([-*+])\s+(.+)$/);
      var ordered = trimmed.match(/^\d+\.\s+(.+)$/);

      if (unordered || ordered) {
        var items = [];
        var listTag = unordered ? 'ul' : 'ol';

        while (index < lines.length) {
          var listLine = lines[index].trim();
          var listMatch = unordered
            ? listLine.match(/^([-*+])\s+(.+)$/)
            : listLine.match(/^\d+\.\s+(.+)$/);

          if (!listMatch) {
            break;
          }

          items.push('<li>' + renderMarkdownInline(listMatch[2]) + '</li>');
          index += 1;
        }

        push(listTag, items.join(''));
        continue;
      }

      var paragraphLines = [];

      while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index].trim())) {
        paragraphLines.push(lines[index].trim());
        index += 1;
      }

      push('p', renderMarkdownInline(paragraphLines.join(' ')));
    }

    return output.join('\n');
  }

  var NoteApp = {
    STORAGE_KEY: STORAGE_KEY,
    createNote: createNote,
    updateNote: updateNote,
    deleteNote: deleteNote,
    sortNotes: sortNotes,
    filterNotes: filterNotes,
    getDisplayTitle: getDisplayTitle,
    getSnippet: getSnippet,
    getWordCount: getWordCount,
    formatDate: formatDate,
    formatRelativeDate: formatRelativeDate,
    createMemoryStorage: createMemoryStorage,
    serializeNotes: serializeNotes,
    deserializeNotes: deserializeNotes,
    loadNotes: loadNotes,
    saveNotes: saveNotes,
    parseMarkdown: parseMarkdown
  };

  function initApp() {
    var storage;

    try {
      var probeKey = '__mark_notes_probe__';
      global.localStorage.setItem(probeKey, '1');
      global.localStorage.removeItem(probeKey);
      storage = global.localStorage;
    } catch (error) {
      storage = createMemoryStorage();
    }

    var storedTheme = storage.getItem(THEME_KEY);
    var prefersDark = typeof global.matchMedia === 'function' && global.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : (prefersDark ? 'dark' : 'light');
    var savedAppTitle = storage.getItem(APP_TITLE_KEY);
    var notes = loadNotes(storage);
    var activeId = notes.length > 0 ? notes[0].id : null;
    var sortMode = 'updated';
    var query = '';
    var viewMode = 'edit';

    var newNoteButton = document.getElementById('newNoteButton');
    var themeToggle = document.getElementById('themeToggle');
    var themeIcon = document.getElementById('themeIcon');
    var appTitleInput = document.getElementById('appTitleInput');
    var searchInput = document.getElementById('searchInput');
    var sortSelect = document.getElementById('sortSelect');
    var noteList = document.getElementById('noteList');
    var listEmptyState = document.getElementById('listEmptyState');
    var noteCount = document.getElementById('noteCount');
    var editorEmpty = document.getElementById('editorEmpty');
    var editorContent = document.getElementById('editorContent');
    var titleInput = document.getElementById('titleInput');
    var contentInput = document.getElementById('contentInput');
    var saveStatus = document.getElementById('saveStatus');
    var wordCount = document.getElementById('wordCount');
    var updatedAt = document.getElementById('updatedAt');
    var pinButton = document.getElementById('pinButton');
    var pinButtonLabel = document.getElementById('pinButtonLabel');
    var saveButton = document.getElementById('saveButton');
    var editModeButton = document.getElementById('editModeButton');
    var previewModeButton = document.getElementById('previewModeButton');
    var markdownPreview = document.getElementById('markdownPreview');
    var resizer = document.getElementById('resizer');
    var deleteButton = document.getElementById('deleteButton');

    if (savedAppTitle) {
      appTitleInput.value = savedAppTitle;
    }

    function findNote(id) {
      return notes.find(function (note) {
        return note.id === id;
      });
    }

    function persist() {
      try {
        saveNotes(storage, notes);
      } catch (error) {
        // The app remains usable even when storage is unavailable.
      }
    }

    function setSaveStatus(text) {
      saveStatus.textContent = text;
    }

    function applyAppTitle() {
      var nextTitle = appTitleInput.value.trim() || 'Ray的笔记';
      appTitleInput.value = nextTitle;
      document.title = nextTitle;

      try {
        storage.setItem(APP_TITLE_KEY, nextTitle);
      } catch (error) {
        // Title persistence is optional.
      }
    }

    function applyTheme(nextTheme) {
      theme = nextTheme;
      document.documentElement.dataset.theme = theme;
      themeIcon.setAttribute('href', theme === 'dark' ? '#icon-sun' : '#icon-moon');
      themeToggle.title = theme === 'dark' ? '切换浅色模式' : '切换暗黑模式';
      themeToggle.setAttribute('aria-label', themeToggle.title);

      try {
        storage.setItem(THEME_KEY, theme);
      } catch (error) {
        // Theme preference persistence is optional.
      }
    }

    function makeIcon(id, className) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'icon ' + (className || ''));
      svg.setAttribute('aria-hidden', 'true');

      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#' + id);
      svg.appendChild(use);
      return svg;
    }

    function renderList() {
      var visibleNotes = sortNotes(filterNotes(notes, query), sortMode);
      noteList.textContent = '';

      noteCount.textContent = notes.length + ' 条笔记';
      listEmptyState.classList.toggle('is-visible', visibleNotes.length === 0);

      if (visibleNotes.length === 0) {
        listEmptyState.querySelector('p').textContent = query ? '没有匹配的笔记' : '还没有笔记';
        listEmptyState.querySelector('span').textContent = query ? '换个关键词试试' : '点击右上角加号开始记录';
        return;
      }

      var fragment = document.createDocumentFragment();

      visibleNotes.forEach(function (note) {
        var item = document.createElement('article');
        item.className = 'note-item' + (note.id === activeId ? ' is-active' : '') + (note.pinned ? ' has-pin' : '');
        item.dataset.id = note.id;
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', '打开笔记：' + getDisplayTitle(note));
        item.setAttribute('data-testid', 'note-item');

        var main = document.createElement('div');
        main.className = 'note-item-main';

        var title = document.createElement('h2');
        title.className = 'note-title';
        title.textContent = getDisplayTitle(note);

        var snippet = document.createElement('p');
        snippet.className = 'note-snippet';
        snippet.textContent = getSnippet(note.content);

        var meta = document.createElement('div');
        meta.className = 'note-meta';
        meta.textContent = formatRelativeDate(note.updatedAt);

        main.appendChild(title);
        main.appendChild(snippet);
        main.appendChild(meta);

        if (note.pinned) {
          var pinButtonEl = document.createElement('button');
          pinButtonEl.className = 'pin-button is-pinned';
          pinButtonEl.type = 'button';
          pinButtonEl.dataset.action = 'pin';
          pinButtonEl.dataset.id = note.id;
          pinButtonEl.title = '取消置顶';
          pinButtonEl.setAttribute('aria-label', pinButtonEl.title);
          pinButtonEl.appendChild(makeIcon('icon-pin', 'icon-pin'));
          item.appendChild(pinButtonEl);
        }

        item.appendChild(main);
        fragment.appendChild(item);
      });

      noteList.appendChild(fragment);
    }

    function renderEditor() {
      var note = activeId ? findNote(activeId) : null;

      if (!note) {
        editorEmpty.hidden = false;
        editorContent.hidden = true;
        return;
      }

      editorEmpty.hidden = true;
      editorContent.hidden = false;

      if (document.activeElement !== titleInput) {
        titleInput.value = note.title;
      }

      if (document.activeElement !== contentInput) {
        contentInput.value = note.content;
      }

      wordCount.textContent = getWordCount(note.content) + ' 字';
      updatedAt.textContent = '更新于 ' + formatRelativeDate(note.updatedAt);
      pinButton.classList.toggle('is-pinned', note.pinned);
      pinButtonLabel.textContent = note.pinned ? '已置顶' : '置顶';
      pinButton.title = note.pinned ? '取消置顶' : '置顶笔记';
      pinButton.setAttribute('aria-label', pinButton.title);

      editModeButton.classList.toggle('is-active', viewMode === 'edit');
      previewModeButton.classList.toggle('is-active', viewMode === 'preview');
      editModeButton.setAttribute('aria-pressed', String(viewMode === 'edit'));
      previewModeButton.setAttribute('aria-pressed', String(viewMode === 'preview'));

      contentInput.hidden = viewMode !== 'edit';
      markdownPreview.hidden = viewMode !== 'preview';
      markdownPreview.innerHTML = viewMode === 'preview' ? NoteApp.parseMarkdown(note.content || '') : '';
      setSaveStatus('已保存');
    }

    function setViewMode(mode) {
      viewMode = mode === 'preview' ? 'preview' : 'edit';
      renderEditor();
    }

    function getSidebarWidth() {
      var value = document.documentElement.style.getPropertyValue('--sidebar-width');
      return parseFloat(value) || 340;
    }

    function isStacked() {
      return global.innerWidth <= 760;
    }

    function getStackHeight() {
      var value = document.documentElement.style.getPropertyValue('--stack-top-height');
      return parseFloat(value) || global.innerHeight * 0.45;
    }

    function resizeSidebar(width) {
      var minWidth = 240;
      var maxWidth = Math.max(minWidth, Math.floor(global.innerWidth * 0.72));
      var nextWidth = Math.min(maxWidth, Math.max(minWidth, width));
      document.documentElement.style.setProperty('--sidebar-width', nextWidth + 'px');
    }

    function resizeStack(height) {
      var minHeight = 180;
      var maxHeight = Math.max(minHeight, Math.floor(global.innerHeight - 140));
      var nextHeight = Math.min(maxHeight, Math.max(minHeight, height));
      document.documentElement.style.setProperty('--stack-top-height', nextHeight + 'px');
    }

    function render() {
      renderList();
      renderEditor();
    }

    function activateNote(id) {
      activeId = id;
      render();
    }

    function createNewNote() {
      var note = NoteApp.createNote();
      notes.unshift(note);
      activeId = note.id;
      viewMode = 'edit';
      query = '';
      searchInput.value = '';
      persist();
      render();
      titleInput.focus();
      titleInput.select();
    }

    function updateActiveNote(patch, options) {
      var note = activeId ? findNote(activeId) : null;

      if (!note) {
        return;
      }

      var nextNote = NoteApp.updateNote(note, patch, options);
      notes = notes.map(function (item) {
        return item.id === nextNote.id ? nextNote : item;
      });
      persist();
      setSaveStatus('已保存');
      renderList();
      renderEditor();
    }

    function deleteActiveNote() {
      var note = activeId ? findNote(activeId) : null;

      if (!note) {
        return;
      }

      if (!global.confirm('确定删除这条笔记吗？此操作无法撤销。')) {
        return;
      }

      var remaining = sortNotes(filterNotes(deleteNote(notes, note.id), query), sortMode);
      notes = deleteNote(notes, note.id);
      activeId = remaining.length > 0 ? remaining[0].id : null;
      persist();
      render();
    }

    function togglePin(id) {
      var note = findNote(id);

      if (!note) {
        return;
      }

      var nextNote = NoteApp.updateNote(note, { pinned: !note.pinned }, { touch: false });
      notes = notes.map(function (item) {
        return item.id === nextNote.id ? nextNote : item;
      });
      persist();
      render();
    }

    newNoteButton.addEventListener('click', createNewNote);

    appTitleInput.addEventListener('input', function () {
      document.title = appTitleInput.value.trim() || 'Ray的笔记';
    });

    appTitleInput.addEventListener('change', applyAppTitle);
    appTitleInput.addEventListener('blur', applyAppTitle);
    appTitleInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        appTitleInput.blur();
      }
    });

    themeToggle.addEventListener('click', function () {
      applyTheme(theme === 'dark' ? 'light' : 'dark');
    });

    searchInput.addEventListener('input', function () {
      query = searchInput.value;
      renderList();
    });

    sortSelect.addEventListener('change', function () {
      sortMode = sortSelect.value;
      renderList();
    });

    titleInput.addEventListener('input', function () {
      updateActiveNote({ title: titleInput.value });
    });

    titleInput.addEventListener('blur', function () {
      var note = activeId ? findNote(activeId) : null;

      if (note && !titleInput.value.trim()) {
        updateActiveNote({ title: '无标题笔记' });
      }
    });

    contentInput.addEventListener('input', function () {
      updateActiveNote({ content: contentInput.value });
    });

    pinButton.addEventListener('click', function () {
      if (activeId) {
        togglePin(activeId);
      }
    });

    saveButton.addEventListener('click', function () {
      if (activeId) {
        persist();
        setSaveStatus('已保存');
      }
    });

    editModeButton.addEventListener('click', function () {
      setViewMode('edit');
    });

    previewModeButton.addEventListener('click', function () {
      setViewMode('preview');
    });

    deleteButton.addEventListener('click', deleteActiveNote);

    resizer.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      resizer.classList.add('is-dragging');

      if (typeof resizer.setPointerCapture === 'function') {
        resizer.setPointerCapture(event.pointerId);
      }
    });

    resizer.addEventListener('pointermove', function (event) {
      if (resizer.classList.contains('is-dragging')) {
        if (isStacked()) {
          resizeStack(event.clientY);
        } else {
          resizeSidebar(event.clientX);
        }
      }
    });

    function endResize(event) {
      resizer.classList.remove('is-dragging');

      if (typeof resizer.releasePointerCapture === 'function' && resizer.hasPointerCapture(event.pointerId)) {
        resizer.releasePointerCapture(event.pointerId);
      }
    }

    resizer.addEventListener('pointerup', endResize);
    resizer.addEventListener('pointercancel', endResize);

    resizer.addEventListener('dblclick', function () {
      if (isStacked()) {
        document.documentElement.style.setProperty('--stack-top-height', '45vh');
      } else {
        document.documentElement.style.setProperty('--sidebar-width', '340px');
      }
    });

    resizer.addEventListener('keydown', function (event) {
      if (isStacked() && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        var verticalDirection = event.key === 'ArrowUp' ? -1 : 1;
        resizeStack(getStackHeight() + verticalDirection * 16);
      } else if (!isStacked() && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        var horizontalDirection = event.key === 'ArrowLeft' ? -1 : 1;
        resizeSidebar(getSidebarWidth() + horizontalDirection * 16);
      }
    });

    noteList.addEventListener('click', function (event) {
      var pinTarget = event.target.closest('[data-action="pin"]');

      if (pinTarget) {
        event.stopPropagation();
        togglePin(pinTarget.dataset.id);
        return;
      }

      var item = event.target.closest('[data-id]');

      if (item) {
        activateNote(item.dataset.id);
      }
    });

    noteList.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      var item = event.target.closest('[data-id]');

      if (item) {
        event.preventDefault();
        activateNote(item.dataset.id);
      }
    });

    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        createNewNote();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        persist();
        setSaveStatus('已保存');
      }
    });

    applyAppTitle();
    applyTheme(theme);
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NoteApp;
  } else {
    global.NoteApp = NoteApp;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
