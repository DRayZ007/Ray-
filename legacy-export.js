// Serve this page from the original application's exact origin to access its localStorage.
const result = document.querySelector('#result');
document.querySelector('#export').addEventListener('click', () => {
  try {
    const readArray = key => {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(value)) throw new Error(key + ' 不是有效数组');
      return value;
    };
    const notes = readArray('mark-notes:v1').map(note => ({ ...note, pinned: Boolean(note.pinned), folderId: note.folderId || null }));
    const folders = readArray('mark-notes:folders:v1').map(folder => ({ ...folder, parentId: folder.parentId || null }));
    const storedTheme = localStorage.getItem('mark-notes:theme');
    const backup = { version: 1, notes, folders, settings: {
      appTitle: localStorage.getItem('mark-notes:app-title')?.trim() || 'Ray的笔记',
      theme: ['light', 'dark'].includes(storedTheme) ? storedTheme : 'system', sidebarWidth: 340, stackHeight: 340
    } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '马克笔记-旧版备份.json';
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    result.textContent = `已导出 ${notes.length} 条笔记、${folders.length} 个文件夹。请在桌面客户端中选择“文件 → 导入 JSON 备份”。`;
  } catch (error) { result.textContent = '导出失败，原数据未修改：' + String(error); }
});
