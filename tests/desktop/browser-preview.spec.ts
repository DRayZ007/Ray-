import { test, expect, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

test('offline HTML menu, format selection, Ctrl+S, auto-save and refresh safety', async ({}, info) => {
  const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  test.skip(!executablePath, 'Microsoft Edge is required for standalone HTML validation.');
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext({ offline: true, acceptDownloads: true, viewport: { width: 1100, height: 800 }, colorScheme: 'light' });
    const page = await context.newPage();
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve('桌面客户端预览.html')).href);
    await page.getByTestId('new-note').waitFor();
    await expect(page.locator('.storage-status')).toHaveCount(0);
    expect(await page.getByTestId('app-logo').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.getByTestId('title-input').fill('离线体验');
    await page.getByTestId('content-input').fill('## 今天的计划\n\n**自动保存**，随时继续。');
    await expect(page.getByTestId('save-status')).toHaveText('已保存');
    await page.reload(); await expect(page.getByTestId('title-input')).toHaveValue('离线体验');
    await page.getByTestId('content-input').fill('刷新前的最后一次输入');
    await page.reload(); await expect(page.getByTestId('content-input')).toHaveValue('刷新前的最后一次输入');
    await page.getByTestId('content-input').fill('## 今天的计划\n\n**自动保存**，随时继续。');
    await page.keyboard.press('Control+s'); await expect(page.getByTestId('save-status')).toHaveText('已保存');
    await page.getByRole('button', { name: '文件', exact: true }).click();
    await expect(page.getByRole('menuitem')).toHaveCount(4);
    await expect(page.getByRole('menuitem').filter({ hasText: '导出' })).toHaveCount(1);
    await page.screenshot({ path: info.outputPath('file-menu.png') });
    await page.keyboard.press('Escape'); await expect(page.getByRole('menu')).toHaveCount(0);
    for (const [format, extension] of [['Markdown', 'md'], ['纯文本', 'txt'], ['完整备份', 'json']]) {
      await page.getByRole('button', { name: '文件', exact: true }).click();
      await page.getByRole('menuitem', { name: /导出/ }).click();
      await page.getByRole('radio', { name: format, exact: true }).check();
      if (extension === 'md') await page.screenshot({ path: info.outputPath('export-dialog.png') });
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: '导出文件', exact: true }).click();
      const download = await pending;
      expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
      const text = await readFile((await download.path())!, 'utf8');
      if (extension === 'md') expect(text).toContain('**自动保存**');
      if (extension === 'txt') { expect(text).toContain('自动保存'); expect(text).not.toContain('**'); }
      if (extension === 'json') expect(JSON.parse(text).notes[0].title).toBe('离线体验');
      await page.getByRole('button', { name: '关闭提示' }).click();
    }
    await page.getByTestId('preview-mode').click();
    await page.screenshot({ path: info.outputPath('light.png') });
    await page.getByTestId('theme-toggle').click(); await page.screenshot({ path: info.outputPath('dark.png') });
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
});
