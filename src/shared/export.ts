import type { Note, NoteExportFormat } from './types';
import { getDisplayTitle } from './domain';
import { parseMarkdown } from './markdown';

function decodeEntities(value: string): string {
  const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
  return value.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => entities[entity]);
}
export function markdownToText(source: string): string {
  // Convert only the HTML emitted by our escaped Markdown renderer. Decode after removing
  // tags so literal HTML and code in a note remain literal text in the exported document.
  let html = parseMarkdown(source).replace(/>\n(?=<)/g, '>');
  html = html.replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_match, href: string, label: string) => href === '#' || href.startsWith('#') ? label : `${label} (${href})`);
  html = html.replace(/<ol>([\s\S]*?)<\/ol>/g, (_match, list: string) => {
    let number = 0;
    return list.replace(/<li>/g, () => `${++number}. `).replace(/<\/li>/g, '\n');
  });
  html = html.replace(/<li>/g, '- ').replace(/<\/li>/g, '\n')
    .replace(/<\/(?:p|h[1-6]|blockquote|pre|ul|ol)>/g, '\n\n')
    .replace(/<hr>/g, '\n\n').replace(/<[^>]*>/g, '');
  return decodeEntities(html).trim();
}
export function exportFilename(title: string, format: NoteExportFormat): string {
  let stem = Array.from(title.trim().replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_')).slice(0, 80).join('').replace(/[. ]+$/, '');
  if (!stem) stem = '无标题笔记';
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(stem)) stem = '_' + stem;
  return `${stem}.${format === 'markdown' ? 'md' : 'txt'}`;
}
export function noteExport(note: Note, format: NoteExportFormat): { filename: string; content: string; mime: string } {
  const title = getDisplayTitle(note).replace(/[\r\n]+/g, ' ');
  const body = format === 'markdown' ? note.content.replace(/\r\n?/g, '\n') : markdownToText(note.content);
  const heading = format === 'markdown' ? `# ${title}` : title;
  return {
    filename: exportFilename(title, format),
    content: heading + (body ? '\n\n' + body : '') + (body.endsWith('\n') ? '' : '\n'),
    mime: format === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8'
  };
}
