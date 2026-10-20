import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, PointerEvent } from 'react';
import type { Folder, ImportPreview, MenuCommand, Note, NoteExportFormat } from '../../shared/types';
import { createFolder, createNote, deleteNote, filterNotes, getFolderPath, isDescendantFolder, moveFolderInList, notesForFolder, removeFolderTree, sortNotes, updateNote } from '../../shared/domain';
import type { SortMode } from '../../shared/domain';
import { useNotebook } from './useNotebook';
import { Icon } from './Icon';
import { FolderTree } from './FolderTree';
import { NoteList } from './NoteList';
import { Editor } from './Editor';
import { Modal } from './Modal';
import { BrowserMenu } from './BrowserMenu';
import logo from '../../../resources/icon.svg';

export function App() {
  const { data, ready, error, setError, status, change, replaceSaved, flush, current } = useNotebook();
  const [active, setActive] = useState<string | null>(null), [selected, setSelected] = useState('all');
  const [query, setQuery] = useState(''), [sort, setSort] = useState<SortMode>('updated'), [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [newFolderParent, setNewFolderParent] = useState<string | null | undefined>(undefined), [folderName, setFolderName] = useState('');
  const [context, setContext] = useState<{ folder: Folder; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; parentId: string | null } | null>(null);
  const [deleting, setDeleting] = useState<{ type: 'note' | 'folder'; id: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [exportFailure, setExportFailure] = useState<{ message: string; format: NoteExportFormat | 'backup'; noteId: string | null } | null>(null);
  const locked = useRef(false), search = useRef<HTMLInputElement>(null), initialSelection = useRef(false);
  const notebook = useRef({ flush }); notebook.current = { flush };
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const theme = data.settings.theme === 'system' ? systemDark ? 'dark' : 'light' : data.settings.theme;
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const listener = () => setSystemDark(media?.matches ?? false);
    media?.addEventListener('change', listener); return () => media?.removeEventListener('change', listener);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; document.title = data.settings.appTitle; }, [theme, data.settings.appTitle]);
  useEffect(() => {
    if (ready && !initialSelection.current) { initialSelection.current = true; setActive(data.notes[0]?.id ?? null); }
  }, [ready, data.notes]);
  const update = useCallback((patch: Partial<Note>, touch = true) => {
    if (!active || locked.current) return;
    change(value => ({ ...value, notes: value.notes.map(note => note.id === active ? updateNote(note, patch, { touch }) : note) }));
  }, [active, change]);
  function pin(id: string) { change(value => ({ ...value, notes: value.notes.map(note => note.id === id ? updateNote(note, { pinned: !note.pinned }, { touch: false }) : note) })); }
  function newNote() {
    const note = createNote({ folderId: selected === 'all' || selected === 'none' ? null : selected });
    change(value => ({ ...value, notes: [note, ...value.notes] })); setActive(note.id); setQuery(''); setMode('edit');
    requestAnimationFrame(() => { const title = document.querySelector<HTMLInputElement>('[data-testid="title-input"]'); title?.focus(); title?.select(); });
  }
  function toggleTheme() { change(value => ({ ...value, settings: { ...value.settings, theme: theme === 'dark' ? 'light' : 'dark' } })); }
  async function exclusive(action: () => Promise<void>, onError: (reason: unknown) => void = reason => setError(String(reason))) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setNotice('');
    try { await action(); } catch (reason) { onError(reason); }
    finally { locked.current = false; setBusy(false); }
  }
  async function beginImport() {
    await exclusive(async () => { await flush(); const result = await window.desktop.previewImport(); setPreview(result); });
  }
  async function exportData(format: NoteExportFormat | 'backup', noteId: string | null = active) {
    if (format !== 'backup' && !noteId) { setNotice('请先选择一条笔记，再导出'); return; }
    setExportFailure(null);
    let saved = false;
    await exclusive(async () => {
      await flush(); saved = true;
      const success = format === 'backup' ? await window.desktop.exportData() : await window.desktop.exportNote(noteId!, format);
      if (success) setNotice(format === 'backup' ? 'JSON 完整备份已导出' : format === 'markdown' ? 'Markdown 笔记已导出' : 'TXT 笔记已导出');
    }, reason => { if (saved) setExportFailure({ message: String(reason), format, noteId }); });
  }
  const commandHandler = useRef<(command: MenuCommand) => void>(() => {});
  commandHandler.current = command => {
    if (!ready || locked.current || preview || editing || deleting) return;
    if (command === 'new') newNote();
    if (command === 'save') void flush().catch(() => {});
    if (command === 'search') { search.current?.focus(); search.current?.select(); }
    if (command === 'theme') toggleTheme();
    if (command === 'import') void beginImport();
    if (command === 'export') void exportData('backup');
    if (command === 'export-markdown') void exportData('markdown');
    if (command === 'export-txt') void exportData('txt');
  };
  useEffect(() => window.desktop.onCommand(command => commandHandler.current(command)), []);
  useEffect(() => window.desktop.onCloseRequested(async () => {
    if (locked.current) return false;
    locked.current = true; setBusy(true);
    try { await notebook.current.flush(); return true; }
    catch { locked.current = false; setBusy(false); return false; }
  }), []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setContext(null); setNewFolderParent(undefined); }
      if ((event.ctrlKey || event.metaKey) && ['n', 's', 'f'].includes(event.key.toLowerCase())) {
        event.preventDefault(); commandHandler.current(event.key.toLowerCase() === 'n' ? 'new' : event.key.toLowerCase() === 's' ? 'save' : 'search');
      }
    };
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  }, []);
  function moveFolder(id: string, parentId: string | null) {
    change(value => { const folders = moveFolderInList(value.folders, id, parentId); return folders === value.folders ? value : { ...value, folders }; });
  }
  function renameFolder(id: string, name: string) {
    if (!name.trim()) return;
    change(value => ({ ...value, folders: value.folders.map(folder => folder.id === id ? { ...folder, name: name.trim() } : folder) }));
  }
  function createFolderFromForm(event: FormEvent) {
    event.preventDefault(); if (!folderName.trim()) return;
    const folder = createFolder({ name: folderName, parentId: newFolderParent ?? null });
    change(value => ({ ...value, folders: [...value.folders, folder] }));
    setSelected(folder.id); setFolderName(''); setNewFolderParent(undefined);
  }
  function confirmDelete() {
    if (!deleting) return;
    if (deleting.type === 'note') {
      const remaining = sortNotes(filterNotes(notesForFolder({ ...data, notes: deleteNote(data.notes, deleting.id) }, selected), query), sort);
      change(value => ({ ...value, notes: deleteNote(value.notes, deleting.id) })); setActive(remaining[0]?.id ?? null);
    } else {
      const folder = data.folders.find(f => f.id === deleting.id);
      if (isDescendantFolder(data.folders, selected, deleting.id)) setSelected(folder?.parentId ?? 'all');
      change(value => removeFolderTree(value, deleting.id));
    }
    setDeleting(null);
  }
  function resize(value: number, vertical: boolean) {
    change(data => ({ ...data, settings: { ...data.settings, ...(vertical ? { stackHeight: Math.max(150, Math.min(value, window.innerHeight - 200, 1200)) } : { sidebarWidth: Math.max(240, Math.min(value, window.innerWidth - 300, 640)) }) } }));
  }
  function pointerResize(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(window.innerWidth <= 760 ? event.clientY : event.clientX, window.innerWidth <= 760);
  }
  const note = data.notes.find(n => n.id === active);
  const visible = sortNotes(filterNotes(notesForFolder(data, selected), query), sort);
  const closeEditing = useCallback(() => setEditing(null), []), closeDeleting = useCallback(() => setDeleting(null), []);
  const closePreview = useCallback(() => { if (!locked.current) setPreview(null); }, []);
  if (!ready) return <div className="loading-screen" role={error ? 'alert' : 'status'}>{error || '正在打开笔记…'}</div>;
  return <>
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => { void flush().catch(() => {}); }}>重试保存</button><button aria-label="关闭错误提示" onClick={() => setError('')}>×</button></div>}
    {!error && exportFailure && <div className="error-banner" role="alert">导出失败：{exportFailure.message}<button disabled={busy} onClick={() => { void exportData(exportFailure.format, exportFailure.noteId); }}>重新导出</button><button aria-label="关闭错误提示" onClick={() => setExportFailure(null)}>×</button></div>}
    {notice && <div className="notice" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}
    {window.desktop.environment === 'browser' && <BrowserMenu command={command => commandHandler.current(command)} disabled={busy || !!preview || !!editing || !!deleting} />}
    <fieldset className={`app-fieldset ${window.desktop.environment === 'browser' ? 'browser-layout' : ''}`} disabled={busy || !!preview} aria-busy={busy}>
      <div className="app-shell" inert={busy || !!preview || !!editing || !!deleting} style={{ '--sidebar-width': `${data.settings.sidebarWidth}px`, '--stack-top-height': `${data.settings.stackHeight}px` } as CSSProperties} onPointerDown={() => { if (context) setContext(null); }}>
        <aside className="sidebar" aria-label="笔记列表"><header className="sidebar-header"><div className="brand"><img className="app-logo" src={logo} width="32" height="32" alt="" data-testid="app-logo" /><div className="brand-text"><p className="eyebrow">NOTES</p><input className="app-title-input" aria-label="笔记名称" data-testid="app-title-input" value={data.settings.appTitle} maxLength={200} onChange={event => change(value => ({ ...value, settings: { ...value.settings, appTitle: event.target.value } }))} onBlur={() => { if (!data.settings.appTitle.trim()) change(value => ({ ...value, settings: { ...value.settings, appTitle: 'Ray的笔记' } })); }} /></div></div>
          <div className="header-actions"><button className="icon-button" aria-label={theme === 'dark' ? '切换浅色模式' : '切换暗黑模式'} data-testid="theme-toggle" onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button><button className="icon-button primary" aria-label="新建笔记" title="新建笔记 (Ctrl+N)" data-testid="new-note" onClick={newNote}><Icon name="plus" /></button></div></header>
          <div className="search-row"><Icon name="search" className="search-icon" /><input ref={search} className="search-input" type="search" aria-label="搜索笔记" data-testid="search-input" placeholder="搜索笔记" value={query} onChange={event => setQuery(event.target.value)} /></div>
          <section className="folder-section" aria-label="文件夹"><div className="folder-heading"><h2>文件夹</h2><button className="icon-button small" aria-label="新建文件夹" data-testid="add-folder" onClick={() => { setNewFolderParent(null); setFolderName(''); }}><Icon name="plus" /></button></div>
            <FolderTree data={data} selected={selected} select={setSelected} move={moveFolder} rename={renameFolder} context={(folder, x, y) => setContext({ folder, x: Math.min(x, window.innerWidth - 180), y: Math.min(y, window.innerHeight - 180) })} />
            {newFolderParent !== undefined && <form className="new-folder-form" data-testid="new-folder-form" onSubmit={createFolderFromForm}><input autoFocus className="new-folder-input" aria-label="文件夹名称" data-testid="new-folder-input" placeholder="文件夹名称" value={folderName} onChange={event => setFolderName(event.target.value)} /><button type="submit">添加</button><button type="button" aria-label="取消新建文件夹" onClick={() => setNewFolderParent(undefined)}>×</button></form>}
          </section>
          <div className="list-toolbar"><span className="note-count" data-testid="note-count">{visible.length} 条笔记</span><select className="sort-select" aria-label="排序方式" data-testid="sort-select" value={sort} onChange={event => setSort(event.target.value as SortMode)}><option value="updated">最近编辑</option><option value="created">创建时间</option><option value="title">文字排序</option></select></div>
          <NoteList notes={visible} folders={data.folders} activeId={active} select={id => { setActive(id); setMode('edit'); }} pin={pin} query={query} />
          <footer className="storage-status"><span>{busy ? '处理中…' : '保存在本机'}</span></footer>
        </aside>
        <div className="resizer" role="separator" aria-label="调整笔记列表宽度" aria-orientation={window.innerWidth <= 760 ? 'horizontal' : 'vertical'} tabIndex={0} data-testid="resizer" onPointerDown={event => { if (!busy) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); } }} onPointerMove={pointerResize} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onDoubleClick={() => resize(window.innerWidth <= 760 ? 340 : 340, window.innerWidth <= 760)} onKeyDown={event => {
          const vertical = window.innerWidth <= 760;
          if ((vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']).includes(event.key)) { event.preventDefault(); resize((vertical ? data.settings.stackHeight : data.settings.sidebarWidth) + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -16 : 16), vertical); }
        }} />
        <Editor note={note} folders={data.folders} mode={mode} setMode={setMode} update={update} status={status} save={() => { void flush().catch(() => {}); }} pin={() => { if (active) pin(active); }} remove={() => { if (active) setDeleting({ type: 'note', id: active }); }} />
      </div>
    </fieldset>
    {context && <div className="folder-context-menu" data-testid="folder-context-menu" role="menu" style={{ left: context.x, top: context.y }} onPointerDown={event => event.stopPropagation()}>
      <button role="menuitem" onClick={() => { setEditing({ id: context.folder.id, name: context.folder.name, parentId: context.folder.parentId }); setContext(null); }}>编辑属性</button>
      <button role="menuitem" onClick={() => { setNewFolderParent(context.folder.id); setFolderName(''); setContext(null); }}>新建子文件夹</button>
      <button role="menuitem" disabled={!context.folder.parentId} onClick={() => { const parent = data.folders.find(f => f.id === context.folder.parentId); moveFolder(context.folder.id, parent?.parentId ?? null); setContext(null); }}>移动到上一级</button>
      <button role="menuitem" className="danger" onClick={() => { setDeleting({ type: 'folder', id: context.folder.id }); setContext(null); }}>删除文件夹</button>
    </div>}
    {editing && <Modal title="编辑文件夹" cancel={closeEditing} testId="folder-editor-overlay"><form data-testid="folder-editor-form" onSubmit={event => {
      event.preventDefault();
      change(value => ({ ...value, folders: moveFolderInList(value.folders, editing.id, editing.parentId).map(folder => folder.id === editing.id ? { ...folder, name: editing.name.trim() || folder.name } : folder) })); setEditing(null);
    }}><label><span>名称</span><input data-testid="folder-editor-name" value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label><label><span>上级文件夹</span><select data-testid="folder-editor-parent" value={editing.parentId ?? ''} onChange={event => setEditing({ ...editing, parentId: event.target.value || null })}><option value="">顶层文件夹</option>{data.folders.filter(folder => !isDescendantFolder(data.folders, folder.id, editing.id)).map(folder => <option key={folder.id} value={folder.id}>{getFolderPath(data.folders, folder.id).join(' / ')}</option>)}</select></label><div className="folder-editor-actions"><button type="button" onClick={closeEditing}>取消</button><button type="submit">保存</button></div></form></Modal>}
    {deleting && <Modal title={deleting.type === 'folder' ? '删除文件夹' : '删除笔记'} cancel={closeDeleting}><p>{deleting.type === 'folder' ? '删除此文件夹及其子文件夹？里面的笔记会移到上一级文件夹。' : '确定删除这条笔记吗？此操作无法撤销。'}</p><div className="folder-editor-actions"><button onClick={closeDeleting}>取消</button><button className="danger" onClick={confirmDelete}>确认删除</button></div></Modal>}
    {preview && <Modal title="确认导入" cancel={closePreview}><p>新增 {preview.notes} 条笔记、{preview.folders} 个文件夹。</p><p>{preview.conflicts} 项冲突将保留副本，{preview.skipped} 项重复数据将跳过。</p><p>导入前会自动备份当前数据，已有内容不会被覆盖。</p><div className="folder-editor-actions"><button disabled={busy} onClick={closePreview}>取消</button><button disabled={busy} onClick={() => { void exclusive(async () => { const merged = await window.desktop.confirmImport(preview.token); replaceSaved(merged); setActive(merged.notes[0]?.id ?? null); setSelected('all'); setQuery(''); setPreview(null); setNotice('导入完成'); }); }}>确认导入</button></div></Modal>}
  </>;
}
