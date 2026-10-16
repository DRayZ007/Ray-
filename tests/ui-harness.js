(function () {
  'use strict';

  function run() {
    var failures = [];
    var passCount = 0;

    function assert(condition, message) {
      if (condition) {
        passCount += 1;
      } else {
        failures.push(message);
      }
    }

    function value(selector) {
      return document.querySelector(selector).value;
    }

    function text(selector) {
      return document.querySelector(selector).textContent.trim();
    }

    function click(selector) {
      document.querySelector(selector).click();
    }

    function input(selector, nextValue) {
      var element = document.querySelector(selector);
      element.focus();
      element.value = nextValue;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function setSearch(nextValue) {
      input('[data-testid="search-input"]', nextValue);
    }

    try {
      assert(
        !document.querySelector('[data-testid="editor-empty"]').hidden,
        'initial empty state should be visible'
      );
      assert(text('[data-testid="note-count"]') === '0 条笔记', 'initial note count should be zero');
      assert(value('[data-testid="app-title-input"]') === 'Ray的笔记', 'app title should be editable');
      assert(document.querySelector('[data-testid="resizer"]'), 'resizer should be available');

      var appTitle = document.querySelector('[data-testid="app-title-input"]');
      appTitle.value = '工作笔记';
      appTitle.dispatchEvent(new Event('input', { bubbles: true }));
      appTitle.dispatchEvent(new Event('change', { bubbles: true }));
      assert(localStorage.getItem('mark-notes:app-title') === '工作笔记', 'app title should be persisted');
      assert(document.title === '工作笔记', 'document title should follow the editable app title');

      var initialTheme = document.documentElement.dataset.theme;
      click('[data-testid="theme-toggle"]');
      assert(document.documentElement.dataset.theme !== initialTheme, 'theme toggle should switch color scheme');
      click('[data-testid="theme-toggle"]');
      assert(document.documentElement.dataset.theme === initialTheme, 'theme toggle should switch back');

      assert(document.querySelectorAll('[data-folder-id]').length >= 2, 'folder list should include built-in folders');
      click('[data-testid="add-folder"]');
      assert(!document.querySelector('[data-testid="new-folder-form"]').hidden, 'new folder form should open');
      input('[data-testid="new-folder-input"]', '工作');
      document.querySelector('[data-testid="new-folder-form"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      var savedFolders = JSON.parse(localStorage.getItem('mark-notes:folders:v1'));
      var workFolder = savedFolders.find(function (folder) { return folder.name === '工作'; });
      assert(workFolder, 'new folder should be persisted');
      assert(
        Array.from(document.querySelectorAll('[data-testid="folder-item"] .folder-name')).some(function (name) {
          return name.textContent.trim() === '工作';
        }),
        'new folder should appear in the sidebar'
      );

      var workFolderRow = document.querySelector('.folder-item[data-folder-id="' + workFolder.id + '"]');
      workFolderRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));
      assert(!document.querySelector('[data-testid="folder-context-menu"]').hidden, 'folder context menu should open');
      click('[data-context-action="edit-folder"]');
      assert(!document.querySelector('[data-testid="folder-editor-overlay"]').hidden, 'folder editor should open');
      assert(value('[data-testid="folder-editor-name"]') === '工作', 'folder editor should show the current name');
      document.querySelector('[data-testid="folder-editor-form"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      assert(document.querySelector('[data-testid="folder-editor-overlay"]').hidden, 'folder editor should close after save');

      click('[data-testid="new-note"]');
      assert(!document.querySelector('[data-testid="editor"]').hidden, 'editor should open after creating a note');
      assert(document.querySelector('[data-testid="editor-empty"]').hidden, 'empty state should hide after opening a note');
      assert(value('[data-testid="title-input"]') === '无标题笔记', 'new note should have a default title');

      input('[data-testid="title-input"]', '项目计划');
      input('[data-testid="content-input"]', '编写 **测试** 用例');

      assert(value('[data-testid="title-input"]') === '项目计划', 'title input should reflect typed text');
      assert(text('[data-testid="word-count"]') === '6 字', 'word count should count CJK characters');
      assert(text('[data-testid="note-item"] .note-title') === '项目计划', 'list should show the note title');
      assert(value('[data-testid="content-input"]') === '编写 **测试** 用例', 'content should keep Markdown source');
      assert(
        JSON.parse(localStorage.getItem('mark-notes:v1'))[0].folderId === workFolder.id,
        'new note should be assigned to the selected folder'
      );

      click('[data-testid="preview-mode"]');
      assert(document.querySelector('[data-testid="content-input"]').hidden, 'textarea should hide in preview mode');
      assert(!document.querySelector('[data-testid="markdown-preview"]').hidden, 'Markdown preview should be visible');
      assert(
        document.querySelector('[data-testid="markdown-preview"]').innerHTML.includes('<strong>测试</strong>'),
        'Markdown preview should render bold text'
      );
      click('[data-testid="edit-mode"]');

      document.querySelector('[data-action="add-subfolder"][data-id="' + workFolder.id + '"]').click();
      input('[data-testid="new-folder-input"]', '子项目');
      document.querySelector('[data-testid="new-folder-form"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      var childFolders = JSON.parse(localStorage.getItem('mark-notes:folders:v1'));
      var childFolder = childFolders.find(function (folder) { return folder.name === '子项目'; });
      assert(childFolder && childFolder.parentId === workFolder.id, 'subfolder should be nested under its parent');

      click('[data-testid="new-note"]');
      input('[data-testid="title-input"]', '购物清单');
      input('[data-testid="content-input"]', '牛奶 面包');
      document.querySelector('.folder-select[data-folder-id="all"]').click();
      assert(document.querySelectorAll('[data-testid="note-item"]').length === 2, 'two notes should be listed');

      document.querySelector('.folder-select[data-folder-id="' + workFolder.id + '"]').click();
      assert(document.querySelectorAll('[data-testid="note-item"]').length === 2, 'parent folder should include descendant notes');
      document.querySelector('.folder-select[data-folder-id="' + childFolder.id + '"]').click();
      assert(document.querySelectorAll('[data-testid="note-item"]').length === 1, 'child folder should show only its own notes');
      assert(text('[data-testid="note-item"] .note-title') === '购物清单', 'child folder should show the shopping note');
      document.querySelector('.folder-select[data-folder-id="all"]').click();
      assert(document.querySelectorAll('[data-testid="note-item"]').length === 2, 'all folder should show every note');

      var sortSelect = document.querySelector('[data-testid="sort-select"]');
      assert(
        Array.from(sortSelect.options).some(function (option) { return option.value === 'title'; }),
        'text sort option should be available'
      );
      sortSelect.value = 'title';
      sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
      assert(text('[data-testid="note-item"] .note-title') === '购物清单', 'text sort should order Chinese by pinyin');
      sortSelect.value = 'updated';
      sortSelect.dispatchEvent(new Event('change', { bubbles: true }));

      setSearch('项目');
      assert(document.querySelectorAll('[data-testid="note-item"]').length === 1, 'search should filter the list');
      assert(text('[data-testid="note-item"] .note-title') === '项目计划', 'search should match the project note');

      setSearch('');
      assert(
        document.querySelectorAll('[data-id][data-action="pin"]').length === 0,
        'unpinned notes should not show a pin button'
      );

      var savedNotes = JSON.parse(localStorage.getItem('mark-notes:v1'));
      var projectNote = savedNotes.find(function (note) {
        return note.title === '项目计划';
      });
      var projectId = projectNote.id;

      document.querySelector('[data-id="' + projectId + '"]').click();
      click('[data-testid="pin-button"]');
      var projectPin = document.querySelector('[data-id="' + projectId + '"] [data-action="pin"]');
      assert(projectPin.classList.contains('is-pinned'), 'pin button should show the pinned state');
      assert(text('#pinButtonLabel') === '已置顶', 'editor pin button should have a clear label');
      assert(
        text('[data-testid="note-item"] .note-title') === '项目计划',
        'pinned note should appear first'
      );

      window.confirm = function () {
        return true;
      };
      click('[data-testid="delete-button"]');

      var remaining = JSON.parse(localStorage.getItem('mark-notes:v1'));
      assert(remaining.length === 1, 'deleting a note should persist one remaining note');
      assert(remaining[0].title === '购物清单', 'the remaining note should be the shopping list');
      assert(text('[data-testid="note-count"]') === '1 条笔记', 'note count should update after deletion');
    } catch (error) {
      failures.push(error && error.message ? error.message : String(error));
    }

    document.documentElement.dataset.uiTest = failures.length === 0 ? 'pass' : 'fail';
    document.documentElement.dataset.uiTestCount = String(passCount);

    var result = document.createElement('output');
    result.id = 'ui-test-result';
    result.textContent = failures.length === 0
      ? 'pass (' + passCount + ' assertions)'
      : 'fail: ' + failures.join(' | ');
    document.body.appendChild(result);

    window.__uiTestFailures = failures;
  }

  if (document.readyState === 'complete') {
    run();
  } else {
    window.addEventListener('load', run, { once: true });
  }
})();
