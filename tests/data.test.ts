import { describe, expect, test } from 'vitest';
import { emptyData, mergeData, validateData } from '../src/shared/data';
import { createFolder, createNote, isDescendantFolder, moveFolderInList, removeFolderTree } from '../src/shared/domain';
describe('validated backups and lossless merging', () => {
  test('rejects invalid versions, duplicate IDs, orphan references and cycles', () => {
    expect(() => validateData({ ...emptyData(), version: 2 })).toThrow();
    expect(() => validateData({ ...emptyData(), notes: [createNote({ id: 'n' }), createNote({ id: 'n' })] })).toThrow('重复');
    expect(() => validateData({ ...emptyData(), notes: [createNote({ folderId: 'missing' })] })).toThrow('不存在');
    expect(() => validateData({ ...emptyData(), folders: [createFolder({ id: 'f', parentId: 'missing' })] })).toThrow('不存在');
    expect(() => validateData({ ...emptyData(), folders: [createFolder({ id: 'f', parentId: 'f' })] })).toThrow('循环');
    expect(() => validateData({ ...emptyData(), folders: [createFolder({ id: 'a', parentId: 'b' }), createFolder({ id: 'b', parentId: 'a' })] })).toThrow('循环');
    expect(() => validateData({ ...emptyData(), notes: [createNote({ updatedAt: Infinity })] })).toThrow();
  });
  test('keeps local settings and content, remaps nested folder conflicts, re-import is idempotent', () => {
    const current = { ...emptyData(), folders: [createFolder({ id: 'root', name: '本地', createdAt: 1 })], notes: [createNote({ id: 'note', content: '本地内容', folderId: 'root', now: 1 })] };
    const incoming = { ...emptyData(), folders: [createFolder({ id: 'child', parentId: 'root', name: '子目录', createdAt: 2 }), createFolder({ id: 'root', name: '导入', createdAt: 1 })], notes: [createNote({ id: 'note', content: '导入内容', folderId: 'child', now: 1 })], settings: { ...emptyData().settings, appTitle: '外部' } };
    const merged = mergeData(current, incoming);
    expect(merged.conflicts).toBe(2);
    expect(merged.data.notes[0].content).toBe('本地内容');
    expect(merged.data.notes).toHaveLength(2);
    const importedRoot = merged.data.folders.find(f => f.name === '导入')!;
    expect(importedRoot.id).not.toBe('root');
    const child = merged.data.folders.find(f => f.name === '子目录')!;
    expect(child.parentId).toBe(importedRoot.id);
    expect(merged.data.notes[1].folderId).toBe(child.id);
    expect(merged.data.settings.appTitle).toBe(current.settings.appTitle);
    const repeated = mergeData(merged.data, incoming);
    expect(repeated.notes).toBe(0); expect(repeated.folders).toBe(0); expect(repeated.conflicts).toBe(0);
    expect(repeated.data).toEqual(merged.data);
  });
  test('adopts settings on an empty client, skips identical data', () => {
    const incoming = { ...emptyData(), notes: [createNote({ id: 'n', now: 1 })], settings: { ...emptyData().settings, appTitle: '旧笔记', theme: 'dark' as const } };
    const first = mergeData(emptyData(), incoming);
    expect(first.data.settings.appTitle).toBe('旧笔记');
    expect(mergeData(first.data, incoming).skipped).toBe(1);
  });
  test('deleting a subtree relocates notes to its parent and preserves edit timestamps', () => {
    const data = { ...emptyData(), folders: [createFolder({ id: 'parent' }), createFolder({ id: 'child', parentId: 'parent' }), createFolder({ id: 'leaf', parentId: 'child' })], notes: [createNote({ id: 'n', folderId: 'leaf', now: 10 })] };
    const removed = removeFolderTree(data, 'child');
    expect(removed.folders.map(f => f.id)).toEqual(['parent']);
    expect(removed.notes[0].folderId).toBe('parent'); expect(removed.notes[0].updatedAt).toBe(10);
    expect(removeFolderTree(removed, 'parent').notes[0].folderId).toBeNull();
  });
  test('blocks unknown parents and remains safe on corrupt cycles', () => {
    const folders = [createFolder({ id: 'a', parentId: 'b' }), createFolder({ id: 'b', parentId: 'a' })];
    expect(isDescendantFolder(folders, 'a', 'unknown')).toBe(false);
    expect(moveFolderInList(folders, 'a', 'missing')).toEqual(folders);
  });
});
