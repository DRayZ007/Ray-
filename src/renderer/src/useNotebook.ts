import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyData, validateData } from '../../shared/data';
import type { AppData } from '../../shared/types';

export function useNotebook() {
  const [data, setData] = useState(emptyData);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('正在加载…');
  const current = useRef(data), revision = useRef(0), saved = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let active = true;
    window.desktop.load().then(value => {
      if (!active) return;
      current.current = validateData(value); setData(current.current); setReady(true); setStatus('已保存');
    }).catch(reason => { if (active) { setError(String(reason)); setStatus('加载失败'); } });
    return () => { active = false; };
  }, []);
  const change = useCallback((update: (value: AppData) => AppData) => {
    const next = update(current.current);
    if (next === current.current) return;
    current.current = next; revision.current++; setData(next); setStatus('待保存');
  }, []);
  const replaceSaved = useCallback((value: AppData) => {
    current.current = value; revision.current++; saved.current = revision.current;
    setData(value); setStatus('已保存'); setError('');
  }, []);
  const flush = useCallback(async (): Promise<void> => {
    if (pending.current) return pending.current;
    const operation = (async () => {
      try {
        while (saved.current < revision.current) {
          const target = revision.current, snapshot = current.current;
          setStatus('保存中…');
          await window.desktop.save(snapshot);
          saved.current = target;
        }
        setStatus('已保存'); setError('');
      } catch (reason) { setStatus('保存失败'); setError(String(reason)); throw reason; }
    })();
    pending.current = operation;
    try { await operation; } finally { pending.current = null; }
  }, []);
  useEffect(() => {
    if (!ready || revision.current === saved.current) return;
    const timer = setTimeout(() => { void flush().catch(() => {}); }, 250);
    return () => clearTimeout(timer);
  }, [data, ready, flush]);
  return { data, ready, error, setError, status, change, replaceSaved, flush, current };
}
