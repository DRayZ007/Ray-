export interface Note {
  id: string; title: string; content: string; createdAt: number; updatedAt: number;
  pinned: boolean; folderId: string | null;
}
export interface Folder { id: string; name: string; createdAt: number; parentId: string | null }
export interface Settings {
  appTitle: string; theme: 'light' | 'dark' | 'system'; sidebarWidth: number; stackHeight: number;
  noteOrders?: Record<string, string[]>;
  noteSorts?: Record<string, NoteSortMode>;
}
export type NoteSortMode = 'created' | 'updated' | 'title' | 'manual';
export interface AppData { version: 1; notes: Note[]; folders: Folder[]; settings: Settings }
export type NoteExportFormat = 'markdown' | 'txt';
export type MenuCommand = 'new' | 'save' | 'search' | 'import' | 'export' | 'theme';
export interface ImportPreview { token: string; notes: number; folders: number; conflicts: number; skipped: number }
export interface DesktopAPI {
  environment: 'desktop' | 'browser';
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  saveBeforeUnload?(data: AppData): void;
  previewImport(): Promise<ImportPreview | null>;
  confirmImport(token: string): Promise<AppData>;
  exportData(): Promise<boolean>;
  exportNote(noteId: string, format: NoteExportFormat): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  onCommand(callback: (command: MenuCommand) => void): () => void;
  onCloseRequested(callback: () => Promise<boolean>): () => void;
}
