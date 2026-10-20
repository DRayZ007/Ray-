import { expect, test } from 'vitest';
import { emptyData, validateData } from '../src/shared/data';
import { createFolder, createNote, moveNoteToFolder, noteSortForView, notesForFolder, noteViewKey, reorderNotes, sortNotes } from '../src/shared/domain';
function fixture() {
  return { ...emptyData(), folders: [createFolder({ id: 'work' }), createFolder({ id: 'life' })], notes: [
    createNote({ id: 'a', folderId: 'work', createdAt: 1, updatedAt: 30 }),
    createNote({ id: 'b', folderId: 'work', createdAt: 2, updatedAt: 20 }),
    createNote({ id: 'c', folderId: 'work', createdAt: 3, updatedAt: 10 }),
    createNote({ id: 'other', folderId: 'life', createdAt: 4 })
  ] };
}
function order(data: ReturnType<typeof emptyData>, selected: string) {
  return sortNotes(notesForFolder(data, selected), noteSortForView(data, selected), data.settings.noteOrders?.[noteViewKey(selected)]).map(note => note.id);
}
test('legacy notebooks default to newest creation first, independent of edit times', () => {
  expect(noteSortForView(validateData(fixture()), 'work')).toBe('created');
  expect(order(fixture(), 'work')).toEqual(['c', 'b', 'a']);
});
test('reordering persists per view without changing creation or edit timestamps', () => {
  const original = fixture();
  const reordered = reorderNotes(original, 'work', 'a', 'c', true);
  expect(order(reordered, 'work')).toEqual(['a', 'c', 'b']);
  expect(order(reordered, 'all')).toEqual(['other', 'c', 'b', 'a']);
  expect(reordered.notes).toEqual(original.notes);
  expect(order(validateData(JSON.parse(JSON.stringify(reordered))), 'work')).toEqual(['a', 'c', 'b']);
  const after = reorderNotes(reordered, 'work', 'a', 'b', false);
  expect(order(after, 'work')).toEqual(['c', 'b', 'a']);
});
test('reordering retains notes hidden by search and rejects foreign or pinned boundaries', () => {
  const data = fixture();
  expect(order(reorderNotes(data, 'work', 'a', 'c', true), 'work')).toContain('b');
  expect(reorderNotes(data, 'work', 'other', 'a', true)).toBe(data);
  expect(reorderNotes(data, 'work', 'a', 'a', false)).toBe(data);
  data.notes[0].pinned = true;
  expect(reorderNotes(data, 'work', 'a', 'b', true)).toBe(data);
  expect(order(data, 'work')[0]).toBe('a');
});
test('cross-folder movement retains content and timestamps and cleans the old manual order', () => {
  const data = reorderNotes(fixture(), 'work', 'a', 'c', true);
  const moved = moveNoteToFolder(data, 'a', 'life');
  expect(order(moved, 'work')).toEqual(['c', 'b']);
  expect(moved.settings.noteOrders!['folder:work']).toEqual(['c', 'b']);
  expect(moved.notes.find(note => note.id === 'a')).toEqual({ ...data.notes[0], folderId: 'life' });
  expect(order(moved, 'life')).toContain('a');
  expect(moveNoteToFolder(moved, 'a', 'life')).toBe(moved);
  expect(moveNoteToFolder(moved, 'a', 'missing')).toBe(moved);
  expect(moveNoteToFolder(moved, 'a', null).notes.find(note => note.id === 'a')!.folderId).toBeNull();
});
