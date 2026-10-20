import { afterEach, describe, expect, test, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { DataStore, RecoveryRequired } from '../src/main/store';
import { emptyData } from '../src/shared/data';
import { createNote } from '../src/shared/domain';
vi.mock('node:fs/promises', async importOriginal => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return { ...real, rename: vi.fn(real.rename) };
});
const directories: string[] = [];
async function setup() {
  await mkdir(path.resolve('build/test-data'), { recursive: true });
  const directory = await mkdtemp(path.resolve('build/test-data/mark-notes-unit-')); directories.push(directory);
  const store = new DataStore(directory); await store.load(); return store;
}
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
describe('atomic persisted notebook', () => {
  test('serializes rapid saves and reloads the latest complete snapshot', async () => {
    const store = await setup();
    const saves = Array.from({ length: 8 }, (_, index) => store.save({ ...emptyData(), notes: [createNote({ id: 'n', content: String(index) })] }));
    await Promise.all(saves);
    expect((await new DataStore(store.directory).load()).notes[0].content).toBe('7');
    expect(JSON.parse(await readFile(store.file + '.bak', 'utf8')).notes[0].content).toBe('6');
  });
  test('a failed atomic replacement retains the primary and allows retry', async () => {
    const store = await setup(); await store.save(emptyData());
    vi.mocked(rename).mockRejectedValueOnce(new Error('disk denied'));
    const next = { ...emptyData(), notes: [createNote({ id: 'new' })] };
    await expect(store.save(next)).rejects.toThrow('disk denied');
    expect(JSON.parse(await readFile(store.file, 'utf8')).notes).toHaveLength(0);
    expect(store.snapshot().notes).toHaveLength(0);
    await store.save(next); expect((await new DataStore(store.directory).load()).notes).toHaveLength(1);
  });
  test('failed primary rename after backup retains old data and leaves save unacknowledged', async () => {
    const store = await setup(); await store.save(emptyData());
    const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(rename).mockImplementationOnce(real.rename).mockRejectedValueOnce(new Error('replace failed'));
    await expect(store.save({ ...emptyData(), notes: [createNote()] })).rejects.toThrow('replace failed');
    expect(JSON.parse(await readFile(store.file, 'utf8')).notes).toHaveLength(0);
    expect(JSON.parse(await readFile(store.file + '.bak', 'utf8')).notes).toHaveLength(0);
  });
  test('corruption requires explicit recovery and preserves the broken primary', async () => {
    const store = await setup(); const data = { ...emptyData(), notes: [createNote({ id: 'original' })] };
    await store.save(data); await store.save(data); await writeFile(store.file, '{broken');
    const reopened = new DataStore(store.directory);
    let recovery: RecoveryRequired | undefined;
    try { await reopened.load(); } catch (error) { recovery = error as RecoveryRequired; }
    expect(recovery).toBeInstanceOf(RecoveryRequired); expect(recovery!.backup).toEqual(data);
    await expect(reopened.save(emptyData())).rejects.toThrow('禁止覆盖');
    await reopened.recover(recovery!.backup!);
    expect((await new DataStore(store.directory).load()).notes[0].id).toBe('original');
    const corrupt = (await readdir(store.directory)).find(name => name.includes('.corrupt-'))!;
    expect(await readFile(path.join(store.directory, corrupt), 'utf8')).toBe('{broken');
  });
  test('corruption without backup never silently resets, import backup is separate', async () => {
    const store = await setup(); await store.save(emptyData()); await store.backup();
    expect((await readdir(store.directory)).some(f => f.startsWith('before-import-'))).toBe(true);
    await writeFile(store.file, 'broken'); await expect(new DataStore(store.directory).load()).rejects.toBeInstanceOf(RecoveryRequired);
    expect(await readFile(store.file, 'utf8')).toBe('broken');
  });
});
