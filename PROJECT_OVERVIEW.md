# Git Assistant 项目概览

## 📊 项目统计

- **项目类型**: VS Code 扩展
- **开发语言**: TypeScript + React 18
- **核心功能**: Git 可视化管理（分支/远程/标签/冲突/历史）
- **代码行数**: 约 4000+ 行
- **文件数量**: 35+ 个
- **开发周期**: v1.0.1（正式版维护中）
- **最低 VS Code**: 1.80+
- **最低 Node.js**: 16+

## 🏗️ 完整项目结构

```
CodeGitAssistant/
│
├── 📁 src/                          # 源代码目录
│   ├── extension.ts                 # 扩展入口文件
│   │
│   ├── 📁 commands/                 # 命令处理器
│   │   ├── index.ts                # 命令注册中心
│   │   ├── git-operations.ts       # Git基础操作（Push/Pull/Clone）
│   │   ├── branch-manager.ts       # 分支管理命令
│   │   ├── conflict-resolver.ts    # 冲突解决命令
│   │   ├── repository-init.ts      # 仓库初始化向导
│   │   └── tag-manager.ts          # 标签管理命令
│   │
│   ├── 📁 services/                 # 业务服务层
│   │   └── git-service.ts          # Git操作封装服务
│   │
│   ├── 📁 providers/                # VS Code数据提供者
│   │   ├── branch-provider.ts      # 分支树视图提供者
│   │   ├── history-provider.ts     # 提交历史提供者
│   │   └── conflict-provider.ts    # 冲突检测提供者
│   │
│   ├── 📁 webview/                  # Webview可视化界面
│   │   ├── index.tsx               # React应用入口
│   │   ├── globals.d.ts            # VS Code webview 类型声明
│   │   ├── tsconfig.json           # Webview TS配置
│   │   ├── dashboard-panel.ts      # 控制面板管理
│   │   └── 📁 components/          # React组件（10个标签页）
│   │       ├── App.tsx             # 主应用组件 / 标签切换
│   │       ├── App.css             # 样式文件
│   │       ├── CommandHistory.tsx  # 📋 快捷指令
│   │       ├── GitCommandReference.tsx # 📚 Git 指令集
│   │       ├── BranchTree.tsx      # 🌿 分支管理
│   │       ├── RemoteManager.tsx   # ☁️ 远程仓库
│   │       ├── TagManager.tsx      # 🏷️ 标签管理
│   │       ├── BranchGraph.tsx     # 🌳 分支视图
│   │       ├── ConflictEditor.tsx  # ⚠️ 冲突解决
│   │       ├── CommitGraph.tsx     # 📊 2D提交图谱（高DPI优化）
│   │       ├── TimelineView.tsx    # 📅 时间线（热力图 + 柱状图）
│   │       ├── HeatmapAnalysis.tsx # 🔥 热力图分析（主题适配）
│   │       └── CommitGraph3D.tsx   # 🧪 3D提交图谱（实验保留）
│   │
│   ├── 📁 utils/                    # 工具函数库
│   │   ├── git-utils.ts            # Git相关工具函数
│   │   ├── logger.ts               # 日志记录器
│   │   ├── notification.ts         # 通知工具类
│   │   ├── command-history.ts      # 命令历史持久化
│   │   ├── merge-history.ts        # 合并操作记录
│   │   └── constants.ts            # 常量定义
│   │
│   └── 📁 types/                    # TypeScript类型定义
│       └── git.ts                  # Git相关类型
│
├── 📁 dist/                         # Webpack 打包后产物
├── 📁 docs/                         # 文档目录
│   ├── DEVELOPMENT.md              # 开发文档
│   ├── QUICKSTART.md               # 快速开始指南
│   └── TESTING.md                  # 测试指南
├── 📁 out/                          # VS Code 测试编译输出
├── 📁 resources/                    # 资源文件
│   └── git-icon.svg                # 扩展图标
├── 📁 .vscode/                      # VS Code配置
│   ├── launch.json                 # 调试配置
│   ├── tasks.json                  # 任务配置
│   ├── settings.json               # 工作区设置
│   └── extensions.json             # 推荐扩展
│
├── 📄 .eslintrc.json               # ESLint配置
├── 📄 .gitignore                   # Git忽略文件
├── 📄 .npmignore                   # NPM发布忽略
├── 📄 .vscodeignore                # VS Code打包忽略
├── 📄 CHANGELOG.md                 # 更新日志
├── 📄 CONTRIBUTING.md              # 贡献指南
├── 📄 GETTING_STARTED.md           # 快速上手
├── 📄 LICENSE                      # MIT许可证
├── 📄 package-lock.json            # 依赖锁定文件
├── 📄 package.json                 # 项目配置和依赖
├── 📄 PROJECT_OVERVIEW.md          # 本文件
├── 📄 QUICK_REFERENCE.md           # 功能速查表
├── 📄 README.md                    # 项目说明（英文）
├── 📄 README_CN.md                 # 项目说明（中文详细版）
├── 📄 tsconfig.json                # TypeScript配置
└── 📄 webpack.config.js            # Webpack打包配置
```

## 🎯 核心模块说明

### 1. Extension (扩展主体)

**文件**: `src/extension.ts`

**职责**:
- 扩展激活和停用
- 服务初始化
- 提供者注册
- 命令注册
- 事件监听

**关键代码**:
```typescript
export function activate(context: vscode.ExtensionContext) {
    const gitService = new GitService();
    const branchProvider = new BranchProvider(gitService);
    // ... 注册各种功能
}
```

### 2. Commands (命令层)

**目录**: `src/commands/`

**模块**:
- `git-operations.ts`: Push/Pull/Clone等基础操作
- `branch-manager.ts`: 创建/切换/合并/删除分支
- `conflict-resolver.ts`: 冲突检测和解决
- `repository-init.ts`: 初始化仓库、添加远程、初始提交一站式引导
- `tag-manager.ts`: 创建/推送/删除标签（带注释/轻量、批量推送、远程删除）
- `index.ts`: 额外注册 `addFiles`、`commitChanges` 等 VS Code 命令，衔接 UI 与 git-service

**特点**:
- 用户交互处理
- 进度提示
- 错误处理
- 确认对话框
- 与控制面板消息互通：远程增删改、标签推送、本地/远程操作均复用这些命令

### 3. Services (服务层)

**文件**: `src/services/git-service.ts`

**职责**:
- 封装simple-git库
- 提供统一的Git操作接口
- 错误处理和日志记录
- 仓库状态管理

**核心方法**:
```typescript
class GitService {
    async getStatus(): Promise<StatusResult>
    async getBranches(): Promise<BranchSummary>
    async push/pull/clone/merge/...
}
```

### 4. Providers (数据提供者)

**目录**: `src/providers/`

**模块**:
- `branch-provider.ts`: 分支树视图
- `history-provider.ts`: 提交历史列表
- `conflict-provider.ts`: 冲突文件检测

**实现**: 
实现VS Code的`TreeDataProvider`接口，提供树形数据结构。

### 5. Webview (可视化界面 + 控制面板)

**目录**: `src/webview/`

**技术栈**:
- React 18 + TypeScript
- CSS（完全复用 VS Code 主题变量，自动适配明暗色）
- D3.js（图谱/热力图/时间线）+ Three.js（实验性 3D 图）

**核心文件**:
- `dashboard-panel.ts`: VS Code Webview 管理，处理消息、与命令交互、并行刷新 Git 数据
- `App.tsx`: Webview 入口，包含 10 个固定顺序的标签页（120px 宽按钮）
- `components/*`: 每个标签页一个 React 组件，提供对应操作；`CommitGraph3D.tsx` 作为实验组件按需挂载

**标签页一览（默认 10 个）**:
1. 📋 `CommandHistory.tsx` – 扩展命令历史、复制/重试、清空
2. 📚 `GitCommandReference.tsx` – 常用 Git 命令学习卡片
3. 🌿 `BranchTree.tsx` – 分支树、创建/切换/合并
4. ☁️ `RemoteManager.tsx` – 远程列表、添加/重命名/更新 URL/删除
5. 🏷️ `TagManager.tsx` – 创建带注释/轻量标签、推送单个/全部、删除
6. 🌳 `BranchGraph.tsx` – 分支视图可视化
7. ⚠️ `ConflictEditor.tsx` – 冲突列表与三栏对比解决
8. 📊 `CommitGraph.tsx` – 高 DPI 2D 提交图谱（D3 力导向图）
9. 📅 `TimelineView.tsx` – 日历热力图 + 柱状图时间线
10. 🔥 `HeatmapAnalysis.tsx` – 文件/贡献者热力图

> 🧪 `CommitGraph3D.tsx`：Three.js + React Three Fiber 的 3D 图谱，目前作为可选实验功能，默认未在面板中展示。

### 6. Utils (工具库)

**目录**: `src/utils/`

**模块**:
- `git-utils.ts`: Git操作辅助函数
- `logger.ts`: 日志系统（输出到 VS Code Output Channel）
- `notification.ts`: 通知封装（信息/警告/错误弹窗）
- `command-history.ts`: 记录并暴露命令执行历史，供 CommandHistory 组件读取
- `merge-history.ts`: 合并操作记录，用于分支视图与时间线分析
- `constants.ts`: 常量定义（命令 ID、配置键等）

## 🔄 数据流架构

```
用户操作（快捷键/命令面板/控制面板）
    ↓
Commands（命令层）        ←—— VS Code 命令 / Webview 消息
    ↓
GitService（服务层）      ←—— simple-git 封装 / 错误处理
    ↓
simple-git / Git CLI
    ↓
Git 仓库
    ↓
Providers & DashboardPanel ←—— TreeDataProvider / Webview postMessage
    ↓
VS Code UI（侧边栏 + 控制面板 + 通知）
```

> 控制面板采用 **Promise.allSettled** 并行抓取 status/branches/log/remotes/tags，任意一项失败不会阻塞整体 UI 刷新。

## 🚀 功能矩阵

| 功能模块 | 实现状态 | 文件位置 | 说明 |
|---------|---------|----------|------|
| 快速推送 | ✅ | git-operations.ts | Ctrl+Alt+P |
| 快速拉取 | ✅ | git-operations.ts | Ctrl+Alt+L |
| 克隆仓库 | ✅ | git-operations.ts | 可视化引导 |
| 仓库初始化向导 | ✅ | repository-init.ts | Init / Add Remote / 初始提交 |
| 创建分支 | ✅ | branch-manager.ts | 输入验证 |
| 切换分支 | ✅ | branch-manager.ts | Ctrl+Alt+B |
| 合并分支 | ✅ | branch-manager.ts | 冲突检测 |
| 删除分支 | ✅ | branch-manager.ts | 命令行方式（UI中已移除） |
| 标签管理 | ✅ | tag-manager.ts / TagManager.tsx | 创建/推送/删除标签，支持批量推送 |
| 远程仓库管理 | ✅ | RemoteManager.tsx / git-service.ts | 添加/重命名/更新URL/删除远程 |
| 分支树视图 | ✅ | branch-provider.ts | 侧边栏 |
| 提交历史 | ✅ | history-provider.ts | 列表展示 |
| 提交详情 | ✅ | history-provider.ts | Webview |
| 2D提交图谱 | ✅ | CommitGraph.tsx | D3.js绘制，高DPI优化 |
| 3D提交图谱 | 🧪 | CommitGraph3D.tsx | Three.js渲染（实验中） |
| 热力图分析 | ✅ | HeatmapAnalysis.tsx | 文件/贡献者统计，主题适配 |
| 分支视图 | ✅ | BranchGraph.tsx | 合并关系可视化 |
| 时间线视图 | ✅ | TimelineView.tsx | 日历热力图，主题适配 |
| 冲突检测 | ✅ | conflict-provider.ts | 实时检测 |
| 冲突解决 | ✅ | conflict-resolver.ts | 三种方案 |
| 控制面板 | ✅ | dashboard-panel.ts | 多标签页可视化 |
| 快捷指令历史 | ✅ | CommandHistory.tsx | 命令记录和执行 |
| Git 指令集 | ✅ | GitCommandReference.tsx | 常用命令速查和示例 |

## 📦 依赖关系

### 核心依赖
```json
{
  "simple-git": "^3.19.0",        // Git操作
  "react": "^18.2.0",             // UI框架
  "react-dom": "^18.2.0",         // React DOM
  "d3": "^7.8.5",                 // 数据可视化（2D图谱、热力图等）
  "d3-force": "^3.0.0",           // 力导向布局
  "three": "^0.170.0",            // 3D提交图谱渲染
  "@react-three/fiber": "^8.15.11", // React + Three.js 绑定
  "@react-three/drei": "^9.88.13" // Three.js 实用组件
}
```

### 开发依赖
```json
{
  "typescript": "^5.1.0",
  "webpack": "^5.85.0",
  "webpack-cli": "^5.1.0",
  "ts-loader": "^9.4.0",
  "css-loader": "^6.8.1",
  "style-loader": "^3.3.3",
  "eslint": "^8.40.0",
  "@typescript-eslint/eslint-plugin": "^6.0.0",
  "@typescript-eslint/parser": "^6.0.0",
  "@types/react": "^18.2.0",
  "@types/react-dom": "^18.2.0",
  "@types/d3": "^7.4.3",
  "@types/d3-force": "^3.0.10",
  "@types/node": "^20.0.0",
  "@types/vscode": "^1.80.0",
  "@vscode/test-electron": "^2.3.0"
}
```

## 🛠️ 开发工作流

### 1. 本地开发
```bash
npm install          # 安装依赖
npm run watch        # 监听编译
F5                   # 启动调试
```

### 2. 测试验证
```bash
npm test            # 运行测试
npm run lint        # 代码检查
```

### 3. 打包发布
```bash
npm run compile     # 编译
vsce package        # 打包
vsce publish        # 发布
```

## 📈 性能指标

- **激活时间**: < 500ms
- **命令响应**: < 100ms
- **控制面板基础数据刷新**: < 400ms（并行获取 status/branches/log/remotes）
- **大仓库统计数据刷新**: < 1.5s（热力图/时间线异步加载）
- **内存占用**: < 50MB
- **包体积**: < 5MB

## 🆕 近期性能优化（2025/11）

- **并行数据刷新**：`dashboard-panel.ts` 使用 `Promise.allSettled` 拉取 Git 状态、分支、日志、远程等信息，即使单项失败也不会阻塞整体 UI
- **标签批量拉取**：`git-service.ts#getTags()` 改为 `git for-each-ref`，大幅减少逐条 `rev-list/cat-file` 带来的等待
- **逐级推送策略**：Webview 先推送基础数据、后推送统计图，操作反馈更即时；统计失败时会回退到默认空数据
- **命令容错**：任何刷新步骤出错都会降级处理并记录 warning，用户不再看到长时间的“正在加载”

## 🔐 安全考虑

- ✅ 不存储Git凭据
- ✅ 使用系统Git配置
- ✅ 操作前确认（可配置）
- ✅ 错误信息不泄露敏感数据
- ✅ 文件操作权限检查

## 🌐 国际化支持

- **当前版本**: 简体中文
- **计划支持**: 英文、繁体中文
- **实现思路**: 使用 VS Code `vscode.l10n` 或 `i18n` 包，将 UI 文案抽离为 JSON 语言包

## 📝 代码规范

- **语言**: TypeScript (严格模式)
- **风格**: ESLint + Prettier
- **注释**: JSDoc格式
- **命名**: 
  - 类: PascalCase
  - 函数: camelCase
  - 常量: UPPER_SNAKE_CASE

## 🧪 测试覆盖

- **单元测试**: 计划中（Mocha + Chai + sinon 模拟 Git 命令）
- **集成测试**: 计划中（使用 @vscode/test-electron 在 Extension Host 中运行）
- **E2E 测试**: 计划中（Puppeteer / Playwright 控制 Webview）
- **CI/CD**: 计划接入 GitHub Actions，自动运行 lint + test + package

## 📚 文档完整性

- [x] README.md - 项目介绍
- [x] README_CN.md - 中文详细文档
- [x] GETTING_STARTED.md - 开始使用指南
- [x] QUICK_REFERENCE.md - 功能速查表
- [x] CHANGELOG.md - 更新日志
- [x] CONTRIBUTING.md - 贡献指南
- [x] LICENSE - MIT许可证
- [x] docs/DEVELOPMENT.md - 开发文档
- [x] docs/QUICKSTART.md - 快速开始
- [x] docs/TESTING.md - 测试指南
- [x] PROJECT_OVERVIEW.md - 项目概览
- [x] 代码注释完整

## 🎯 后续规划

### v1.1.0（规划中）
- [ ] 完整 Git 操作覆盖（更多快捷指令/QuickPick 工作流）
- [ ] AI 辅助冲突解决
- [ ] 团队协作增强（协作模板、权限提示）
- [ ] 自定义工作流 / 插件系统
- [ ] 性能与报表导出

## 🤝 贡献统计

- 当前版本由核心团队完成初始开发
- 欢迎社区贡献！请参阅 [`CONTRIBUTING.md`](CONTRIBUTING.md)
- 提交 PR 前请确保 `npm run lint` 与 `npm run compile` 通过

## 📞 支持渠道

- 📖 文档: [Wiki](https://github.com/YIXUAN-oss/CodeGitAssistant/wiki)
- 💬 讨论: [Discussions](https://github.com/YIXUAN-oss/CodeGitAssistant/discussions)
- 🐛 问题: [Issues](https://github.com/YIXUAN-oss/CodeGitAssistant/issues)
- 📧 邮件: support@gitassistant.com

---

**项目状态**: 🟢 活跃开发中

**最后更新**: 2025-12-03

**当前版本**: v1.0.1

**维护者**: Git Assistant Team

