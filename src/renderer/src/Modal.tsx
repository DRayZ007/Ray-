import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
export function Modal({ title, children, cancel, testId }: { title: string; children: ReactNode; cancel(): void; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(cancel); cancelRef.current = cancel;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button,input,select,[tabindex="0"]') ?? []).filter(element => !element.hasAttribute('disabled'));
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); cancelRef.current(); }
      if (event.key === 'Tab') {
        const elements = focusable(), index = elements.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && index <= 0) { event.preventDefault(); elements.at(-1)?.focus(); }
        else if (!event.shiftKey && index === elements.length - 1) { event.preventDefault(); elements[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return <div className="folder-editor-overlay" data-testid={testId} onMouseDown={event => { if (event.target === event.currentTarget) cancel(); }}><div ref={ref} className="folder-editor-panel" role="dialog" aria-modal="true" aria-label={title}><h2>{title}</h2>{children}</div></div>;
}
