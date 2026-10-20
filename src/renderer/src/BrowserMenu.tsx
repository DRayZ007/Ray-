import { useEffect, useRef, useState } from 'react';
import type { MenuCommand } from '../../shared/types';
import { Icon } from './Icon';

export function BrowserMenu({ command, disabled }: { command(value: MenuCommand): void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const items: { label: string; command: MenuCommand; icon: string; shortcut?: string }[] = [
    { label: '新建笔记', command: 'new', icon: 'plus', shortcut: 'Ctrl N' },
    { label: '保存', command: 'save', icon: 'save', shortcut: 'Ctrl S' },
    { label: '导入备份…', command: 'import', icon: 'import' },
    { label: '导出…', command: 'export', icon: 'export', shortcut: 'Ctrl ⇧ E' }
  ];
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      if (event.key === 'Tab') setOpen(false);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard); };
  }, [open]);
  return <nav ref={root} className="browser-menubar" aria-label="应用菜单">
    <button ref={trigger} className={`file-menu-trigger ${open ? 'is-open' : ''}`} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}><Icon name="note" /><span>文件</span><Icon name="chevron" className="menu-chevron" /></button>
    {open && <div className="file-dropdown" role="menu" aria-label="文件">{items.map((item, index) => <div key={item.command}>{index === 2 && <div className="menu-divider" role="separator" />}<button role="menuitem" disabled={disabled} onClick={() => { trigger.current?.focus(); setOpen(false); command(item.command); }}><Icon name={item.icon} /><span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button></div>)}</div>}
  </nav>;
}
