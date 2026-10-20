import { useRef } from 'react';
import type { Folder, Note } from '../../shared/types';
import { formatRelativeDate, getFolderPath, getWordCount, parseMarkdown, sortFolders } from '../../shared/domain';
import { Icon } from './Icon';
export function Editor({ note, folders, mode, setMode, update, status, save, pin, remove }: {
  note?: Note; folders: Folder[]; mode: 'edit' | 'preview'; setMode(mode: 'edit' | 'preview'): void;
  update(patch: Partial<Note>, touch?: boolean): void; status: string; save(): void; pin(): void; remove(): void;
}) {
  const composing = useRef(false);
  if (!note) return <main className="editor-pane"><div className="editor-empty" data-testid="editor-empty"><Icon name="note" className="xlarge" /><h2>选择一条笔记开始编辑</h2><p>你的内容会自动保存在本机</p></div></main>;
  return <main className="editor-pane"><section className="editor-content" data-testid="editor">
    <header className="editor-header">
      <input className="title-input" aria-label="笔记标题" data-testid="title-input" placeholder="无标题笔记" value={note.title} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onChange={event => update({ title: event.target.value })} onBlur={() => { if (!composing.current && !note.title.trim()) update({ title: '无标题笔记' }); }} />
      <div className="editor-actions"><div className="view-toggle" role="group" aria-label="编辑视图"><button className={`view-button ${mode === 'edit' ? 'is-active' : ''}`} data-testid="edit-mode" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>编辑</button><button className={`view-button ${mode === 'preview' ? 'is-active' : ''}`} data-testid="preview-mode" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>预览</button></div>
        <span className="save-status" data-testid="save-status" aria-live="polite">{status}</span>
        <button className="icon-button labeled-button" aria-label="保存笔记" data-testid="save-button" onClick={save}><Icon name="save" /><span>保存</span></button>
        <button className={`icon-button labeled-button ${note.pinned ? 'is-pinned' : ''}`} aria-label={note.pinned ? '取消置顶笔记' : '置顶笔记'} data-testid="pin-button" onClick={pin}><Icon name="pin" /><span>{note.pinned ? '已置顶' : '置顶'}</span></button>
        <button className="icon-button danger" aria-label="删除笔记" data-testid="delete-button" onClick={remove}><Icon name="trash" /></button>
      </div>
    </header>
    <textarea className="content-input" aria-label="笔记内容" data-testid="content-input" hidden={mode !== 'edit'} placeholder="开始写下你的想法..." value={note.content} onChange={event => update({ content: event.target.value })} />
    <article className="markdown-preview" aria-label="Markdown 预览" data-testid="markdown-preview" hidden={mode !== 'preview'} dangerouslySetInnerHTML={{ __html: parseMarkdown(note.content) }} onClick={event => {
      const anchor = (event.target as Element).closest('a');
      if (!anchor) return;
      event.preventDefault(); const href = anchor.getAttribute('href');
      if (href && !href.startsWith('#')) void window.desktop.openExternal(href).catch(() => {});
    }} />
    <footer className="editor-footer"><span className="meta" data-testid="word-count">{getWordCount(note.content)} 字</span><label className="folder-picker"><span>文件夹</span><select className="folder-select" aria-label="笔记文件夹" data-testid="folder-select" value={note.folderId ?? ''} onChange={event => update({ folderId: event.target.value || null }, false)}><option value="">未分类</option>{sortFolders(folders).map(folder => <option key={folder.id} value={folder.id}>{getFolderPath(folders, folder.id).join(' / ')}</option>)}</select></label><span className="meta" data-testid="updated-at">{formatRelativeDate(note.updatedAt)}</span></footer>
  </section></main>;
}
