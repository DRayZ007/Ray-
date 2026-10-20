// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/renderer/src/App';
import { emptyData } from '../src/shared/data';
import type { AppData, MenuCommand } from '../src/shared/types';
let command: (value: MenuCommand) => void;
let closeRequested: () => Promise<boolean>;
beforeEach(() => {
  const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', () => media);
  window.desktop = {
    environment: 'desktop',
    load: vi.fn().mockResolvedValue(emptyData()), save: vi.fn().mockResolvedValue(undefined),
    previewImport: vi.fn().mockResolvedValue(null), confirmImport: vi.fn(), exportData: vi.fn().mockResolvedValue(true), exportNote: vi.fn().mockResolvedValue(true), openExternal: vi.fn(),
    onCommand: callback => { command = callback; return () => {}; },
    onCloseRequested: callback => { closeRequested = callback; return () => {}; }
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function start() { const user = userEvent.setup(); render(<App />); await screen.findByTestId('new-note'); return user; }
test('edits, previews, searches, pins and confirms/cancels deletion', async () => {
  const user = await start(); await user.click(screen.getByTestId('new-note'));
  await user.clear(screen.getByTestId('title-input')); await user.type(screen.getByTestId('title-input'), '项目计划');
  await user.type(screen.getByTestId('content-input'), '编写 **测试** 用例');
  expect(screen.getByTestId('word-count')).toHaveTextContent('6 字');
  await user.click(screen.getByTestId('preview-mode')); expect(screen.getByTestId('markdown-preview').querySelector('strong')).toHaveTextContent('测试');
  await user.click(screen.getByTestId('pin-button')); expect(screen.getByTestId('pin-button')).toHaveTextContent('已置顶');
  await user.type(screen.getByTestId('search-input'), '无匹配'); expect(screen.queryAllByTestId('note-item')).toHaveLength(0);
  await user.clear(screen.getByTestId('search-input')); expect(screen.getAllByTestId('note-item')).toHaveLength(1);
  await user.click(screen.getByTestId('delete-button')); await user.click(screen.getByRole('button', { name: '取消' })); expect(screen.getAllByTestId('note-item')).toHaveLength(1);
  await user.click(screen.getByTestId('delete-button')); await user.click(screen.getByRole('button', { name: '确认删除' })); expect(screen.queryAllByTestId('note-item')).toHaveLength(0);
});
test('acknowledges actual persistence, reports failure and retries on close', async () => {
  const user = await start(); vi.mocked(window.desktop.save).mockRejectedValue(new Error('只读磁盘'));
  await user.click(screen.getByTestId('new-note')); await user.type(screen.getByTestId('content-input'), '不能丢失');
  await waitFor(() => expect(screen.getByTestId('save-status')).toHaveTextContent('保存失败'));
  expect(screen.getByRole('alert')).toHaveTextContent('只读磁盘');
  let result: boolean | undefined;
  await act(async () => { result = await closeRequested(); }); expect(result).toBe(false);
  expect(screen.getByTestId('content-input')).toHaveValue('不能丢失');
  vi.mocked(window.desktop.save).mockResolvedValue(undefined);
  await user.click(screen.getByRole('button', { name: '重试保存' }));
  await waitFor(() => expect(screen.getByTestId('save-status')).toHaveTextContent('已保存'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
test('flushes the last keystroke on immediate close and supports composition without losing focus', async () => {
  const user = await start(); await user.click(screen.getByTestId('new-note'));
  const title = screen.getByTestId('title-input'); title.focus();
  fireEvent.compositionStart(title); fireEvent.change(title, { target: { value: '中文输入' } }); fireEvent.compositionEnd(title);
  expect(title).toHaveFocus(); expect(title).toHaveValue('中文输入');
  fireEvent.change(screen.getByTestId('content-input'), { target: { value: '最终内容' } });
  await act(async () => { expect(await closeRequested()).toBe(true); });
  const last = vi.mocked(window.desktop.save).mock.calls.at(-1)![0]; expect(last.notes[0].title).toBe('中文输入'); expect(last.notes[0].content).toBe('最终内容');
});
test('shows saving until acknowledgement and drains edits made during a save', async () => {
  const user = await start();
  let acknowledge!: () => void;
  vi.mocked(window.desktop.save).mockImplementationOnce(() => new Promise<void>(resolve => { acknowledge = resolve; }));
  await user.click(screen.getByTestId('new-note'));
  await waitFor(() => expect(screen.getByTestId('save-status')).toHaveTextContent('保存中'));
  fireEvent.change(screen.getByTestId('content-input'), { target: { value: '较新的编辑' } });
  await act(async () => { acknowledge(); });
  await waitFor(() => expect(screen.getByTestId('save-status')).toHaveTextContent('已保存'));
  expect(vi.mocked(window.desktop.save).mock.calls.at(-1)![0].notes[0].content).toBe('较新的编辑');
});
test('folder attributes, theme, title, menus and import cancellation work', async () => {
  const user = await start();
  await user.click(screen.getByTestId('add-folder')); await user.type(screen.getByTestId('new-folder-input'), '工作'); await user.click(screen.getByRole('button', { name: '添加' }));
  fireEvent.contextMenu(screen.getByText('工作'), { clientX: 20, clientY: 20 });
  await user.click(screen.getByRole('menuitem', { name: '编辑属性' }));
  await user.clear(screen.getByTestId('folder-editor-name')); await user.type(screen.getByTestId('folder-editor-name'), '项目');
  await user.click(screen.getByRole('button', { name: '保存' })); expect(screen.getByText('项目')).toBeInTheDocument();
  await user.click(screen.getByTestId('theme-toggle')); expect(document.documentElement.dataset.theme).toBe('dark');
  await user.clear(screen.getByTestId('app-title-input')); await user.type(screen.getByTestId('app-title-input'), '工作笔记'); expect(document.title).toBe('工作笔记');
  act(() => command('search')); expect(screen.getByTestId('search-input')).toHaveFocus();
  vi.mocked(window.desktop.previewImport).mockResolvedValue({ token: 't', notes: 2, folders: 1, conflicts: 1, skipped: 0 });
  act(() => command('import')); expect(await screen.findByRole('dialog', { name: '确认导入' })).toHaveTextContent('新增 2 条笔记');
  await user.click(screen.getByRole('button', { name: '取消' })); expect(window.desktop.confirmImport).not.toHaveBeenCalled();
  await act(async () => { await closeRequested(); });
  const saved: AppData = vi.mocked(window.desktop.save).mock.calls.at(-1)![0]; expect(saved.settings.theme).toBe('dark'); expect(saved.folders[0].name).toBe('项目');
});

test('desktop removes duplicate footer controls and exports selected note after saving', async () => {
  const user = await start();
  expect(screen.queryByTestId('import-button')).not.toBeInTheDocument();
  expect(screen.queryByTestId('export-button')).not.toBeInTheDocument();
  act(() => command('export-markdown'));
  expect(screen.getByRole('status')).toHaveTextContent('请先选择');
  expect(window.desktop.exportNote).not.toHaveBeenCalled();
  await user.click(screen.getByTestId('new-note'));
  fireEvent.change(screen.getByTestId('content-input'), { target: { value: '刚输入的内容' } });
  act(() => command('export-markdown'));
  await waitFor(() => expect(window.desktop.exportNote).toHaveBeenCalledWith(expect.any(String), 'markdown'));
  const calls = vi.mocked(window.desktop.save).mock.calls;
  expect(calls.at(-1)![0].notes[0].content).toBe('刚输入的内容');
  expect(vi.mocked(window.desktop.save).mock.invocationCallOrder.at(-1)!).toBeLessThan(vi.mocked(window.desktop.exportNote).mock.invocationCallOrder[0]);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Markdown 笔记已导出'));
});

test('cancelled export has no success message, failed export retries the same note and format', async () => {
  const user = await start(); await user.click(screen.getByTestId('new-note'));
  vi.mocked(window.desktop.exportNote).mockResolvedValueOnce(false);
  act(() => command('export-txt'));
  await waitFor(() => expect(window.desktop.exportNote).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  vi.mocked(window.desktop.exportNote).mockRejectedValueOnce(new Error('没有权限写入此位置'));
  act(() => command('export-txt'));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('导出失败'));
  const failedRequest = vi.mocked(window.desktop.exportNote).mock.calls.at(-1)!;
  await user.click(screen.getByRole('button', { name: '重新导出' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('TXT 笔记已导出'));
  expect(vi.mocked(window.desktop.exportNote).mock.calls.at(-1)).toEqual(failedRequest);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
