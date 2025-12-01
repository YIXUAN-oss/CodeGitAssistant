# ⚡ Git Assistant 快速参考

## 🚀 立即开始（3步）

```bash
# 1. 启动监听
cd E:\CodeGitAssistant
npm run watch

# 2. 在 VS Code 中打开项目
# 3. 按 F5 开始调试
```

> 💡 **新项目/空文件夹**：在 VS Code 中按 `Ctrl+Shift+P`，执行 `Git Assistant: 初始化仓库`，即可完成 `git init → git remote add → git add . → git commit → git push` 的全流程。

---

## ⚡ 最新优化概览（2025/11）

- 控制面板数据刷新改为 **Promise.allSettled** 并行模式，编辑/删除/推送后的回执更快
- 标签列表使用 `git for-each-ref` 批量解析，Tag Manager 打开速度提升 3-5 倍
- Webview 先推送基础数据、后推送统计信息，避免大仓库场景下的长时间空白

---

## 📋 快捷键

| 快捷键 | 功能 |
|--------|------|
| `F5` | 启动调试 |
| `Ctrl+R` | 重新加载扩展 |
| `Ctrl+Shift+P` | 命令面板 |
| `Ctrl+Alt+P` | 快速推送 |
| `Ctrl+Alt+L` | 快速拉取 |
| `Ctrl+Alt+B` | 切换分支 |
| `Ctrl+Shift+U` | 查看日志 |

---

## 🧭 插件命令速查

| 命令 | 描述 |
|------|------|
| Git Assistant: 初始化仓库 | 引导完成 `git init → add remote → add → commit → push` |
| Git Assistant: 添加远程仓库 | 输入地址并执行 `git remote add` |
| Git Assistant: 快速推送 | `git push`，带确认与进度提示 |
| Git Assistant: 快速拉取 | `git pull`，可选自动 stash |
| Git Assistant: 克隆仓库 | 引导选择目标目录并拉取代码 |
| Git Assistant: 添加文件到暂存区 | 一键暂存全部或多选文件 |
| Git Assistant: 提交更改 | 输入提交信息并提交到本地仓库 |
| Git Assistant: 创建分支 | 输入校验 + 可选立即切换 |
| Git Assistant: 切换分支 | 支持 `Ctrl+Alt+B` 快捷键与自动 stash |
| Git Assistant: 合并分支 | 选择快进或三路合并策略 |
| Git Assistant: 标签管理命令* | 创建/推送/删除标签（面板同源） |
| Git Assistant: 解决冲突 | 打开冲突解决器 |
| Git Assistant: 打开控制面板 | 查看统计与操作按钮 |

> *包含 `git-assistant.createTag/deleteTag/pushTag/pushAllTags` 等命令，通常通过控制面板触发。

## 📊 可视化功能速查

控制面板标签页按以下顺序显示（每个标签按钮固定宽度 120px）：

| 标签页 | 功能 | 技术 |
|--------|------|------|
| 📋 快捷指令 | 命令历史记录、复制/重试、清空 | React组件 |
| 📚 Git 指令集 | Git命令参考手册 | React组件 |
| 🌿 分支管理 | 分支树、创建/切换/合并 | React组件 |
| ☁️ 远程仓库 | 添加/重命名/更新/删除远程 | React组件 + VS Code 命令 |
| 🏷️ 标签管理 | 创建注释/轻量标签、推送/删除 | React组件 |
| 🌳 分支视图 | 分支关系与合流路径 | D3.js 图形布局 |
| ⚠️ 冲突解决 | 冲突检测、三栏对比编辑、解决指令 | React组件 |
| 📊 提交图谱 | 2D图形化提交历史，高 DPI 强化 | D3.js 力导向图 |
| 📅 时间线 | 日历热力图 + 时间轴柱状图 | D3.js 时间轴 + 日历 |
| 🔥 热力图 | 文件修改频率与贡献者活跃度 | D3.js 热力图 |

---

## 📂 项目结构

```
src/
├── extension.ts         # 入口
├── commands/           # 命令
├── services/           # 服务
├── providers/          # 提供者
├── webview/            # UI
├── utils/              # 工具
└── types/              # 类型
```

---

## 🛠️ 常用命令

```bash
# 开发
npm run watch          # 监听模式
npm run compile        # 编译
npm run lint           # 检查

# 调试
F5                     # 启动
Ctrl+R                 # 重载
Ctrl+Shift+U          # 日志

# 打包
npm install -g @vscode/vsce
vsce package          # 生成 .vsix
```

---

## 📝 文档导航

| 文档 | 用途 |
|------|------|
| [`README.md`](README.md) | 项目介绍（英文） |
| [`README_CN.md`](README_CN.md) | 功能与特性详细说明（中文） |
| [`GETTING_STARTED.md`](GETTING_STARTED.md) | 使用和调试指南 |
| [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) | 架构概览和功能矩阵 |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本更新日志 |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | 开发流程与规范 |
| [`docs/QUICKSTART.md`](docs/QUICKSTART.md) | 5分钟入门 |
| [`docs/TESTING.md`](docs/TESTING.md) | 测试与验证清单 |

---

## ✅ 验证清单

```
✅ npm install 成功
✅ npm run compile 成功
✅ 生成 dist/extension.js
✅ 生成 dist/webview/webview.js
✅ 按 F5 启动成功
✅ Extension Host 窗口打开
```

---

## 🐛 问题排查

### 扩展未激活
```bash
# 确保在 Git 仓库中
git init
```

### 修改未生效
```
1. 确保 npm run watch 在运行
2. 在 Extension Host 中按 Ctrl+R
```

### 查看日志
```
Ctrl+Shift+U → 选择 "Git Assistant"
```

---

## 📞 获取帮助

1. 查看 [`GETTING_STARTED.md`](GETTING_STARTED.md)
2. 查看输出日志
3. 查看开发者工具

---

## 🎨 可视化功能说明

### 2D提交图谱
- 使用D3.js力导向图算法
- 节点表示提交，连线表示分支关系
- 支持拖拽和缩放
- 点击节点查看提交详情
- **显示优化**：
  - 高DPI支持，自动适配设备像素比
  - 优化的字体渲染清晰度
  - 改进的文本换行处理
  - 增强的颜色对比度

### 热力图分析
- **文件热力图**：统计文件修改次数，颜色深浅表示频率
- **贡献者热力图**：统计贡献者提交数，识别核心贡献者

### 分支视图
- 展示分支之间的关系与合流路径
- 箭头表示合并方向
- 高亮显示当前分支

### 时间线视图
- **日历热力图**：
  - 统一的颜色方案（#0e639c）
  - 紧凑的日历布局
  - 完整的浅色/深色主题适配
  - 支持年月切换
- **时间线图表**：
  - 柱状图展示每日提交统计
  - 自动主题适配

### 快捷指令历史
- 记录所有已执行的Git命令
- 按功能分类显示
- 支持快速重新执行
- 显示执行状态和错误信息

---

**项目状态：✅ v1.0.0 正式版** | **最后更新：2025-11-26**

