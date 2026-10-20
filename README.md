# 马克笔记

<p align="center">
  <img src="resources/icon.png" width="96" alt="马克笔记图标">
</p>

一款简洁的 Windows 本地笔记软件，用来记录想法、整理资料和编写 Markdown。支持自动保存，笔记存放在自己的电脑上，无需注册账号。

使用 **Electron + React + TypeScript** 开发，当前版本为 **1.0.7**。

## 主要功能

- **编辑与预览**：编写 Markdown，随时切换预览，查看字数。
- **自动保存**：编辑时自动保存，也可以按 `Ctrl + S` 立即保存。
- **整理笔记**：支持多级文件夹、重命名、置顶和删除。
- **拖拽操作**：拖动笔记调整顺序，或移到其他文件夹。
- **搜索与排序**：搜索标题和正文，按创建时间、最近编辑、标题或手动顺序排列。
- **导入与导出**：单篇笔记导出为 Markdown、TXT；全部数据导出为 JSON 备份，也可导入备份恢复。
- **个性设置**：切换浅色、深色主题，自定义应用名称，调整列表宽度。

## 安装与使用

适用于 **Windows 10 / 11，Intel 或 AMD 64 位电脑**。

拿到 `MarkNotes-1.0.7-x64-Setup.exe` 后，双击并按提示安装即可，不需要安装 Node.js 或其他开发工具。当前安装包未签名，Windows 可能显示“未知发布者”。

打开软件后，点击左上角 `+` 新建笔记，直接输入标题和正文。点击“文件 → 导出…”选择导出格式；换电脑时，可以先导出 JSON 完整备份，再在新电脑上导入。

本仓库保存源码，不包含安装包；开发者可以按下方命令自行构建。

### 不安装也能体验

下载仓库中的 [桌面客户端预览.html](桌面客户端预览.html)，保存到本地后双击，用浏览器打开即可。预览文件支持离线运行，数据保存在浏览器中，与桌面客户端各自独立。

### 常用快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + N` | 新建笔记 |
| `Ctrl + S` | 立即保存 |
| `Ctrl + F` | 搜索笔记 |
| `Ctrl + Shift + E` | 打开导出窗口 |

## 笔记保存在哪里？

桌面客户端的笔记、文件夹和设置默认保存在：

```text
%APPDATA%\MarkNotes\notes.json
```

数据保存在本机，当前不提供云同步。修改应用显示名称不影响存储位置，卸载默认保留笔记数据。建议定期导出 JSON 完整备份；Markdown 和 TXT 适合分享单篇内容。

## 本地开发

需要 **Node.js 22.12 或更新版本**（推荐 22 LTS）和 npm。

```bash
git clone https://github.com/DRayZ007/Ray-.git mark-notes
cd mark-notes
npm ci
npm run dev
```

| 命令 | 用途 |
| --- | --- |
| `npm run typecheck` | 检查 TypeScript 类型 |
| `npm test` | 运行逻辑、存储和组件测试 |
| `npm run test:e2e` | 构建并运行 Electron、HTML 端到端测试 |
| `npm run verify` | 执行单元、组件及端到端测试和生产构建 |
| `npm run preview:html` | 重新生成独立 HTML 预览 |
| `npm run dist` | 在 Windows 上生成 x64 安装包 |

安装包生成在 `release/` 目录。依赖、构建产物、测试报告和安装包已通过 `.gitignore` 排除。

更多说明见 [开发与数据迁移文档](docs/DEVELOPMENT.md)；各版本的实际测试结果及未验证项见 [验收记录](VALIDATION.md)。
