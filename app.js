(function (global) {
  'use strict';

  var STORAGE_KEY = 'mark-notes:v1';
  var FOLDERS_KEY = 'mark-notes:folders:v1';
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
      pinned: Boolean(overrides.pinned),
      folderId: Object.prototype.hasOwnProperty.call(overrides, 'folderId') ? overrides.folderId : null
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
      pinned: typeof patch.pinned === 'boolean' ? patch.pinned : note.pinned,
      folderId: Object.prototype.hasOwnProperty.call(patch, 'folderId') ? patch.folderId : note.folderId
    };
  }

  function createFolder(overrides) {
    overrides = overrides || {};
    var now = typeof overrides.now === 'number' ? overrides.now : Date.now();
    var name = isString(overrides.name) ? overrides.name.trim() : '';

    return {
      id: isString(overrides.id) ? overrides.id : createId().replace(/^note-/, 'folder-'),
      name: name || '未命名文件夹',
      createdAt: typeof overrides.createdAt === 'number' ? overrides.createdAt : now,
      parentId: Object.prototype.hasOwnProperty.call(overrides, 'parentId') ? overrides.parentId : null
    };
  }

  function updateFolder(folder, patch) {
    return {
      id: folder.id,
      name: isString(patch.name) ? patch.name.trim() || folder.name : folder.name,
      createdAt: folder.createdAt,
      parentId: Object.prototype.hasOwnProperty.call(patch, 'parentId') ? patch.parentId : folder.parentId
    };
  }

  function deleteFolder(folders, id) {
    return folders.filter(function (folder) {
      return folder.id !== id;
    });
  }

  function sortFolders(folders) {
    return folders.slice().sort(function (a, b) {
      return a.createdAt - b.createdAt;
    });
  }

  function getChildFolders(folders, parentId) {
    var targetParentId = parentId || null;

    return sortFolders(folders).filter(function (folder) {
      return (folder.parentId || null) === targetParentId;
    });
  }

  function isDescendantFolder(folders, folderId, ancestorId) {
    var currentId = folderId || null;

    while (currentId) {
      if (currentId === ancestorId) {
        return true;
      }

      var folder = folders.find(function (item) {
        return item.id === currentId;
      });

      if (!folder) {
        return false;
      }

      currentId = folder.parentId || null;
    }

    return false;
  }

  function getFolderPath(folders, folderId) {
    var path = [];
    var currentId = folderId || null;

    while (currentId) {
      var folder = folders.find(function (item) {
        return item.id === currentId;
      });

      if (!folder) {
        break;
      }

      path.unshift(folder.name);
      currentId = folder.parentId || null;
    }

    return path;
  }

  function moveFolderInList(folders, folderId, parentId) {
    var folder = folders.find(function (item) {
      return item.id === folderId;
    });

    if (!folder || folderId === parentId) {
      return folders.slice();
    }

    if (parentId && isDescendantFolder(folders, parentId, folderId)) {
      return folders.slice();
    }

    return folders.map(function (item) {
      return item.id === folderId
        ? updateFolder(item, { parentId: parentId || null })
        : item;
    });
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
      return Array.isArray(parsed)
        ? parsed.filter(isValidNote).map(function (note) {
            note.folderId = note.folderId || null;
            return note;
          })
        : [];
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

  function serializeFolders(folders) {
    return JSON.stringify(folders || []);
  }

  function deserializeFolders(raw) {
    if (!raw) {
      return [];
    }

    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter(function (folder) {
            return folder && typeof folder === 'object' && isString(folder.id) && isString(folder.name);
          })
        : [];
    } catch (error) {
      return [];
    }
  }

  function loadFolders(storage) {
    return deserializeFolders(storage.getItem(FOLDERS_KEY));
  }

  function saveFolders(storage, folders) {
    storage.setItem(FOLDERS_KEY, serializeFolders(folders));
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
    FOLDERS_KEY: FOLDERS_KEY,
    createNote: createNote,
    createFolder: createFolder,
    updateNote: updateNote,
    updateFolder: updateFolder,
    deleteNote: deleteNote,
    deleteFolder: deleteFolder,
    sortNotes: sortNotes,
    sortFolders: sortFolders,
    getChildFolders: getChildFolders,
    isDescendantFolder: isDescendantFolder,
    getFolderPath: getFolderPath,
    moveFolderInList: moveFolderInList,
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
    serializeFolders: serializeFolders,
    deserializeFolders: deserializeFolders,
    loadFolders: loadFolders,
    saveFolders: saveFolders,
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
    var folders = loadFolders(storage);
    var activeId = notes.length > 0 ? notes[0].id : null;
    var sortMode = 'updated';
    var query = '';
    var viewMode = 'edit';
    var selectedFolder = 'all';
    var editingFolderId = null;
    var expandedFolders = {};
    var newFolderParentId = null;
    var contextFolderId = null;
    var dragFolderId = null;

    var newNoteButton = document.getElementById('newNoteButton');
    var themeToggle = document.getElementById('themeToggle');
    var themeIcon = document.getElementById('themeIcon');
    var appTitleInput = document.getElementById('appTitleInput');
    var searchInput = document.getElementById('searchInput');
    var addFolderButton = document.getElementById('addFolderButton');
    var folderList = document.getElementById('folderList');
    var newFolderForm = document.getElementById('newFolderForm');
    var newFolderInput = document.getElementById('newFolderInput');
    var folderContextMenu = document.getElementById('folderContextMenu');
    var folderEditorOverlay = document.getElementById('folderEditorOverlay');
    var folderEditorForm = document.getElementById('folderEditorForm');
    var folderEditorName = document.getElementById('folderEditorName');
    var folderEditorParent = document.getElementById('folderEditorParent');
    var cancelFolderEditor = document.getElementById('cancelFolderEditor');
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
    var folderSelect = document.getElementById('folderSelect');
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
        saveFolders(storage, folders);
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

    function getFolderId(note) {
      return note && note.folderId ? note.folderId : null;
    }

    function getFolderName(id) {
      if (!id) {
        return '';
      }

      var folder = folders.find(function (item) {
        return item.id === id;
      });

      return folder ? NoteApp.getFolderPath(folders, id).join(' / ') : '';
    }

    function notesForFolder(source) {
      if (selectedFolder === 'all') {
        return source.slice();
      }

      if (selectedFolder === 'none') {
        return source.filter(function (note) {
          return getFolderId(note) === null;
        });
      }

      return source.filter(function (note) {
        var noteFolderId = getFolderId(note);
        return noteFolderId === selectedFolder || NoteApp.isDescendantFolder(folders, noteFolderId, selectedFolder);
      });
    }

    function countNotesInFolder(folderId) {
      if (folderId === 'all') {
        return notes.length;
      }

      if (folderId === 'none') {
        return notes.filter(function (note) {
          return getFolderId(note) === null;
        }).length;
      }

      return notes.filter(function (note) {
        var noteFolderId = getFolderId(note);
        return noteFolderId === folderId || NoteApp.isDescendantFolder(folders, noteFolderId, folderId);
      }).length;
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

    function renderFolderList() {
      folderList.textContent = '';

      var fragment = document.createDocumentFragment();

      function appendBuiltIn(folderId, label) {
        var row = document.createElement('div');
        row.className = 'folder-item' + (selectedFolder === folderId ? ' is-active' : '');

        var selectButton = document.createElement('button');
        selectButton.className = 'folder-select';
        selectButton.type = 'button';
        selectButton.dataset.folderId = folderId;
        selectButton.setAttribute('data-testid', 'folder-item');
        selectButton.style.paddingLeft = '28px';
        selectButton.appendChild(makeIcon('icon-folder'));

        var name = document.createElement('span');
        name.className = 'folder-name';
        name.textContent = label;
        selectButton.appendChild(name);

        var count = document.createElement('span');
        count.className = 'folder-count';
        count.textContent = String(countNotesInFolder(folderId));
        selectButton.appendChild(count);
        row.appendChild(selectButton);
        fragment.appendChild(row);
      }

      function appendFolder(folder, depth) {
        var children = NoteApp.getChildFolders(folders, folder.id);
        var isExpanded = expandedFolders[folder.id] !== false;
        var row = document.createElement('div');
        row.className = 'folder-item' + (selectedFolder === folder.id ? ' is-active' : '');
        row.draggable = true;
        row.dataset.folderId = folder.id;
        row.style.paddingLeft = (depth * 14) + 'px';

        var toggle = document.createElement('button');
        toggle.className = 'folder-toggle';
        toggle.type = 'button';
        toggle.dataset.action = 'toggle-folder';
        toggle.dataset.id = folder.id;
        toggle.title = isExpanded ? '收起文件夹' : '展开文件夹';
        toggle.setAttribute('aria-label', toggle.title);

        if (children.length > 0) {
          toggle.appendChild(makeIcon('icon-chevron'));
          toggle.classList.toggle('is-expanded', isExpanded);
        } else {
          toggle.classList.add('is-empty');
        }

        row.appendChild(toggle);

        var selectButton = document.createElement('button');
        selectButton.className = 'folder-select';
        selectButton.type = 'button';
        selectButton.dataset.folderId = folder.id;
        selectButton.setAttribute('data-testid', 'folder-item');
        selectButton.appendChild(makeIcon('icon-folder'));

        if (editingFolderId === folder.id) {
          var renameInput = document.createElement('input');
          renameInput.className = 'folder-rename-input';
          renameInput.value = folder.name;
          renameInput.setAttribute('aria-label', '重命名文件夹');
          renameInput.addEventListener('blur', function () {
            commitFolderRename(folder.id, renameInput.value);
          });
          renameInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
              event.preventDefault();
              renameInput.blur();
            } else if (event.key === 'Escape') {
              editingFolderId = null;
              renderFolderList();
            }
          });
          selectButton.appendChild(renameInput);
          setTimeout(function () {
            renameInput.focus();
            renameInput.select();
          }, 0);
        } else {
          var name = document.createElement('span');
          name.className = 'folder-name';
          name.textContent = folder.name;
          selectButton.appendChild(name);
        }

        var count = document.createElement('span');
        count.className = 'folder-count';
        count.textContent = String(countNotesInFolder(folder.id));
        selectButton.appendChild(count);
        row.appendChild(selectButton);

        var actions = document.createElement('div');
        actions.className = 'folder-actions';

        var addChildButton = document.createElement('button');
        addChildButton.className = 'folder-action';
        addChildButton.type = 'button';
        addChildButton.dataset.action = 'add-subfolder';
        addChildButton.dataset.id = folder.id;
        addChildButton.title = '新建子文件夹';
        addChildButton.setAttribute('aria-label', addChildButton.title);
        addChildButton.appendChild(makeIcon('icon-plus'));

        var renameButton = document.createElement('button');
        renameButton.className = 'folder-action';
        renameButton.type = 'button';
        renameButton.dataset.action = 'rename-folder';
        renameButton.dataset.id = folder.id;
        renameButton.title = '重命名文件夹';
        renameButton.setAttribute('aria-label', renameButton.title);
        renameButton.appendChild(makeIcon('icon-edit'));

        var deleteButtonEl = document.createElement('button');
        deleteButtonEl.className = 'folder-action danger';
        deleteButtonEl.type = 'button';
        deleteButtonEl.dataset.action = 'delete-folder';
        deleteButtonEl.dataset.id = folder.id;
        deleteButtonEl.title = '删除文件夹';
        deleteButtonEl.setAttribute('aria-label', deleteButtonEl.title);
        deleteButtonEl.appendChild(makeIcon('icon-trash'));

        actions.appendChild(addChildButton);
        actions.appendChild(renameButton);
        actions.appendChild(deleteButtonEl);
        row.appendChild(actions);
        fragment.appendChild(row);

        if (isExpanded) {
          children.forEach(function (child) {
            appendFolder(child, depth + 1);
          });
        }
      }

      appendBuiltIn('all', '全部笔记');
      appendBuiltIn('none', '未分类');

      NoteApp.getChildFolders(folders, null).forEach(function (folder) {
        appendFolder(folder, 0);
      });

      folderList.appendChild(fragment);
    }

    function renderList() {
      renderFolderList();
      var visibleNotes = sortNotes(filterNotes(notesForFolder(notes), query), sortMode);
      noteList.textContent = '';

      noteCount.textContent = visibleNotes.length + ' 条笔记';
      listEmptyState.classList.toggle('is-visible', visibleNotes.length === 0);

      if (visibleNotes.length === 0) {
        listEmptyState.querySelector('p').textContent = query
          ? '没有匹配的笔记'
          : (selectedFolder === 'all' ? '还没有笔记' : '这个文件夹还没有笔记');
        listEmptyState.querySelector('span').textContent = query
          ? '换个关键词试试'
          : '点击右上角加号开始记录';
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
        var folderName = getFolderName(getFolderId(note));
        meta.textContent = folderName
          ? folderName + ' · ' + formatRelativeDate(note.updatedAt)
          : formatRelativeDate(note.updatedAt);

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

      folderSelect.textContent = '';
      var noFolderOption = document.createElement('option');
      noFolderOption.value = '';
      noFolderOption.textContent = '未分类';
      folderSelect.appendChild(noFolderOption);

      sortFolders(folders).forEach(function (folder) {
        var option = document.createElement('option');
        option.value = folder.id;
        option.textContent = NoteApp.getFolderPath(folders, folder.id).join(' / ');
        folderSelect.appendChild(option);
      });

      folderSelect.value = getFolderId(note) || '';

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

    function selectFolder(id) {
      selectedFolder = id;
      renderList();
    }

    function commitFolderRename(id, nextName) {
      var folder = folders.find(function (item) {
        return item.id === id;
      });

      if (!folder) {
        editingFolderId = null;
        return;
      }

      var trimmedName = nextName.trim();

      if (trimmedName && trimmedName !== folder.name) {
        folders = folders.map(function (item) {
          return item.id === id ? NoteApp.updateFolder(item, { name: trimmedName }) : item;
        });
        persist();
      }

      editingFolderId = null;
      renderFolderList();
      renderEditor();
    }

    function createFolderFromForm(event) {
      event.preventDefault();

      var name = newFolderInput.value.trim();

      if (!name) {
        return;
      }

      var folder = NoteApp.createFolder({ name: name, parentId: newFolderParentId });
      folders.push(folder);

      if (newFolderParentId) {
        expandedFolders[newFolderParentId] = true;
      }

      selectedFolder = folder.id;
      newFolderParentId = null;
      newFolderInput.value = '';
      newFolderForm.hidden = true;
      persist();
      render();
    }

    function deleteCustomFolder(id) {
      var folder = folders.find(function (item) {
        return item.id === id;
      });

      if (!folder) {
        return;
      }

      if (!global.confirm('删除文件夹“' + folder.name + '”及其子文件夹？里面的笔记会移到上一级文件夹。')) {
        return;
      }

      var descendantIds = folders
        .filter(function (item) {
          return item.id === id || NoteApp.isDescendantFolder(folders, item.id, id);
        })
        .map(function (item) {
          return item.id;
        });
      var parentId = folder.parentId || null;

      folders = folders.filter(function (item) {
        return descendantIds.indexOf(item.id) === -1;
      });

      notes = notes.map(function (note) {
        return descendantIds.indexOf(getFolderId(note)) !== -1
          ? NoteApp.updateNote(note, { folderId: parentId }, { touch: false })
          : note;
      });

      if (descendantIds.indexOf(selectedFolder) !== -1) {
        selectedFolder = parentId || 'all';
      }

      persist();
      render();
    }

    function moveActiveNoteToFolder(folderId) {
      var note = activeId ? findNote(activeId) : null;

      if (!note) {
        return;
      }

      var nextNote = NoteApp.updateNote(note, { folderId: folderId || null }, { touch: false });
      notes = notes.map(function (item) {
        return item.id === nextNote.id ? nextNote : item;
      });
      persist();
      render();
    }

    function closeFolderContextMenu() {
      contextFolderId = null;
      folderContextMenu.hidden = true;
    }

    function showFolderContextMenu(id, x, y) {
      contextFolderId = id;
      folderContextMenu.hidden = false;
      folderContextMenu.style.left = x + 'px';
      folderContextMenu.style.top = y + 'px';
    }

    function populateFolderParentOptions(folderId, selectedParentId) {
      folderEditorParent.textContent = '';

      var rootOption = document.createElement('option');
      rootOption.value = '';
      rootOption.textContent = '顶层文件夹';
      folderEditorParent.appendChild(rootOption);

      sortFolders(folders).forEach(function (folder) {
        if (folder.id === folderId || NoteApp.isDescendantFolder(folders, folder.id, folderId)) {
          return;
        }

        var option = document.createElement('option');
        option.value = folder.id;
        option.textContent = NoteApp.getFolderPath(folders, folder.id).join(' / ');
        folderEditorParent.appendChild(option);
      });

      folderEditorParent.value = selectedParentId || '';
    }

    function openFolderEditor(id) {
      var folder = folders.find(function (item) {
        return item.id === id;
      });

      if (!folder) {
        return;
      }

      contextFolderId = id;
      folderEditorName.value = folder.name;
      populateFolderParentOptions(id, folder.parentId);
      folderContextMenu.hidden = true;
      folderEditorOverlay.hidden = false;
      folderEditorName.focus();
      folderEditorName.select();
    }

    function closeFolderEditor() {
      folderEditorOverlay.hidden = true;
      contextFolderId = null;
    }

    function saveFolderEditor(event) {
      event.preventDefault();

      var folder = folders.find(function (item) {
        return item.id === contextFolderId;
      });

      if (!folder) {
        closeFolderEditor();
        return;
      }

      var nextName = folderEditorName.value.trim() || folder.name;
      var nextParentId = folderEditorParent.value || null;

      folders = folders.map(function (item) {
        return item.id === contextFolderId
          ? NoteApp.updateFolder(item, { name: nextName, parentId: nextParentId })
          : item;
      });

      if (nextParentId) {
        expandedFolders[nextParentId] = true;
      }

      persist();
      closeFolderEditor();
      render();
    }

    function moveFolder(id, parentId) {
      var nextFolders = NoteApp.moveFolderInList(folders, id, parentId);

      if (nextFolders === folders) {
        return;
      }

      folders = nextFolders;

      if (parentId) {
        expandedFolders[parentId] = true;
      }

      persist();
      render();
    }

    function createNewNote() {
      var initialFolderId = selectedFolder === 'all' || selectedFolder === 'none' ? null : selectedFolder;
      var note = NoteApp.createNote({ folderId: initialFolderId });
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

      var remaining = sortNotes(filterNotes(notesForFolder(deleteNote(notes, note.id)), query), sortMode);
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

    addFolderButton.addEventListener('click', function () {
      newFolderParentId = null;
      newFolderForm.hidden = !newFolderForm.hidden;

      if (!newFolderForm.hidden) {
        newFolderInput.value = '';
        newFolderInput.focus();
      }
    });

    newFolderForm.addEventListener('submit', createFolderFromForm);

    folderList.addEventListener('click', function (event) {
      var action = event.target.closest('[data-action]');

      if (action) {
        var folderId = action.dataset.id;

        if (action.dataset.action === 'toggle-folder') {
          expandedFolders[folderId] = expandedFolders[folderId] === false;
          renderFolderList();
        } else if (action.dataset.action === 'add-subfolder') {
          newFolderParentId = folderId;
          newFolderForm.hidden = false;
          newFolderInput.value = '';
          newFolderInput.focus();
        } else if (action.dataset.action === 'rename-folder') {
          editingFolderId = folderId;
          renderFolderList();
        } else if (action.dataset.action === 'delete-folder') {
          deleteCustomFolder(folderId);
        }

        return;
      }

      var select = event.target.closest('.folder-select');

      if (select) {
        selectFolder(select.dataset.folderId);
      }
    });

    folderList.addEventListener('contextmenu', function (event) {
      var row = event.target.closest('.folder-item[data-folder-id]');

      if (!row) {
        return;
      }

      event.preventDefault();
      showFolderContextMenu(row.dataset.folderId, event.clientX, event.clientY);
    });

    folderContextMenu.addEventListener('click', function (event) {
      var button = event.target.closest('[data-context-action]');

      if (!button || !contextFolderId) {
        return;
      }

      var folderId = contextFolderId;
      var action = button.dataset.contextAction;
      closeFolderContextMenu();

      if (action === 'edit-folder') {
        openFolderEditor(folderId);
      } else if (action === 'add-subfolder') {
        newFolderParentId = folderId;
        newFolderForm.hidden = false;
        newFolderInput.value = '';
        newFolderInput.focus();
      } else if (action === 'move-up') {
        var folder = folders.find(function (item) {
          return item.id === folderId;
        });

        if (folder && folder.parentId) {
          var parentFolder = folders.find(function (item) {
            return item.id === folder.parentId;
          });
          moveFolder(folderId, parentFolder ? parentFolder.parentId || null : null);
        }
      } else if (action === 'delete-folder') {
        deleteCustomFolder(folderId);
      }
    });

    cancelFolderEditor.addEventListener('click', closeFolderEditor);
    folderEditorForm.addEventListener('submit', saveFolderEditor);

    folderEditorOverlay.addEventListener('click', function (event) {
      if (event.target === folderEditorOverlay) {
        closeFolderEditor();
      }
    });

    document.addEventListener('pointerdown', function (event) {
      if (!folderContextMenu.hidden && !folderContextMenu.contains(event.target)) {
        closeFolderContextMenu();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (!folderEditorOverlay.hidden) {
          closeFolderEditor();
        } else if (!folderContextMenu.hidden) {
          closeFolderContextMenu();
        }
      }
    });

    function clearFolderDropTargets() {
      folderList.querySelectorAll('.is-drop-target').forEach(function (item) {
        item.classList.remove('is-drop-target');
      });
    }

    folderList.addEventListener('dragstart', function (event) {
      if (event.target.closest('button, input')) {
        event.preventDefault();
        return;
      }

      var row = event.target.closest('.folder-item[data-folder-id]');

      if (!row) {
        return;
      }

      dragFolderId = row.dataset.folderId;
      event.dataTransfer.setData('text/plain', dragFolderId);
      event.dataTransfer.effectAllowed = 'move';
      row.classList.add('is-dragging');
    });

    folderList.addEventListener('dragover', function (event) {
      if (!dragFolderId) {
        return;
      }

      var builtIn = event.target.closest('.folder-select[data-folder-id="all"], .folder-select[data-folder-id="none"]');

      if (builtIn) {
        event.preventDefault();
        clearFolderDropTargets();
        builtIn.closest('.folder-item').classList.add('is-drop-target');
        return;
      }

      var row = event.target.closest('.folder-item[data-folder-id]');

      if (!row || row.dataset.folderId === dragFolderId) {
        return;
      }

      if (NoteApp.isDescendantFolder(folders, row.dataset.folderId, dragFolderId)) {
        return;
      }

      event.preventDefault();
      clearFolderDropTargets();
      row.classList.add('is-drop-target');
    });

    folderList.addEventListener('drop', function (event) {
      if (!dragFolderId) {
        return;
      }

      event.preventDefault();

      var builtIn = event.target.closest('.folder-select[data-folder-id="all"], .folder-select[data-folder-id="none"]');
      var row = event.target.closest('.folder-item[data-folder-id]');
      var targetId = builtIn ? null : (row ? row.dataset.folderId : null);

      if (targetId !== null || builtIn) {
        moveFolder(dragFolderId, targetId);
      }

      dragFolderId = null;
      clearFolderDropTargets();
    });

    folderList.addEventListener('dragend', function () {
      dragFolderId = null;
      clearFolderDropTargets();
      folderList.querySelectorAll('.is-dragging').forEach(function (item) {
        item.classList.remove('is-dragging');
      });
    });

    folderSelect.addEventListener('change', function () {
      moveActiveNoteToFolder(folderSelect.value);
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
