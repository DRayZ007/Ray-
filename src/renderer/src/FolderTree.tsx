import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import type { AppData, Folder } from '../../shared/types';
import { getChildFolders, isDescendantFolder, notesForFolder } from '../../shared/domain';
import { Icon } from './Icon';
interface Props {
  data: AppData; selected: string; select(id: string): void;
  move(id: string, parent: string | null): void; rename(id: string, name: string): void;
  moveNote(id: string, folderId: string | null): void;
  context(folder: Folder, x: number, y: number): void;
}
export function FolderTree({ data, selected, select, move, rename, context, moveNote }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    setCollapsed(previous => {
      const next = new Set([...previous].filter(id => id === selected || !isDescendantFolder(data.folders, selected, id)));
      return next.size === previous.size ? previous : next;
    });
  }, [selected, data.folders]);
  function drop(event: DragEvent, parent: string | null, target: string) {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.classList.remove('is-drop-target');
    const noteId = event.dataTransfer.getData('application/x-marknotes-note');
    if (noteId) { if (target !== 'all') moveNote(noteId, parent); return; }
    const id = event.dataTransfer.getData('application/x-marknotes-folder');
    if (id && target !== 'none') move(id, parent);
  }
  function finishRename() { if (editing) { rename(editing.id, editing.name); setEditing(null); } }
  function row(id: string, label: string, folder?: Folder, depth = 0) {
    const children = folder ? getChildFolders(data.folders, id) : [];
    return <div key={id}>
      <div className={`folder-item ${selected === id ? 'is-active' : ''}`} data-folder-id={id} data-testid="folder-item"
        style={{ paddingLeft: 10 + depth * 18 }} draggable={!!folder}
        onDragStart={event => { event.dataTransfer.setData('application/x-marknotes-folder', id); event.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={event => {
          const isNote = event.dataTransfer.types.includes('application/x-marknotes-note');
          const isFolder = event.dataTransfer.types.includes('application/x-marknotes-folder');
          if ((!isNote && !isFolder) || (isNote && id === 'all') || (isFolder && id === 'none')) return;
          const source = data.folders.find(f => f.id === event.dataTransfer.getData('application/x-marknotes-folder'));
          if (isFolder && source && isDescendantFolder(data.folders, id, source.id)) return;
          event.preventDefault(); event.dataTransfer.dropEffect = 'move'; event.currentTarget.classList.add('is-drop-target');
        }} onDragLeave={event => event.currentTarget.classList.remove('is-drop-target')} onDrop={event => drop(event, folder?.id ?? null, id)}
        onContextMenu={event => { if (folder) { event.preventDefault(); context(folder, event.clientX, event.clientY); } }}>
        {children.length > 0 ? <button className={`folder-toggle ${collapsed.has(id) ? '' : 'is-expanded'}`} aria-label={`${collapsed.has(id) ? '展开' : '折叠'}${label}`} aria-expanded={!collapsed.has(id)} onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; })}><Icon name="chevron" /></button> : <span className="folder-toggle-spacer" />}
        {editing?.id === id ? <input className="folder-rename-input" aria-label="重命名文件夹" autoFocus value={editing.name} onChange={event => setEditing({ id, name: event.target.value })} onBlur={finishRename} onKeyDown={event => { if (event.key === 'Enter') finishRename(); if (event.key === 'Escape') setEditing(null); }} /> :
          <button type="button" className="folder-main" onClick={() => select(id)} onDoubleClick={() => { if (folder) setEditing({ id, name: folder.name }); }} onKeyDown={event => { if (folder && event.key === 'F2') setEditing({ id, name: folder.name }); }}>
            <Icon name="folder" /><span className="folder-name">{label}</span><span className="folder-count">{notesForFolder(data, id).length}</span>
          </button>}
      </div>
      {folder && !collapsed.has(id) && children.map(child => row(child.id, child.name, child, depth + 1))}
    </div>;
  }
  return <div className="folder-list" data-testid="folder-list">{row('all', '全部笔记')}{row('none', '未分类')}{getChildFolders(data.folders, null).map(folder => row(folder.id, folder.name, folder))}</div>;
}
