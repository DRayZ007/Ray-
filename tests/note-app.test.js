const test = require('node:test');
const assert = require('node:assert/strict');

const NoteApp = require('../app.js');

test('createNote returns a complete note with deterministic overrides', () => {
  const note = NoteApp.createNote({
    id: 'note-1',
    title: '会议记录',
    content: '讨论下周发布计划',
    createdAt: 100,
    updatedAt: 200,
    pinned: true
  });

  assert.deepEqual(note, {
    id: 'note-1',
    title: '会议记录',
    content: '讨论下周发布计划',
    createdAt: 100,
    updatedAt: 200,
    pinned: true
  });
});

test('createNote fills sensible defaults for a blank note', () => {
  const note = NoteApp.createNote({ now: 1234 });

  assert.match(note.id, /^note-/);
  assert.equal(note.title, '无标题笔记');
  assert.equal(note.content, '');
  assert.equal(note.createdAt, 1234);
  assert.equal(note.updatedAt, 1234);
  assert.equal(note.pinned, false);
});

test('updateNote changes content and bumps updatedAt by default', () => {
  const note = NoteApp.createNote({ id: 'note-1', updatedAt: 100 });
  const updated = NoteApp.updateNote(note, { title: '新标题', content: '新内容' });

  assert.equal(updated.title, '新标题');
  assert.equal(updated.content, '新内容');
  assert.equal(updated.createdAt, note.createdAt);
  assert.ok(updated.updatedAt > 100);
});

test('updateNote can keep updatedAt unchanged for pin-only edits', () => {
  const note = NoteApp.createNote({ id: 'note-1', updatedAt: 100 });
  const updated = NoteApp.updateNote(note, { pinned: true }, { touch: false });

  assert.equal(updated.pinned, true);
  assert.equal(updated.updatedAt, 100);
});

test('deleteNote removes only the requested id', () => {
  const notes = [
    NoteApp.createNote({ id: 'a' }),
    NoteApp.createNote({ id: 'b' }),
    NoteApp.createNote({ id: 'c' })
  ];

  const result = NoteApp.deleteNote(notes, 'b');

  assert.deepEqual(result.map((note) => note.id), ['a', 'c']);
  assert.deepEqual(notes.map((note) => note.id), ['a', 'b', 'c']);
});

test('sortNotes puts pinned notes first and orders by updatedAt', () => {
  const notes = [
    NoteApp.createNote({ id: 'old', updatedAt: 1 }),
    NoteApp.createNote({ id: 'new', updatedAt: 3 }),
    NoteApp.createNote({ id: 'pinned-old', updatedAt: 2, pinned: true })
  ];

  assert.deepEqual(
    NoteApp.sortNotes(notes, 'updated').map((note) => note.id),
    ['pinned-old', 'new', 'old']
  );
});

test('sortNotes can order by createdAt', () => {
  const notes = [
    NoteApp.createNote({ id: 'middle', createdAt: 2, updatedAt: 9 }),
    NoteApp.createNote({ id: 'first', createdAt: 1, updatedAt: 8 }),
    NoteApp.createNote({ id: 'last', createdAt: 3, updatedAt: 7 })
  ];

  assert.deepEqual(
    NoteApp.sortNotes(notes, 'created').map((note) => note.id),
    ['last', 'middle', 'first']
  );
});

test('sortNotes supports Chinese and English title order', () => {
  const chineseNotes = [
    NoteApp.createNote({ id: 'zhang', title: '张' }),
    NoteApp.createNote({ id: 'chen', title: '陈' }),
    NoteApp.createNote({ id: 'wang', title: '王' })
  ];

  assert.deepEqual(
    NoteApp.sortNotes(chineseNotes, 'title').map((note) => note.id),
    ['chen', 'wang', 'zhang']
  );

  const englishNotes = [
    NoteApp.createNote({ id: 'banana', title: 'banana' }),
    NoteApp.createNote({ id: 'apple', title: 'apple' })
  ];

  assert.deepEqual(
    NoteApp.sortNotes(englishNotes, 'title').map((note) => note.id),
    ['apple', 'banana']
  );
});

test('filterNotes matches title and content without case sensitivity', () => {
  const notes = [
    NoteApp.createNote({ id: 'a', title: '周报', content: '整理本周工作' }),
    NoteApp.createNote({ id: 'b', title: '草稿', content: 'Remember to follow up' }),
    NoteApp.createNote({ id: 'c', title: '阅读清单', content: '读书笔记' })
  ];

  assert.deepEqual(NoteApp.filterNotes(notes, '周报').map((note) => note.id), ['a']);
  assert.deepEqual(NoteApp.filterNotes(notes, 'remember').map((note) => note.id), ['b']);
  assert.deepEqual(NoteApp.filterNotes(notes, '  '), notes);
});

test('getWordCount counts CJK characters and latin words', () => {
  assert.equal(NoteApp.getWordCount(''), 0);
  assert.equal(NoteApp.getWordCount('   '), 0);
  assert.equal(NoteApp.getWordCount('你好世界'), 4);
  assert.equal(NoteApp.getWordCount('Hello world'), 2);
  assert.equal(NoteApp.getWordCount('写 code 很快'), 4);
});

test('formatRelativeDate reports recent and older timestamps', () => {
  const now = 1_000_000;

  assert.equal(NoteApp.formatRelativeDate(now - 20_000, now), '刚刚');
  assert.equal(NoteApp.formatRelativeDate(now - 120_000, now), '2 分钟前');
  assert.equal(NoteApp.formatRelativeDate(now - 3_600_000, now), '1 小时前');
  assert.match(NoteApp.formatRelativeDate(now - 86_400_000, now), /^\d{4}\/\d{2}\/\d{2}$/);
});

test('getSnippet trims whitespace and adds an ellipsis', () => {
  assert.equal(NoteApp.getSnippet('  第一行\n\n第二行  '), '第一行 第二行');
  assert.equal(NoteApp.getSnippet('abcdefg', 4), 'abcd…');
  assert.equal(NoteApp.getSnippet('', 10), '暂无内容');
});

test('parseMarkdown renders headings, emphasis, lists, links, and code', () => {
  const html = NoteApp.parseMarkdown(
    '# 标题\n\n正文 **加粗** 和 `code`。\n\n- 第一项\n- 第二项\n\n[链接](https://example.com)'
  );

  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /<strong>加粗<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<ul><li>第一项<\/li><li>第二项<\/li><\/ul>/);
  assert.match(html, /<a href="https:\/\/example.com"[^>]*>链接<\/a>/);
});

test('parseMarkdown escapes raw HTML and unsafe links', () => {
  const html = NoteApp.parseMarkdown('<script>alert(1)</script> [bad](javascript:alert(1))');

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /javascript:/);
});

test('storage helpers round-trip valid notes and reject invalid payloads', () => {
  const storage = NoteApp.createMemoryStorage();
  const notes = [NoteApp.createNote({ id: 'a', title: '保存测试' })];

  NoteApp.saveNotes(storage, notes);

  assert.deepEqual(NoteApp.loadNotes(storage), notes);
  assert.deepEqual(NoteApp.deserializeNotes('{bad json'), []);
  assert.deepEqual(NoteApp.deserializeNotes('[{"id":"broken"}]'), []);
});
