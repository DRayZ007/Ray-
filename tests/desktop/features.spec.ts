import { test, expect, fileMenuCommand, exportViaMenu } from './fixtures';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { emptyData } from '../../src/shared/data';
import { createFolder, createNote } from '../../src/shared/domain';

test('nested folder filters, attributes, drag movement and subtree deletion', async ({ notebook }) => {
  async function add(name: string) { await notebook.getByTestId('new-folder-input').fill(name); await notebook.getByRole('button', { name: '添加', exact: true }).click(); }
  await notebook.getByTestId('add-folder').click(); await add('工作');
  const work = notebook.locator('[data-folder-id]').filter({ has: notebook.getByRole('button', { name: '工作', exact: false }) }).first();
  await notebook.locator('.folder-name', { hasText: /^工作$/ }).click({ button: 'right' }); await notebook.getByRole('menuitem', { name: '新建子文件夹' }).click(); await add('项目');
  await notebook.getByTestId('new-note').click(); await notebook.getByTestId('title-input').fill('子目录笔记');
  await notebook.locator('.folder-name', { hasText: /^工作$/ }).click(); await expect(notebook.getByTestId('note-item')).toHaveCount(1);
  await notebook.getByTestId('add-folder').click(); await add('生活');
  const project = notebook.locator('[data-folder-id]').filter({ has: notebook.locator('.folder-name', { hasText: /^项目$/ }) }).first();
  const life = notebook.locator('[data-folder-id]').filter({ has: notebook.locator('.folder-name', { hasText: /^生活$/ }) }).first();
  await project.dragTo(life);
  await notebook.locator('.folder-name', { hasText: /^生活$/ }).click(); await expect(notebook.getByTestId('note-item')).toHaveCount(1);
  await notebook.locator('.folder-name', { hasText: /^项目$/ }).click({ button: 'right' }); await notebook.getByRole('menuitem', { name: '编辑属性' }).click();
  await notebook.getByTestId('folder-editor-name').fill('项目归档'); await notebook.getByRole('button', { name: '保存', exact: true }).click();
  await expect(notebook.getByTestId('folder-select')).toContainText('生活 / 项目归档');
  await notebook.locator('.folder-name', { hasText: /^生活$/ }).click({ button: 'right' }); await notebook.getByRole('menuitem', { name: '删除文件夹' }).click(); await notebook.getByRole('button', { name: '确认删除' }).click();
  await notebook.locator('.folder-name', { hasText: /^未分类$/ }).click(); await expect(notebook.getByTestId('note-item')).toContainText('子目录笔记'); await expect(notebook.getByTestId('folder-select')).toHaveValue('');
  await expect(work).toBeVisible();
  await notebook.getByTestId('folder-select').selectOption({ label: '工作' });
  await notebook.locator('.folder-name', { hasText: /^工作$/ }).click(); await expect(notebook.getByTestId('note-item')).toHaveCount(1);
  await notebook.locator('.folder-name', { hasText: /^工作$/ }).dblclick();
  await notebook.getByRole('textbox', { name: '重命名文件夹' }).fill('工作归档'); await notebook.getByRole('textbox', { name: '重命名文件夹' }).press('Enter');
  await expect(notebook.getByTestId('folder-select')).toContainText('工作归档');
  await notebook.keyboard.press('Control+s'); await expect(notebook.getByTestId('save-status')).toHaveText('已保存');
});

test('native import/export, conflict preservation, repeated import and invalid file rejection', async ({ desktop, notebook, dataDir }) => {
  const incoming = { ...emptyData(), folders: [createFolder({ id: 'root', name: '备份文件夹', now: 1 })], notes: [createNote({ id: 'backup-note', title: '导入笔记', folderId: 'root', content: '外部原稿', now: 1 })] };
  const input = path.join(dataDir, 'incoming.json'), output = path.join(dataDir, '..', path.basename(dataDir) + '-export.json');
  await writeFile(input, JSON.stringify(incoming));
  await desktop.evaluate(({ dialog }, { input, output }) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
  }, { input, output });
  async function importFile() { await fileMenuCommand(desktop, '导入 JSON 备份…'); await expect(notebook.getByRole('dialog', { name: '确认导入' })).toBeVisible(); await notebook.getByRole('button', { name: '确认导入', exact: true }).click(); await expect(notebook.getByRole('dialog')).toHaveCount(0); }
  await importFile(); await expect(notebook.getByTestId('note-item')).toHaveCount(1);
  await notebook.getByTestId('content-input').fill('本地修改');
  await importFile(); await expect(notebook.getByTestId('note-item')).toHaveCount(2);
  await importFile(); await expect(notebook.getByTestId('note-item')).toHaveCount(2);
  await exportViaMenu(desktop, notebook, '完整备份'); await expect(notebook.getByRole('status')).toHaveText(/JSON 完整备份已导出/);
  const exported = JSON.parse(await readFile(output, 'utf8')); expect(exported.notes.map((note: { content: string }) => note.content).sort()).toEqual(['外部原稿', '本地修改'].sort());
  await writeFile(input, '{broken'); await fileMenuCommand(desktop, '导入 JSON 备份…'); await expect(notebook.getByRole('alert')).toBeVisible(); await expect(notebook.getByTestId('note-item')).toHaveCount(2);
  const { rm } = await import('node:fs/promises'); await rm(output, { force: true });
});

test('keyboard shortcuts, safe external links, resizing and two themes', async ({ desktop, notebook }, info) => {
  await notebook.keyboard.press('Control+n'); await expect(notebook.getByTestId('editor')).toBeVisible();
  await notebook.getByTestId('content-input').fill('<script>window.hacked=true</script>\n\n[链接](https://example.com) [危险](javascript:alert(1))');
  await notebook.getByTestId('preview-mode').click(); await expect(notebook.getByTestId('markdown-preview').locator('script')).toHaveCount(0); await expect(notebook.getByTestId('markdown-preview').locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await notebook.evaluate(async () => {
    try { await window.desktop.openExternal('javascript:alert(1)'); return false; } catch { return true; }
  })).toBe(true);
  expect(await notebook.evaluate(async () => {
    try { await window.desktop.save({ version: 999 } as never); return false; } catch { return true; }
  })).toBe(true);
  await desktop.evaluate(({ shell }) => { shell.openExternal = async (url: string) => { (globalThis as unknown as { opened: string }).opened = url; }; });
  await notebook.getByTestId('markdown-preview').getByRole('link', { name: '链接', exact: true }).click();
  await expect.poll(() => desktop.evaluate(() => (globalThis as unknown as { opened: string }).opened)).toBe('https://example.com/');
  await notebook.keyboard.press('Control+f'); await expect(notebook.getByTestId('search-input')).toBeFocused();
  for (const factor of [1, 1.5, 2]) {
    await desktop.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(value), factor);
    await expect(notebook.getByTestId('app-logo')).toBeVisible();
    const rect = await notebook.getByTestId('app-logo').boundingBox(); expect(rect?.width).toBe(32);
    await notebook.screenshot({ path: info.outputPath(`light-${factor}.png`) });
  }
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
  await notebook.getByTestId('theme-toggle').click(); await expect(notebook.locator('html')).toHaveAttribute('data-theme', 'dark');
  await notebook.screenshot({ path: info.outputPath('dark.png') });
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(650, 700));
  const separator = notebook.getByTestId('resizer'); await separator.focus(); await notebook.keyboard.press('ArrowDown');
  const before = await notebook.locator('.app-shell').evaluate(element => parseFloat((element as HTMLElement).style.getPropertyValue('--stack-top-height')));
  const box = (await separator.boundingBox())!;
  await notebook.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await notebook.mouse.down(); await notebook.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30, { steps: 5 }); await notebook.mouse.up();
  const after = await notebook.locator('.app-shell').evaluate(element => parseFloat((element as HTMLElement).style.getPropertyValue('--stack-top-height')));
  expect(after).toBeGreaterThan(before);
  await expect(notebook.getByTestId('app-logo')).toBeVisible(); await notebook.screenshot({ path: info.outputPath('narrow.png') });
});

test('legacy page exports original localStorage without modifying it', async ({ desktop, dataDir }) => {
  const download = path.join(dataDir, 'legacy-backup.json');
  const opened = desktop.waitForEvent('window');
  await desktop.evaluate(async ({ BrowserWindow }, { file, download }) => {
    const legacy = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    legacy.webContents.session.once('will-download', (_event, item) => item.setSavePath(download));
    await legacy.loadFile(file);
  }, { file: path.resolve('index.html'), download });
  const page = await opened;
  await page.evaluate(() => {
    localStorage.setItem('mark-notes:v1', JSON.stringify([{ id: 'old', title: '旧笔记', content: '原始内容', createdAt: 1, updatedAt: 2, pinned: false, folderId: null }]));
    localStorage.setItem('mark-notes:folders:v1', '[]'); localStorage.setItem('mark-notes:app-title', '原应用');
  });
  await page.getByRole('button', { name: '导出旧版笔记' }).click();
  await expect.poll(async () => { try { return JSON.parse(await readFile(download, 'utf8')).notes[0].title; } catch { return ''; } }).toBe('旧笔记');
  expect(JSON.parse(await readFile(download, 'utf8')).settings.appTitle).toBe('原应用');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mark-notes:v1')!)[0].content)).toBe('原始内容');
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/index.html') && window.webContents.getURL().includes('/src/renderer/') === false && window.webContents.getURL().includes('/out/renderer/') === false)?.destroy());
});
