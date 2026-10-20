export interface Note {
  id: string; title: string; content: string; createdAt: number; updatedAt: number;
  pinned: boolean; folderId: string | null;
}
export interface Folder { id: string; name: string; createdAt: number; parentId: string | null }
export interface Settings {
  appTitle: string; theme: 'light' | 'dark' | 'system'; sidebarWidth: number; stackHeight: number;
}
export interface AppData { version: 1; notes: Note[]; folders: Folder[]; settings: Settings }
export type MenuCommand = 'new' | 'save' | 'search' | 'import' | 'export' | 'theme';
export interface ImportPreview { token: string; notes: number; folders: number; conflicts: number; skipped: number }
export interface DesktopAPI {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  previewImport(): Promise<ImportPreview | null>;
  confirmImport(token: string): Promise<AppData>;
  exportData(): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  onCommand(callback: (command: MenuCommand) => void): () => void;
  onCloseRequested(callback: () => Promise<boolean>): () => void;
}
