import { mkdir, open, readFile, rename, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { emptyData, validateData } from '../shared/data';
import type { AppData } from '../shared/types';

export class RecoveryRequired extends Error {
  constructor(public readonly backup: AppData | null) { super('数据文件损坏或无法读取；原文件已保留。'); }
}
export class DataStore {
  readonly file: string;
  private queue: Promise<void> = Promise.resolve();
  private writable = false;
  private current = emptyData();
  constructor(readonly directory: string) { this.file = path.join(directory, 'notes.json'); }
  async load(): Promise<AppData> {
    await mkdir(this.directory, { recursive: true });
    try {
      this.current = validateData(JSON.parse(await readFile(this.file, 'utf8')));
      this.writable = true;
      return structuredClone(this.current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // An existing backup without a primary file is also a recovery situation.
        try { const backup = validateData(JSON.parse(await readFile(this.file + '.bak', 'utf8'))); throw new RecoveryRequired(backup); }
        catch (backupError) {
          if (backupError instanceof RecoveryRequired) throw backupError;
          if ((backupError as NodeJS.ErrnoException).code !== 'ENOENT') throw new RecoveryRequired(null);
        }
        this.writable = true; return structuredClone(this.current);
      }
      let backup: AppData | null = null;
      try { backup = validateData(JSON.parse(await readFile(this.file + '.bak', 'utf8'))); } catch { /* Preserve both originals. */ }
      throw new RecoveryRequired(backup);
    }
  }
  snapshot(): AppData { return structuredClone(this.current); }
  async recover(backup: AppData): Promise<void> {
    // Keep a separate copy of the broken primary, including when restoration fails.
    try { await copyFile(this.file, this.file + `.corrupt-${Date.now()}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await this.atomicWrite(this.file, JSON.stringify(validateData(backup), null, 2));
    this.current = structuredClone(backup); this.writable = true;
  }
  save(value: unknown): Promise<void> {
    const data = validateData(value);
    const operation = this.queue.then(async () => {
      if (!this.writable) throw new Error('数据尚未成功加载，禁止覆盖原文件');
      try {
        const previous = validateData(JSON.parse(await readFile(this.file, 'utf8')));
        await this.atomicWrite(this.file + '.bak', JSON.stringify(previous, null, 2));
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await this.atomicWrite(this.file, JSON.stringify(data, null, 2));
      this.current = structuredClone(data);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async backup(): Promise<void> {
    await this.queue;
    if (!this.writable) throw new Error('数据尚未成功加载');
    await this.atomicWrite(path.join(this.directory, `before-import-${Date.now()}.json`), JSON.stringify(this.current, null, 2));
  }
  async drain(): Promise<void> { await this.queue; }
  private async atomicWrite(file: string, content: string): Promise<void> {
    const temporary = file + '.tmp';
    const handle = await open(temporary, 'w');
    try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, file);
  }
}
