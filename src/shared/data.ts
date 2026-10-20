import { z } from 'zod';
import type { AppData, Folder, Note } from './types';

const id = z.string().min(1).max(512);
const timestamp = z.number().finite().nonnegative();
const folderSchema = z.object({ id, name: z.string().trim().min(1), createdAt: timestamp, parentId: id.nullable() });
const noteSchema = z.object({ id, title: z.string(), content: z.string(), createdAt: timestamp, updatedAt: timestamp, pinned: z.boolean(), folderId: id.nullable() });
const settingsSchema = z.object({
  appTitle: z.string().max(200).transform(value => value.trim() || 'Ray的笔记'), theme: z.enum(['light', 'dark', 'system']),
  sidebarWidth: z.number().min(240).max(640), stackHeight: z.number().min(150).max(1200),
  noteOrders: z.record(z.string(), z.array(id)).optional(),
  noteSorts: z.record(z.string(), z.enum(['created', 'updated', 'title', 'manual'])).optional()
});
const dataSchema = z.object({ version: z.literal(1), notes: z.array(noteSchema), folders: z.array(folderSchema), settings: settingsSchema });
export function emptyData(): AppData {
  return { version: 1, notes: [], folders: [], settings: { appTitle: 'Ray的笔记', theme: 'system', sidebarWidth: 340, stackHeight: 340 } };
}
export function validateData(value: unknown): AppData {
  const result = dataSchema.safeParse(value);
  if (!result.success) throw new Error('数据格式无效：' + result.error.issues[0]?.message);
  const data = result.data;
  const folders = new Map(data.folders.map(f => [f.id, f]));
  if (folders.size !== data.folders.length || new Set(data.notes.map(n => n.id)).size !== data.notes.length) throw new Error('数据包含重复标识');
  for (const folder of data.folders) {
    const visited = new Set<string>();
    let current: Folder | undefined = folder;
    while (current) {
      if (visited.has(current.id)) throw new Error('文件夹存在循环层级');
      visited.add(current.id);
      if (current.parentId && !folders.has(current.parentId)) throw new Error('文件夹引用不存在的上级');
      current = current.parentId ? folders.get(current.parentId) : undefined;
    }
  }
  if (data.notes.some(n => n.folderId && !folders.has(n.folderId))) throw new Error('笔记引用不存在的文件夹');
  return data;
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
// Stable content-derived IDs make repeated imports idempotent, including conflicts.
function fingerprint(value: unknown): string {
  let a = 2166136261, b = 5381;
  for (const char of JSON.stringify(value)) { a = Math.imul(a ^ char.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ char.charCodeAt(0); }
  return (a >>> 0).toString(16) + (b >>> 0).toString(16);
}
export function mergeData(current: AppData, incoming: AppData) {
  current = validateData(current); incoming = validateData(incoming);
  const notes = current.notes.slice(), folders = current.folders.slice();
  const folderMap = new Map<string, string>();
  let conflicts = 0, skipped = 0, addedNotes = 0, addedFolders = 0;
  function resolve<T extends Note | Folder>(item: T, list: T[]): T | null {
    const existing = list.find(x => x.id === item.id);
    if (!existing) return item;
    if (same(existing, item)) { skipped++; return null; }
    const base = `${item.id}-import-${fingerprint(item)}`;
    let candidate = base, suffix = 0;
    for (;;) {
      const collision = list.find(x => x.id === candidate);
      if (!collision) { conflicts++; return { ...item, id: candidate }; }
      if (same(collision, { ...item, id: candidate })) { skipped++; return null; }
      candidate = `${base}-${++suffix}`;
    }
  }
  function addFolder(folder: Folder): string {
    const mapped = folderMap.get(folder.id);
    if (mapped) return mapped;
    const parentId = folder.parentId ? addFolder(incoming.folders.find(f => f.id === folder.parentId)!) : null;
    const item = { ...folder, parentId };
    const resolved = resolve(item, folders);
    // A skipped conflict has an existing deterministic ID, rather than the original ID.
    const existing = folders.find(f => same(f, { ...item, id: f.id }) && (f.id === item.id || f.id.startsWith(`${item.id}-import-${fingerprint(item)}`)));
    const targetId = resolved?.id ?? existing!.id;
    if (resolved) { folders.push(resolved); addedFolders++; }
    folderMap.set(folder.id, targetId);
    return targetId;
  }
  incoming.folders.forEach(addFolder);
  for (const note of incoming.notes) {
    const item = { ...note, folderId: note.folderId ? folderMap.get(note.folderId)! : null };
    const resolved = resolve(item, notes);
    if (resolved) { notes.push(resolved); addedNotes++; }
  }
  const settings = current.notes.length === 0 && current.folders.length === 0 ? incoming.settings : current.settings;
  return { data: validateData({ version: 1, notes, folders, settings }), conflicts, skipped, notes: addedNotes, folders: addedFolders };
}
