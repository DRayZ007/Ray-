import type { MenuCommand } from '../../shared/types';
export function BrowserMenu({ command, disabled }: { command(value: MenuCommand): void; disabled: boolean }) {
  const items: { label: string; command: MenuCommand }[] = [
    { label: '新建笔记', command: 'new' }, { label: '保存', command: 'save' },
    { label: '导出当前笔记为 Markdown（.md）…', command: 'export-markdown' },
    { label: '导出当前笔记为纯文本（.txt）…', command: 'export-txt' },
    { label: '导入 JSON 备份…', command: 'import' }, { label: '导出全部数据（JSON）…', command: 'export' }
  ];
  return <nav className="browser-menubar" aria-label="应用菜单"><details><summary>文件</summary><div role="menu">{items.map(item => <button key={item.command} role="menuitem" disabled={disabled} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); command(item.command); }}>{item.label}</button>)}</div></details></nav>;
}
