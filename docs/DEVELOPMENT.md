# 开发文档

本文档提供 Git Assistant 扩展的详细开发指南。

> **当前版本**：v1.0.2 | **最后更新**：2025-12-11

## 📋 目录

- [环境搭建](#环境搭建)
- [项目结构](#项目结构)
- [核心概念](#核心概念)
- [开发工作流](#开发工作流)
- [调试技巧](#调试技巧)
- [性能优化](#性能优化)
- [发布流程](#发布流程)

## 环境搭建

### 系统要求

- Node.js 16.x 或更高版本
- npm 8.x 或更高版本
- VS Code 1.80.0 或更高版本
- Git 2.0 或更高版本

### 初始化项目

```bash
# 克隆仓库
git clone https://github.com/YIXUAN-oss/CodeGitAssistant
cd git-assistant

# 安装依赖
npm install

# 编译项目
npm run compile

# 启动开发监听
npm run watch
```

### VS Code 配置

推荐安装以下扩展：
- ESLint
- TypeScript and JavaScript Language Features

## 项目结构

```
git-assistant/
├── src/                          # 扩展端 TypeScript 源码
│   ├── extension.ts             # 扩展入口
│   ├── commands/                # 命令处理
│   │   ├── index.ts            # 命令注册（含 addFiles/commitChanges）
│   │   ├── git-operations.ts   # Git 操作命令（Push/Pull/Clone）
│   │   ├── branch-manager.ts   # 分支管理命令
│   │   ├── conflict-resolver.ts # 冲突解决命令
│   │   ├── repository-init.ts   # 仓库初始化/远程/初始提交
│   │   └── tag-manager.ts       # 标签创建/推送/删除
│   ├── providers/              # 树视图提供者
│   │   ├── branch-provider.ts
│   │   ├── history-provider.ts
│   │   └── conflict-provider.ts
│   ├── services/               # 业务服务
│   │   └── git-service.ts      # Git 服务封装（simple-git）
│   ├── webview/                # Webview 容器
│   │   ├── dashboard-panel.ts  # 面板管理（创建 Webview、消息处理、并行刷新）
│   │   └── globals.d.ts        # VS Code webview 类型声明
│   ├── utils/                  # 工具函数
│   │   ├── git-utils.ts
│   │   ├── logger.ts
│   │   ├── notification.ts
│   │   ├── command-history.ts
│   │   ├── merge-history.ts
│   │   └── constants.ts
│   └── types/                  # 类型定义
│       └── git.ts
├── web/                        # Webview 前端源码（浏览器环境）
│   ├── app.ts                  # 主应用 / 标签切换
│   ├── components/             # 10 个标签页组件（命令历史、Git 指令集、Git 视图表等）
│   ├── styles/                 # Webview 样式（复制到 media/styles）
│   ├── utils/                  # 主题、Git 图渲染等工具
│   ├── types/                  # Web 端 git 相关类型
│   └── index.ts                # Webview 入口脚本
├── resources/                  # 资源文件（扩展图标、截图）
│   └── git-icon.svg
├── dist/                       # 扩展端打包输出（extension.js）
├── media/                      # Webview 前端编译输出（由 web/ 生成）
├── out/                        # VS Code 测试编译输出
├── package.json                # 包配置
├── tsconfig.json              # TypeScript 配置
├── tsconfig.web.json          # Web 前端 TS 配置（rootDir=web, outDir=media）
├── webpack.config.js          # Webpack 配置（仅打包 extension）
└── README.md                  # 说明文档
```

## 核心概念

### Extension 激活

扩展在以下情况激活：
- 工作区包含 `.git` 目录
- 用户执行相关命令
- 打开 Git Assistant 视图
- VS Code 启动完成（`onStartupFinished`）

```typescript
export function activate(context: vscode.ExtensionContext) {
    // 初始化日志与历史
    Logger.initialize();
    CommandHistory.initialize(context);
    MergeHistory.initialize(context);

    // 初始化服务
    const gitService = new GitService();

    // 注册提供者
    const branchProvider = new BranchProvider(gitService);
    const historyProvider = new HistoryProvider(gitService);
    const conflictProvider = new ConflictProvider(gitService);

    // 注册命令
    registerCommands(context, gitService, branchProvider, historyProvider, conflictProvider);
}
```

### Git 服务封装

所有 Git 操作通过 `GitService` 类封装：

```typescript
class GitService {
    private git: SimpleGit;

    async getBranches(): Promise<BranchSummary> {
        return await this.git.branch();
    }

    async push(remote: string, branch: string): Promise<void> {
        await this.git.push(remote, branch);
    }

    // 标签批量获取（git for-each-ref）
    async getTags(): Promise<TagInfo[]> { ... }

    // 远程管理
    async getRemotes(): Promise<RemoteInfo[]> { ... }
    async renameRemote(oldName: string, newName: string): Promise<void> { ... }
    async updateRemoteUrl(name: string, url: string): Promise<void> { ... }
    async removeRemote(name: string): Promise<void> { ... }
}
```

### 树视图提供者

实现 `TreeDataProvider` 接口：

```typescript
class BranchProvider implements vscode.TreeDataProvider<BranchTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BranchTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<BranchTreeItem[]> {
        // 返回子节点
    }
}
```

### Webview 面板

Webview 由两部分组成：

- 扩展端管理类：`src/webview/dashboard-panel.ts`
- 前端源码：`web/` 下的 `app.ts` + `components/*` + `styles/*`

**扩展端职责（DashboardPanel）**：

- 创建 Webview 面板（`gitAssistantDashboard`），配置 `enableScripts` 与 `localResourceRoots`
- 注入 `media/app.js` 与 `media/styles/*.css` 等静态资源
- 通过 `Promise.allSettled` 并行获取 `status/branches/log/remotes/tags/branchGraph` 等数据，组装为 `GitData` 发送给前端：

```typescript
class DashboardPanel {
    private readonly _panel: vscode.WebviewPanel;

    static createOrShow(extensionUri: vscode.Uri, gitService: GitService) {
        const panel = vscode.window.createWebviewPanel(
            'gitAssistantDashboard',
            'Git Assistant 控制面板',
            vscode.ViewColumn.One,
            { enableScripts: true, localResourceRoots: [...] }
        );

        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'getData':
                    await this._sendGitData();
                    break;
                case 'createTag':
                    await vscode.commands.executeCommand('git-assistant.createTag');
                    break;
                // ... 其他消息（刷新、清理缓存等）
            }
        });
    }

    private async _sendGitData() {
        const [statusResult, branchesResult, logResult, remotesResult, tagsResult] =
            await Promise.allSettled([
                this.gitService.getStatus(),
                this.gitService.getBranches(),
                this.gitService.getLog(100),
                this.gitService.getRemotes(),
                this.gitService.getTags()
            ]);
        // 组装 GitData 并通过 postMessage 发送给 Webview
    }
}
```

**前端实现（web/）**：

- `web/app.ts`：负责标签切换、保存上次激活的标签页、转发 `GitData` 给各个组件
- `web/components/*`：每个标签页一个组件（命令历史、Git 指令集、🧬 Git 视图表、远程仓库、分支管理、标签管理、冲突解决、提交图、时间线、热力图）
- `web/utils/git-graph-renderer.ts`：Git 视图表使用的 DAG 渲染器（SVG），将 `BranchGraphData` 转换为节点/连线

**Git 视图表（🧬 Git 图标签）职责概览**：

- 展示各分支的合流路径和最近 ~800 个提交的拓扑结构（基于 `BranchGraphData.dag`）
- 高亮当前 HEAD 所在提交，并通过颜色区分普通提交/合并提交/多分支共享提交
- 支持缩放、平移、展开提交详情，并在按需补全提交详情时避免滚动跳动

## 开发工作流

### 1. 启动开发环境

```bash
# 终端1: 监听 TypeScript 编译
npm run watch

# 终端2: 运行扩展
# 在 VS Code 中按 F5
```

### 2. 开发新功能

```bash
# 创建功能分支
git checkout -b feature/new-feature

# 开发代码
# ...

# 提交更改
git commit -m "feat: add new feature"
```

### 3. 测试

```bash
# 运行单元测试
npm test

# 代码检查
npm run lint

#（可选）仅重新编译测试
npm run compile-tests
```

### 4. 调试

- 设置断点
- 按 F5 启动调试
- 在 Extension Host 窗口中测试
- 查看调试控制台输出

## 调试技巧

### 扩展主机调试

```typescript
// 使用 console.log 调试
console.log('Debug info:', data);

// 使用 Logger
Logger.debug('Debug message', { data });

// 使用 VS Code 输出通道
outputChannel.appendLine('Debug info');
```

### Webview 调试

1. 在 Webview 中右键 -> "打开开发者工具"
2. 使用 Chrome DevTools 调试
3. 查看 Console 和 Network 面板

### 常见问题排查

**问题**: 扩展不激活
```typescript
// 检查 activationEvents 配置
"activationEvents": [
    "workspaceContains:.git",
    "onStartupFinished"
]
```

**问题**: 命令不可用
```typescript
// 确保命令已注册
context.subscriptions.push(
    vscode.commands.registerCommand('git-assistant.yourCommand', handler)
);
```

**问题**: 树视图不更新
```typescript
// 手动触发刷新
this._onDidChangeTreeData.fire();
```

**问题**: 控制面板长时间加载
```typescript
// 检查 Promise.allSettled 是否正确处理失败
// 确保单项失败不阻塞整体 UI
```

## 性能优化

### 1. 并行数据刷新

```typescript
// 使用 Promise.allSettled 同时抓取多项数据
const [statusResult, branchesResult, logResult] = await Promise.allSettled([
    gitService.getStatus(),
    gitService.getBranches(),
    gitService.getLog(100)
]);
```

### 2. 标签批量解析

```typescript
// 使用 git for-each-ref 一次取回全部标签
async getTags(): Promise<TagInfo[]> {
    const result = await this.git.raw([
        'for-each-ref',
        '--sort=-creatordate',
        '--format=%(refname:short)|%(objectname)|%(contents:subject)|%(creatordate:iso8601)',
        'refs/tags'
    ]);
    // 解析结果
}
```

### 3. 防抖和节流

```typescript
// 文件监听防抖（300ms）
let refreshTimeout: NodeJS.Timeout | undefined;
const debouncedRefresh = () => {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
        refreshAllProviders();
    }, 300);
};
```

### 4. 延迟加载

```typescript
// 按需导入大型模块
async function heavyOperation() {
    const module = await import('./heavy-module');
    return module.execute();
}
```

### 5. 缓存结果

```typescript
class GitService {
    private branchCache?: BranchSummary;
    private cacheTime = 0;

    async getBranches(): Promise<BranchSummary> {
        const now = Date.now();
        if (this.branchCache && now - this.cacheTime < 5000) {
            return this.branchCache;
        }

        this.branchCache = await this.git.branch();
        this.cacheTime = now;
        return this.branchCache;
    }
}
```

## 发布流程

### 1. 版本更新

```bash
# 更新版本号
npm version patch  # 1.0.2 -> 1.0.3
npm version minor  # 1.0.2 -> 1.1.0
npm version major  # 1.0.2 -> 2.0.0
```

### 2. 更新文档

- 更新 `CHANGELOG.md`
- 更新 `README.md`
- 检查所有文档链接

### 3. 构建和测试

```bash
# 确保依赖最新
npm install

# 完整构建（生成 dist/ & webview）
npm run compile

# 运行所有测试
npm test

# 代码检查
npm run lint
```

### 4. 打包

```bash
# 安装 vsce
npm install -g @vscode/vsce

# 打包扩展
vsce package

# 生成 git-assistant-1.0.2.vsix
```

### 5. 发布

```bash
# 登录
vsce login your-publisher-name

# 发布到市场
vsce publish

# 或手动上传 .vsix 文件
```

### 6. GitHub Release

```bash
# 创建标签
git tag -a v1.0.2 -m "Release v1.0.2"
git push origin v1.0.2

# 在 GitHub 上创建 Release
# 上传 .vsix 文件作为附件
```

## 最佳实践

### 1. 错误处理

```typescript
try {
    await gitService.push();
    Notification.success('推送成功');
} catch (error) {
    Logger.error('推送失败', error);
    Notification.error('推送失败', error);
}
```

### 2. 进度提示

```typescript
await vscode.window.withProgress(
    {
        location: vscode.ProgressLocation.Notification,
        title: '正在推送...',
        cancellable: false
    },
    async (progress) => {
        progress.report({ increment: 30 });
        await gitService.push();
        progress.report({ increment: 70 });
    }
);
```

### 3. 用户确认

```typescript
const confirmed = await vscode.window.showWarningMessage(
    '确定要删除分支吗？',
    { modal: true },
    '删除',
    '取消'
);

if (confirmed === '删除') {
    await gitService.deleteBranch(branchName);
}
```

### 4. 配置读取

```typescript
const config = vscode.workspace.getConfiguration('git-assistant');
const autoFetch = config.get<boolean>('autoFetch', true);
const confirmPush = config.get<boolean>('confirmPush', true);
const defaultRemote = config.get<string>('defaultRemote', '');
const maxHistoryCount = config.get<number>('maxHistoryCount', 100);
const conflictHighlight = config.get<boolean>('conflictHighlight', true);
```

### 5. 命令历史记录

```typescript
// 记录命令执行结果
CommandHistory.addCommand('git push origin main', '快速推送', true);
CommandHistory.addCommand('git push', '推送', false, '认证失败');
```

## 参考资源

- [VS Code Extension API](https://code.visualstudio.com/api)
- [simple-git 文档](https://github.com/steveukx/git-js)
- [TypeScript 官方文档](https://www.typescriptlang.org/)
- [React 官方文档](https://react.dev/)
- [D3.js 官方文档](https://d3js.org/)

---

如有疑问，请在 [GitHub Discussions](https://github.com/YIXUAN-oss/CodeGitAssistant/discussions) 提问。
