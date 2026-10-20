# 桌面版验收记录

日期：2026-10-20（Asia/Shanghai）。环境：Windows 11 x64，Node.js 25.8.1，Electron 44.9.1。

## 1.0.1 导出功能修复

- 左下角移除导入、导出按钮，只显示本地存储状态；桌面端统一使用原生“文件”菜单，独立 HTML 使用顶部“文件”菜单。
- 新增当前笔记 Markdown（`.md`）、纯文本（`.txt`）导出；标题和正文使用 UTF-8，Markdown 保留原始格式，TXT 保留可读文字、列表、代码和链接地址。
- JSON 全量备份与单篇文档导出使用独立菜单项。默认保存位置为用户“文档”目录，导出前提交最新编辑；空正文可导出，取消不会报告成功，文件写入失败保留原稿并允许重新选择位置导出。
- 修复原 Markdown 解析器的有序列表内容丢失及链接实体重复转义问题。

| 检查 | 结果 |
| --- | --- |
| TypeScript 严格类型检查、生产构建 | 通过 |
| Vitest 逻辑、存储、React 组件 | 40 / 40 通过 |
| 实际 Electron 全部场景 | 8 / 8 通过 |
| 1.0.1 打包后 exe 编辑、重启、导出与错误重试 | 4 / 4 通过 |
| 独立 HTML 离线导出 | Edge 离线模式下检查 Markdown、TXT、JSON 实际下载内容，通过 |

新安装包：`release/MarkNotes-1.0.1-x64-Setup.exe`，113,006,864 字节，未签名。

SHA-256：`81456D01E58304B048E14C7A4F919B2F3D4A781785ABF115F799BFE9E22FD05D`

本次使用独立测试数据验证工作区内的打包程序；因用户已有正在使用的客户端，未覆盖现有安装、关闭用户窗口或操作个人笔记。安装/卸载脚本仍会拒绝覆盖已有安装，CI 已加入打包版导出回归。

## 1.0.0 初始交付验收

## 已通过

| 检查 | 结果 |
| --- | --- |
| TypeScript 严格类型检查 | 通过 |
| Vitest 逻辑、存储、React 组件 | 34 / 34 通过 |
| Playwright 实际 Electron 核心流程 | 6 / 6 通过，无渲染进程未捕获异常 |
| 打包后 Windows exe | 2 / 2 烟雾测试通过 |
| 安装后的 Windows exe | 2 / 2 烟雾测试通过 |
| NSIS 安装及卸载 | 通过；安装在工作区临时目录，验收后已卸载 |
| 桌面、开始菜单快捷方式 | 已检查创建、目标 exe、图标资源及卸载后的移除 |
| 图标 | SVG、512px PNG、7 种尺寸 ICO 已生成；已提取并检查安装后 exe 的图标 |
| 生产构建 | electron-vite 构建主进程、preload 和 React 渲染进程通过 |
| 运行时依赖审计 | `npm audit --omit=dev`：0 漏洞 |
| 独立 HTML 展示 | 本机 Edge 在完全离线模式下打开通过；内嵌图标、主题、编辑预览、搜索、保存恢复和导出正常，无页面异常 |

核心桌面测试覆盖笔记编辑、自动保存、预览、搜索、排序、置顶、删除确认和取消；文件夹嵌套、筛选、拖拽、内联重命名、属性修改、删除迁移和笔记归类；原生文件对话框导入导出、冲突副本、重复导入、非法文件拒绝；旧浏览器导出入口；主题、快捷键、鼠标和键盘调整布局；快速输入后关闭并重启恢复笔记、设置及窗口尺寸。

存储测试另外验证串行写入、原子替换失败、备份、损坏恢复及失败后重试；组件测试验证保存状态等待实际确认、保存期间继续编辑、中文组合输入和关闭时写盘失败阻止退出。

## 图标与界面检查

已查看 `build/icon-preview.png` 的浅色/深色背景及 16、24、32、48、64、128、256 像素图标；已查看真实应用浅色、深色和窄窗口截图。自动化验证应用 100%、150%、200% 缩放时左上角图标完整显示，安装脚本验证系统快捷方式指向 exe 的第 0 号图标。

应用缩放测试不等同于切换 Windows 显示器的系统 DPI；不同显示器的系统 DPI、任务栏原生外观仍未逐一人工检查。Windows 分数缩放下，窗口恢复测试允许原生边框最多 2 个逻辑像素的取整差异。

## 安装包

- 文件：`release/MarkNotes-1.0.0-x64-Setup.exe`
- 大小：113,005,371 字节（约 107.8 MiB）
- SHA-256：`7747550E0007F1FC43F007742B8892AA627551A51E523FB27069517C15B66C97`
- Authenticode 状态：`NotSigned`，符合首版未签名交付约定。

开发工具链审计仍有 8 项 moderate，来自 electron-builder 的下载工具依赖链；这些开发工具不包含在运行时依赖中。Vitest 与 sharp 的已知高危/严重问题已通过升级修复。未采用未经打包验证的跨主版本依赖强制覆盖。

## 复现与环境说明

```powershell
npm ci
npm run verify
npm run dist
$env:MARK_NOTES_EXECUTABLE = Join-Path $pwd 'release/win-unpacked/马克笔记.exe'
npx playwright test tests/desktop/smoke.spec.ts
Remove-Item Env:MARK_NOTES_EXECUTABLE
./scripts/installer-smoke.ps1
```

当前受限沙箱禁止系统临时目录中的原子重命名，Vitest 4 运行时使用以下环境变量将临时文件放在工作区，34 项测试全部通过；真实 Electron 测试及安装验收在已授权的沙箱外运行，数据均隔离到工作区，不读取个人笔记。

```powershell
$env:TEMP = Join-Path $pwd 'build/test-temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force $env:TEMP | Out-Null
npm test
```

本机下载 Electron 和打包工具时使用 npmmirror 镜像，Electron 安装器仍按 npm 包附带的校验和检查二进制。镜像未写入项目配置；其他环境默认使用官方来源。
