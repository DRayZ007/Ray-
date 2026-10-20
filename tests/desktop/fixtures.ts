import { test as base, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
export { expect };
export async function fileMenuCommand(desktop: ElectronApplication, label: string): Promise<void> {
  await desktop.evaluate(({ Menu }, label) => {
    const items = Menu.getApplicationMenu()!.items[0].submenu!.items;
    const entry = items.flatMap(item => item.submenu ? item.submenu.items : [item]).find(item => item.label === label);
    if (!entry) throw new Error(`File menu item missing: ${label}`);
    entry.click();
  }, label);
}
export async function launch(directory: string): Promise<ElectronApplication> {
  const env: Record<string, string> = Object.fromEntries(Object.entries({ ...process.env, MARK_NOTES_DATA_DIR: directory }).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    ...(process.env.MARK_NOTES_EXECUTABLE ? { executablePath: process.env.MARK_NOTES_EXECUTABLE, args: [] } : { args: [path.resolve('out/main/index.js')] }),
    env, timeout: 30000
  });
}
export const test = base.extend<{ desktop: ElectronApplication; notebook: Page; dataDir: string }>({
  dataDir: async ({}, use) => {
    await mkdir(path.resolve('build/test-data'), { recursive: true });
    const directory = await mkdtemp(path.resolve('build/test-data/mark-notes-e2e-'));
    await use(directory);
    await rm(directory, { force: true, recursive: true, maxRetries: 10, retryDelay: 200 });
  },
  desktop: async ({ dataDir }, use, info) => {
    const desktop = await launch(dataDir);
    let output = '';
    desktop.process().stderr?.on('data', chunk => { output += String(chunk); });
    try { await use(desktop); }
    finally {
      if (info.status !== info.expectedStatus) {
        await info.attach('electron-stderr', { body: output, contentType: 'text/plain' });
        for (const page of desktop.windows()) {
          if (!page.isClosed()) await info.attach('desktop-failure', { body: await page.screenshot(), contentType: 'image/png' }).catch(() => {});
        }
      }
      await desktop.close().catch(() => {});
    }
  },
  notebook: async ({ desktop }, use, info) => {
    const notebook = await desktop.firstWindow();
    await notebook.emulateMedia({ colorScheme: 'light' });
    const errors: string[] = [];
    notebook.on('pageerror', error => errors.push(error.message));
    await notebook.context().tracing.start({ screenshots: true, snapshots: true });
    await expect(notebook.getByTestId('new-note')).toBeVisible();
    await use(notebook);
    if (info.status !== info.expectedStatus) {
      await mkdir(info.outputDir, { recursive: true });
      await notebook.context().tracing.stop({ path: info.outputPath('trace.zip') }).catch(() => {});
    } else await notebook.context().tracing.stop().catch(() => {});
    await writeFile(info.outputPath('renderer-errors.txt'), errors.join('\n'));
    expect(errors).toEqual([]);
  }
});
