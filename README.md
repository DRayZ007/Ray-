# 马克笔记桌面版

Electron + React + TypeScript 本地笔记客户端。支持笔记编辑、Markdown 预览、搜索排序、置顶、多级文件夹和拖拽、主题切换及 JSON 备份。首版为 Windows x64，安装包未签名。

## 开发与交付

使用 Node.js 22.12+（推荐 22 LTS）和 npm：

```powershell
npm ci
npm run dev
npm run test
npm run test:e2e
npm run dist
```

`npm run verify` 运行逻辑、存储、组件和 Electron 测试及生产构建。`npm run pack` 生成免安装目录；`npm run dist` 生成 `release/MarkNotes-1.0.0-x64-Setup.exe`。实际交付结果见 `VALIDATION.md`。

`resources/icon.svg` 为「折页 M」唯一母版。`npm run icons` 生成 PNG、多尺寸 ICO 和 `build/icon-preview.png`。应用左上角使用原始 SVG，窗口、任务栏、安装程序与快捷方式使用配套资源。

## 独立 HTML 展示

双击根目录 `桌面客户端预览.html` 即可在浏览器打开，无需服务器、安装依赖或联网。它复用桌面版 React 界面，支持主题切换、编辑预览、搜索、文件夹和 JSON 备份，使用单独的浏览器存储，不读取桌面客户端的个人数据。运行 `npm run preview:html` 可重新生成文件。浏览器关闭前应确认“已保存”；此展示文件不提供 Electron 的系统菜单及窗口关闭保存握手。

## 数据和恢复

默认保存至 `%APPDATA%/MarkNotes/notes.json`，修改显示名称不影响路径。保存成功才显示“已保存”；失败时保留编辑内容，点击重试。正常关闭等待保存；写入失败则保持窗口打开。不要强制终止尚未保存的进程。

数据写入前备份上一有效版本为 `notes.json.bak`，导入前另存 `before-import-*.json`。损坏时由原生对话框选择备份恢复，原文件保留为 `.corrupt-*`；无有效备份则停止启动并显示目录位置，不会自动清空。卸载默认保留用户数据。

## 从旧网页迁移

1. 将根目录 `index.html` 和 `legacy-export.js` 放在旧网页的**相同协议、主机、端口**下，使用原浏览器和原配置访问。若旧版从本地文件打开，保留原 `index.html` 的完整路径，在同一浏览器打开；本地文件存储行为取决于浏览器。
2. 点击“导出旧版笔记”，保存 JSON。若数量为零，先检查是否使用了原来源和原浏览器；桌面程序不能直接读取浏览器 localStorage。
3. 在桌面版点击“导入备份”，核对摘要后确认。完整校验通过后才合并；相同数据跳过，冲突保留副本并维护文件夹关系。同一文件重复导入不会重复增加副本。

备份格式为 `{ version: 1, notes, folders, settings }`。仅空客户端采用导入设置，已有笔记或文件夹时保留本地设置。不接受循环文件夹、重复 ID、缺失引用或超过 50 MB 的导入文件。

## 测试隔离

自动化使用独立临时目录，通过 `MARK_NOTES_DATA_DIR` 指定数据位置，不触碰个人笔记。可用 `MARK_NOTES_EXECUTABLE` 指定打包后的 exe 运行 `tests/desktop/smoke.spec.ts`。测试通过主进程替换原生文件对话框返回值，无生产测试后门。

Windows CI 会构建安装包，测试打包后的 exe，并上传测试报告和图标预览。安装程序、桌面快捷方式、系统任务栏及不同 DPI 的最终检查需在实际 Windows 桌面完成。

`./scripts/installer-smoke.ps1` 在工作区临时目录安装、检查快捷方式和嵌入图标、测试安装后的程序，随后卸载；会拒绝覆盖已有同名安装或快捷方式。系统原生 DPI 与任务栏的最终外观仍需人工确认，自动化覆盖的是应用 100%、150%、200% 缩放和资源完整性。
