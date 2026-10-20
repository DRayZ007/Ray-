import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const output = await build({
  entryPoints: ['src/preview/index.tsx'], bundle: true, write: false,
  outfile: 'build/html-preview/preview.js', format: 'iife', minify: true,
  loader: { '.svg': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' }
});
const javascript = output.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = output.outputFiles.find(file => file.path.endsWith('.css')).text;
const icon = await readFile('resources/icon.svg', 'utf8');
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>马克笔记 · 桌面客户端预览</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">
<style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="root"></div>
<script>${javascript.replace(/<\/script/gi, '<\\/script')}</script></body></html>\n`;
await writeFile('桌面客户端预览.html', html, 'utf8');
console.log(`Created 桌面客户端预览.html (${Math.round(Buffer.byteLength(html) / 1024)} KB), fully offline and self-contained.`);
