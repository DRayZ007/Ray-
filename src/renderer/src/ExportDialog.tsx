import type { NoteExportFormat } from '../../shared/types';
import { Modal } from './Modal';
import { Icon } from './Icon';
export type ExportFormat = NoteExportFormat | 'backup';
export function ExportDialog({ format, noteTitle, changeFormat, cancel, confirm }: {
  format: ExportFormat; noteTitle: string | null; changeFormat(format: ExportFormat): void; cancel(): void; confirm(): void;
}) {
  const formats: { value: ExportFormat; label: string; extension: string; description: string; glyph: string }[] = [
    { value: 'markdown', label: 'Markdown', extension: '.md', description: '当前笔记，保留文字格式', glyph: 'MD' },
    { value: 'txt', label: '纯文本', extension: '.txt', description: '当前笔记，适合任何文本编辑器', glyph: 'TXT' },
    { value: 'backup', label: '完整备份', extension: '.json', description: '全部笔记、文件夹和设置', glyph: '{ }' }
  ];
  return <Modal title="导出" cancel={cancel}><p className="export-intro">选择文件格式{noteTitle ? <>，当前笔记：<strong>{noteTitle}</strong></> : '。选择一条笔记后可导出 Markdown 或纯文本。'}</p>
    <fieldset className="export-formats"><legend className="sr-only">导出格式</legend>{formats.map(item => <label key={item.value} className={`export-format ${format === item.value ? 'is-selected' : ''} ${!noteTitle && item.value !== 'backup' ? 'is-disabled' : ''}`}><input type="radio" name="export-format" value={item.value} checked={format === item.value} disabled={!noteTitle && item.value !== 'backup'} onChange={() => changeFormat(item.value)} aria-label={item.label} /><span className="format-glyph">{item.glyph}</span><span className="format-copy"><strong>{item.label}</strong><small>{item.description}</small></span><span className="format-extension">{item.extension}</span></label>)}</fieldset>
    <div className="folder-editor-actions"><button onClick={cancel}>取消</button><button className="primary-action" onClick={confirm}><Icon name="export" />导出文件</button></div>
  </Modal>;
}
