import type { AppData, Folder, Note } from './types';
export { parseMarkdown } from './markdown';
export const STORAGE_KEY = 'mark-notes:v1';
export const FOLDERS_KEY = 'mark-notes:folders:v1';
export type SortMode = 'updated' | 'created' | 'title';
const collator = new Intl.Collator('zh-CN', { sensitivity: 'base', numeric: true });
const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export function createNote(overrides: Partial<Note> & { now?: number } = {}): Note {
  const now = overrides.now ?? Date.now();
  return { id: overrides.id ?? createId('note'), title: overrides.title || '无标题笔记', content: overrides.content ?? '', createdAt: overrides.createdAt ?? now, updatedAt: overrides.updatedAt ?? now, pinned: !!overrides.pinned, folderId: overrides.folderId ?? null };
}
export function updateNote(note: Note, patch: Partial<Note>, options: { touch?: boolean } = {}): Note {
  return { ...note, ...patch, id: note.id, createdAt: note.createdAt, updatedAt: options.touch === false ? note.updatedAt : patch.updatedAt ?? Date.now() };
}
export function createFolder(overrides: Partial<Folder> & { now?: number } = {}): Folder {
  return { id: overrides.id ?? createId('folder'), name: overrides.name?.trim() || '未命名文件夹', createdAt: overrides.createdAt ?? overrides.now ?? Date.now(), parentId: overrides.parentId ?? null };
}
export function updateFolder(folder: Folder, patch: Partial<Folder>): Folder {
  return { ...folder, ...patch, id: folder.id, createdAt: folder.createdAt, name: patch.name?.trim() || folder.name };
}
export const deleteNote = (notes: Note[], id: string) => notes.filter(n => n.id !== id);
export const deleteFolder = (folders: Folder[], id: string) => folders.filter(f => f.id !== id);
export const sortFolders = (folders: Folder[]) => folders.slice().sort((a, b) => a.createdAt - b.createdAt);
export const getChildFolders = (folders: Folder[], parentId: string | null) => sortFolders(folders).filter(f => f.parentId === parentId);
export function isDescendantFolder(folders: Folder[], folderId: string | null, ancestorId: string): boolean {
  const visited = new Set<string>();
  while (folderId) {
    if (folderId === ancestorId) return true;
    if (visited.has(folderId)) return false;
    visited.add(folderId); folderId = folders.find(f => f.id === folderId)?.parentId ?? null;
  }
  return false;
}
export function getFolderPath(folders: Folder[], folderId: string | null): string[] {
  const names: string[] = [], seen = new Set<string>();
  while (folderId && !seen.has(folderId)) {
    seen.add(folderId);
    const folder = folders.find(f => f.id === folderId);
    if (!folder) break;
    names.unshift(folder.name); folderId = folder.parentId;
  }
  return names;
}
export function moveFolderInList(folders: Folder[], folderId: string, parentId: string | null): Folder[] {
  if (!folders.some(f => f.id === folderId) || (parentId && (!folders.some(f => f.id === parentId) || isDescendantFolder(folders, parentId, folderId)))) return folders;
  return folders.map(f => f.id === folderId ? { ...f, parentId } : f);
}
export function removeFolderTree(data: AppData, id: string): AppData {
  const folder = data.folders.find(f => f.id === id);
  if (!folder) return data;
  const removed = new Set(data.folders.filter(f => isDescendantFolder(data.folders, f.id, id)).map(f => f.id));
  return { ...data, folders: data.folders.filter(f => !removed.has(f.id)), notes: data.notes.map(n => n.folderId && removed.has(n.folderId) ? { ...n, folderId: folder.parentId } : n) };
}
export function sortNotes(notes: Note[], mode: SortMode): Note[] {
  return notes.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || (mode === 'title' ? collator.compare(a.title, b.title) : mode === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt));
}
export function filterNotes(notes: Note[], query: string): Note[] {
  const needle = query.trim().toLowerCase();
  return notes.filter(n => n.title.toLowerCase().includes(needle) || n.content.toLowerCase().includes(needle));
}
export function notesForFolder(data: AppData, selected: string): Note[] {
  return data.notes.filter(n => selected === 'all' || (selected === 'none' ? !n.folderId : isDescendantFolder(data.folders, n.folderId, selected)));
}
export const getDisplayTitle = (note: Note) => note.title.trim() || '无标题笔记';
export function getSnippet(content: string, maxLength = 120): string {
  const text = content.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text || '暂无内容';
}
export function getWordCount(text: string): number {
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) ?? [];
  return cjk.length + (text.replace(/[\u3400-\u4dbf\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length;
}
export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
export function formatRelativeDate(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp), minutes = Math.floor(diff / 60000);
  return minutes < 1 ? '刚刚' : minutes < 60 ? `${minutes} 分钟前` : diff < 86400000 ? `${Math.floor(minutes / 60)} 小时前` : formatDate(timestamp);
}
export function createMemoryStorage() {
  const store = new Map<string, string>();
  return { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, String(value)); }, removeItem: (key: string) => { store.delete(key); }, clear: () => store.clear() };
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export const serializeNotes = (notes: Note[]) => JSON.stringify(notes);
export const serializeFolders = (folders: Folder[]) => JSON.stringify(folders);
export function deserializeNotes(raw: string | null): Note[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((n): n is Note => !!n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.content === 'string').map(n => ({ ...n, folderId: n.folderId ?? null })) : [];
  } catch { return []; }
}
export function deserializeFolders(raw: string | null): Folder[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((f): f is Folder => !!f && typeof f.id === 'string' && typeof f.name === 'string') : [];
  } catch { return []; }
}
export const loadNotes = (storage: StorageLike) => deserializeNotes(storage.getItem(STORAGE_KEY));
export const saveNotes = (storage: StorageLike, notes: Note[]) => storage.setItem(STORAGE_KEY, serializeNotes(notes));
export const loadFolders = (storage: StorageLike) => deserializeFolders(storage.getItem(FOLDERS_KEY));
export const saveFolders = (storage: StorageLike, folders: Folder[]) => storage.setItem(FOLDERS_KEY, serializeFolders(folders));
