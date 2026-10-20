import { app, BrowserWindow, Menu, dialog, ipcMain, shell, screen } from 'electron';
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DataStore, RecoveryRequired } from './store';
import { mergeData, validateData } from '../shared/data';
import type { AppData, MenuCommand } from '../shared/types';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
// Stable across user-edited display names and application upgrades.
app.setPath('userData', process.env.MARK_NOTES_DATA_DIR || path.join(app.getPath('appData'), 'MarkNotes'));
app.setAppUserModelId('com.marknotes.desktop');
let window: BrowserWindow | null = null;
let forceExit = false, rendererReady = false, closeToken: string | null = null;
const store = new DataStore(app.getPath('userData'));
let pendingImport: { token: string; data: AppData } | null = null;
let loaded: AppData;
const devURL = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
const rendererFile = path.resolve(here, '../renderer/index.html');
function trusted(event: IpcMainInvokeEvent | Electron.IpcMainEvent): void {
  const url = event.senderFrame?.url;
  const allowed = devURL ? url && new URL(url).origin === new URL(devURL).origin : url === pathToFileURL(rendererFile).href;
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !allowed) throw new Error('拒绝不受信任的请求');
}
function send(command: MenuCommand) { if (rendererReady && window && !window.isDestroyed()) window.webContents.send('app:command', command); }
function registerIPC() {
  ipcMain.handle('data:load', event => { trusted(event); rendererReady = true; return loaded; });
  ipcMain.handle('data:save', async (event, data: unknown) => { trusted(event); await store.save(data); loaded = store.snapshot(); });
  ipcMain.handle('data:preview-import', async event => {
    trusted(event);
    const result = await dialog.showOpenDialog(window!, { title: '导入笔记备份', filters: [{ name: '笔记备份', extensions: ['json'] }], properties: ['openFile'] });
    pendingImport = null;
    if (result.canceled || !result.filePaths[0]) return null;
    const file = result.filePaths[0];
    if ((await stat(file)).size > 50 * 1024 * 1024) throw new Error('备份文件不能超过 50 MB');
    const data = validateData(JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')));
    const summary = mergeData(store.snapshot(), data);
    pendingImport = { token: randomUUID(), data };
    return { token: pendingImport.token, notes: summary.notes, folders: summary.folders, conflicts: summary.conflicts, skipped: summary.skipped };
  });
  ipcMain.handle('data:confirm-import', async (event, token: unknown) => {
    trusted(event);
    if (!pendingImport || token !== pendingImport.token) throw new Error('导入预览已过期，请重新选择文件');
    const incoming = pendingImport.data; pendingImport = null;
    await store.drain();
    const merged = mergeData(store.snapshot(), incoming);
    await store.backup(); await store.save(merged.data); loaded = store.snapshot();
    return loaded;
  });
  ipcMain.handle('data:export', async event => {
    trusted(event); await store.drain();
    const result = await dialog.showSaveDialog(window!, { title: '导出笔记备份', defaultPath: `马克笔记-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: '笔记备份', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    // No renderer-controlled arbitrary write path; the path comes from the OS dialog.
    const selected = path.resolve(result.filePath);
    if (selected.toLowerCase().startsWith(path.resolve(store.directory).toLowerCase() + path.sep)) throw new Error('请导出到应用数据目录以外的位置');
    await writeFile(selected, JSON.stringify(store.snapshot(), null, 2), 'utf8'); return true;
  });
  ipcMain.handle('app:external', async (event, value: unknown) => {
    trusted(event);
    if (typeof value !== 'string') throw new Error('链接无效');
    const url = new URL(value);
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error('不支持的链接协议');
    await shell.openExternal(url.href);
  });
  ipcMain.on('app:close-response', async (event, token: unknown, success: unknown) => {
    try { trusted(event); } catch { return; }
    if (!closeToken || token !== closeToken) return;
    closeToken = null;
    if (success !== true) return;
    await store.drain(); forceExit = true; window?.close();
  });
}
function installMenu() {
  const template: MenuItemConstructorOptions[] = [
    { label: '文件', submenu: [
      { label: '新建笔记', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
      { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
      { type: 'separator' }, { label: '导入备份…', click: () => send('import') }, { label: '导出备份…', click: () => send('export') },
      { type: 'separator' }, { label: '退出', accelerator: 'Alt+F4', click: () => window?.close() }
    ] },
    { label: '编辑', submenu: [ { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }, { type: 'separator' }, { label: '搜索笔记', accelerator: 'CmdOrCtrl+F', click: () => send('search') } ] },
    { label: '视图', submenu: [ { label: '切换主题', click: () => send('theme') }, { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { role: 'togglefullscreen', label: '全屏' }, ...(!app.isPackaged ? [{ role: 'toggleDevTools' as const, label: '开发者工具' }] : []) ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
async function createWindow() {
  let bounds: Electron.Rectangle | undefined;
  try {
    const raw = JSON.parse(await readFile(path.join(store.directory, 'window.json'), 'utf8'));
    if (['x', 'y', 'width', 'height'].every(key => Number.isFinite(raw[key])) && raw.width >= 520 && raw.height >= 450 && raw.width <= 10000 && raw.height <= 10000) {
      const display = screen.getDisplayMatching(raw).workArea;
      if (raw.x < display.x + display.width && raw.y < display.y + display.height && raw.x + raw.width > display.x && raw.y + raw.height > display.y) bounds = raw;
    }
  } catch { /* First launch or invalid saved bounds: center the window. */ }
  window = new BrowserWindow({
    width: 1180, height: 800, ...bounds, minWidth: 520, minHeight: 450, show: false, title: '马克笔记',
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(root, 'resources/icon.png'),
    webPreferences: { preload: path.join(here, '../preload/index.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  // On Windows fractional DPI, constructor dimensions can include different frame rounding.
  // Reapply the saved outer bounds through the same API used when resizing an existing window.
  if (bounds) window.setBounds(bounds);
  window.once('ready-to-show', () => window?.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('close', event => {
    persistBounds();
    if (!forceExit && rendererReady) {
      event.preventDefault();
      if (!closeToken) {
        closeToken = randomUUID();
        window!.webContents.send('app:close-request', closeToken);
        // An unresponsive renderer must never silently discard pending edits.
        setTimeout(() => { closeToken = null; }, 15000).unref();
      }
    }
  });
  window.on('closed', () => { window = null; });
  window.on('resize', persistBounds); window.on('move', persistBounds);
  if (devURL) await window.loadURL(devURL); else await window.loadFile(rendererFile);
}
function persistBounds() {
  if (window && !window.isDestroyed() && !window.isMinimized() && !window.isMaximized()) {
    try { writeFileSync(path.join(store.directory, 'window.json'), JSON.stringify(window.getBounds())); } catch { /* Bounds are optional; note persistence is handled separately. */ }
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.show(); window?.focus(); });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    try { loaded = await store.load(); }
    catch (error) {
      if (error instanceof RecoveryRequired && error.backup) {
        const result = await dialog.showMessageBox({ type: 'warning', title: '恢复笔记', message: '数据文件损坏或不可读。是否从最近有效备份恢复？', detail: '原文件将保留，不会自动清空笔记。', buttons: ['恢复备份', '退出'], defaultId: 0, cancelId: 1 });
        if (result.response !== 0) { app.quit(); return; }
        await store.recover(error.backup); loaded = store.snapshot();
      } else { dialog.showErrorBox('无法读取笔记', `${String(error)}\n数据位置：${store.directory}\n请保留该目录并检查文件或权限。`); app.quit(); return; }
    }
    registerIPC(); installMenu(); await createWindow();
  }).catch(error => { dialog.showErrorBox('启动失败', String(error)); forceExit = true; app.quit(); });
}
