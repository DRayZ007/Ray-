import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI, MenuCommand } from '../shared/types';
const api: DesktopAPI = {
  load: () => ipcRenderer.invoke('data:load'),
  save: data => ipcRenderer.invoke('data:save', data),
  previewImport: () => ipcRenderer.invoke('data:preview-import'),
  confirmImport: token => ipcRenderer.invoke('data:confirm-import', token),
  exportData: () => ipcRenderer.invoke('data:export'),
  openExternal: url => ipcRenderer.invoke('app:external', url),
  onCommand(callback) {
    const listener = (_event: Electron.IpcRendererEvent, command: MenuCommand) => callback(command);
    ipcRenderer.on('app:command', listener);
    return () => { ipcRenderer.removeListener('app:command', listener); };
  },
  onCloseRequested(callback) {
    const listener = async (_event: Electron.IpcRendererEvent, token: string) => {
      try { ipcRenderer.send('app:close-response', token, await callback()); }
      catch { ipcRenderer.send('app:close-response', token, false); }
    };
    ipcRenderer.on('app:close-request', listener);
    return () => { ipcRenderer.removeListener('app:close-request', listener); };
  }
};
contextBridge.exposeInMainWorld('desktop', api);
