import { createRoot } from 'react-dom/client';
import { App } from '../renderer/src/App';
import '../renderer/src/styles.css';
import { emptyData, mergeData, validateData } from '../shared/data';
import { noteExport } from '../shared/export';
import type { AppData, DesktopAPI } from '../shared/types';

// This adapter is only bundled into the standalone presentation HTML, never the desktop app.
const storageKey = 'mark-notes:standalone-preview:v1';
function demonstration(): AppData {
  const now = Date.now();
  return {
    ...emptyData(), settings: { ...emptyData().settings, theme: 'light' },
    folders: [{ id: 'preview-work', name: '工作', createdAt: now, parentId: null }],
    notes: [{
      id: 'preview-note', title: '本周计划', createdAt: now, updatedAt: now, pinned: true, folderId: 'preview-work',
      content: '# 把想法，慢慢写下来\n\n记录重要的事，也留住一闪而过的灵感。\n\n## 今天要做的事\n\n- 整理项目笔记与会议记录\n- 完成桌面客户端功能验收\n- 留一点时间阅读和思考\n\n> 好的记录，让下一步更清晰。\n\n**所有内容自动保存在本机。**'
    }]
  };
}
let current = demonstration();
let pending: { token: string; data: AppData } | null = null;
function download(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const api: DesktopAPI = {
  environment: 'browser',
  async load() {
    const raw = localStorage.getItem(storageKey);
    if (raw) current = validateData(JSON.parse(raw));
    return structuredClone(current);
  },
  async save(value) {
    const validated = validateData(value);
    localStorage.setItem(storageKey, JSON.stringify(validated)); current = validated;
  },
  async previewImport() {
    const file = await new Promise<File | null>(resolve => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
      const finish = (value: File | null) => { input.remove(); resolve(value); };
      input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
      input.addEventListener('cancel', () => finish(null), { once: true });
      document.body.append(input); input.click();
    });
    pending = null;
    if (!file) return null;
    if (file.size > 50 * 1024 * 1024) throw new Error('备份文件不能超过 50 MB');
    const data = validateData(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
    const summary = mergeData(current, data);
    pending = { token: crypto.randomUUID(), data };
    return { token: pending.token, notes: summary.notes, folders: summary.folders, conflicts: summary.conflicts, skipped: summary.skipped };
  },
  async confirmImport(token) {
    if (!pending || token !== pending.token) throw new Error('请重新选择导入文件');
    const merged = mergeData(current, pending.data).data;
    localStorage.setItem(storageKey + ':before-import', JSON.stringify(current));
    await api.save(merged); pending = null; return structuredClone(merged);
  },
  async exportData() { download(JSON.stringify(current, null, 2), '马克笔记-预览备份.json', 'application/json'); return true; },
  async exportNote(noteId, format) {
    const note = current.notes.find(item => item.id === noteId);
    if (!note) throw new Error('请重新选择要导出的笔记');
    const exported = noteExport(note, format);
    download(exported.content, exported.filename, exported.mime); return true;
  },
  async openExternal(value) {
    const url = new URL(value);
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error('不支持的链接协议');
    window.open(url.href, '_blank', 'noopener,noreferrer');
  },
  onCommand: () => () => {},
  onCloseRequested: () => () => {}
};
window.desktop = api;
createRoot(document.getElementById('root')!).render(<App />);
