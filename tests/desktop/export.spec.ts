import { test, expect, fileMenuCommand, exportViaMenu } from './fixtures';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

test('File menu exports latest active note as Markdown/TXT, separate from full JSON backup', async ({ desktop, notebook, dataDir }) => {
  await expect(notebook.getByTestId('import-button')).toHaveCount(0);
  await expect(notebook.getByTestId('export-button')).toHaveCount(0);
  await fileMenuCommand(desktop, '导出…');
  await expect(notebook.getByRole('radio', { name: 'Markdown', exact: true })).toBeDisabled();
  await expect(notebook.getByRole('radio', { name: '完整备份', exact: true })).toBeChecked();
  await notebook.getByRole('button', { name: '取消', exact: true }).click();
  const exportItems = await desktop.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items[0].submenu!.items.filter(item => item.label.startsWith('导出')).map(item => item.label));
  expect(exportItems).toEqual(['导出…']);
  await notebook.getByTestId('new-note').click(); await notebook.getByTestId('title-input').fill('不应导出的其他笔记');
  await notebook.getByTestId('new-note').click(); await notebook.getByTestId('title-input').fill('标记法');
  const directory = path.join(path.dirname(dataDir), path.basename(dataDir) + '-exports');
  await mkdir(directory);
  try {
    for (const format of ['md', 'txt', 'json']) {
      const output = path.join(directory, `标记法.${format}`);
      await desktop.evaluate(({ dialog }, output) => {
        dialog.showSaveDialog = async (windowOrOptions: Electron.BaseWindow | Electron.SaveDialogOptions, options?: Electron.SaveDialogOptions) => {
          (globalThis as unknown as { lastExportDialog: Electron.SaveDialogOptions }).lastExportDialog = options ?? windowOrOptions as Electron.SaveDialogOptions;
          return { canceled: false, filePath: output };
        };
      }, output);
      const source = '## 标题\n\n**中文** 与 `code`\n\n- 任务\n\n[文档](https://example.com)';
      await notebook.getByTestId('content-input').fill(source);
      await exportViaMenu(desktop, notebook, format === 'md' ? 'Markdown' : format === 'txt' ? '纯文本' : '完整备份');
      await expect(notebook.getByRole('status')).toHaveText(/已导出/);
      const text = await readFile(output, 'utf8');
      if (format === 'md') expect(text).toBe('# 标记法\n\n' + source + '\n');
      else if (format === 'txt') {
        expect(text).toContain('标记法\n\n标题'); expect(text).toContain('中文 与 code');
        expect(text).toContain('文档 (https://example.com)'); expect(text).not.toContain('**'); expect(text).not.toContain('## ');
      } else expect(JSON.parse(text).notes).toHaveLength(2);
      if (format !== 'json') expect(text).not.toContain('不应导出的其他笔记');
      const defaultPath = await desktop.evaluate(({ app }) => {
        const options = (globalThis as unknown as { lastExportDialog: Electron.SaveDialogOptions }).lastExportDialog;
        return { path: options.defaultPath!, documents: app.getPath('documents'), extension: options.filters![0].extensions[0] };
      });
      expect(path.dirname(defaultPath.path)).toBe(defaultPath.documents); expect(defaultPath.extension).toBe(format);
      await notebook.getByRole('button', { name: '关闭提示' }).click();
    }
    // Export still works for an empty body, rather than silently doing nothing.
    await notebook.getByTestId('content-input').fill('');
    const emptyFile = path.join(directory, 'empty.md');
    await desktop.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, emptyFile);
    await exportViaMenu(desktop, notebook, 'Markdown'); await expect(notebook.getByRole('status')).toHaveText(/Markdown 笔记已导出/);
    expect(await readFile(emptyFile, 'utf8')).toBe('# 标记法\n');
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('cancel, filesystem failure and retry never falsely report export success', async ({ desktop, notebook, dataDir }) => {
  await notebook.getByTestId('new-note').click(); await notebook.getByTestId('title-input').fill('失败重试');
  await notebook.getByTestId('content-input').fill('保留原稿');
  await desktop.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' }); });
  await exportViaMenu(desktop, notebook, '纯文本');
  await expect(notebook.locator('.app-fieldset')).toHaveAttribute('aria-busy', 'false');
  await expect(notebook.getByRole('status')).toHaveCount(0);
  const directory = path.join(path.dirname(dataDir), path.basename(dataDir) + '-retry');
  await mkdir(directory);
  try {
    await desktop.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, directory);
    await exportViaMenu(desktop, notebook, '纯文本');
    await expect(notebook.getByRole('alert')).toContainText('导出失败'); await expect(notebook.getByRole('status')).toHaveCount(0);
    await expect(notebook.getByTestId('content-input')).toHaveValue('保留原稿');
    const output = path.join(directory, '重试.txt');
    await desktop.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, output);
    await notebook.getByRole('button', { name: '重新导出' }).click();
    await expect(notebook.getByRole('status')).toHaveText(/TXT 笔记已导出/); await expect(notebook.getByRole('alert')).toHaveCount(0);
    expect(await readFile(output, 'utf8')).toBe('失败重试\n\n保留原稿\n');
    const rejected = await notebook.evaluate(async () => {
      try { await window.desktop.exportNote('missing', 'markdown'); return false; } catch { return true; }
    }); expect(rejected).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
