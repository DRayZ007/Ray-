import { expect, test } from 'vitest';
import { createNote } from '../src/shared/domain';
import { exportFilename, markdownToText, noteExport } from '../src/shared/export';

test('Markdown export preserves source, Unicode and title, with a final newline', () => {
  const source = '## 计划\r\n\r\n**重要**\r\n\r\n```go\r\nfmt.Println("你好")\r\n```';
  const exported = noteExport(createNote({ title: '标记法 📝', content: source }), 'markdown');
  expect(exported.filename).toBe('标记法 📝.md');
  expect(exported.content).toBe('# 标记法 📝\n\n' + source.replace(/\r\n/g, '\n') + '\n');
  expect(noteExport(createNote({ title: '只有标题', content: '' }), 'markdown').content).toBe('# 只有标题\n');
});
test('TXT export removes formatting while preserving links, code and literal HTML', () => {
  const source = '# 标题\n\n**加粗** 和 *斜体*，`x < 2 && y`\n\n- 任务一\n- 任务二\n\n1. 第一步\n2. 第二步\n\n[文档](https://example.com?a=1&b=2)\n\n> 引用\n\n```js\nconst value = "<tag>**原样**";\n```\n\n<script>仅作为文字</script>';
  const plain = markdownToText(source);
  expect(plain).toContain('加粗 和 斜体，x < 2 && y');
  expect(plain).toContain('- 任务一\n- 任务二');
  expect(plain).toContain('1. 第一步\n2. 第二步');
  expect(plain).toContain('文档 (https://example.com?a=1&b=2)');
  expect(plain).toContain('const value = "<tag>**原样**";');
  expect(plain).toContain('<script>仅作为文字</script>');
  expect(plain).not.toContain('<strong>'); expect(plain).not.toContain('```');
  const exported = noteExport(createNote({ title: '导出笔记', content: source }), 'txt');
  expect(exported.filename).toBe('导出笔记.txt'); expect(exported.content).toBe('导出笔记\n\n' + plain + '\n');
});
test('safe Windows filenames handle invalid characters, reserved names and empty titles', () => {
  expect(exportFilename('a/b:c*?. ', 'markdown')).toBe('a_b_c__.md');
  expect(exportFilename('CON', 'txt')).toBe('_CON.txt');
  expect(exportFilename('lpt1.any', 'txt')).toBe('_lpt1.any.txt');
  expect(exportFilename(' .. ', 'txt')).toBe('无标题笔记.txt');
  expect(exportFilename('📝'.repeat(100), 'markdown')).toBe('📝'.repeat(80) + '.md');
  expect(noteExport(createNote({ title: '空内容', content: '' }), 'txt').content).toBe('空内容\n');
});
