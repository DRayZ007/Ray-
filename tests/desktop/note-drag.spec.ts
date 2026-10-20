import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('default creation order, mouse reorder, cross-folder drag and reload persistence', async ({ notebook, dataDir }) => {
  async function folder(name: string) {
    await notebook.getByTestId('add-folder').click(); await notebook.getByTestId('new-folder-input').fill(name); await notebook.getByRole('button', { name: '添加', exact: true }).click();
  }
  await folder('工作');
  for (const title of ['第一条', '第二条', '第三条']) {
    await notebook.getByTestId('new-note').click(); await notebook.getByTestId('title-input').fill(title);
  }
  await expect(notebook.getByTestId('sort-select')).toHaveValue('created');
  const titles = () => notebook.getByTestId('note-list').locator('.note-title');
  await expect(titles()).toHaveText(['第三条', '第二条', '第一条']);
  const first = notebook.getByTestId('note-item').filter({ has: notebook.getByRole('heading', { name: '第一条', exact: true }) });
  const third = notebook.getByTestId('note-item').filter({ has: notebook.getByRole('heading', { name: '第三条', exact: true }) });
  await first.dragTo(third, { targetPosition: { x: 40, y: 5 } });
  await expect(titles()).toHaveText(['第一条', '第三条', '第二条']);
  await expect(notebook.getByTestId('sort-select')).toHaveValue('manual');
  await notebook.keyboard.press('Control+s'); await expect(notebook.getByTestId('save-status')).toHaveText('已保存');
  await notebook.reload(); await notebook.getByTestId('new-note').waitFor();
  await notebook.locator('.folder-name', { hasText: /^工作$/ }).click();
  await expect(titles()).toHaveText(['第一条', '第三条', '第二条']);
  await folder('生活'); await notebook.locator('.folder-name', { hasText: /^工作$/ }).click();
  const life = notebook.locator('[data-folder-id]').filter({ has: notebook.locator('.folder-name', { hasText: /^生活$/ }) }).first();
  await first.dragTo(life);
  await expect(titles()).toHaveText(['第三条', '第二条']);
  await notebook.locator('.folder-name', { hasText: /^生活$/ }).click();
  await expect(titles()).toHaveText(['第一条']);
  await notebook.getByTestId('note-item').click();
  await notebook.getByTestId('content-input').fill('拖动后自动保存');
  await expect(notebook.getByTestId('save-status')).toHaveText('已保存');
  const stored = JSON.parse(await readFile(path.join(dataDir, 'notes.json'), 'utf8'));
  const moved = stored.notes.find((note: { title: string }) => note.title === '第一条');
  expect(moved.content).toBe('拖动后自动保存');
  expect(stored.folders.find((folder: { id: string }) => folder.id === moved.folderId).name).toBe('生活');
  await notebook.reload(); await notebook.getByTestId('new-note').waitFor();
  await notebook.locator('.folder-name', { hasText: /^生活$/ }).click(); await expect(titles()).toHaveText(['第一条']);
  const none = notebook.locator('[data-folder-id="none"]');
  await notebook.getByTestId('note-item').dragTo(none);
  await expect(titles()).toHaveCount(0);
  await none.getByRole('button').click(); await expect(titles()).toHaveText(['第一条']);
  await expect(notebook.locator('.storage-status')).toHaveCount(0);
});
