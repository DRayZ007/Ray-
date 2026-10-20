import type { Folder, Note } from '../../shared/types';
import { formatRelativeDate, getDisplayTitle, getFolderPath, getSnippet } from '../../shared/domain';
import { Icon } from './Icon';
export function NoteList({ notes, folders, activeId, select, pin, query }: { notes: Note[]; folders: Folder[]; activeId: string | null; select(id: string): void; pin(id: string): void; query: string }) {
  return <>
    <div className="note-list" data-testid="note-list">{notes.map(note => <div key={note.id} className={`note-item ${activeId === note.id ? 'is-active' : ''}`} data-testid="note-item" data-id={note.id} role="button" tabIndex={0} aria-pressed={activeId === note.id} onClick={() => select(note.id)} onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); select(note.id); } }}>
      <div className="note-topline"><h3 className="note-title">{getDisplayTitle(note)}</h3>{note.pinned && <button className="icon-button small is-pinned" aria-label="取消置顶" onClick={event => { event.stopPropagation(); pin(note.id); }}><Icon name="pin" /></button>}</div>
      <p className="note-snippet">{getSnippet(note.content)}</p><div className="note-meta"><span>{note.folderId ? getFolderPath(folders, note.folderId).join(' / ') + ' · ' : ''}{formatRelativeDate(note.updatedAt)}</span></div>
    </div>)}</div>
    {notes.length === 0 && <div className="list-empty" data-testid="list-empty"><Icon name="note" className="large" /><p>{query ? '没有匹配的笔记' : '还没有笔记'}</p><span>{query ? '试试其他关键词' : '点击右上角加号开始记录'}</span></div>}
  </>;
}
