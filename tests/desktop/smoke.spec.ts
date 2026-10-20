import { test, expect, launch } from './fixtures';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('desktop shell, editing, preview, search, sort, pin and deletion', async ({ desktop, notebook }, info) => {
  const options = await desktop.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const contents = window.webContents as typeof window.webContents & { getLastWebPreferences(): Electron.WebPreferences };
    return { preferences: contents.getLastWebPreferences(), hasNativeWindow: window.getNativeWindowHandle().length > 0 };
  });
  expect(options.preferences.nodeIntegration).toBe(false); expect(options.preferences.contextIsolation).toBe(true); expect(options.preferences.sandbox).toBe(true);
  expect(options.hasNativeWindow).toBe(true);
  expect(await notebook.evaluate(() => ({ require: typeof (window as unknown as { require?: unknown }).require, bridge: typeof window.desktop.save }))).toEqual({ require: 'undefined', bridge: 'function' });
  await expect(notebook.getByTestId('app-logo')).toBeVisible();
  expect(await notebook.getByTestId('app-logo').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await notebook.getByTestId('new-note').click();
  await notebook.getByTestId('title-input').fill('项目计划'); await notebook.getByTestId('content-input').fill('# 发布\n\n编写 **测试** 用例');
  await notebook.getByTestId('preview-mode').click(); await expect(notebook.getByTestId('markdown-preview').locator('strong')).toHaveText('测试');
  await expect(notebook.getByTestId('save-status')).toHaveText('已保存');
  await notebook.screenshot({ path: info.outputPath('application.png') });
  await notebook.getByTestId('new-note').click(); await notebook.getByTestId('title-input').fill('购物清单');
  await notebook.getByTestId('sort-select').selectOption('title'); await expect(notebook.getByTestId('note-item').first()).toContainText('购物清单');
  await notebook.getByTestId('search-input').fill('项目'); await expect(notebook.getByTestId('note-item')).toHaveCount(1);
  await notebook.getByTestId('note-item').click(); await notebook.getByTestId('pin-button').click();
  await notebook.getByTestId('search-input').fill(''); await expect(notebook.getByTestId('note-item').first()).toContainText('项目计划');
  await notebook.getByTestId('delete-button').click(); await notebook.getByRole('button', { name: '取消', exact: true }).click(); await expect(notebook.getByTestId('note-item')).toHaveCount(2);
  await notebook.getByTestId('delete-button').click(); await notebook.getByRole('button', { name: '确认删除' }).click(); await expect(notebook.getByTestId('note-item')).toHaveCount(1);
});

test('quick edit closes safely and restores notes, settings and window bounds', async ({ desktop, notebook, dataDir }) => {
  await notebook.getByTestId('new-note').click(); await notebook.getByTestId('title-input').fill('重启测试');
  await notebook.getByTestId('app-title-input').fill('工作笔记'); await notebook.getByTestId('theme-toggle').click();
  const separator = notebook.getByTestId('resizer'); await separator.focus(); await notebook.keyboard.press('ArrowRight');
  const appliedWidth = await desktop.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]; window.setBounds({ width: 1100, height: 780 });
    return window.getBounds().width;
  });
  await notebook.getByTestId('content-input').fill('最后一个字也要保存');
  const closing = desktop.waitForEvent('close');
  await desktop.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); }); await closing;
  const stored = JSON.parse(await readFile(path.join(dataDir, 'notes.json'), 'utf8'));
  expect(stored.notes[0].content).toBe('最后一个字也要保存'); expect(stored.settings.sidebarWidth).toBe(356);
  const reopened = await launch(dataDir);
  try {
    const page = await reopened.firstWindow();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.getByTestId('title-input')).toHaveValue('重启测试'); await expect(page.getByTestId('content-input')).toHaveValue('最后一个字也要保存');
    await expect(page.getByTestId('app-title-input')).toHaveValue('工作笔记'); expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
    const restoredWidth = await reopened.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().width);
    // Windows rounds invisible frame edges to physical pixels at fractional display scaling.
    expect(Math.abs(restoredWidth - appliedWidth)).toBeLessThanOrEqual(2);
  } finally { await reopened.close(); }
});
