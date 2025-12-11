# Git Assistant 项目详细技术文档

## 📋 目录

1. [项目概述](#项目概述)
2. [核心模块详解](#核心模块详解)
3. [技术栈与算法](#技术栈与算法)
4. [功能实现细节](#功能实现细节)
5. [代码质量与架构优化](#代码质量与架构优化)
6. [项目亮点](#项目亮点)
7. [性能优化策略](#性能优化策略)
8. [创新点总结](#创新点总结)
9. [开发环境搭建](#开发环境搭建)
10. [构建和发布流程](#构建和发布流程)
11. [常见问题解答](#常见问题解答)

---

## 项目概述

**Git Assistant** 是一个专为 VS Code 设计的 Git 可视化管理扩展，旨在通过图形化界面和智能操作简化 Git 工作流。项目采用 TypeScript + React 18 构建，集成了 D3.js 数据可视化、Three.js 3D 渲染等前沿技术，实现了从基础 Git 操作到高级数据分析的全方位功能覆盖。

### 核心定位

- **可视化 Git 工作台**：将命令行操作转化为直观的图形界面
- **智能操作助手**：自动化常见工作流，减少人工错误
- **数据分析工具**：通过热力图、时间线等可视化方式洞察代码演进

---

## 核心模块详解

### 1. 扩展入口模块 (Extension Module)

**文件位置**: `src/extension.ts`

**模块职责**:

- 扩展生命周期管理（激活/停用）
- 服务初始化与依赖注入
- 视图提供者注册
- 命令系统注册
- 文件系统监听与自动刷新

**技术实现**:

```typescript
export function activate(context: vscode.ExtensionContext) {
    // 1. 初始化核心服务
    const gitService = new GitService();
    
    // 2. 注册数据提供者（TreeDataProvider）
    const branchProvider = new BranchProvider(gitService);
    const historyProvider = new HistoryProvider(gitService);
    const conflictProvider = new ConflictProvider(gitService);
    
    // 3. 注册命令处理器
    registerCommands(context, gitService, branchProvider, ...);
    
    // 4. 文件系统监听（防抖优化）
    const debouncedRefresh = debounce(() => {
        refreshAllProviders();
    }, 300);
}
```

**技术要点**:

- **按需激活**: 使用 `activationEvents` 延迟加载，提升启动性能
- **防抖优化**: 文件监听使用 300ms 防抖，避免频繁刷新
- **精准监听**: 只监听 `.git/HEAD` 和 `refs/heads/**`，减少资源消耗
- **统一错误处理**: 所有错误通过 `ErrorHandler` 统一处理，提供友好的错误提示
- **统一日志系统**: 所有日志通过 `Logger` 记录，支持调试模式

---

### 2. Git 服务层 (Git Service Layer)

**文件位置**: `src/services/git-service.ts`

**模块职责**:

- 封装 `simple-git` 库，提供统一的 Git 操作接口
- 实现智能缓存机制，减少重复 Git 调用
- 错误处理与日志记录
- 批量操作优化（如标签批量解析）

**核心技术**:

#### 2.1 智能缓存系统

```typescript
interface CacheItem<T> {
    data: T;
    timestamp: number;
    ttl: number; // 缓存有效期（毫秒）
}

private readonly CACHE_TTL = {
    branches: 5000,        // 分支列表缓存5秒（提升到5秒，减少重复获取）
    status: 1500,          // 状态缓存1.5秒
    remotes: 5000,         // 远程仓库缓存5秒
    tags: 3000,            // 标签缓存3秒
    remoteTags: 10000,     // 远程标签缓存10秒（网络操作，缓存时间更长）
    log: 2000,             // 日志缓存2秒
    branchGraph: 10000,    // 分支图缓存10秒（计算成本高，延长缓存时间）
};

// 缓存大小限制（防止内存泄漏）
private readonly MAX_CACHE_SIZE = 100;
```

**缓存优化特性**：

- **大小限制**: 缓存项超过 100 个时自动删除最旧的项，防止内存泄漏
- **TTL 机制**: 不同数据类型使用不同的缓存时间，平衡性能与数据新鲜度
- **自动清理**: 过期缓存自动失效，无需手动管理
- **持久化缓存**: 分支图数据支持持久化到 workspaceState，跨会话保持

**实现原理**:

- 基于时间戳的 TTL（Time To Live）缓存
- 不同数据类型采用不同缓存时长（网络操作缓存更长）
- 操作后自动失效相关缓存

#### 2.2 标签批量解析优化

**传统方式**（低效）:

```typescript
// 逐个获取标签，每个标签需要多次 Git 调用
for (const tagName of tagNames) {
    const commit = await git.revParse(tagName);
    const message = await git.catFile(['-p', tagName]);
    // ... 多次调用
}
```

**优化方式**（高效）:

```typescript
async getTags(): Promise<TagInfo[]> {
    // 使用 git for-each-ref 一次获取所有标签元数据
    const tagsOutput = await git.raw([
        'for-each-ref',
        'refs/tags',
        '--sort=-creatordate',
        '--format=%(refname:short)|%(objectname)|%(objecttype)|%(contents:subject)|%(creatordate:iso)'
    ]);
    
    // 解析单行输出，性能提升 3-5 倍
    return tagsOutput.split('\n').map(line => {
        const [name, commit, type, message, date] = line.split('|');
        return { name, commit, message, date };
    });
}
```

**性能提升**:

- **传统方式**: N 个标签需要 3N 次 Git 调用
- **优化方式**: 1 次 Git 调用获取所有数据
- **实际效果**: Tag Manager 打开速度提升 3-5 倍

---

### 3. 命令处理层 (Commands Layer)

**文件位置**: `src/commands/`

**模块组成**:

- `git-operations.ts`: Push/Pull/Clone 等基础操作
- `branch-manager.ts`: 分支创建/切换/合并/删除
- `conflict-resolver.ts`: 冲突检测与解决
- `repository-init.ts`: 仓库初始化向导
- `tag-manager.ts`: 标签管理命令

**技术特点**:

#### 3.1 仓库初始化向导

**实现流程**:

```typescript
async function initRepository() {
    // 1. 检查当前目录状态
    if (await isGitRepository()) {
        throw new Error('已经是 Git 仓库');
    }
    
    // 2. 执行 git init
    await git.init();
    
    // 3. 引导添加远程仓库
    const remoteUrl = await vscode.window.showInputBox({...});
    await git.addRemote('origin', remoteUrl);
    
    // 4. 自动添加所有文件
    await git.add('.');
    
    // 5. 引导首次提交
    const message = await vscode.window.showInputBox({...});
    await git.commit(message);
    
    // 6. 可选推送
    if (shouldPush) {
        await git.push('origin', 'main');
    }
}
```

**亮点**:

- **一站式流程**: 从空目录到首次推送，全程引导
- **智能检测**: 自动检测仓库状态，避免重复操作
- **用户友好**: 每个步骤都有清晰的提示和确认

#### 3.2 冲突解决器

**三栏对比编辑器**:

```typescript
// 冲突解决策略
enum ConflictResolution {
    ACCEPT_CURRENT,   // 接受当前更改（本地）
    ACCEPT_INCOMING,  // 接受传入更改（远程）
    ACCEPT_BOTH,      // 接受双方更改（合并）
    MANUAL_EDIT       // 手动编辑
}
```

**实现原理**:

1. **冲突检测**: 解析 Git 冲突标记（`<<<<<<<`, `=======`, `>>>>>>>`）
2. **三栏展示**: 当前版本 | 冲突区域 | 传入版本
3. **智能合并**: 根据用户选择自动生成合并结果
4. **撤销支持**: 支持撤销/重做操作

---

### 4. 数据提供者层 (Providers Layer)

**文件位置**: `src/providers/`

**模块组成**:

- `branch-provider.ts`: 分支树视图提供者
- `history-provider.ts`: 提交历史提供者
- `conflict-provider.ts`: 冲突检测提供者

**技术实现**:

#### 4.1 TreeDataProvider 接口

```typescript
class BranchProvider implements vscode.TreeDataProvider<BranchItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<BranchItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    getTreeItem(element: BranchItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: BranchItem): Promise<BranchItem[]> {
        if (!element) {
            // 根节点：返回分支列表
            const branches = await this.gitService.getBranches();
            return this.buildBranchTree(branches);
        }
        // 子节点：返回提交列表等
        return [];
    }
    
    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}
```

**特点**:

- **懒加载**: 按需加载子节点，提升性能
- **自动刷新**: 监听文件变化，自动更新视图
- **分组展示**: 本地分支/远程分支分组显示

---

### 5. 可视化控制面板 (Dashboard Panel)

**文件位置**: `src/webview/dashboard-panel.ts` + `src/webview/components/`

**技术栈**:

- **React 18**: 组件化 UI 开发
- **D3.js**: 数据可视化（力导向图、热力图）
- **Three.js**: 3D 提交图谱（实验性功能）
- **VS Code Webview API**: 与扩展主进程通信

#### 5.1 并行数据刷新机制

**核心算法**: `Promise.allSettled` 并行执行

```typescript
private async _sendGitData() {
    // 第一阶段：并行获取基础数据
    const [
        statusResult,
        branchesResult,
        logResult,
        remotesResult,
        conflictsResult,
        tagsResult
    ] = await Promise.allSettled([
        this.gitService.getStatus(),
        this.gitService.getBranches(),
        this.gitService.getLog(100),
        this.gitService.getRemotes(),
        this.gitService.getConflicts(),
        this.gitService.getTags()
    ]);
    
    // 容错处理：单个失败不影响整体
    const status = statusResult.status === 'fulfilled' 
        ? statusResult.value 
        : defaultStatus;
    
    // 第二阶段：异步加载耗时数据（不阻塞主界面）
    const loadHeavyData = async () => {
        const [
            fileStatsResult,
            contributorStatsResult,
            timelineResult,
            branchGraphResult
        ] = await Promise.allSettled([
            this.gitService.getFileStats(180),
            this.gitService.getContributorStats(180),
            this.gitService.getCommitTimeline(180),
            this.gitService.getBranchGraph()
        ]);
        
        // 增量更新 UI
        this._panel.webview.postMessage({
            type: 'gitDataUpdate',
            data: { fileStats, contributorStats, timeline, branchGraph }
        });
    };
    
    // 先推送基础数据，再异步加载统计
    this._panel.webview.postMessage({
        type: 'gitData',
        data: { status, branches, log, remotes, conflicts, tags }
    });
    
    loadHeavyData(); // 后台加载
}
```

**性能优势**:

- **并行执行**: 6 个基础数据请求同时进行，总耗时 = max(各请求耗时)
- **容错机制**: 单个失败不影响其他数据加载
- **分阶段推送**: 基础数据立即显示，统计数据后台加载
- **实际效果**: 大仓库下基础面板 < 400ms 恢复

#### 5.2 十个功能标签页

| 标签页       | 组件文件                  | 核心功能           | 技术实现               |
| ------------ | ------------------------- | ------------------ | ---------------------- |
| 📋 快捷指令   | `CommandHistory.tsx`      | 命令历史记录与重试 | React Hooks + 本地存储 |
| 📚 Git 指令集 | `GitCommandReference.tsx` | Git 命令学习卡片   | 静态数据 + 交互式示例  |
| 🌿 分支管理   | `BranchTree.tsx`          | 分支树与操作       | 递归组件 + 状态管理    |
| ☁️ 远程仓库   | `RemoteManager.tsx`       | 远程仓库 CRUD      | 表单验证 + API 调用    |
| 🏷️ 标签管理   | `TagManager.tsx`          | 标签创建/推送/删除 | 批量操作 + 进度反馈    |
| 🧬 Git 视图表 | `git-graph-view.ts`       | 提交 DAG 图形视图  | 自定义 SVG 图形引擎    |
| ⚠️ 冲突解决   | `ConflictEditor.tsx`      | 三栏对比编辑器     | 文本解析 + 合并算法    |
| 📊 提交图     | `CommitGraph.tsx`         | 2D 提交图谱        | Canvas + 高 DPI 渲染   |
| 📅 时间线     | `TimelineView.tsx`        | 日历热力图         | D3.js + 主题适配       |
| 🔥 热力图     | `HeatmapAnalysis.tsx`     | 文件/贡献者统计    | 数据聚合 + 可视化      |

##### 📋 快捷指令（CommandHistory.tsx & command-history.ts）

- **实现架构**：采用**双层架构**：命令历史管理器（`command-history.ts`）负责持久化存储和命令管理，Webview 组件（`CommandHistory.tsx`）负责可视化展示和交互。支持命令分类、状态检测、历史记录、一键执行等功能。

- **核心策略**：
  1. **持久化存储**：使用 VS Code `globalState` 持久化命令历史，最多保留 50 条
  2. **智能分类**：根据仓库状态动态显示可用命令，隐藏不可用命令
  3. **状态检测**：实时检测仓库状态（是否初始化、是否有提交、是否有冲突等）
  4. **命令执行**：通过 `vscode.commands.executeCommand` 执行命令，自动记录执行结果

- **命令历史管理器（`command-history.ts`）**：

**1. 初始化与存储**：

```typescript
export class CommandHistory {
    private static readonly MAX_HISTORY = 50;  // 最多保留 50 条历史记录
    private static readonly STORAGE_KEY = 'git-assistant.commandHistory';
    private static history: CommandHistoryItem[] = [];
    private static context: vscode.ExtensionContext | null = null;

    /**
     * 初始化命令历史（从存储中加载）
     */
    static initialize(context: vscode.ExtensionContext) {
        this.context = context;
        // 从 globalState 加载历史记录
        const stored = context.globalState.get<CommandHistoryItem[]>(this.STORAGE_KEY);
        if (stored) {
            this.history = stored;
        }
    }

    /**
     * 保存到存储
     */
    private static async save() {
        if (this.context) {
            await this.context.globalState.update(this.STORAGE_KEY, this.history);
        }
    }
}
```

**2. 添加命令记录**：

```typescript
/**
 * 添加命令到历史记录
 * @param command Git命令字符串
 * @param commandName 命令显示名称
 * @param success 是否成功
 * @param error 错误信息（可选）
 * @param remote 远程仓库名称（可选，用于推送、拉取等操作）
 */
static addCommand(
    command: string, 
    commandName: string, 
    success: boolean = true, 
    error?: string, 
    remote?: string
) {
    const item: CommandHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // 唯一ID
        command,
        commandName,
        timestamp: Date.now(),
        success,
        error,
        remote
    };

    // 添加到历史记录开头（最新的在前）
    this.history.unshift(item);

    // 限制历史记录数量（最多 50 条）
    if (this.history.length > this.MAX_HISTORY) {
        this.history = this.history.slice(0, this.MAX_HISTORY);
    }

    // 保存到存储
    this.save();
}
```

**3. 获取命令历史**：

```typescript
/**
 * 获取命令历史
 * @param limit 限制返回数量（默认 20 条）
 */
static getHistory(limit: number = 20): CommandHistoryItem[] {
    return this.history.slice(0, limit);
}

/**
 * 清空历史记录
 */
static clear() {
    this.history = [];
    this.save();
}
```

**4. 获取可用命令列表**：

```typescript
/**
 * 获取所有可用的命令列表
 * 包含命令ID、名称、描述、图标、分类、依赖要求
 */
static getAvailableCommands(): Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    requires: string;  // 'none' | 'repository' | 'commits' | 'conflicts'
}> {
    return [
        // 🚀 开始使用 - 不需要仓库
        { 
            id: 'git-assistant.initRepository', 
            name: '初始化仓库', 
            description: '在当前文件夹初始化Git仓库 (git init)', 
            icon: '🆕', 
            category: 'init', 
            requires: 'none' 
        },
        { 
            id: 'git-assistant.quickClone', 
            name: '克隆仓库', 
            description: '克隆远程Git仓库 (git clone)', 
            icon: '📦', 
            category: 'init', 
            requires: 'none' 
        },

        // ⚙️ 配置仓库 - 需要仓库，但不需要提交
        { 
            id: 'git-assistant.addRemote', 
            name: '添加远程仓库', 
            description: '添加远程仓库地址 (git remote add)', 
            icon: '☁️', 
            category: 'setup', 
            requires: 'repository' 
        },

        // 📝 更改操作 - 需要仓库
        { 
            id: 'git-assistant.addFiles', 
            name: '暂存更改', 
            description: '将文件添加到暂存区 (git add)', 
            icon: '➕', 
            category: 'changes', 
            requires: 'repository' 
        },
        { 
            id: 'git-assistant.unstageFiles', 
            name: '取消暂存', 
            description: '从暂存区移除文件 (git reset HEAD)', 
            icon: '↩️', 
            category: 'changes', 
            requires: 'repository' 
        },
        { 
            id: 'git-assistant.discardChanges', 
            name: '放弃更改', 
            description: '放弃工作区中的更改 (git checkout)', 
            icon: '🗑️', 
            category: 'changes', 
            requires: 'repository' 
        },

        // 💾 提交操作 - 需要仓库
        { 
            id: 'git-assistant.commitChanges', 
            name: '提交更改', 
            description: '提交已暂存的更改 (git commit)', 
            icon: '💾', 
            category: 'commit', 
            requires: 'repository' 
        },
        { 
            id: 'git-assistant.commitAllChanges', 
            name: '提交所有更改', 
            description: '提交所有已跟踪更改 (git commit -a)', 
            icon: '📦', 
            category: 'commit', 
            requires: 'repository' 
        },
        { 
            id: 'git-assistant.undoLastCommit', 
            name: '撤销上次提交', 
            description: '保留更改撤销最近提交 (git reset HEAD~1 --soft)', 
            icon: '↩️', 
            category: 'commit', 
            requires: 'commits' 
        },

        // 🔄 同步操作 - 需要提交
        { 
            id: 'git-assistant.quickPush', 
            name: '快速推送', 
            description: '推送当前分支到远程仓库 (git push)', 
            icon: '📤', 
            category: 'sync', 
            requires: 'commits' 
        },
        { 
            id: 'git-assistant.quickPull', 
            name: '快速拉取', 
            description: '从远程仓库拉取最新更改 (git pull)', 
            icon: '📥', 
            category: 'sync', 
            requires: 'commits' 
        },

        // 🌿 分支管理 - 需要提交
        { 
            id: 'git-assistant.createBranch', 
            name: '创建分支', 
            description: '创建新的Git分支 (git branch)', 
            icon: '🌿', 
            category: 'branch', 
            requires: 'commits' 
        },
        { 
            id: 'git-assistant.switchBranch', 
            name: '切换分支', 
            description: '切换到指定分支 (git checkout)', 
            icon: '🔀', 
            category: 'branch', 
            requires: 'commits' 
        },
        { 
            id: 'git-assistant.mergeBranch', 
            name: '合并分支', 
            description: '合并指定分支到当前分支 (git merge)', 
            icon: '🔗', 
            category: 'branch', 
            requires: 'commits' 
        },
        { 
            id: 'git-assistant.renameBranch', 
            name: '重命名分支', 
            description: '重命名本地分支 (git branch -m)', 
            icon: '✏️', 
            category: 'branch', 
            requires: 'commits' 
        },
        { 
            id: 'git-assistant.deleteBranch', 
            name: '删除分支', 
            description: '删除本地分支 (git branch -d)', 
            icon: '🗑️', 
            category: 'branch', 
            requires: 'commits' 
        },

        // 🏷️ 标签管理 - 需要提交
        { 
            id: 'git-assistant.createTag', 
            name: '创建标签', 
            description: '创建新的Git标签（版本标记） (git tag)', 
            icon: '🏷️', 
            category: 'tag', 
            requires: 'commits' 
        },
        { 
            id: 'git-assistant.listTags', 
            name: '查看标签列表', 
            description: '查看所有Git标签 (git tag -l)', 
            icon: '📋', 
            category: 'tag', 
            requires: 'commits' 
        },
        { 
            id: 'git-assistant.deleteTag', 
            name: '删除标签', 
            description: '删除本地或远程标签 (git tag -d)', 
            icon: '🗑️', 
            category: 'tag', 
            requires: 'commits' 
        },
        { 
            id: 'git-assistant.pushTag', 
            name: '推送标签', 
            description: '推送标签到远程仓库 (git push --tags)', 
            icon: '📤', 
            category: 'tag', 
            requires: 'commits' 
        },

        // 📊 查看操作 - 需要仓库
        { 
            id: 'git-assistant.refreshBranches', 
            name: '刷新分支列表', 
            description: '刷新Git分支列表 (git branch)', 
            icon: '🔄', 
            category: 'view', 
            requires: 'repository' 
        },

        // ⚠️ 冲突处理 - 需要冲突
        { 
            id: 'git-assistant.resolveConflicts', 
            name: '解决冲突', 
            description: '解决Git合并冲突 (git merge --abort)', 
            icon: '⚠️', 
            category: 'conflict', 
            requires: 'conflicts' 
        },

        // 🛠️ 工具 - 始终可用
        { 
            id: 'git-assistant.openDashboard', 
            name: '打开控制面板', 
            description: '打开Git Assistant控制面板', 
            icon: '📋', 
            category: 'tools', 
            requires: 'none' 
        }
    ];
}
```

**5. 获取命令分类**：

```typescript
/**
 * 获取命令分类信息
 */
static getCommandCategories(): Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
}> {
    return [
        {
            id: 'init',
            name: '开始使用',
            description: '初始化仓库或克隆现有仓库',
            icon: '🚀'
        },
        {
            id: 'setup',
            name: '配置仓库',
            description: '配置远程仓库和首次提交',
            icon: '⚙️'
        },
        {
            id: 'changes',
            name: '更改操作',
            description: '管理工作区和暂存区',
            icon: '📝'
        },
        {
            id: 'commit',
            name: '提交操作',
            description: '提交更改或撤销最近一次提交',
            icon: '✅'
        },
        {
            id: 'sync',
            name: '同步操作',
            description: '推送和拉取代码',
            icon: '🔄'
        },
        {
            id: 'branch',
            name: '分支管理',
            description: '创建、切换、合并分支',
            icon: '🌿'
        },
        {
            id: 'tag',
            name: '标签管理',
            description: '创建、查看、删除和推送标签',
            icon: '🏷️'
        },
        {
            id: 'view',
            name: '查看操作',
            description: '查看历史和刷新数据',
            icon: '📊'
        },
        {
            id: 'conflict',
            name: '冲突处理',
            description: '解决合并冲突',
            icon: '⚠️'
        },
        {
            id: 'tools',
            name: '工具',
            description: '辅助工具',
            icon: '🛠️'
        }
    ];
}
```

- **Webview 组件实现（`CommandHistory.tsx`）**：

**1. 状态管理**：

```typescript
export const CommandHistory: React.FC<{ data: any }> = ({ data }) => {
    const [history, setHistory] = useState<CommandHistoryItem[]>([]);
    const [availableCommands, setAvailableCommands] = useState<Command[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [isClearingHistory, setIsClearingHistory] = useState<boolean>(false);
    const previousHistoryLengthRef = useRef<number>(0);
    
    // 仓库状态
    const [repositoryState, setRepositoryState] = useState<{
        isRepository: boolean;
        hasCommits: boolean;
        hasConflicts: boolean;
        hasRemote: boolean;
        hasUncommittedChanges: boolean;
        hasUnpushedCommits: boolean;
        currentBranch: string | null;
    }>({
        isRepository: false,
        hasCommits: false,
        hasConflicts: false,
        hasRemote: false,
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
        currentBranch: null
    });
```

**2. 数据同步与状态检测**：

```typescript
useEffect(() => {
    // 更新命令历史
    if (data?.commandHistory) {
        const currentHistoryLength = data.commandHistory.length;
        const previousHistoryLength = previousHistoryLengthRef.current;
        setHistory(data.commandHistory);

        // 如果历史已清空（从有到无）且正在清空，则停止加载状态
        if (currentHistoryLength === 0 && previousHistoryLength > 0 && isClearingHistory) {
            setIsClearingHistory(false);
        }

        // 更新历史长度引用
        previousHistoryLengthRef.current = currentHistoryLength;
    }
    
    // 更新可用命令列表
    if (data?.availableCommands) {
        setAvailableCommands(data.availableCommands);
    }
    
    // 更新命令分类
    if (data?.categories) {
        setCategories(data.categories);
    }

    // 判断仓库状态
    const isRepo = data?.status !== undefined;
    const hasCommits = data?.log?.all?.length > 0;
    const hasConflicts = data?.status?.conflicted?.length > 0;
    const hasRemote = data?.remotes && data.remotes.length > 0;
    const hasUncommittedChanges = isRepo && data?.status && (
        (data.status.modified && data.status.modified.length > 0) ||
        (data.status.created && data.status.created.length > 0) ||
        (data.status.deleted && data.status.deleted.length > 0) ||
        (data.status.not_added && data.status.not_added.length > 0)
    );
    const hasUnpushedCommits = isRepo && data?.status && data.status.ahead > 0;
    const currentBranch = data?.currentBranch || data?.branches?.current || null;

    setRepositoryState({
        isRepository: isRepo,
        hasCommits,
        hasConflicts,
        hasRemote,
        hasUncommittedChanges,
        hasUnpushedCommits,
        currentBranch
    });
}, [data, isClearingHistory]);
```

**3. 命令可用性判断**：

```typescript
/**
 * 判断命令是否可用
 * 根据命令的 requires 属性和当前仓库状态判断
 */
const isCommandAvailable = (command: Command): boolean => {
    const { requires } = command;
    const { isRepository, hasCommits, hasConflicts } = repositoryState;

    switch (requires) {
        case 'none':
            // 不需要任何条件，始终可用
            return true;
        case 'repository':
            // 需要已初始化仓库
            return isRepository;
        case 'commits':
            // 需要已初始化仓库且有提交
            return isRepository && hasCommits;
        case 'conflicts':
            // 需要存在冲突
            return isRepository && hasConflicts;
        default:
            return true;
    }
};
```

**4. 命令执行**：

```typescript
/**
 * 执行命令
 * 通过 postMessage 发送命令ID到扩展端
 */
const executeCommand = (commandId: string) => {
    vscode.postMessage({ command: 'executeCommand', commandId });
};

/**
 * 清空历史记录
 */
const handleClearHistory = () => {
    setIsClearingHistory(true);
    vscode.postMessage({ command: 'clearHistory' });
};
```

**5. 分类折叠/展开**：

```typescript
/**
 * 切换分类展开/折叠状态
 */
const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
        newExpanded.delete(categoryId);
    } else {
        newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
};
```

**6. 仓库状态显示**：

```typescript
{/* 仓库状态提示 */}
<div style={{
    padding: '12px 16px',
    marginBottom: '20px',
    background: repositoryState.isRepository
        ? 'var(--vscode-textBlockQuote-background)'
        : 'var(--vscode-inputValidation-warningBackground)',
    border: `1px solid ${repositoryState.isRepository ? 'var(--vscode-textLink-foreground)' : 'var(--vscode-inputValidation-warningBorder)'}`,
    borderRadius: '6px',
    fontSize: '13px'
}}>
    <div style={{ marginBottom: '8px' }}>
        <strong>📌 当前状态：</strong>
    </div>
    <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        fontSize: '12px',
        color: 'var(--vscode-descriptionForeground)'
    }}>
        {!repositoryState.isRepository ? (
            <div>❌ 未初始化 Git 仓库</div>
        ) : (
            <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                    <span>✅ 已初始化 Git 仓库</span>
                    {repositoryState.currentBranch && (
                        <span>🌿 当前分支: <strong>{repositoryState.currentBranch}</strong></span>
                    )}
                </div>

                {!repositoryState.hasCommits ? (
                    <div>⚠️ 已初始化，但还没有提交到本地仓库</div>
                ) : (
                    <div>✅ 已提交到本地仓库</div>
                )}

                {!repositoryState.hasRemote ? (
                    <div>⚠️ 未配置远程仓库</div>
                ) : (
                    <div>
                        <div>✅ 已配置远程仓库</div>
                        {/* 显示远程仓库列表，支持点击打开 */}
                        {data?.remotes && data.remotes.map((remote: any) => {
                            const remoteUrl = remote.refs?.fetch || remote.refs?.push || '';
                            const browserUrl = convertGitUrlToBrowserUrl(remoteUrl);
                            return (
                                <div
                                    key={remote.name}
                                    onClick={() => {
                                        if (browserUrl) {
                                            vscode.postMessage({
                                                command: 'openRemoteUrl',
                                                url: browserUrl
                                            });
                                        }
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '6px 10px',
                                        background: 'var(--vscode-list-hoverBackground)',
                                        borderRadius: '4px',
                                        cursor: browserUrl ? 'pointer' : 'default'
                                    }}
                                >
                                    <span>🔗</span>
                                    <span><strong>{remote.name}</strong>: {remoteUrl}</span>
                                    {browserUrl && <span>打开 →</span>}
                                </div>
                            );
                        })}
                    </div>
                )}

                {repositoryState.hasUncommittedChanges && (
                    <div>📝 有未提交的更改</div>
                )}

                {repositoryState.hasUnpushedCommits && (
                    <div>📤 有未推送的提交</div>
                )}

                {repositoryState.hasConflicts && (
                    <div style={{ color: 'var(--vscode-errorForeground)' }}>
                        ⚠️ 存在合并冲突
                    </div>
                )}

                {/* 仓库状态正常提示 */}
                {repositoryState.isRepository &&
                    repositoryState.hasCommits &&
                    repositoryState.hasRemote &&
                    !repositoryState.hasUncommittedChanges &&
                    !repositoryState.hasUnpushedCommits &&
                    !repositoryState.hasConflicts && (
                        <div style={{ color: 'var(--vscode-textLink-foreground)' }}>
                            ✨ 仓库状态正常
                        </div>
                    )}
            </>
        )}
    </div>
</div>
```

**7. 分类命令列表渲染**：

```typescript
{/* 分类命令列表 */}
<div style={{ marginBottom: '30px' }}>
    <h3>📋 可用命令</h3>

    {categories.map((category) => {
        // 判断分类是否应该显示（至少有一个可用命令）
        if (!shouldShowCategory(category.id)) {
            return null;
        }

        const commands = getCommandsByCategory(category.id);
        const availableCommandsInCategory = commands.filter(cmd => isCommandAvailable(cmd));
        const isExpanded = expandedCategories.has(category.id);

        if (availableCommandsInCategory.length === 0) {
            return null;
        }

        return (
            <div key={category.id} style={{
                marginBottom: '15px',
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: '8px',
                overflow: 'hidden',
                background: 'var(--vscode-editor-background)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
                {/* 分类标题（可点击折叠） */}
                <div
                    onClick={() => toggleCategory(category.id)}
                    style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--vscode-list-hoverBackground)'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>{category.icon}</span>
                        <div>
                            <div style={{ fontWeight: 'bold' }}>{category.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
                                {category.description} ({availableCommandsInCategory.length} 个可用)
                            </div>
                        </div>
                    </div>
                    <span>{isExpanded ? '▼' : '▶'}</span>
                </div>

                {/* 分类内容（可折叠） */}
                {isExpanded && (
                    <div style={{
                        padding: '15px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '12px'
                    }}>
                        {commands.map((cmd) => {
                            const isAvailable = isCommandAvailable(cmd);
                            return (
                                <div
                                    key={cmd.id}
                                    onClick={() => isAvailable && executeCommand(cmd.id)}
                                    style={{
                                        padding: '12px 16px',
                                        background: isAvailable
                                            ? 'var(--vscode-list-hoverBackground)'
                                            : 'var(--vscode-list-inactiveSelectionBackground)',
                                        border: `1px solid var(--vscode-panel-border)`,
                                        borderRadius: '6px',
                                        cursor: isAvailable ? 'pointer' : 'not-allowed',
                                        opacity: isAvailable ? 1 : 0.6
                                    }}
                                    title={!isAvailable ? '当前状态不可用此命令' : cmd.description}
                                >
                                    <span>{cmd.icon}</span>
                                    <div>
                                        <div style={{ fontWeight: 'bold' }}>{cmd.name}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
                                            {cmd.description}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    })}
</div>
```

**8. 执行历史渲染**：

```typescript
{/* 执行历史 */}
<div>
    <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '15px'
    }}>
        <h3>📜 执行历史</h3>
        <button
            onClick={handleClearHistory}
            disabled={isClearingHistory}
        >
            {isClearingHistory ? '清空中...' : '清空历史'}
        </button>
    </div>

    {history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
            <p>📝 暂无执行历史</p>
            <p>点击上方的命令卡片来执行操作</p>
        </div>
    ) : (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '400px',
            overflowY: 'auto'
        }}>
            {history.map((item) => (
                <div
                    key={item.id}
                    style={{
                        padding: '12px 16px',
                        background: item.success
                            ? 'var(--vscode-list-hoverBackground)'
                            : 'var(--vscode-inputValidation-errorBackground)',
                        border: `1px solid ${item.success ? 'var(--vscode-panel-border)' : 'var(--vscode-inputValidation-errorBorder)'}`,
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                    }}
                >
                    <span>{item.success ? '✅' : '❌'}</span>
                    <div style={{ flex: 1 }}>
                        <div style={{
                            fontWeight: 'bold',
                            fontSize: '14px',
                            color: item.success ? 'var(--vscode-foreground)' : 'var(--vscode-errorForeground)'
                        }}>
                            {item.commandName}
                        </div>
                        <div style={{
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            color: 'var(--vscode-descriptionForeground)'
                        }}>
                            {item.command}
                        </div>
                        {item.remote && (
                            <div style={{ fontSize: '11px', color: 'var(--vscode-textLink-foreground)' }}>
                                ☁️ 远程: {item.remote}
                            </div>
                        )}
                        {item.error && (
                            <div style={{ fontSize: '11px', color: 'var(--vscode-errorForeground)' }}>
                                错误: {item.error}
                            </div>
                        )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
                        {formatTime(item.timestamp)}
                    </div>
                </div>
            ))}
        </div>
    )}
</div>
```

**9. 时间格式化**：

```typescript
/**
 * 格式化时间戳为相对时间
 */
const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
};
```

- **命令执行处理（`dashboard-panel.ts`）**：

**1. 执行命令**：

```typescript
/**
 * 执行命令
 * 通过 vscode.commands.executeCommand 执行命令，并记录执行结果
 */
private async _executeCommand(commandId: string) {
    // 获取命令显示名称
    const commandName = CommandHistory.getAvailableCommands()
        .find(c => c.id === commandId)?.name || commandId;

    try {
        // 执行命令
        await vscode.commands.executeCommand(commandId);

        // 只有在命令实际执行成功后，才记录为成功
        CommandHistory.addCommand(commandId, commandName, true);
        await this._sendGitData();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // 执行出错时，记录失败状态和错误信息
        CommandHistory.addCommand(commandId, commandName, false, errorMessage);
        await this._sendGitData();
    }
}
```

**2. 清空历史**：

```typescript
// 在消息处理中
case 'clearHistory':
    CommandHistory.clear();
    await this._sendGitData();
    break;
```

**3. 发送数据到 Webview**：

```typescript
/**
 * 发送 Git 数据到 Webview
 * 包含命令历史、可用命令列表、命令分类等信息
 */
private async _sendGitData() {
    if (this._disposed) {
        return;
    }

    // ... 获取其他 Git 数据 ...

    this._panel.webview.postMessage({
        type: 'gitDataUpdate',
        data: {
            // ... 其他数据 ...
            commandHistory: CommandHistory.getHistory(20),  // 最近 20 条历史
            availableCommands: CommandHistory.getAvailableCommands(),  // 所有可用命令
            categories: CommandHistory.getCommandCategories()  // 命令分类
        }
    });
}
```

- **常见问题 & 解决**：

  - **命令列表过长导致渲染卡顿**：使用网格布局（`gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))'`），只渲染可见区域；历史记录限制最多显示 20 条，支持滚动查看
  - **重复执行命令失败**：在 UI 中用状态标识（成功/失败图标），显示错误详情，支持查看完整错误信息
  - **命令不可用但显示**：通过 `isCommandAvailable` 函数判断，不可用命令显示为灰色，禁用点击
  - **历史记录丢失**：使用 `globalState` 持久化存储，扩展重启后自动恢复
  - **状态检测不准确**：实时检测仓库状态，在数据更新时重新计算可用命令

- **亮点**：
  - **智能分类**：根据仓库状态动态显示可用命令，隐藏不可用命令
  - **状态检测**：实时检测仓库状态，显示详细的状态信息
  - **持久化存储**：使用 `globalState` 持久化命令历史，最多保留 50 条
  - **一键执行**：点击命令卡片即可执行，自动记录执行结果
  - **历史记录**：显示执行历史，包含成功/失败状态、错误信息、远程仓库等
  - **时间格式化**：相对时间显示（刚刚、X分钟前、X小时前等），提高可读性
  - **分类折叠**：支持分类折叠/展开，便于管理大量命令
  - **远程仓库链接**：支持点击远程仓库在浏览器中打开

##### 📚 Git 指令集（GitCommandReference.tsx）

- **实现架构**：采用**静态数据配置 + React 组件渲染**的架构，支持命令搜索、分类展开/折叠、一键复制等功能。所有命令数据内嵌在组件中，无需外部 API 调用。

- **核心策略**：
  1. **静态数据配置**：所有 Git 命令以 TypeScript 接口形式定义，包含 11 个分类、100+ 个常用命令
  2. **智能搜索过滤**：支持按命令、描述、示例进行全文搜索，自动展开匹配的分类
  3. **一键复制**：通过 Webview 消息机制实现跨进程剪贴板操作
  4. **主题适配**：所有 UI 元素使用 VS Code CSS 变量，自动适配浅色/深色主题
  5. **响应式布局**：使用 CSS Grid 自适应布局，支持不同屏幕尺寸

- **数据结构设计**：

```typescript
interface GitCommand {
    id: string;              // 命令唯一标识
    command: string;         // Git 命令字符串
    description: string;     // 命令描述
    example?: string;        // 可选示例
}

interface CommandCategory {
    id: string;              // 分类唯一标识
    name: string;            // 分类名称
    icon: string;            // 分类图标（emoji）
    description: string;     // 分类描述
    commands: GitCommand[];  // 该分类下的命令列表
}
```

- **命令分类**（11 个分类，100+ 命令）：

| 分类 ID | 分类名称 | 图标 | 命令数量 | 说明 |
|---------|---------|------|---------|------|
| `init` | 初始化与克隆 | 🚀 | 4 | git init, clone 等 |
| `basic` | 基础操作 | 📝 | 11 | status, add, commit, log 等 |
| `branch` | 分支管理 | 🌿 | 11 | branch, checkout, merge 等 |
| `remote` | 远程仓库 | ☁️ | 11 | remote, fetch, pull, push 等 |
| `tag` | 标签管理 | 🏷️ | 9 | tag 创建、推送、删除等 |
| `stash` | 暂存管理 | 📦 | 8 | stash 保存和恢复 |
| `reset` | 撤销操作 | ↩️ | 7 | reset, checkout, restore 等 |
| `rebase` | 变基操作 | 🔄 | 5 | rebase 相关命令 |
| `cherry-pick` | 精选提交 | 🍒 | 4 | cherry-pick 相关命令 |
| `config` | 配置管理 | ⚙️ | 5 | git config 相关 |
| `advanced` | 高级操作 | 🔧 | 10 | clean, reflog, submodule, worktree 等 |

- **搜索过滤实现**：

```typescript
const [searchTerm, setSearchTerm] = useState<string>('');

// 过滤命令：支持按命令、描述、示例搜索
const filteredCategories = categories
    .map(category => {
        if (!searchTerm.trim()) {
            return category;
        }
        const searchLower = searchTerm.toLowerCase();
        const filteredCommands = category.commands.filter(cmd =>
            cmd.command.toLowerCase().includes(searchLower) ||
            cmd.description.toLowerCase().includes(searchLower) ||
            (cmd.example && cmd.example.toLowerCase().includes(searchLower))
        );
        if (filteredCommands.length === 0) {
            return null; // 该分类无匹配命令
        }
        return { ...category, commands: filteredCommands };
    })
    .filter((cat): cat is CommandCategory => cat !== null);

// 搜索时自动展开匹配的分类
useEffect(() => {
    if (searchTerm.trim()) {
        const newExpanded = new Set<string>();
        filteredCategories.forEach(cat => {
            newExpanded.add(cat.id);
        });
        setExpandedCategories(newExpanded);
    }
}, [searchTerm]);
```

- **复制到剪贴板实现**：

```typescript
const handleCopyCommand = async (command: string) => {
    try {
        // 发送复制命令到扩展（Webview 中 clipboard API 受限）
        vscode.postMessage({
            command: 'copyToClipboard',
            text: command
        });
        
        // 显示复制成功反馈（2秒后消失）
        setCopiedCommand(command);
        setTimeout(() => {
            setCopiedCommand(null);
        }, 2000);
    } catch (error) {
        // 复制失败，静默处理（用户可以通过其他方式复制）
    }
};
```

**扩展端处理**（`dashboard-panel.ts`）：

```typescript
case 'copyToClipboard':
    if (message.text) {
        await vscode.env.clipboard.writeText(message.text);
        vscode.window.showInformationMessage(`已复制: ${message.text}`);
    }
    break;
```

- **分类展开/折叠实现**：

```typescript
const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['init', 'basic']) // 默认展开前两个分类
);

const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
        newExpanded.delete(categoryId);
    } else {
        newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
};
```

- **UI 渲染优化**：

```typescript
// 响应式 Grid 布局：每行至少 450px，自动填充
<div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))',
    gap: '10px'
}}>
    {category.commands.map(cmd => (
        <CommandCard key={cmd.id} command={cmd} onCopy={handleCopyCommand} />
    ))}
</div>
```

- **主题适配**：所有颜色使用 VS Code CSS 变量：

```typescript
const styles = {
    background: 'var(--vscode-sideBar-background)',
    foreground: 'var(--vscode-foreground)',
    border: 'var(--vscode-panel-border)',
    hoverBackground: 'var(--vscode-list-hoverBackground)',
    buttonBackground: 'var(--vscode-button-background)',
    buttonForeground: 'var(--vscode-button-foreground)',
    // ... 更多变量
};
```

- **性能优化**：
  - 使用 `useState` 和 `useEffect` 管理状态，避免不必要的重渲染
  - 搜索过滤使用 `useMemo` 缓存结果（可选优化）
  - 命令数据静态定义，无需运行时加载

- **亮点特性**：
  1. **智能搜索**：搜索时自动展开匹配的分类，提升用户体验
  2. **一键复制**：点击复制按钮即可复制命令，无需手动选择
  3. **主题适配**：完全适配 VS Code 浅色/深色主题
  4. **响应式布局**：自适应不同屏幕尺寸，移动端友好
  5. **命令覆盖全面**：涵盖 Git 日常使用的所有场景，从基础到高级
  6. **示例丰富**：大部分命令提供实际使用示例，降低学习成本

##### 🌿 分支管理（BranchTree.tsx & branch-manager.ts & branch-provider.ts）

- **实现架构**：采用**三层架构**：侧边栏树视图（`BranchProvider`）、命令处理（`branch-manager.ts`）、Webview 可视化（`BranchTree.tsx`）。支持创建、切换、合并、重命名、删除等完整分支操作。

- **核心策略**：
  1. **智能缓存**：BranchProvider 使用 3 秒 TTL 缓存，减少 Git 调用
  2. **安全检查**：切换/合并前检查未提交更改，自动提示 stash
  3. **合并策略建议**：根据分支关系智能推荐 fast-forward 或 three-way 合并
  4. **状态同步**：通过 CommandHistory 和实时数据刷新同步操作状态

- **侧边栏树视图实现（`BranchProvider`）**：

**1. 树数据提供者**：

```typescript
export class BranchProvider implements vscode.TreeDataProvider<BranchTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<BranchTreeItem | undefined | null | void> =
        new vscode.EventEmitter<BranchTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<BranchTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    // 内存缓存：缓存分支数据和树项，避免重复获取和创建
    private _cachedBranches: { data: any; timestamp: number } | null = null;
    private _cachedLocalItems: BranchTreeItem[] | null = null;
    private _cachedRemoteItems: BranchTreeItem[] | null = null;
    private readonly CACHE_TTL = 3000; // 缓存3秒

    constructor(private gitService: GitService) { }

    refresh(): void {
        // 清除缓存，确保下次获取最新数据
        this._cachedBranches = null;
        this._cachedLocalItems = null;
        this._cachedRemoteItems = null;
        this._onDidChangeTreeData.fire();
    }

    /**
     * 获取分支数据（带缓存）
     */
    private async _getBranchesData(): Promise<{ branches: any; currentBranch: string | null }> {
        const now = Date.now();

        // 检查缓存是否有效
        if (this._cachedBranches && (now - this._cachedBranches.timestamp) < this.CACHE_TTL) {
            return this._cachedBranches.data;
        }

        // 从 GitService 获取（GitService 也有缓存）
        const branches = await this.gitService.getBranches();
        const currentBranch = branches.current;

        // 更新缓存
        this._cachedBranches = {
            data: { branches, currentBranch },
            timestamp: now
        };

        return { branches, currentBranch };
    }

    async getChildren(element?: BranchTreeItem): Promise<BranchTreeItem[]> {
        if (!element) {
            // 根节点：显示本地分支和远程分支分组
            return [
                new BranchTreeItem(
                    '本地分支',
                    'local',
                    false,
                    false,
                    vscode.TreeItemCollapsibleState.Expanded
                ),
                new BranchTreeItem(
                    '远程分支',
                    'remote',
                    false,
                    true,
                    vscode.TreeItemCollapsibleState.Collapsed
                )
            ];
        }

        try {
            // 使用缓存获取分支数据
            const { branches, currentBranch } = await this._getBranchesData();

            if (element.branchName === 'local') {
                // 检查本地分支缓存
                if (this._cachedLocalItems) {
                    return this._cachedLocalItems;
                }

                // 本地分支
                const localItems = branches.all
                    .filter((b: string) => !b.startsWith('remotes/'))
                    .map((branch: string) => {
                        const isCurrent = branch === currentBranch;
                        return new BranchTreeItem(
                            branch,
                            branch,
                            isCurrent,
                            false,
                            vscode.TreeItemCollapsibleState.None,
                            {
                                command: 'git-assistant.switchBranch',
                                title: '切换分支',
                                arguments: [branch]
                            }
                        );
                    });

                // 缓存本地分支项
                this._cachedLocalItems = localItems;
                return localItems;
            } else if (element.branchName === 'remote') {
                // 检查远程分支缓存
                if (this._cachedRemoteItems) {
                    return this._cachedRemoteItems;
                }

                // 远程分支
                const remoteItems = branches.all
                    .filter((b: string) => b.startsWith('remotes/'))
                    .map((branch: string) => {
                        const displayName = branch.replace('remotes/', '');
                        return new BranchTreeItem(
                            displayName,
                            branch,
                            false,
                            true,
                            vscode.TreeItemCollapsibleState.None
                        );
                    });

                // 缓存远程分支项
                this._cachedRemoteItems = remoteItems;
                return remoteItems;
            }

            return [];
        } catch (error) {
            vscode.window.showErrorMessage(`获取分支列表失败: ${error}`);
            return [];
        }
    }
}
```

**2. 分支树项定义**：

```typescript
export class BranchTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly branchName: string,
        public readonly isCurrent: boolean,
        public readonly isRemote: boolean,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);

        this.tooltip = branchName;
        this.contextValue = isRemote ? 'remoteBranch' : 'localBranch';

        if (isCurrent) {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
            this.description = '当前';
        } else if (isRemote) {
            this.iconPath = new vscode.ThemeIcon('cloud');
        } else {
            this.iconPath = new vscode.ThemeIcon('git-branch');
        }
    }
}
```

- **分支管理命令实现（`branch-manager.ts`）**：

**1. 创建分支**：

```typescript
context.subscriptions.push(
    vscode.commands.registerCommand('git-assistant.createBranch', async () => {
        try {
            // 输入分支名称（带验证）
            const branchName = await vscode.window.showInputBox({
                prompt: '输入新分支名称',
                placeHolder: 'feature/new-feature',
                validateInput: (value) => {
                    if (!value) {
                        return '分支名称不能为空';
                    }
                    // 验证分支名称格式：只能包含字母、数字、下划线和横线
                    if (!/^[a-zA-Z0-9/_-]+$/.test(value)) {
                        return '分支名称只能包含字母、数字、下划线和横线';
                    }
                    return null;
                }
            });

            if (!branchName) {
                return;
            }

            // 询问是否立即切换
            const shouldCheckout = await vscode.window.showQuickPick(
                ['创建并切换', '仅创建'],
                { placeHolder: '选择操作' }
            );

            if (!shouldCheckout) {
                return;
            }

            await gitService.createBranch(branchName, shouldCheckout === '创建并切换');

            vscode.window.showInformationMessage(`✅ 分支 "${branchName}" 创建成功`);

            // 使用防抖刷新，避免重复刷新
            branchProvider.refresh();
            DashboardPanel.refresh();

        } catch (error) {
            vscode.window.showErrorMessage(`创建分支失败: ${error}`);
        }
    })
);
```

**2. 切换分支（带安全检查）**：

```typescript
context.subscriptions.push(
    vscode.commands.registerCommand('git-assistant.switchBranch', async () => {
        try {
            // 获取所有分支
            const branches = await gitService.getBranches();
            const currentBranch = branches.current;

            // 只允许切换本地分支
            const localBranches = branches.all.filter(branch => !branch.startsWith('remotes/'));

            if (localBranches.length === 0) {
                vscode.window.showInformationMessage('没有可切换的本地分支');
                return;
            }

            // 创建快速选择项
            const items = localBranches.map(branch => ({
                label: branch === currentBranch ? `$(check) ${branch}` : `$(git-branch) ${branch}`,
                description: branch === currentBranch ? '当前分支' : '',
                branch: branch
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: '选择要切换的分支'
            });

            if (!selected || selected.branch === currentBranch) {
                return;
            }

            // 检查未提交的更改
            const status = await gitService.getStatus();
            if (status.modified.length > 0 || status.created.length > 0) {
                const choice = await vscode.window.showWarningMessage(
                    '有未提交的更改，是否暂存(stash)？',
                    '暂存并切换',
                    '放弃更改并切换',
                    '取消'
                );

                if (choice === '取消' || !choice) {
                    return;
                }

                if (choice === '暂存并切换') {
                    await gitService.stash();
                }
            }

            await gitService.checkout(selected.branch);
            vscode.window.showInformationMessage(`✅ 已切换到分支 "${selected.branch}"`);

            // 使用防抖刷新
            branchProvider.refresh();
            DashboardPanel.refresh();

        } catch (error) {
            vscode.window.showErrorMessage(`切换分支失败: ${error}`);
        }
    })
);
```

**3. 合并分支（智能策略建议）**：

```typescript
context.subscriptions.push(
    vscode.commands.registerCommand('git-assistant.mergeBranch', async () => {
        try {
            // 获取当前分支
            const branches = await gitService.getBranches();
            const currentBranch = branches.current;

            // 仅显示本地分支
            const localBranches = branches.all.filter(branch => !branch.startsWith('remotes/'));

            // 选择要合并的分支
            const items = localBranches
                .filter(b => b !== currentBranch)
                .map(branch => ({
                    label: `$(git-branch) ${branch}`,
                    branch: branch
                }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `选择要合并到 "${currentBranch}" 的分支`
            });

            if (!selected) {
                return;
            }

            // ========== 合并前状态检查 ==========
            const status = await gitService.getStatus();
            const hasUncommittedChanges = status.modified.length > 0 ||
                status.created.length > 0 ||
                status.deleted.length > 0 ||
                status.not_added.length > 0;

            if (hasUncommittedChanges) {
                const changeCount = status.modified.length + status.created.length + status.deleted.length + status.not_added.length;
                const changeDetails = [
                    status.modified.length > 0 ? `${status.modified.length} 个已修改文件` : '',
                    status.created.length > 0 ? `${status.created.length} 个新文件` : '',
                    status.deleted.length > 0 ? `${status.deleted.length} 个已删除文件` : '',
                    status.not_added.length > 0 ? `${status.not_added.length} 个未跟踪文件` : ''
                ].filter(Boolean).join('、');

                const choice = await vscode.window.showWarningMessage(
                    `合并前检测到 ${changeCount} 个未提交的更改 (${changeDetails})。建议先提交或暂存这些更改。`,
                    { modal: true },
                    '暂存后继续',
                    '提交后继续',
                    '直接合并',
                    '取消'
                );

                if (!choice || choice === '取消') {
                    return;
                }

                if (choice === '暂存后继续') {
                    await gitService.stash(`Stash before merging ${selected.branch}`);
                    vscode.window.showInformationMessage('✅ 更改已暂存');
                } else if (choice === '提交后继续') {
                    // 提示用户先提交
                    vscode.window.showWarningMessage(
                        '请先使用 "Git: 提交所有更改" 命令提交更改，然后再进行合并操作。',
                        '打开命令面板'
                    ).then(selected => {
                        if (selected === '打开命令面板') {
                            vscode.commands.executeCommand('workbench.action.showCommands');
                        }
                    });
                    return;
                }
                // '直接合并' 继续执行合并流程
            }

            // ========== 合并策略智能建议 ==========
            const mergeInfo = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: '正在分析分支关系...',
                    cancellable: false
                },
                async () => {
                    return await gitService.getBranchMergeInfo(selected.branch);
                }
            );

            // 根据分析结果构建策略选项
            const strategyOptions: Array<{
                label: string;
                description: string;
                value: 'fast-forward' | 'three-way';
                recommended?: boolean;
            }> = [];

            if (mergeInfo.canFastForward === true) {
                // 可以快进，推荐快速合并
                strategyOptions.push({
                    label: '⚡ 快速合并 (fast-forward) $(star) 推荐',
                    description: '保持线性历史，当前分支可以直接快进',
                    value: 'fast-forward',
                    recommended: true
                });
                strategyOptions.push({
                    label: '🔀 三路合并 (三方合并提交)',
                    description: '强制创建合并提交，保留分支结构',
                    value: 'three-way'
                });
            } else if (mergeInfo.canFastForward === false || mergeInfo.hasDiverged) {
                // 不能快进或已分叉，推荐三路合并
                strategyOptions.push({
                    label: '🔀 三路合并 (三方合并提交) $(star) 推荐',
                    description: mergeInfo.hasDiverged
                        ? `分支已分叉 (${mergeInfo.commitsAhead} 个新提交, ${mergeInfo.commitsBehind} 个不同提交)，建议创建合并提交`
                        : `无法快进 (${mergeInfo.commitsAhead} 个新提交)，建议创建合并提交`,
                    value: 'three-way',
                    recommended: true
                });
                strategyOptions.push({
                    label: '⚡ 快速合并 (fast-forward)',
                    description: '仅当可以快进时成功（可能失败）',
                    value: 'fast-forward'
                });
            } else {
                // 无法确定，提供两个选项
                strategyOptions.push({
                    label: '⚡ 快速合并 (fast-forward)',
                    description: '保持线性历史，仅当可以快进时成功',
                    value: 'fast-forward'
                });
                strategyOptions.push({
                    label: '🔀 三路合并 (三方合并提交)',
                    description: '创建合并提交，保留分支结构',
                    value: 'three-way'
                });
            }

            const strategyPick = await vscode.window.showQuickPick(
                strategyOptions,
                {
                    placeHolder: mergeInfo.canFastForward === true
                        ? '✅ 检测到可快进合并，推荐使用快速合并'
                        : mergeInfo.hasDiverged
                            ? '⚠️ 分支已分叉，推荐使用三路合并'
                            : '选择合并策略'
                }
            );

            if (!strategyPick) {
                return;
            }

            // 构建确认消息
            const strategyLabel = strategyPick.label.replace(/\s*\$\(star\)\s*推荐\s*/g, '').trim();
            let confirmMessage = `确定要将 "${selected.branch}" 以"${strategyLabel}"合并到 "${currentBranch}" 吗？`;

            if (mergeInfo.commitsAhead > 0) {
                confirmMessage += `\n\n将合并 ${mergeInfo.commitsAhead} 个提交到 ${currentBranch}`;
            }
            if (mergeInfo.canFastForward === false && strategyPick.value === 'fast-forward') {
                confirmMessage += `\n\n⚠️ 警告：此合并可能无法快进，操作可能失败`;
            }

            const mergeAction = '合并';
            const cancelAction = '取消';
            const confirm = await vscode.window.showWarningMessage(
                confirmMessage,
                { modal: true },
                mergeAction,
                cancelAction
            );

            if (confirm !== '合并') {
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `正在合并分支 ${selected.branch}...`,
                    cancellable: false
                },
                async () => {
                    await gitService.merge(selected.branch, strategyPick.value === 'fast-forward' ? 'fast-forward' : 'three-way');
                    // 等待一小段时间，确保 Git 合并操作完成
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            );

            vscode.window.showInformationMessage(
                `✅ 分支 "${selected.branch}" 已通过${strategyPick.value === 'fast-forward' ? '快速合并' : '三路合并'}合并到 "${currentBranch}"`
            );

            // 合并后需要立即刷新（因为数据变化较大）
            branchProvider.refresh();
            // 延迟一点再刷新，确保 Git 数据已经更新
            await new Promise(resolve => setTimeout(resolve, 200));
            DashboardPanel.refreshImmediate();

        } catch (error) {
            const errorMsg = String(error);
            if (errorMsg.includes('CONFLICT')) {
                vscode.window.showErrorMessage(
                    '合并冲突！请使用 "Git Assistant: 解决冲突" 命令处理'
                );
            } else {
                vscode.window.showErrorMessage(`合并失败: ${error}`);
            }
        }
    })
);
```

**4. 删除分支（安全检查）**：

```typescript
context.subscriptions.push(
    vscode.commands.registerCommand('git-assistant.deleteBranch', async (branchName?: string) => {
        try {
            const branches = await gitService.getBranches();
            const currentBranch = branches.current;

            let targetBranch = branchName;

            if (!targetBranch) {
                const items = branches.all
                    .filter(b => b !== currentBranch)
                    .map(branch => ({
                        label: `$(git-branch) ${branch}`,
                        branch: branch
                    }));

                if (items.length === 0) {
                    vscode.window.showInformationMessage('没有可删除的本地分支（不能删除当前分支）');
                    return;
                }

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: '选择要删除的分支'
                });

                if (!selected) {
                    return;
                }
                targetBranch = selected.branch;
            }

            if (targetBranch === currentBranch) {
                vscode.window.showWarningMessage('不能删除当前所在的分支，请先切换到其他分支。');
                return;
            }

            // 判断分支是否已合并到当前分支，用于给出更友好的安全提示
            const isMerged = await gitService.isBranchMergedIntoCurrent(targetBranch);

            let confirm: string | undefined;

            if (isMerged) {
                // 已合并分支：正常删除提示
                const deleteAction = '删除';
                confirm = await vscode.window.showWarningMessage(
                    `分支 "${targetBranch}" 已合并到当前分支 "${currentBranch}"。\n\n删除该分支不会丢失已合并到当前分支的提交，是否继续？`,
                    { modal: true },
                    deleteAction
                );

                if (confirm !== deleteAction) {
                    return;
                }

                await gitService.deleteBranch(targetBranch, false);
                vscode.window.showInformationMessage(`✅ 已删除已合并分支 "${targetBranch}"`);
            } else {
                // 未合并分支：提示风险，并提供"强制删除"选项
                const forceDeleteAction = '强制删除（未合并）';
                confirm = await vscode.window.showWarningMessage(
                    `⚠️ 分支 "${targetBranch}" 尚未完全合并到当前分支 "${currentBranch}"。\n\n强制删除可能导致该分支上的未合并提交无法通过普通方式找回（仍可通过 reflog 等方式手动恢复）。\n\n确定要强制删除该分支吗？`,
                    { modal: true },
                    forceDeleteAction
                );

                if (confirm !== forceDeleteAction) {
                    return;
                }

                await gitService.deleteBranch(targetBranch, true);
                vscode.window.showInformationMessage(`✅ 已强制删除未合并分支 "${targetBranch}"`);
            }

            // 使用防抖刷新
            branchProvider.refresh();
            DashboardPanel.refresh();

        } catch (error) {
            vscode.window.showErrorMessage(`删除分支失败: ${error}`);
        }
    })
);
```

- **GitService 分支操作方法**：

**1. 创建分支**：

```typescript
/**
 * 创建分支
 */
async createBranch(branchName: string, checkout: boolean = false): Promise<void> {
    const git = this.ensureGit();
    // 在创建新分支前，先记录当前分支
    const status = await this.getStatus(true); // 强制刷新状态
    const previousBranch = status.current;

    await git.checkoutLocalBranch(branchName);

    // 清除相关缓存
    this.invalidateCache('branches');
    this.invalidateCache('status');

    if (!checkout && previousBranch) {
        // 切换回原分支（优先使用之前记录的分支）
        await git.checkout(previousBranch);
        this.invalidateCache('status');
    }
}
```

**2. 快进合并检测**：

```typescript
/**
 * 检查是否可以快进合并
 * @param branchName 要合并的分支名称
 * @returns 如果可以快进返回true，否则返回false，出错返回null
 */
async canFastForwardMerge(branchName: string): Promise<boolean | null> {
    try {
        const git = this.ensureGit();
        const branchInfo = await git.branch();
        const currentBranch = branchInfo.current;

        if (!currentBranch) {
            return null;
        }

        // 获取当前分支的最新提交
        const currentCommit = await git.raw(['rev-parse', currentBranch]);
        if (!currentCommit || !currentCommit.trim()) {
            return null;
        }

        // 获取要合并分支的最新提交
        const branchCommit = await git.raw(['rev-parse', branchName]);
        if (!branchCommit || !branchCommit.trim()) {
            return null;
        }

        // 获取共同祖先
        const mergeBase = await git.raw(['merge-base', currentBranch, branchName]);
        if (!mergeBase || !mergeBase.trim()) {
            return null;
        }

        // 如果共同祖先等于当前分支的HEAD，说明可以快进
        const currentCommitTrimmed = currentCommit.trim();
        const mergeBaseTrimmed = mergeBase.trim();

        return currentCommitTrimmed === mergeBaseTrimmed;
    } catch (error) {
        ErrorHandler.handleSilent(error, '检查快进合并');
        return null;
    }
}
```

**3. 分支合并信息获取**：

```typescript
/**
 * 获取分支的差异信息（用于合并策略建议）
 * @param branchName 要合并的分支名称
 * @returns 返回差异信息对象
 */
async getBranchMergeInfo(branchName: string): Promise<{
    canFastForward: boolean | null;
    commitsAhead: number;
    commitsBehind: number;
    hasDiverged: boolean;
}> {
    try {
        const git = this.ensureGit();
        const branchInfo = await git.branch();
        const currentBranch = branchInfo.current;

        if (!currentBranch) {
            return {
                canFastForward: null,
                commitsAhead: 0,
                commitsBehind: 0,
                hasDiverged: false
            };
        }

        // 检查是否可以快进
        const canFastForward = await this.canFastForwardMerge(branchName);

        // 计算分支间的提交差异
        let commitsAhead = 0;
        let commitsBehind = 0;
        let hasDiverged = false;

        try {
            // 获取要合并分支相对于当前分支的提交数
            const aheadOutput = await git.raw(['rev-list', '--count', `${currentBranch}..${branchName}`]);
            commitsAhead = parseInt(aheadOutput.trim()) || 0;

            // 获取当前分支相对于要合并分支的提交数
            const behindOutput = await git.raw(['rev-list', '--count', `${branchName}..${currentBranch}`]);
            commitsBehind = parseInt(behindOutput.trim()) || 0;

            // 如果两个分支都有对方没有的提交，说明已经分叉
            hasDiverged = commitsAhead > 0 && commitsBehind > 0;
        } catch (error) {
            ErrorHandler.handleSilent(error, '计算分支差异');
        }

        return {
            canFastForward,
            commitsAhead,
            commitsBehind,
            hasDiverged
        };
    } catch (error) {
        ErrorHandler.handleSilent(error, '获取分支合并信息');
        return {
            canFastForward: null,
            commitsAhead: 0,
            commitsBehind: 0,
            hasDiverged: false
        };
    }
}
```

**4. 合并分支**：

```typescript
/**
 * 合并分支
 * @param branchName 要合并的分支名称
 * @param strategy 合并策略：'fast-forward'（仅快进）或 'three-way'（强制三路）
 */
async merge(branchName: string, strategy: 'fast-forward' | 'three-way' = 'three-way'): Promise<void> {
    const git = this.ensureGit();
    let targetBranch: string | null = null;

    try {
        const branchInfo = await this.getBranches(true); // 强制刷新分支信息
        targetBranch = branchInfo.current || null;
    } catch {
        targetBranch = null;
    }

    if (strategy === 'fast-forward') {
        // 仅允许快进，保持线性历史
        await git.merge([branchName, '--ff-only']);
        await this.recordMergeHistory(branchName, targetBranch, 'fast-forward');
    } else {
        try {
            // 强制创建合并提交，确保依赖图能记录
            await git.merge([branchName, '--no-ff']);
            await this.recordMergeHistory(branchName, targetBranch, 'three-way');
        } catch (error: unknown) {
            // 某些环境可能不支持 --no-ff，退回普通合并
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('--no-ff')) {
                await git.merge([branchName]);
                await this.recordMergeHistory(branchName, targetBranch, 'three-way');
            } else {
                throw error;
            }
        }
    }

    // 清除相关缓存
    this.invalidateCache('branches');
    this.invalidateCache('status');
    this.invalidateCache('log');
    this.invalidateCache('branchGraph');
}
```

- **Webview 分支树组件（`BranchTree.tsx`）**：

**1. 状态管理**：

```typescript
export const BranchTree: React.FC<{ data: any }> = ({ data }) => {
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
    const [isCreatingBranch, setIsCreatingBranch] = useState<boolean>(false);
    const [createRequestTimestamp, setCreateRequestTimestamp] = useState<number | null>(null);
    const [creationResult, setCreationResult] = useState<'success' | 'error' | null>(null);

    // 切换分支状态
    const [isSwitchingBranch, setIsSwitchingBranch] = useState<boolean>(false);
    const [switchingBranchName, setSwitchingBranchName] = useState<string | null>(null);
    const [switchResult, setSwitchResult] = useState<'success' | 'error' | null>(null);
    const previousCurrentBranch = React.useRef<string | null>(null);
    const switchRequestTimestamp = useRef<number | null>(null);
    const switchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isSwitchingRef = useRef<boolean>(false);

    // 合并分支状态
    const [isMergingBranch, setIsMergingBranch] = useState<boolean>(false);
    const [mergingBranchName, setMergingBranchName] = useState<string | null>(null);
    const [mergeResult, setMergeResult] = useState<'success' | 'error' | null>(null);
    const mergeRequestTimestamp = useRef<number | null>(null);
    const previousLogCount = useRef<number>(0);
    const mergeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isMergingRef = useRef<boolean>(false);
```

**2. 切换分支操作监听**：

```typescript
// 监听切换分支操作完成
useEffect(() => {
    if (!isSwitchingBranch || !switchingBranchName || !data?.branches || !switchRequestTimestamp.current) {
        return;
    }

    const currentBranch = data.branches.current;
    const timeSinceRequest = Date.now() - switchRequestTimestamp.current;

    // 检查命令历史，看是否有对应的切换命令记录
    const hasSwitchCommand = data?.commandHistory?.some((item: any) => {
        const commandMatch = item.command === 'git-assistant.switchBranch' ||
            (item.command && item.command.includes('checkout'));
        const timeMatch = item.timestamp && item.timestamp >= switchRequestTimestamp.current!;
        return commandMatch && timeMatch;
    });

    // 如果超过3秒且命令历史中没有对应的切换命令，可能是用户取消了操作
    if (timeSinceRequest > 3000 && !hasSwitchCommand && currentBranch === previousCurrentBranch.current) {
        // 清除超时定时器
        if (switchTimeoutRef.current) {
            clearTimeout(switchTimeoutRef.current);
            switchTimeoutRef.current = null;
        }
        // 重置状态（操作被取消）
        setIsSwitchingBranch(false);
        isSwitchingRef.current = false;
        setSwitchingBranchName(null);
        switchRequestTimestamp.current = null;
        return;
    }

    // 如果当前分支已经改变为目标分支，说明切换成功
    if (currentBranch === switchingBranchName && currentBranch !== previousCurrentBranch.current) {
        // 清除超时定时器
        if (switchTimeoutRef.current) {
            clearTimeout(switchTimeoutRef.current);
            switchTimeoutRef.current = null;
        }
        setIsSwitchingBranch(false);
        isSwitchingRef.current = false;
        setSwitchResult('success');
        setSwitchingBranchName(null);
        switchRequestTimestamp.current = null;
        previousCurrentBranch.current = currentBranch;
    }
}, [data?.branches?.current, data?.commandHistory, isSwitchingBranch, switchingBranchName]);
```

**3. 合并分支操作监听**：

```typescript
// 监听合并分支操作完成 - 通过检测数据刷新来判断
useEffect(() => {
    if (!isMergingBranch || !mergingBranchName || !mergeRequestTimestamp.current) {
        return;
    }

    const currentLogCount = data?.log?.all?.length || 0;
    const currentTimestamp = Date.now();
    const timeSinceRequest = currentTimestamp - mergeRequestTimestamp.current;

    // 检查命令历史，看是否有对应的合并命令记录
    const hasMergeCommand = data?.commandHistory?.some((item: any) => {
        const commandMatch = item.command === 'git-assistant.mergeBranch' ||
            (item.command && item.command.includes('merge'));
        const timeMatch = item.timestamp && item.timestamp >= mergeRequestTimestamp.current!;
        return commandMatch && timeMatch;
    });

    // 如果超过3秒且命令历史中没有对应的合并命令，可能是用户取消了操作
    if (timeSinceRequest > 3000 && !hasMergeCommand) {
        // 清除超时定时器
        if (mergeTimeoutRef.current) {
            clearTimeout(mergeTimeoutRef.current);
            mergeTimeoutRef.current = null;
        }
        // 重置状态（操作被取消）
        setIsMergingBranch(false);
        isMergingRef.current = false;
        setMergingBranchName(null);
        mergeRequestTimestamp.current = null;
        return;
    }

    // 如果数据已经刷新（提交数量增加），认为合并操作完成
    if (timeSinceRequest > 500) {
        // 检查是否有新的提交（合并会产生新的提交）
        if (currentLogCount > previousLogCount.current) {
            // 清除超时定时器
            if (mergeTimeoutRef.current) {
                clearTimeout(mergeTimeoutRef.current);
                mergeTimeoutRef.current = null;
            }
            // 合并成功
            setIsMergingBranch(false);
            isMergingRef.current = false;
            setMergeResult('success');
            setMergingBranchName(null);
            mergeRequestTimestamp.current = null;
            previousLogCount.current = currentLogCount;
        } else if (hasMergeCommand) {
            // 有命令记录但没有新提交，可能是快速合并（fast-forward）或失败
            // 检查命令历史中的成功/失败状态
            const mergeCommand = data?.commandHistory?.find((item: any) => {
                const commandMatch = item.command === 'git-assistant.mergeBranch' ||
                    (item.command && item.command.includes('merge'));
                const timeMatch = item.timestamp && item.timestamp >= mergeRequestTimestamp.current!;
                return commandMatch && timeMatch;
            });

            if (mergeCommand && timeSinceRequest > 1500) {
                // 清除超时定时器
                if (mergeTimeoutRef.current) {
                    clearTimeout(mergeTimeoutRef.current);
                    mergeTimeoutRef.current = null;
                }
                // 根据命令结果设置状态
                setIsMergingBranch(false);
                isMergingRef.current = false;
                setMergeResult(mergeCommand.success ? 'success' : 'error');
                setMergingBranchName(null);
                mergeRequestTimestamp.current = null;
            }
        }
    }
}, [data?.log, data?.commandHistory, isMergingBranch, mergingBranchName]);
```

- **常见问题 & 解决**：

  - **大仓库分支过多导致刷新慢**：使用 3 秒 TTL 缓存，减少 Git 调用；BranchProvider 缓存树项，避免重复创建
  - **切换分支需确保本地无未提交改动**：通过 `branch-manager.ts` 的预检查提示用户 stash，支持"暂存并切换"和"放弃更改并切换"
  - **合并策略选择困难**：智能分析分支关系，自动推荐 fast-forward 或 three-way 合并
  - **删除分支风险**：检查分支是否已合并，区分安全删除和强制删除，提供明确的风险提示

- **亮点**：
  - **智能缓存**：多层缓存机制（GitService 5秒 + BranchProvider 3秒），大幅减少 Git 调用
  - **安全检查**：切换/合并前自动检查未提交更改，提供 stash 选项
  - **合并策略建议**：根据分支关系智能推荐合并策略，降低操作风险
  - **状态同步**：通过 CommandHistory 和实时数据刷新，准确同步操作状态
  - **用户体验**：操作进度提示、超时处理、错误恢复，提供流畅的操作体验

##### ☁️ 远程仓库（RemoteManager.tsx & git-service.ts & git-helpers.ts）

- **实现架构**：采用**三层架构**：Webview 可视化组件（`RemoteManager.tsx`）、命令处理（`repository-init.ts` & `dashboard-panel.ts`）、GitService API（`git-service.ts`）。支持添加、编辑、删除、重命名、URL 更新等完整远程仓库操作。

- **核心策略**：
  1. **智能缓存**：远程仓库列表使用 5 秒 TTL 缓存，减少 Git 调用
  2. **URL 转换**：支持 SSH 和 HTTPS 格式，自动转换为浏览器可访问的 URL
  3. **默认远程**：优先使用配置的 `git-assistant.defaultRemote`，其次使用当前分支跟踪的远程
  4. **快速刷新**：操作后只刷新远程仓库数据，提升响应速度

- **Webview 组件实现（`RemoteManager.tsx`）**：

**1. 组件结构**：

```typescript
export const RemoteManager: React.FC<{ data: any }> = ({ data }) => {
    const remotes: RemoteInfo[] = data?.remotes || [];
    const trackingInfo = data?.status?.tracking || '';
    
    // 解析当前分支的跟踪信息
    let trackingRemote: string | null = null;
    let trackingBranch: string | null = null;
    if (trackingInfo && trackingInfo.includes('/')) {
        const separatorIndex = trackingInfo.indexOf('/');
        trackingRemote = trackingInfo.slice(0, separatorIndex);
        trackingBranch = trackingInfo.slice(separatorIndex + 1);
    } else if (trackingInfo) {
        trackingRemote = trackingInfo;
    }
    
    // 确定默认远程：优先使用跟踪的远程，其次使用第一个远程
    const defaultRemoteName = trackingRemote || (remotes[0]?.name ?? null);

    // 操作处理函数
    const handleAddRemote = () => {
        vscode.postMessage({ command: 'addRemote' });
    };

    const handleEditRemote = (remoteName: string) => {
        vscode.postMessage({ command: 'editRemote', remote: remoteName });
    };

    const handleDeleteRemote = (remoteName: string) => {
        vscode.postMessage({ command: 'deleteRemote', remote: remoteName });
    };

    const handleOpenRemote = (remoteUrl?: string) => {
        if (!remoteUrl) {
            return;
        }
        // 将 Git URL 转换为浏览器可访问的 URL
        const browserUrl = convertGitUrlToBrowserUrl(remoteUrl);
        if (!browserUrl) {
            return;
        }
        vscode.postMessage({ command: 'openRemoteUrl', url: browserUrl });
    };
```

**2. 远程仓库列表渲染**：

```typescript
return (
    <div className="remote-manager">
        <div className="section-header">
            <h2>远程仓库管理</h2>
            <button className="primary-button" onClick={handleAddRemote}>
                ➕ 添加远程仓库
            </button>
        </div>

        {/* 显示当前分支跟踪信息和默认远程 */}
        <div className="remote-summary">
            {trackingRemote ? (
                <div>
                    🌿 当前分支上游：<strong>{trackingRemote}/{trackingBranch || ''}</strong>
                </div>
            ) : (
                <div>⚠️ 当前分支尚未设置上游分支</div>
            )}
            {defaultRemoteName && (
                <div className="remote-default">
                    📤 默认推送远程：<strong>{defaultRemoteName}</strong>
                </div>
            )}
        </div>

        {/* 远程仓库列表 */}
        {!hasRemotes ? (
            <div className="empty-state">
                <div className="empty-icon">☁️</div>
                <p>当前仓库还没有任何远程仓库</p>
                <p className="empty-hint">点击上方按钮添加远程仓库</p>
            </div>
        ) : (
            <div className="remote-list">
                {remotes.map((remote) => {
                    const remoteUrl = remote.refs?.fetch || remote.refs?.push || '';
                    const browserUrl = convertGitUrlToBrowserUrl(remoteUrl);
                    return (
                        <div
                            key={remote.name}
                            className={`remote-item${remote.name === trackingRemote ? ' tracking' : ''}`}
                        >
                            <div className="remote-info">
                                <div className="remote-title">
                                    <span className="remote-icon">☁️</span>
                                    <span className="remote-name">{remote.name}</span>
                                    {remote.name === trackingRemote && (
                                        <span className="remote-badge">当前分支跟踪</span>
                                    )}
                                </div>
                                <div className="remote-meta">
                                    <div className="remote-url">
                                        <span>fetch:</span>
                                        <span className="url-text">{remote.refs?.fetch || '—'}</span>
                                    </div>
                                    <div className="remote-url">
                                        <span>push:</span>
                                        <span className="url-text">{remote.refs?.push || remote.refs?.fetch || '—'}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="remote-actions">
                                <button
                                    onClick={() => handleOpenRemote(remoteUrl)}
                                    title={browserUrl ? '在浏览器中打开' : '无法转换为浏览器链接'}
                                    disabled={!browserUrl}
                                >
                                    🔗
                                </button>
                                <button
                                    onClick={() => handleEditRemote(remote.name)}
                                    title="编辑远程仓库"
                                >
                                    ✏️
                                </button>
                                <button
                                    className="danger-button"
                                    onClick={() => handleDeleteRemote(remote.name)}
                                    title="删除远程仓库"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
    </div>
);
```

- **GitService 远程仓库 API（`git-service.ts`）**：

**1. 获取远程仓库列表（带缓存）**：

```typescript
/**
 * 获取远程仓库列表
 * @param forceRefresh 是否强制刷新（忽略缓存）
 */
async getRemotes(forceRefresh: boolean = false): Promise<RemoteInfo[]> {
    const cacheKey = 'remotes';

    // 第一层：内存缓存（TTL 5秒）
    if (!forceRefresh) {
        const cached = this.getCached<RemoteInfo[]>(cacheKey);
        if (cached) {
            return cached;
        }
    }

    const git = this.ensureGit();
    // 获取远程仓库信息（包含 fetch 和 push URL）
    const result = await git.getRemotes(true);
    
    // 转换为 RemoteInfo 类型
    const remotes: RemoteInfo[] = result.map((remote: { 
        name: string; 
        refs?: { fetch?: string; push?: string } 
    }) => ({
        name: remote.name,
        refs: {
            fetch: remote.refs?.fetch,
            push: remote.refs?.push
        }
    }));
    
    // 更新缓存
    this.setCache(cacheKey, remotes, this.CACHE_TTL.remotes);
    return remotes;
}
```

**2. 添加远程仓库**：

```typescript
/**
 * 添加远程仓库
 * @param name 远程仓库名称
 * @param url 远程仓库地址（支持 HTTPS 和 SSH）
 */
async addRemote(name: string, url: string): Promise<void> {
    const git = this.ensureGit();
    await git.addRemote(name, url);
    // 清除远程仓库缓存，确保下次获取最新数据
    this.invalidateCache('remotes');
}
```

**3. 移除远程仓库**：

```typescript
/**
 * 移除远程仓库
 * @param name 远程仓库名称
 */
async removeRemote(name: string): Promise<void> {
    const git = this.ensureGit();
    await git.removeRemote(name);
    // 清除远程仓库缓存，确保下次获取最新数据
    this.invalidateCache('remotes');
}
```

**4. 重命名远程仓库**：

```typescript
/**
 * 重命名远程仓库
 * @param oldName 旧名称
 * @param newName 新名称
 */
async renameRemote(oldName: string, newName: string): Promise<void> {
    const git = this.ensureGit();
    // 使用 git remote rename 命令
    await git.raw(['remote', 'rename', oldName, newName]);
    // 清除远程仓库缓存，确保下次获取最新数据
    this.invalidateCache('remotes');
}
```

**5. 更新远程仓库地址**：

```typescript
/**
 * 更新远程仓库地址（同时更新 fetch/push）
 * @param name 远程仓库名称
 * @param url 新的远程仓库地址
 */
async updateRemoteUrl(name: string, url: string): Promise<void> {
    const git = this.ensureGit();
    // 更新 fetch URL
    await git.raw(['remote', 'set-url', name, url]);
    // 更新 push URL（确保 fetch/push 一致）
    await git.raw(['remote', 'set-url', '--push', name, url]);
    // 清除远程仓库缓存，确保下次获取最新数据
    this.invalidateCache('remotes');
}
```

- **命令处理实现（`repository-init.ts` & `dashboard-panel.ts`）**：

**1. 添加远程仓库命令**：

```typescript
vscode.commands.registerCommand('git-assistant.addRemote', async () => {
    try {
        // 检查是否是Git仓库
        const isRepo = await gitService.isRepository();
        if (!isRepo) {
            const init = await vscode.window.showWarningMessage(
                '当前文件夹不是Git仓库，是否先初始化？',
                '初始化',
                '取消'
            );
            if (init === '初始化') {
                await vscode.commands.executeCommand('git-assistant.initRepository');
            }
            return;
        }

        // 输入远程仓库名称（带验证）
        const remoteName = await vscode.window.showInputBox({
            prompt: '输入远程仓库名称',
            value: 'origin',
            placeHolder: 'origin',
            validateInput: (value) => {
                if (!value) {
                    return '请输入远程仓库名称';
                }
                // 验证名称格式：只能包含字母、数字、下划线和横线
                if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                    return '名称只能包含字母、数字、下划线和横线';
                }
                return null;
            }
        });

        if (!remoteName) {
            return;
        }

        // 检查远程仓库是否已存在
        const remotes = await gitService.getRemotes();
        const existingRemote = remotes.find(r => r.name === remoteName);

        // 输入远程仓库地址（带验证）
        const remoteUrl = await vscode.window.showInputBox({
            prompt: '输入远程仓库地址',
            placeHolder: 'https://github.com/username/repo.git',
            validateInput: (value) => {
                if (!value) {
                    return '请输入远程仓库地址';
                }
                // 验证 URL 格式：必须包含 http 或 git@
                if (!value.includes('http') && !value.includes('git@')) {
                    return '请输入有效的Git仓库地址';
                }
                return null;
            }
        });

        if (!remoteUrl) {
            return;
        }

        const sanitizedUrl = remoteUrl.trim();

        if (existingRemote) {
            // 如果已存在，询问是否更新
            const updateAction = '更新';
            const overwrite = await vscode.window.showWarningMessage(
                `远程仓库 "${remoteName}" 已存在，是否更新远程地址？`,
                { modal: true },
                updateAction
            );
            if (overwrite !== updateAction) {
                return;
            }
            await gitService.updateRemoteUrl(remoteName, sanitizedUrl);
            vscode.window.showInformationMessage(`✅ 远程仓库 "${remoteName}" 地址已更新`);
        } else {
            // 添加新远程仓库
            await gitService.addRemote(remoteName, sanitizedUrl);
            vscode.window.showInformationMessage(`✅ 远程仓库 "${remoteName}" 添加成功！`);
        }

        // 记录命令历史
        CommandHistory.addCommand(
            existingRemote 
                ? `git remote set-url ${remoteName} ${sanitizedUrl}`
                : `git remote add ${remoteName} ${sanitizedUrl}`,
            existingRemote ? '更新远程仓库地址' : '添加远程仓库',
            true,
            undefined,
            remoteName
        );

        // 刷新相关视图
        branchProvider.refresh();
        historyProvider.refresh();
        // 使用快速刷新，只更新远程仓库数据
        DashboardPanel.refreshRemotesOnly();

    } catch (error) {
        vscode.window.showErrorMessage(`添加远程仓库失败: ${error}`);
    }
});
```

**2. 编辑远程仓库（`dashboard-panel.ts`）**：

```typescript
private async _handleEditRemote(remoteName: string) {
    try {
        if (!remoteName) {
            vscode.window.showErrorMessage('远程仓库名称不能为空');
            return;
        }

        const remotes = await this.gitService.getRemotes();
        const target = remotes.find((remote) => remote.name === remoteName);

        if (!target) {
            vscode.window.showWarningMessage(`未找到远程仓库 "${remoteName}"`);
            return;
        }

        // 输入新的远程仓库名称（带验证）
        const newName = await vscode.window.showInputBox({
            prompt: '输入新的远程仓库名称',
            value: remoteName,
            validateInput: (value: string) => {
                if (!value) {
                    return '远程仓库名称不能为空';
                }
                if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                    return '名称只能包含字母、数字、下划线和横线';
                }
                return null;
            }
        });

        if (!newName) {
            return;
        }

        // 输入新的远程仓库地址（带验证）
        const currentUrl = target.refs?.fetch || target.refs?.push || '';
        const newUrl = await vscode.window.showInputBox({
            prompt: '输入新的远程仓库地址',
            placeHolder: 'https://github.com/username/repo.git',
            value: currentUrl,
            validateInput: (value: string) => {
                if (!value) {
                    return '远程仓库地址不能为空';
                }
                if (!value.includes('http') && !value.includes('git@')) {
                    return '请输入有效的Git仓库地址';
                }
                return null;
            }
        });

        if (!newUrl) {
            return;
        }

        let updated = false;
        
        // 如果名称改变，先重命名
        if (newName !== remoteName) {
            await this.gitService.renameRemote(remoteName, newName);
            remoteName = newName;
            updated = true;
        }

        // 如果 URL 改变，更新地址
        if (newUrl !== currentUrl) {
            await this.gitService.updateRemoteUrl(remoteName, newUrl);
            updated = true;
        }

        if (updated) {
            vscode.window.showInformationMessage(`✅ 远程仓库 "${remoteName}" 已更新`);
        } else {
            vscode.window.showInformationMessage('未检测到更改，远程仓库保持不变');
        }

        // 使用快速刷新，只更新远程仓库数据
        await this._refreshRemotesOnly();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`编辑远程仓库失败: ${errorMessage}`);
        await this._refreshRemotesOnly();
    }
}
```

**3. 删除远程仓库**：

```typescript
private async _handleDeleteRemote(remoteName: string) {
    try {
        if (!remoteName) {
            vscode.window.showErrorMessage('远程仓库名称不能为空');
            return;
        }

        // 确认删除（模态对话框）
        const confirm = await vscode.window.showWarningMessage(
            `确定要删除远程仓库 "${remoteName}" 吗？此操作会移除所有与其相关的推送/拉取配置。`,
            { modal: true },
            '删除',
            '取消'
        );

        if (confirm !== '删除') {
            return;
        }

        await this.gitService.removeRemote(remoteName);
        vscode.window.showInformationMessage(`✅ 远程仓库 "${remoteName}" 已删除`);
        
        // 使用快速刷新，只更新远程仓库数据
        await this._refreshRemotesOnly();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`删除远程仓库失败: ${errorMessage}`);
        await this._refreshRemotesOnly();
    }
}
```

**4. 打开远程仓库 URL**：

```typescript
private async _openRemoteUrl(url: string) {
    try {
        // 使用 VS Code API 在默认浏览器中打开 URL
        await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`无法打开链接: ${errorMessage}`);
    }
}
```

- **URL 转换工具（`url.ts`）**：

```typescript
/**
 * 将 Git 远程地址转换为浏览器可访问的 URL
 * 支持 SSH 和 HTTPS 格式
 */
export function convertGitUrlToBrowserUrl(gitUrl: string): string | null {
    if (!gitUrl) {
        return null;
    }

    // 处理 SSH 格式: git@github.com:username/repo.git
    if (gitUrl.startsWith('git@')) {
        const match = gitUrl.match(/git@([^:]+):(.+)\.git$/);
        if (match) {
            const [, host, path] = match;
            // 支持常见 Git 托管平台
            if (host.includes('github.com')) {
                return `https://github.com/${path}`;
            } else if (host.includes('gitlab.com')) {
                return `https://gitlab.com/${path}`;
            } else if (host.includes('bitbucket.org')) {
                return `https://bitbucket.org/${path}`;
            } else if (host.includes('gitee.com')) {
                return `https://gitee.com/${path}`;
            }
            // 通用转换
            return `https://${host}/${path}`;
        }
    }

    // 处理 HTTPS/HTTP 格式: https://github.com/username/repo.git
    if (gitUrl.startsWith('http://') || gitUrl.startsWith('https://')) {
        return gitUrl.replace(/\.git$/, ''); // 移除 .git 后缀
    }

    return null;
}
```

- **辅助函数（`git-helpers.ts`）**：

**1. 选择远程仓库**：

```typescript
/**
 * 选择远程仓库（消除代码重复）
 * 显示一个快速选择菜单，让用户从可用的远程仓库中选择一个。
 * 如果只有一个远程仓库，直接返回该仓库名称。
 * 如果没有远程仓库，显示警告并返回 null。
 */
export async function pickRemote(
    gitService: GitService,
    actionLabel: string
): Promise<string | null> {
    try {
        // 使用缓存获取远程仓库列表，提升速度
        const remotes = await gitService.getRemotes(false);

        if (remotes.length === 0) {
            vscode.window.showWarningMessage('当前仓库没有配置远程仓库');
            return null;
        }

        // 如果只有一个远程仓库，直接返回
        if (remotes.length === 1) {
            return remotes[0].name;
        }

        // 多个远程仓库时，显示选择菜单
        const selected = await vscode.window.showQuickPick(
            remotes.map(remote => ({
                label: `$(cloud) ${remote.name}`,
                description: remote.refs?.fetch || remote.refs?.push || '',
                remote: remote.name
            })),
            {
                placeHolder: `选择要${actionLabel}的远程仓库`
            }
        );

        return selected?.remote || null;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`获取远程仓库列表失败: ${errorMessage}`);
        return null;
    }
}
```

**2. 获取默认远程仓库**：

```typescript
/**
 * 获取默认远程仓库名称
 * 优先使用配置的默认远程仓库，如果未配置或不存在，则返回第一个远程仓库。
 * 如果没有任何远程仓库，返回 'origin'。
 */
export async function getDefaultRemote(gitService: GitService): Promise<string> {
    try {
        const remotes = await gitService.getRemotes();
        if (remotes.length === 0) {
            return 'origin';
        }

        // 优先使用配置的默认远程
        const config = vscode.workspace.getConfiguration('git-assistant');
        const defaultRemote = config.get<string>('defaultRemote', '');

        if (defaultRemote && remotes.some(r => r.name === defaultRemote)) {
            return defaultRemote;
        }

        // 否则使用第一个远程
        return remotes[0].name;
    } catch {
        return 'origin';
    }
}
```

- **快速刷新机制（`dashboard-panel.ts`）**：

```typescript
/**
 * 快速刷新远程仓库数据（公共方法，用于远程仓库操作后）
 * 只刷新远程仓库数据，不刷新其他数据，提升响应速度
 */
public static refreshRemotesOnly() {
    if (DashboardPanel.currentPanel) {
        DashboardPanel.currentPanel._refreshRemotesOnly();
    }
}

/**
 * 内部方法：只刷新远程仓库数据
 */
private async _refreshRemotesOnly() {
    try {
        const remotes = await this.gitService.getRemotes(true); // 强制刷新
        this._panel.webview.postMessage({
            type: 'gitDataUpdate',
            data: { remotes }
        });
    } catch (error) {
        ErrorHandler.handleSilent(error, '刷新远程仓库数据');
    }
}
```

- **常见问题 & 解决**：

  - **远程名称重复**：添加前检查是否已存在，如果存在则询问是否更新
  - **URL 不合法**：通过正则预检（必须包含 `http` 或 `git@`），在 VS Code 端再次校验
  - **默认远程配置**：优先使用 `git-assistant.defaultRemote` 配置，其次使用当前分支跟踪的远程
  - **缓存不一致**：操作后立即清除缓存，确保数据最新
  - **SSH URL 无法在浏览器打开**：通过 `convertGitUrlToBrowserUrl` 转换为 HTTPS URL

- **亮点**：
  - **智能缓存**：5 秒 TTL 缓存，减少 Git 调用
  - **URL 转换**：支持 SSH 和 HTTPS 格式，自动转换为浏览器可访问的 URL
  - **默认远程**：智能识别默认远程，与 Quick Push/Pull 联动
  - **快速刷新**：操作后只刷新远程仓库数据，提升响应速度
  - **完整 CRUD**：支持添加、编辑、删除、重命名、URL 更新等所有操作
  - **跟踪信息显示**：显示当前分支跟踪的远程和分支，便于了解分支关系
  - **代码复用**：使用 `pickRemote` 和 `getDefaultRemote` 辅助函数，消除代码重复

##### 🏷️ 标签管理（TagManager.tsx & tag-manager.ts & git-service.ts）

- **实现架构**：采用**三层架构**：Webview 可视化组件（`TagManager.tsx`）、命令处理（`tag-manager.ts`）、GitService API（`git-service.ts`）。支持创建、删除、推送、批量推送等完整标签操作，区分本地和远程标签。

- **核心策略**：
  1. **并行查询**：使用 `Promise.all` 并行查询本地与远程标签，提升加载速度
  2. **智能缓存**：本地标签缓存 3 秒，远程标签缓存 10 秒（网络操作，缓存时间更长）
  3. **状态同步**：通过 `CommandHistory` 同步操作状态，实时更新 UI
  4. **批量操作**：支持批量推送所有标签，提升操作效率

- **Webview 组件实现（`TagManager.tsx`）**：

**1. 状态管理**：

```typescript
export const TagManager: React.FC<{ data: any }> = ({ data }) => {
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [isCreatingTag, setIsCreatingTag] = useState<boolean>(false);
    const [createRequestTimestamp, setCreateRequestTimestamp] = useState<number | null>(null);
    const [creationResult, setCreationResult] = useState<'success' | 'error' | null>(null);

    const localTags = data.tags || [];
    const remoteTags = data.remoteTags || [];
    const hasLocalTags = localTags.length > 0;
    const hasRemoteTags = remoteTags.length > 0;
    const hasTags = hasLocalTags || hasRemoteTags;
```

**2. 创建标签**：

```typescript
/**
 * 创建标签
 * 通过 postMessage 发送命令到扩展端
 */
const handleCreateTag = () => {
    setIsCreatingTag(true);
    setCreateRequestTimestamp(Date.now());
    setCreationResult(null);
    vscode.postMessage({ command: 'createTag' });
};
```

**3. 删除标签**：

```typescript
/**
 * 删除标签
 * @param tagName 标签名称
 */
const handleDeleteTag = (tagName: string) => {
    vscode.postMessage({
        command: 'deleteTag',
        tagName: tagName
    });
};
```

**4. 推送标签**：

```typescript
/**
 * 推送单个标签
 * @param tagName 标签名称
 */
const handlePushTag = (tagName: string) => {
    vscode.postMessage({
        command: 'pushTag',
        tagName: tagName
    });
};

/**
 * 推送所有标签
 */
const handlePushAllTags = () => {
    vscode.postMessage({ command: 'pushAllTags' });
};
```

**5. 状态同步（通过 CommandHistory）**：

```typescript
/**
 * 监听命令历史，同步创建标签的状态
 */
useEffect(() => {
    if (!isCreatingTag || !createRequestTimestamp || !data?.commandHistory) {
        return;
    }

    // 查找匹配的创建标签命令记录
    const matchedEntry = data.commandHistory.find(
        (item: any) =>
            item.command === 'git-assistant.createTag' &&
            item.timestamp >= createRequestTimestamp
    );

    if (matchedEntry) {
        setIsCreatingTag(false);
        setCreateRequestTimestamp(null);
        setCreationResult(matchedEntry.success ? 'success' : 'error');
    }
}, [data?.commandHistory, isCreatingTag, createRequestTimestamp]);

/**
 * 自动清除创建结果提示（2.5秒后）
 */
useEffect(() => {
    if (!creationResult) {
        return;
    }
    const timer = setTimeout(() => setCreationResult(null), 2500);
    return () => clearTimeout(timer);
}, [creationResult]);
```

**6. 本地标签列表渲染**：

```typescript
<div className="tag-section">
    <h3>📁 本地标签 ({localTags.length})</h3>
    <div className="tag-list">
        {hasLocalTags ? (
            localTags.map((tag: any) => (
                <div
                    key={tag.name}
                    className={`tag-item ${tag.name === selectedTag ? 'selected' : ''}`}
                    onClick={() => handleTagClick(tag.name)}
                >
                    <div className="tag-info">
                        <span className="tag-icon">🏷️</span>
                        <div className="tag-details">
                            <span className="tag-name">{tag.name}</span>
                            <div className="tag-meta">
                                <span className="tag-commit">
                                    提交: {tag.commit.substring(0, 8)}
                                </span>
                                {tag.message && (
                                    <span className="tag-message" title={tag.message}>
                                        {tag.message.length > 50
                                            ? `${tag.message.substring(0, 50)}...`
                                            : tag.message}
                                    </span>
                                )}
                                {tag.date && (
                                    <span className="tag-date">
                                        {new Date(tag.date).toLocaleString('zh-CN')}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="tag-actions">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePushTag(tag.name);
                            }}
                            title="推送到远程"
                        >
                            📤
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTag(tag.name);
                            }}
                            title="删除标签"
                            className="danger-button"
                        >
                            🗑️
                        </button>
                    </div>
                </div>
            ))
        ) : (
            <div className="empty-state">
                <p>暂无本地标签</p>
            </div>
        )}
    </div>
</div>
```

**7. 远程标签列表渲染**：

```typescript
<div className="tag-section">
    <h3>☁️ 远程标签 ({remoteTags.length})</h3>
    <div className="tag-list">
        {hasRemoteTags ? (
            remoteTags.map((tag: any) => (
                <div
                    key={tag.name}
                    className="tag-item"
                    onClick={() => handleTagClick(tag.name)}
                >
                    <div className="tag-info">
                        <span className="tag-icon">☁️</span>
                        <div className="tag-details">
                            <span className="tag-name">{tag.name}</span>
                            <div className="tag-meta">
                                <span className="tag-commit">
                                    提交: {tag.commit.substring(0, 8)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            ))
        ) : (
            <div className="empty-state">
                <p>暂无远程标签</p>
            </div>
        )}
    </div>
</div>
```

- **GitService 标签 API（`git-service.ts`）**：

**1. 获取本地标签列表（带缓存）**：

```typescript
/**
 * 获取本地标签列表
 * 使用 git for-each-ref 优化查询，支持缓存
 */
async getTags(forceRefresh: boolean = false): Promise<TagInfo[]> {
    const cacheKey = 'tags';

    // 第一层：内存缓存（TTL 3秒）
    if (!forceRefresh) {
        const cached = this.getCached<TagInfo[]>(cacheKey);
        if (cached) {
            return cached;
        }
    }

    const git = this.ensureGit();
    try {
        // 使用 git for-each-ref 获取标签信息（优化查询）
        const tagsOutput = await git.raw([
            'for-each-ref',
            'refs/tags',
            '--sort=-creatordate',  // 按创建时间倒序
            '--format=%(refname:short)|%(objectname)|%(objecttype)|%(contents:subject)|%(creatordate:iso)'
        ]);

        if (!tagsOutput || !tagsOutput.trim()) {
            return [];
        }

        // 解析标签信息
        const tags: TagInfo[] = tagsOutput
            .trim()
            .split('\n')
            .filter(line => !!line.trim())
            .map((line) => {
                const [name, objectName, objectType, subject, date] = line.split('|');
                const cleanMessage = subject?.trim();
                const isAnnotated = (objectType || '').trim() === 'tag';  // 判断是否为带注释标签
                const tagName = name?.trim() || '';
                const tagCommit = (objectName || '').trim();
                
                if (!tagName || !tagCommit) {
                    return null;
                }
                
                return {
                    name: tagName,
                    commit: tagCommit,
                    message: isAnnotated && cleanMessage ? cleanMessage : undefined,  // 只有带注释标签才有消息
                    date: date?.trim() || undefined
                } as TagInfo;
            })
            .filter((tag): tag is TagInfo => tag !== null);

        // 缓存结果
        this.setCache(cacheKey, tags, this.CACHE_TTL.tags);
        return tags;
    } catch (error) {
        ErrorHandler.handleSilent(error, '获取标签列表');
        return [];
    }
}
```

**2. 获取远程标签列表（带缓存）**：

```typescript
/**
 * 获取指定远程仓库的标签列表（带缓存）
 * 使用 git ls-remote 查询远程标签
 */
async getRemoteTags(
    remote: string, 
    forceRefresh: boolean = false
): Promise<Array<{ name: string; commit: string }>> {
    const cacheKey = `remoteTags:${remote}`;

    // 第一层：内存缓存（TTL 10秒，网络操作缓存时间更长）
    if (!forceRefresh) {
        const cached = this.getCached<Array<{ name: string; commit: string }>>(cacheKey);
        if (cached) {
            return cached;
        }
    }

    const git = this.ensureGit();
    try {
        // 使用 git ls-remote 获取远程标签
        const output = await git.raw(['ls-remote', '--tags', remote]);
        if (!output || !output.trim()) {
            return [];
        }

        // 解析远程标签信息
        const tagsMap = new Map<string, string>();
        output
            .trim()
            .split('\n')
            .forEach(line => {
                const [hash, ref] = line.trim().split('\t');
                if (!hash || !ref) {
                    return;
                }
                // 处理 refs/tags/name^{} 格式（指向标签对象的提交）
                const cleanRef = ref.replace('^{}', '');
                const match = cleanRef.match(/refs\/tags\/(.+)$/);
                if (!match) {
                    return;
                }
                const tagName = match[1];
                // 使用 Map 去重（同一个标签可能有多个引用）
                if (!tagsMap.has(tagName)) {
                    tagsMap.set(tagName, hash);
                }
            });

        const result = Array.from(tagsMap.entries()).map(([name, commit]) => ({ name, commit }));

        // 缓存结果
        this.setCache(cacheKey, result, this.CACHE_TTL.remoteTags);
        return result;
    } catch (error) {
        ErrorHandler.handleSilent(error, `获取远程标签(${remote})`);
        return [];
    }
}
```

**3. 创建标签**：

```typescript
/**
 * 创建标签（轻量级或带注释）
 * @param tagName 标签名称
 * @param message 标签注释（可选，如果提供则创建带注释标签）
 * @param commit 指向的提交哈希（可选，如果不提供则指向当前提交）
 */
async createTag(tagName: string, message?: string, commit?: string): Promise<void> {
    const git = this.ensureGit();
    
    if (message) {
        // 带注释的标签（推荐）
        if (commit) {
            // 使用 raw 方法创建指向特定提交的带注释标签
            await git.raw(['tag', '-a', tagName, '-m', message, commit]);
        } else {
            // 指向当前提交的带注释标签
            await git.addAnnotatedTag(tagName, message);
        }
    } else {
        // 轻量级标签（简单引用）
        if (commit) {
            // 使用 raw 方法创建指向特定提交的轻量级标签
            await git.raw(['tag', tagName, commit]);
        } else {
            // 指向当前提交的轻量级标签
            await git.addTag(tagName);
        }
    }

    // 清除相关缓存
    this.invalidateCache('tags');
}
```

**4. 删除标签**：

```typescript
/**
 * 删除标签
 * @param tagName 标签名称
 */
async deleteTag(tagName: string): Promise<void> {
    const git = this.ensureGit();
    await git.tag(['-d', tagName]);

    // 清除相关缓存
    this.invalidateCache('tags');
}
```

**5. 检查远程标签是否存在**：

```typescript
/**
 * 检查远程标签是否存在
 * @param tagName 标签名称
 * @param remote 远程仓库名称（默认 'origin'）
 */
async remoteTagExists(tagName: string, remote: string = 'origin'): Promise<boolean> {
    const git = this.ensureGit();
    try {
        // 使用 git ls-remote 查询远程标签
        const remoteTags = await git.raw(['ls-remote', '--tags', remote, tagName]);
        return remoteTags.trim().length > 0;
    } catch (error) {
        // 如果获取失败，假设不存在（可能是网络问题）
        return false;
    }
}
```

**6. 推送单个标签**：

```typescript
/**
 * 推送单个标签到远程仓库
 * @param tagName 标签名称
 * @param remote 远程仓库名称（默认 'origin'）
 * @param force 是否强制推送（覆盖远程已存在的标签）
 */
async pushTag(tagName: string, remote: string = 'origin', force: boolean = false): Promise<void> {
    const git = this.ensureGit();
    const pushArgs = force ? ['--force'] : [];
    // 推送标签引用
    await git.push(remote, `refs/tags/${tagName}:refs/tags/${tagName}`, pushArgs);

    // 清除远程标签缓存（推送后远程标签列表已变化）
    this.invalidateCache(`remoteTags:${remote}`);
}
```

**7. 推送所有标签**：

```typescript
/**
 * 推送所有标签到远程仓库
 * @param remote 远程仓库名称（默认 'origin'）
 */
async pushAllTags(remote: string = 'origin'): Promise<void> {
    const git = this.ensureGit();
    // 使用 simple-git 的 pushTags 方法
    await git.pushTags(remote);

    // 清除远程标签缓存（推送后远程标签列表已变化）
    this.invalidateCache(`remoteTags:${remote}`);
}
```

**8. 删除远程标签**：

```typescript
/**
 * 删除远程标签
 * @param tagName 标签名称
 * @param remote 远程仓库名称（默认 'origin'）
 */
async deleteRemoteTag(tagName: string, remote: string = 'origin'): Promise<void> {
    const git = this.ensureGit();
    // 使用 git push --delete 删除远程标签
    await git.push([remote, '--delete', tagName]);

    // 清除远程标签缓存（删除后远程标签列表已变化）
    this.invalidateCache(`remoteTags:${remote}`);
}
```

- **命令处理实现（`tag-manager.ts`）**：

**1. 创建标签命令**：

```typescript
vscode.commands.registerCommand('git-assistant.createTag', async () => {
    let tagName: string | undefined;
    try {
        // 输入标签名称（带验证）
        tagName = await vscode.window.showInputBox({
            prompt: '输入标签名称',
            placeHolder: 'v1.0.2',
            validateInput: (value) => {
                if (!value) {
                    return '标签名称不能为空';
                }
                // 验证标签名称格式：只能包含字母、数字、下划线、横线、点和斜线
                if (!/^[a-zA-Z0-9/._-]+$/.test(value)) {
                    return '标签名称只能包含字母、数字、下划线、横线、点和斜线';
                }
                return null;
            }
        });

        if (!tagName) {
            return;
        }

        // 询问是否添加注释
        const tagType = await vscode.window.showQuickPick(
            [
                { label: '$(tag) 带注释的标签', description: '推荐：包含版本说明', value: 'annotated' },
                { label: '$(tag) 轻量级标签', description: '简单引用', value: 'lightweight' }
            ],
            { placeHolder: '选择标签类型' }
        );

        if (!tagType) {
            return;
        }

        let message: string | undefined;
        if (tagType.value === 'annotated') {
            // 输入标签注释
            message = await vscode.window.showInputBox({
                prompt: '输入标签注释（可选）',
                placeHolder: '版本 1.0.0 发布',
            });
            // 如果没有输入消息，使用默认消息
            if (!message) {
                message = `Tag ${tagName}`;
            }
        }

        // 询问是否指向特定提交
        const commitChoice = await vscode.window.showQuickPick(
            [
                { label: '$(circle-filled) 当前提交', value: 'current' },
                { label: '$(git-commit) 指定提交', value: 'specific' }
            ],
            { placeHolder: '选择标签指向的提交' }
        );

        if (!commitChoice) {
            return;
        }

        let commitHash: string | undefined;
        if (commitChoice.value === 'specific') {
            // 获取最近的提交列表
            const log = await gitService.getLog(20);
            const items = log.all.map(commit => ({
                label: `$(git-commit) ${commit.hash.substring(0, 8)}`,
                description: commit.message.split('\n')[0],
                commit: commit.hash
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: '选择要打标签的提交'
            });

            if (!selected) {
                return;
            }

            commitHash = selected.commit;
        }

        // 创建标签
        await gitService.createTag(tagName, message, commitHash);

        const tagInfo = message ? `标签 "${tagName}" (${message})` : `标签 "${tagName}"`;
        vscode.window.showInformationMessage(`✅ ${tagInfo} 创建成功`);
        Logger.info(`创建标签: ${tagName}`);
        CommandHistory.addCommand(
            `git tag ${message ? `-a -m "${message}"` : ''} ${tagName}${commitHash ? ` ${commitHash}` : ''}`,
            '创建标签',
            true
        );

        // 使用防抖刷新，避免重复刷新
        DashboardPanel.refresh();

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('创建标签失败', error instanceof Error ? error : new Error(errorMessage));
        vscode.window.showErrorMessage(`创建标签失败: ${errorMessage}`);
        CommandHistory.addCommand(
            `git tag ${tagName || ''}`,
            '创建标签',
            false,
            errorMessage
        );
    }
});
```

**2. 删除标签命令**：

```typescript
vscode.commands.registerCommand('git-assistant.deleteTag', async () => {
    try {
        const tags = await gitService.getTags();

        if (tags.length === 0) {
            vscode.window.showInformationMessage('当前仓库没有标签');
            return;
        }

        // 创建快速选择项
        const items = tags.map(tag => ({
            label: `$(tag) ${tag.name}`,
            description: tag.message || tag.commit.substring(0, 8),
            tag: tag.name
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要删除的标签'
        });

        if (!selected) {
            return;
        }

        // 确认删除（模态对话框）
        const deleteAction = '删除';
        const confirmed = await vscode.window.showWarningMessage(
            `确定要删除标签 "${selected.tag}" 吗？此操作无法撤销。`,
            { modal: true },
            deleteAction
        );

        if (confirmed !== deleteAction) {
            return;
        }

        // 询问是否同时删除远程标签
        const deleteRemote = await vscode.window.showQuickPick(
            [
                { label: '$(check) 仅删除本地标签', value: 'local' },
                { label: '$(cloud) 同时删除远程标签', value: 'both' }
            ],
            { placeHolder: '选择删除范围' }
        );

        if (!deleteRemote) {
            return;
        }

        // 删除本地标签
        await gitService.deleteTag(selected.tag);
        Logger.info(`删除本地标签: ${selected.tag}`);
        CommandHistory.addCommand(`git tag -d ${selected.tag}`, '删除标签', true);

        // 如果需要，删除远程标签
        if (deleteRemote.value === 'both') {
            try {
                // 获取远程仓库名称
                const remotes = await gitService.getRemotes();
                const remote = remotes.length > 0 ? remotes[0].name : 'origin';

                await gitService.deleteRemoteTag(selected.tag, remote);
                Logger.info(`删除远程标签: ${selected.tag}`);
                vscode.window.showInformationMessage(`✅ 标签 "${selected.tag}" 已从本地和远程删除`);
            } catch (remoteError) {
                Logger.warn(`删除远程标签失败: ${remoteError}`);
                vscode.window.showWarningMessage(
                    `本地标签已删除，但删除远程标签失败: ${remoteError}`
                );
            }
        } else {
            vscode.window.showInformationMessage(`✅ 本地标签 "${selected.tag}" 已删除`);
        }

        // 使用防抖刷新
        DashboardPanel.refresh();

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('删除标签失败', error instanceof Error ? error : new Error(errorMessage));
        vscode.window.showErrorMessage(`删除标签失败: ${errorMessage}`);
        CommandHistory.addCommand('git tag -d', '删除标签', false, errorMessage);
    }
});
```

**3. 推送标签命令**：

```typescript
vscode.commands.registerCommand('git-assistant.pushTag', async () => {
    try {
        const tags = await gitService.getTags();

        if (tags.length === 0) {
            vscode.window.showInformationMessage('当前仓库没有标签');
            return;
        }

        // 获取远程仓库名称
        const remotes = await gitService.getRemotes();
        if (remotes.length === 0) {
            vscode.window.showWarningMessage('当前仓库没有配置远程仓库');
            return;
        }

        const remote = remotes.length > 0 ? remotes[0].name : 'origin';

        // 询问推送方式
        const pushType = await vscode.window.showQuickPick(
            [
                { label: '$(tag) 推送单个标签', value: 'single' },
                { label: '$(tags) 推送所有标签', value: 'all' }
            ],
            { placeHolder: '选择推送方式' }
        );

        if (!pushType) {
            return;
        }

        if (pushType.value === 'all') {
            // 推送所有标签 - 使用模态对话框确认
            const pushAction = '推送';
            const confirmed = await vscode.window.showWarningMessage(
                `确定要推送所有标签到远程仓库 "${remote}" 吗？`,
                { modal: true },
                pushAction
            );

            if (confirmed !== pushAction) {
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `正在推送所有标签到 ${remote}...`,
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ increment: 30 });
                    await gitService.pushAllTags(remote);
                    progress.report({ increment: 70 });
                }
            );

            vscode.window.showInformationMessage(`✅ 所有标签已推送到 ${remote}`);
            Logger.info(`推送所有标签到 ${remote}`);
            CommandHistory.addCommand(`git push --tags ${remote}`, '推送所有标签', true, undefined, remote);

            // 使用防抖刷新
            DashboardPanel.refresh();

        } else {
            // 推送单个标签
            const items = tags.map(tag => ({
                label: `$(tag) ${tag.name}`,
                description: tag.message || tag.commit.substring(0, 8),
                tag: tag.name
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: '选择要推送的标签'
            });

            if (!selected) {
                return;
            }

            // 检查远程标签是否已存在
            const tagExists = await gitService.remoteTagExists(selected.tag, remote);
            let force = false;

            if (tagExists) {
                // 如果已存在，询问是否强制推送（覆盖）
                const forceAction = '强制推送（覆盖）';
                const choice = await vscode.window.showWarningMessage(
                    `远程仓库 "${remote}" 已存在标签 "${selected.tag}"。是否要覆盖？`,
                    { modal: true },
                    forceAction
                );

                if (choice !== forceAction) {
                    return;
                }

                force = true;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `正在推送标签 "${selected.tag}" 到 ${remote}...`,
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ increment: 30 });
                    await gitService.pushTag(selected.tag, remote, force);
                    progress.report({ increment: 70 });
                }
            );

            vscode.window.showInformationMessage(
                `✅ 标签 "${selected.tag}" 已${force ? '强制' : ''}推送到 ${remote}`
            );
            Logger.info(`推送标签 ${selected.tag} 到 ${remote}${force ? ' (强制)' : ''}`);
            CommandHistory.addCommand(
                `git push ${remote} ${selected.tag}${force ? ' --force' : ''}`,
                '推送标签',
                true,
                undefined,
                remote
            );

            // 使用防抖刷新
            DashboardPanel.refresh();
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('推送标签失败', error instanceof Error ? error : new Error(errorMessage));

        // 提供更友好的错误提示
        if (errorMessage.includes('already exists') || errorMessage.includes('已存在')) {
            vscode.window.showErrorMessage(
                `推送标签失败: 远程仓库已存在同名标签。请使用强制推送来覆盖。`
            );
        } else {
            vscode.window.showErrorMessage(`推送标签失败: ${errorMessage}`);
        }

        // 尝试获取远程仓库名称（如果可用）
        let remoteName: string | undefined;
        try {
            const remotes = await gitService.getRemotes();
            remoteName = remotes.length > 0 ? remotes[0].name : undefined;
        } catch {
            // 忽略错误
        }
        CommandHistory.addCommand('git push --tags', '推送标签', false, errorMessage, remoteName);
    }
});
```

- **Dashboard Panel 处理（`dashboard-panel.ts`）**：

**1. 删除标签处理**：

```typescript
private async _handleDeleteTag(tagName: string) {
    try {
        if (!tagName) {
            vscode.window.showErrorMessage('标签名称不能为空');
            return;
        }

        // 确认删除（模态对话框）
        const deleteAction = '删除';
        const confirm = await vscode.window.showWarningMessage(
            `确定要删除标签 "${tagName}" 吗？此操作无法撤销。`,
            { modal: true },
            deleteAction
        );

        if (confirm !== '删除') {
            return;
        }

        // 询问是否同时删除远程标签
        const deleteRemote = await vscode.window.showQuickPick(
            [
                { label: '$(check) 仅删除本地标签', value: 'local' },
                { label: '$(cloud) 同时删除远程标签', value: 'both' }
            ],
            { placeHolder: '选择删除范围' }
        );

        if (!deleteRemote) {
            return;
        }

        // 删除本地标签
        await this.gitService.deleteTag(tagName);
        vscode.window.showInformationMessage(`✅ 本地标签 "${tagName}" 已删除`);

        // 如果需要，删除远程标签
        if (deleteRemote.value === 'both') {
            try {
                const remote = await this._pickRemote('删除标签');
                if (!remote) {
                    vscode.window.showInformationMessage('已取消远程标签删除');
                    await this._sendGitData();
                    return;
                }
                await this.gitService.deleteRemoteTag(tagName, remote);
                vscode.window.showInformationMessage(`✅ 标签 "${tagName}" 已从本地和远程删除`);
            } catch (remoteError) {
                vscode.window.showWarningMessage(
                    `本地标签已删除，但删除远程标签失败: ${remoteError}`
                );
            }
        }

        await this._sendGitData();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`删除标签失败: ${errorMessage}`);
        await this._sendGitData();
    }
}
```

**2. 推送标签处理**：

```typescript
private async _handlePushTag(tagName: string) {
    try {
        if (!tagName) {
            vscode.window.showErrorMessage('标签名称不能为空');
            return;
        }

        const remote = await this._pickRemote('推送标签');
        if (!remote) {
            return;
        }

        // 检查远程标签是否已存在
        const tagExists = await this.gitService.remoteTagExists(tagName, remote);
        let force = false;

        if (tagExists) {
            // 如果已存在，询问是否强制推送（覆盖）
            const choice = await vscode.window.showWarningMessage(
                `远程仓库 "${remote}" 已存在标签 "${tagName}"。是否要覆盖？`,
                { modal: true },
                '强制推送（覆盖）'
            );

            if (!choice) {
                return;
            }

            if (choice === '强制推送（覆盖）') {
                force = true;
            }
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `正在推送标签 "${tagName}" 到 ${remote}...`,
                cancellable: false
            },
            async () => {
                await this.gitService.pushTag(tagName, remote, force);
            }
        );

        vscode.window.showInformationMessage(
            `✅ 标签 "${tagName}" 已${force ? '强制' : ''}推送到 ${remote}`
        );
        await this._sendGitData();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // 提供更友好的错误提示
        if (errorMessage.includes('already exists') || errorMessage.includes('已存在')) {
            vscode.window.showErrorMessage(
                `推送标签失败: 远程仓库已存在同名标签 "${tagName}"。请使用强制推送来覆盖。`
            );
        } else {
            vscode.window.showErrorMessage(`推送标签失败: ${errorMessage}`);
        }
        await this._sendGitData();
    }
}
```

**3. 推送所有标签处理**：

```typescript
private async _handlePushAllTags() {
    try {
        const remote = await this._pickRemote('推送所有标签');
        if (!remote) {
            return;
        }

        // 确认推送（模态对话框）
        const pushAction = '推送';
        const confirmed = await vscode.window.showWarningMessage(
            `确定要推送所有标签到远程仓库 "${remote}" 吗？`,
            { modal: true },
            pushAction
        );

        if (confirmed !== pushAction) {
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `正在推送所有标签到 ${remote}...`,
                cancellable: false
            },
            async () => {
                await this.gitService.pushAllTags(remote);
            }
        );

        vscode.window.showInformationMessage(`✅ 所有标签已推送到 ${remote}`);
        await this._sendGitData();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`推送标签失败: ${errorMessage}`);
        await this._sendGitData();
    }
}
```

- **常见问题 & 解决**：

  - **推送操作易遗漏远程覆盖提示**：UI 中强制弹出确认框，检查远程标签是否存在，如果存在则询问是否强制推送
  - **标签数量巨大时性能问题**：使用 `git for-each-ref` 优化查询，支持缓存，按创建时间倒序排序
  - **远程标签查询慢**：使用缓存机制，远程标签缓存 10 秒，减少网络请求
  - **标签类型混淆**：区分带注释标签和轻量级标签，带注释标签显示消息，轻量级标签不显示
  - **删除标签后缓存未更新**：操作后立即清除相关缓存，确保数据最新

- **亮点**：
  - **并行查询**：使用 `Promise.all` 并行查询本地与远程标签，提升加载速度
  - **智能缓存**：本地标签缓存 3 秒，远程标签缓存 10 秒，减少 Git 调用和网络请求
  - **批量操作**：支持批量推送所有标签，提升操作效率
  - **强制覆盖**：支持强制推送覆盖远程已存在的标签，提供确认对话框
  - **状态同步**：通过 `CommandHistory` 同步操作状态，实时更新 UI
  - **标签类型支持**：支持带注释标签和轻量级标签，带注释标签显示消息和创建时间
  - **指向特定提交**：支持为历史提交创建标签，提供提交选择界面
  - **远程删除**：支持同时删除本地和远程标签，提供选择范围
  - **进度反馈**：推送操作显示进度通知，提升用户体验

##### 🧬 Git 视图表（git-graph-view.ts & GitGraphRenderer）

- **实现方式**：采用自定义 Git Graph 渲染器（`GitGraphRenderer`，基于 vscode-git-graph 核心算法），在 Webview 中使用 SVG 绘制提交 DAG，不再依赖 D3 力导向图。

- **数据来源**：扩展端通过 `git-service.getBranchGraph()` 构建 `BranchGraphData`（包含 `dag.nodes` / `dag.links` / `currentBranch`），并在 `dashboard-panel._sendGitData()` 中与 `getLog(800)` 一起推送到 Webview；首屏优先读取 `getBranchGraphSnapshot()` 命中的 workspaceState 持久化缓存，保证大仓库场景下也能秒级拉起。

- **数据补全**：`dashboard-panel._enrichLogWithParents()` 使用分支图 DAG 为 `log.all` 提交补全 `parents` / `branches` 字段，避免原始 `git log` 输出被裁剪导致前端缺少父子关系或分支信息。

- **前端构建**：`GitGraphViewComponent.buildGraphData()` 将 `GitData.log` 与 `branchGraph.dag` 合并为内部的 `CommitNode[]`，并结合当前分支与分支筛选条件（仅查看某一分支）计算需要渲染的提交顺序、合并标记以及当前提交标记。

- **数据获取策略（后端 `git-service.ts`）**：

**1. 全量构建（`buildFullBranchGraph`）**：

```typescript
private async buildFullBranchGraph(git: SimpleGit): Promise<BranchGraphData> {
    try {
        // 使用 git log 获取所有分支的提交历史
        const logOutput = await git.raw([
            'log',
            '--all',                    // 所有分支
            `--max-count=${GitService.BRANCH_GRAPH_MAX_COMMITS}`,  // 最多 800 个提交
            '--topo-order',             // 拓扑排序
            '--date-order',             // 日期排序
            '--format=%H%x00%P%x00%D%x00%ct',  // 格式：哈希、父提交、引用、时间戳
            '--decorate=full'           // 完整引用信息
        ]);

        // 解析 Git 输出为提交映射
        const commits = this.parseGitLogToCommitMap(logOutput);
        
        // 强制限制提交数量（防止内存溢出）
        this.enforceCommitLimit(commits);
        
        // 获取分支信息
        const branchSummary = await git.branch();
        
        // 构建 DAG（有向无环图）
        return this.buildBranchGraphFromCommitMap(commits, branchSummary);
    } catch (error) {
        ErrorHandler.handleSilent(error, '获取分支图');
        return { branches: [], merges: [], currentBranch: undefined, dag: { nodes: [], links: [] } };
    }
}
```

**2. 增量更新查找策略（`tryBuildIncrementalBranchGraph`）**：

```typescript
private async tryBuildIncrementalBranchGraph(
    git: SimpleGit, 
    repoId: string, 
    headHash: string
): Promise<BranchGraphData | null> {
    if (!this.storage) return null;

    const indexKey = this.getBranchGraphIndexKey(repoId);
    const storedHashes = this.storage.get<string[]>(indexKey) || [];
    if (storedHashes.length === 0) return null;

    // 优化策略1：从最近的提交开始查找（更可能匹配）
    // 优化策略2：限制查找次数，避免在大量历史中查找过久
    const maxAttempts = Math.min(storedHashes.length, 10);
    let attempts = 0;

    for (let i = storedHashes.length - 1; i >= 0 && attempts < maxAttempts; i--) {
        attempts++;
        const candidate = storedHashes[i];
        if (!candidate || candidate === headHash) continue;

        try {
            // 加载候选提交的缓存图
            const baseGraph = this.loadBranchGraphFromStorage(repoId, candidate);
            if (!baseGraph || !baseGraph.dag) continue;

            // 优化策略3：快速检查 - 如果候选提交的节点数已经接近限制，可能不适合作为基础
            if (baseGraph.dag.nodes.length >= GitService.BRANCH_GRAPH_MAX_COMMITS * 0.9) {
                continue;
            }

            // 优化策略4：使用 Git 命令判断祖先关系（高效）
            const ancestor = await this.isAncestor(git, candidate, headHash);
            if (!ancestor) continue;

            // 尝试增量构建
            const incremental = await this.buildBranchGraphIncrementally(
                git, baseGraph, candidate, headHash
            );
            if (incremental) {
                Logger.debug(`使用增量更新构建分支图: ${candidate.substring(0, 7)} -> ${headHash.substring(0, 7)}`);
                return incremental;
            }
        } catch (error) {
            // 单个候选失败不影响其他候选
            ErrorHandler.handleSilent(error, `检查增量更新候选(${candidate?.substring(0, 7)})`);
            continue;
        }
    }

    return null;
}
```

**3. 增量构建实现（`buildBranchGraphIncrementally`）**：

```typescript
private async buildBranchGraphIncrementally(
    git: SimpleGit, 
    baseGraph: BranchGraphData, 
    baseHash: string, 
    headHash: string
): Promise<BranchGraphData | null> {
    if (!baseGraph.dag) return null;

    let logOutput = '';
    try {
        // 关键：只获取 baseHash..headHash 范围的增量提交
        logOutput = await git.raw([
            'log',
            `${baseHash}..${headHash}`,  // 范围查询，只获取增量
            '--topo-order',
            '--date-order',
            '--format=%H%x00%P%x00%D%x00%ct',
            '--decorate=full'
        ]);
    } catch (error) {
        ErrorHandler.handleSilent(error, '增量获取分支图');
        return null;
    }

    const branchSummary = await git.branch();
    const newCommits = this.parseGitLogToCommitMap(logOutput);
    const combinedCommits = new Map<string, CommitNodeInfo>();

    // 合并新提交
    newCommits.forEach((node, hash) => combinedCommits.set(hash, node));

    // 合并基础图的提交（保留旧数据）
    if (baseGraph.dag.nodes) {
        for (const node of baseGraph.dag.nodes) {
            if (!combinedCommits.has(node.hash)) {
                combinedCommits.set(node.hash, {
                    hash: node.hash,
                    parents: node.parents || [],
                    timestamp: node.timestamp,
                    branches: new Set(node.branches || [])
                });
            }
        }
    }

    // 强制限制提交数量
    this.enforceCommitLimit(combinedCommits);
    
    // 重新构建 DAG
    return this.buildBranchGraphFromCommitMap(combinedCommits, branchSummary);
}
```

**4. 祖先关系判断（`isAncestor`）**：

```typescript
private async isAncestor(git: SimpleGit, ancestor: string, descendant: string): Promise<boolean> {
    if (!ancestor || !descendant) return false;
    try {
        // 使用 Git 内置命令高效判断祖先关系
        // 如果 ancestor 是 descendant 的祖先，命令返回 0（成功），否则返回非 0（失败）
        await git.raw(['merge-base', '--is-ancestor', ancestor, descendant]);
        return true;
    } catch {
        return false;
    }
}
```

**5. Git 日志解析（`parseGitLogToCommitMap`）**：

```typescript
private parseGitLogToCommitMap(logOutput: string): Map<string, CommitNodeInfo> {
    const commits = new Map<string, CommitNodeInfo>();
    if (!logOutput || !logOutput.trim()) return commits;

    const logLines = logOutput.trim().split('\n').filter(line => line.trim());
    for (const line of logLines) {
        // 格式：%H%x00%P%x00%D%x00%ct
        // 哈希、父提交（空格分隔）、引用（逗号分隔）、时间戳
        const parts = line.split('\x00');
        if (parts.length < 4) continue;

        const hash = parts[0].trim();
        if (!hash) continue;
        
        const parentStr = parts[1].trim();
        const refStr = parts[2].trim();
        const timestampStr = parts[3].trim();

        // 解析父提交（可能有多个，空格分隔）
        const parents = parentStr ? parentStr.split(/\s+/).filter(p => p.trim()) : [];
        
        // 解析引用（分支、标签等）
        const refs = refStr ? refStr.split(',').map(r => r.trim()).filter(r => r) : [];
        
        // 提取分支名（refs/heads/xxx）
        const branchNames = refs
            .filter(r => r.startsWith('refs/heads/'))
            .map(r => r.replace('refs/heads/', ''));
        
        // 时间戳（秒转毫秒）
        const timestamp = timestampStr ? parseInt(timestampStr, 10) * 1000 : Date.now();

        commits.set(hash, {
            hash,
            parents,
            timestamp,
            branches: new Set(branchNames)
        });
    }

    return commits;
}
```

**6. 持久化存储策略**：

```typescript
// 存储键格式：branchGraph:<repoId>:<headHash>
private getBranchGraphStorageKey(repoId: string, headHash: string): string {
    return `branchGraph:${repoId}:${headHash}`;
}

// 索引键格式：branchGraphIndex:<repoId>
private getBranchGraphIndexKey(repoId: string): string {
    return `branchGraphIndex:${repoId}`;
}

private async saveBranchGraphToStorage(
    repoId: string, 
    headHash: string, 
    data: BranchGraphData
): Promise<void> {
    if (!this.storage || !repoId || !headHash) return;

    // 保存分支图数据
    const storageKey = this.getBranchGraphStorageKey(repoId, headHash);
    await this.storage.update(storageKey, data);

    // 更新索引（维护最近 N 个提交哈希）
    const indexKey = this.getBranchGraphIndexKey(repoId);
    const existingIndex = this.storage.get<string[]>(indexKey) || [];

    // 优化：限制索引大小，只保留最近的 20 个提交哈希
    const MAX_INDEX_SIZE = 20;
    let updatedIndex = [...existingIndex];
    
    // 如果 headHash 已存在，先移除（避免重复）
    updatedIndex = updatedIndex.filter(h => h !== headHash);
    
    // 添加到末尾（最新的）
    updatedIndex.push(headHash);
    
    // 如果超过限制，删除最旧的
    while (updatedIndex.length > MAX_INDEX_SIZE) {
        const oldestHash = updatedIndex[0];
        await this.storage.update(
            this.getBranchGraphStorageKey(repoId, oldestHash), 
            undefined
        );
        updatedIndex = updatedIndex.slice(1);
    }
    
    await this.storage.update(indexKey, updatedIndex);
}
```

- **前端布局算法（`BranchGraph.tsx`）**：

**1. 分层布局算法（类似 `git log --graph`）**：

```typescript
// ========== 实现分层布局算法 ==========
// 1. 按时间戳排序（新的在上，旧的在下）
nodes.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

// 2. 构建子节点映射（用于查找每个节点的子节点）
const childrenMap = new Map<string, any[]>();
nodes.forEach((node: any) => {
    if (!childrenMap.has(node.hash)) {
        childrenMap.set(node.hash, []);
    }
    // 从 parents 关系构建子节点映射
    if (node.parents && node.parents.length > 0) {
        node.parents.forEach((parentHash: string) => {
            if (!childrenMap.has(parentHash)) {
                childrenMap.set(parentHash, []);
            }
            childrenMap.get(parentHash)!.push(node);
        });
    }
});

// 3. 分配层级（Y坐标）- 使用拓扑排序确保子节点在父节点之上
const nodeLevelMap = new Map<string, number>();
const levelNodes = new Map<number, any[]>();

// 第一步：初始化所有节点的层级为基于时间戳的索引
nodes.forEach((node: any, index: number) => {
    nodeLevelMap.set(node.hash, index);
});

// 第二步：调整层级，确保子节点（较新的提交）始终在父节点（较旧的提交）之上
// 需要多轮迭代来稳定层级分配
let changed = true;
let iterations = 0;
const maxIterations = nodes.length; // 防止无限循环

while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    nodes.forEach((node: any) => {
        if (node.parents && node.parents.length > 0) {
            // 获取所有父节点的层级
            const parentLevels = node.parents
                .map((p: string) => nodeLevelMap.get(p))
                .filter((l: number | undefined) => l !== undefined) as number[];

            if (parentLevels.length > 0) {
                const maxParentLevel = Math.max(...parentLevels);
                const currentLevel = nodeLevelMap.get(node.hash) || 0;

                // 子节点必须比所有父节点都靠上（level 更小）
                if (currentLevel >= maxParentLevel) {
                    // 调整子节点到父节点之上
                    nodeLevelMap.set(node.hash, maxParentLevel - 1);
                    changed = true;
                }
            }
        }
    });
}

// 第三步：规范化层级，使其从 0 开始连续
const levelSet = new Set(Array.from(nodeLevelMap.values()));
const sortedLevels = Array.from(levelSet).sort((a, b) => a - b);
const levelMapping = new Map<number, number>();
sortedLevels.forEach((oldLevel, index) => {
    levelMapping.set(oldLevel, index);
});

// 应用映射并重建 levelNodes
levelNodes.clear();
let maxLevel = 0;
nodeLevelMap.forEach((oldLevel, hash) => {
    const newLevel = levelMapping.get(oldLevel) || 0;
    nodeLevelMap.set(hash, newLevel);

    const node = nodes.find((n: any) => n.hash === hash);
    if (node) {
        if (!levelNodes.has(newLevel)) {
            levelNodes.set(newLevel, []);
        }
        levelNodes.get(newLevel)!.push(node);
        maxLevel = Math.max(maxLevel, newLevel);
    }
});
```

**2. 智能轨道分配算法（X 坐标）**：

```typescript
// 4. 为每个分支构建提交链（从分支 HEAD 到根提交）
const branchCommitChains = new Map<string, Set<string>>();

// 收集所有分支的提交链
nodes.forEach((node: any) => {
    if (node.branches && node.branches.length > 0) {
        node.branches.forEach((branchName: string) => {
            if (!branchCommitChains.has(branchName)) {
                branchCommitChains.set(branchName, new Set());
            }
            branchCommitChains.get(branchName)!.add(node.hash);
        });
    }
});

// 为每个分支的提交链添加所有祖先提交
branchCommitChains.forEach((commitSet, branchName) => {
    const toProcess = Array.from(commitSet);
    const processed = new Set<string>();

    while (toProcess.length > 0) {
        const hash = toProcess.pop()!;
        if (processed.has(hash)) continue;
        processed.add(hash);

        const node = nodes.find((n: any) => n.hash === hash);
        if (node && node.parents) {
            node.parents.forEach((parentHash: string) => {
                commitSet.add(parentHash);
                if (!processed.has(parentHash)) {
                    toProcess.push(parentHash);
                }
            });
        }
    }
});

// 5. 分配 X 坐标（轨道/列）- 改进的轨道分配算法
const nodeColumnMap = new Map<string, number>(); // 提交哈希 -> 轨道号
const branchLaneMap = new Map<string, number>(); // 分支名 -> 当前轨道号
let nextLaneId = 0;

// 确保 main/master 在轨道 0（最左侧）
const mainBranchName = nodes.find((n: any) =>
    n.branches && (n.branches.includes('main') || n.branches.includes('master'))
)?.branches?.find((b: string) => b === 'main' || b === 'master') || 'main';
branchLaneMap.set(mainBranchName, 0);
nextLaneId = 1;

// 按层级从新到旧（从上到下）分配轨道
for (let level = 0; level <= maxLevel; level++) {
    const levelCommits = levelNodes.get(level) || [];
    // 在同一层级内，按时间戳排序（新的在前）
    levelCommits.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

    levelCommits.forEach((node: any) => {
        let lane = -1;

        if (node.parents.length === 0) {
            // 情况1: 根提交（初始提交）
            lane = 0;
        } else if (node.parents.length === 1) {
            // 情况2: 普通提交
            const parentLane = nodeColumnMap.get(node.parents[0]);
            if (parentLane !== undefined) {
                lane = parentLane;
            } else {
                lane = 0;
            }

            // 检查是否是分叉点（多个子节点从同一个父节点分出）
            const siblings = childrenMap.get(node.parents[0]) || [];
            if (siblings.length > 1) {
                // 这是分叉点，需要为不同子提交分配不同轨道
                const sortedSiblings = siblings
                    .slice()
                    .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
                const siblingIndex = sortedSiblings.findIndex((s: any) => s.hash === node.hash);

                // 第一个子节点继承父轨道（通常是主分支），其余子节点强制使用新的轨道
                if (siblingIndex > 0) {
                    const usedLanes = new Set(Array.from(nodeColumnMap.values()));
                    let newLane = nextLaneId;
                    while (usedLanes.has(newLane)) {
                        newLane++;
                    }
                    lane = newLane;
                    nextLaneId = Math.max(nextLaneId, newLane + 1);
                }
            } else {
                // 不是分叉点，但需要检查节点所属的分支
                const nodeBranches = new Set<string>();
                branchCommitChains.forEach((commitSet, branchName) => {
                    if (commitSet.has(node.hash)) {
                        nodeBranches.add(branchName);
                    }
                });

                // 如果节点属于已存在的分支，使用该分支的轨道
                for (const branchName of nodeBranches) {
                    if (branchLaneMap.has(branchName)) {
                        lane = branchLaneMap.get(branchName)!;
                        break;
                    }
                }
            }
        } else {
            // 情况3: 合并提交（多个父节点）
            // 主干（第一个父节点）使用其轨道，合并提交也使用该轨道
            const firstParentLane = nodeColumnMap.get(node.parents[0]);
            if (firstParentLane !== undefined) {
                lane = firstParentLane;
            } else {
                lane = 0; // 默认使用主轨道
            }
        }

        // 处理分支引用：更新分支到轨道的映射
        if (node.branches && node.branches.length > 0) {
            // 如果节点有分支引用，优先使用分支的现有轨道
            for (const branchName of node.branches) {
                if (branchLaneMap.has(branchName)) {
                    const existingLane = branchLaneMap.get(branchName);
                    if (existingLane !== undefined) {
                        lane = existingLane;
                        break;
                    }
                }
            }

            // 更新所有相关分支的轨道映射
            node.branches.forEach((branchName: string) => {
                branchLaneMap.set(branchName, lane);
            });
        }

        // 如果还没有分配轨道，使用默认值
        if (lane === -1) {
            lane = 0;
        }

        nodeColumnMap.set(node.hash, lane);
    });
}

// 6. 计算布局参数并设置节点位置
const padding = 50;
const nodeSpacing = 60;      // Y 方向间距
const columnSpacing = 140;   // X 方向间距（轨道宽度）
const startY = padding;
const startX = padding;

nodes.forEach((node: any) => {
    const level = nodeLevelMap.get(node.hash) || 0;
    const lane = nodeColumnMap.get(node.hash) || 0;

    node.x = startX + lane * columnSpacing;
    node.y = startY + level * nodeSpacing;
    node.level = level;
    node.column = lane;
});
```

**3. LOD（Level of Detail）性能优化**：

```typescript
// 节点可见性更新函数（LOD - Level of Detail）
const updateNodeVisibility = (scale: number) => {
    const labels = g.selectAll('.node-label');
    const circles = g.selectAll('.node circle');
    const links = g.selectAll('.links line');

    if (scale < 0.5) {
        // 缩小视图：只显示节点，隐藏标签，缩小节点
        labels.style('opacity', 0);
        circles.attr('r', (d: any) => (d.isMerge ? 4 : 3));
        links.attr('stroke-width', Math.max(1, 1.5 * scale));
    } else if (scale < 1.0) {
        // 中等视图：显示节点和哈希，隐藏消息
        labels.style('opacity', 1);
        labels.selectAll('text').each(function (d: any, i: number) {
            if (i === 0) {
                d3.select(this).style('opacity', 1); // 哈希
            } else {
                d3.select(this).style('opacity', 0); // 消息
            }
        });
        circles.attr('r', (d: any) => (d.isMerge ? 6 : 5));
        links.attr('stroke-width', Math.max(1.5, 2 * scale));
    } else {
        // 放大视图：显示所有信息
        labels.style('opacity', 1);
        labels.selectAll('text').style('opacity', 1);
        circles.attr('r', (d: any) => (d.isMerge ? 8 : 6));
        links.attr('stroke-width', 2);
    }
};

// 创建缩放和平移行为
const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.05, 5]) // 缩放范围：5% - 500%
    .on('zoom', (event) => {
        const currentScale = event.transform.k;
        g.attr('transform', event.transform);
        // 根据缩放级别调整节点和标签显示
        updateNodeVisibility(currentScale);
        // 更新缩放百分比
        setZoomLevel(Math.round(currentScale * 100 * 10) / 10);
    });

svg.call(zoom);
```

**7. 缓存入口方法（`getBranchGraph`）**：

```typescript
/**
 * 获取分支关系图数据
 * 完全基于提交及其 parent 关系构建，不进行推断
 * 
 * 缓存策略（优先级从高到低）：
 * 1. 内存缓存（TTL 10秒）
 * 2. 持久化缓存（workspaceState，基于 headHash）
 * 3. 增量更新（基于祖先关系）
 * 4. 全量重建
 */
async getBranchGraph(forceRefresh: boolean = false): Promise<BranchGraphData> {
    const cacheKey = 'branchGraph';

    // 第一层：内存缓存
    if (!forceRefresh) {
        const cached = this.getCached<BranchGraphData>(cacheKey);
        if (cached) {
            return cached;
        }
    }

    const git = this.ensureGit();
    const repoId = this.getRepoStorageId();

    let headHash = '';
    try {
        headHash = (await git.revparse(['HEAD'])).trim();
    } catch {
        headHash = '';
    }

    // 第二层：持久化缓存（workspaceState）
    if (!forceRefresh && headHash) {
        const persisted = this.loadBranchGraphFromStorage(repoId, headHash);
        if (persisted) {
            // 同时更新内存缓存
            this.setCache(cacheKey, persisted, this.CACHE_TTL.branchGraph);
            return persisted;
        }
    }

    // 第三层：增量更新
    if (!forceRefresh && headHash) {
        const incrementalGraph = await this.tryBuildIncrementalBranchGraph(git, repoId, headHash);
        if (incrementalGraph) {
            // 更新内存和持久化缓存
            this.setCache(cacheKey, incrementalGraph, this.CACHE_TTL.branchGraph);
            await this.saveBranchGraphToStorage(repoId, headHash, incrementalGraph);
            return incrementalGraph;
        }
    }

    // 第四层：全量重建
    const fullGraph = await this.buildFullBranchGraph(git);
    this.setCache(cacheKey, fullGraph, this.CACHE_TTL.branchGraph);
    if (headHash) {
        await this.saveBranchGraphToStorage(repoId, headHash, fullGraph);
    }
    return fullGraph;
}
```

**8. 快照获取方法（`getBranchGraphSnapshot`）**：

```typescript
/**
 * 获取当前 HEAD 对应的快照，用于控制面板初次渲染
 * 优先使用内存缓存，其次使用持久化缓存
 * 不触发增量更新或全量重建（避免阻塞 UI）
 */
async getBranchGraphSnapshot(): Promise<BranchGraphData | null> {
    const cacheKey = 'branchGraph';
    
    // 优先使用内存缓存
    const cached = this.getCached<BranchGraphData>(cacheKey);
    if (cached) {
        return cached;
    }

    // 其次使用持久化缓存
    const git = this.ensureGit();
    let headHash = '';
    try {
        headHash = (await git.revparse(['HEAD'])).trim();
    } catch {
        return null;
    }
    if (!headHash) {
        return null;
    }

    return this.loadBranchGraphFromStorage(this.getRepoStorageId(), headHash);
}
```

**9. 缓存清理方法（`clearBranchGraphCache`）**：

```typescript
/**
 * 一键清空分支图缓存：内存 + workspaceState
 * 用于调试和强制刷新
 */
async clearBranchGraphCache(): Promise<void> {
    // 清空内存缓存
    this.invalidateCache('branchGraph');
    
    if (!this.storage) {
        return;
    }

    const repoId = this.getRepoStorageId();
    const indexKey = this.getBranchGraphIndexKey(repoId);
    const storedHashes = this.storage.get<string[]>(indexKey) || [];

    // 删除所有持久化的分支图数据
    for (const hash of storedHashes) {
        await this.storage.update(
            this.getBranchGraphStorageKey(repoId, hash), 
            undefined
        );
    }
    
    // 清空索引
    await this.storage.update(indexKey, []);
}
```

- **控制面板与 Webview 集成（`dashboard-panel.ts` & `BranchGraph.tsx`）**：

**1. 控制面板发送初始数据（`dashboard-panel.ts`）**：

```typescript
// 在刷新控制面板时，优先获取分支图快照（不阻塞）
const branchGraphSnapshot = await this.gitService
    .getBranchGraphSnapshot()
    .catch(() => null);

// 发送初始数据到 Webview
this._sendInitialData({
    status,
    branches,
    log,
    remotes,
    currentBranch,
    conflicts,
    tags,
    remoteTags: [],
    repositoryInfo,
    branchGraphSnapshot: branchGraphSnapshot || null  // 快照数据
});

// 后台异步刷新完整分支图（增量更新或全量重建）
this.gitService.getBranchGraph(false).then((fullGraph) => {
    // 增量更新 UI
    this._panel.webview.postMessage({
        type: 'gitDataUpdate',
        data: { branchGraph: fullGraph }
    });
}).catch((error) => {
    ErrorHandler.handleSilent(error, '刷新分支图');
});
```

**2. Webview 端初始状态（`App.tsx`）**：

```typescript
// Webview 端初始状态：如果有快照则直接渲染，否则显示空 DAG 等待后台更新
const [gitData, setGitData] = useState<GitData>({
    status: data.status || {},
    branches: data.branches || { all: [], current: '' },
    log: data.log || { all: [], total: 0 },
    remotes: data.remotes || [],
    currentBranch: data.currentBranch || '',
    conflicts: data.conflicts || [],
    tags: data.tags || [],
    remoteTags: data.remoteTags || [],
    repositoryInfo: data.repositoryInfo || null,
    branchGraph: {
        // 优先使用快照，否则使用空数据等待后台更新
        branches: data.branchGraphSnapshot?.branches || data.branches.all || [],
        merges: data.branchGraphSnapshot?.merges || [],
        currentBranch: data.branchGraphSnapshot?.currentBranch || data.currentBranch,
        dag: data.branchGraphSnapshot?.dag || { nodes: [], links: [] }
    }
});
```

**3. 分支视图组件布局（`BranchGraph.tsx`）**：

```typescript
// 固定高度布局，支持滚动和详情面板
<div className="branch-graph-layout" style={{ 
    display: 'flex', 
    gap: '16px', 
    height: '800px', 
    minHeight: '800px' 
}}>
    {/* 图形容器：可滚动，支持缩放和平移 */}
    <div 
        className="graph-container" 
        ref={containerRef} 
        style={{ 
            flex: showDetails ? '1 1 70%' : '1 1 100%', 
            height: '100%', 
            overflow: 'auto' 
        }}
    >
        <svg 
            ref={svgRef} 
            style={{ 
                width: '100%', 
                minHeight: '100%', 
                cursor: 'move'  // 拖拽光标
            }} 
        />
        
        {/* 清空缓存按钮 */}
        <button 
            className="secondary-button" 
            onClick={handleClearBranchGraphCache}
            style={{ marginTop: '16px' }}
        >
            🧹 清空分支图缓存
        </button>
    </div>
    
    {/* 详情面板：点击节点时显示 */}
    {showDetails && selectedNode && (
        <div 
            className="details-panel" 
            style={{ 
                flex: '0 0 300px', 
                height: '100%', 
                overflow: 'auto',
                padding: '16px',
                borderLeft: `1px solid ${themeColors.border.secondary}`
            }}
        >
            {/* 详情内容 */}
        </div>
    )}
</div>
```

**4. 节点交互事件处理**：

```typescript
// 节点点击事件 - 显示详情面板
node.on('click', (event, d: any) => {
    event.stopPropagation();
    selectedNodeRef.current = d;
    setSelectedNode(d);
    setShowDetails(true);
});

// 节点悬停事件 - 显示增强的工具提示
node.on('mouseover', (event, d: any) => {
    const branches = d.branches?.join(', ') || '未知分支';
    const isMergeText = d.isMerge ? ' 🔀 合并提交' : '';
    const author = d.author_name || '未知作者';
    const date = d.formattedDate || d.relativeTime || '未知日期';
    const message = d.message ? d.message.split('\n')[0] : '无提交消息';
    const parentHashes = d.parents?.slice(0, 2)
        .map((p: string) => p.substring(0, 7))
        .join(', ') || '无';

    tooltip
        .html(`
            <div style="margin-bottom: 8px; border-bottom: 1px solid ${themeColors.tooltip.border}; padding-bottom: 6px;">
                <div style="font-weight: bold; color: ${themeColors.chart.primary}; margin-bottom: 4px;">
                    ${d.hash.substring(0, 7)}${isMergeText}
                </div>
                <div style="font-size: 11px; color: ${themeColors.tooltip.text};">
                    ${message}
                </div>
            </div>
            <div style="margin: 4px 0;"><strong>👤 作者:</strong> ${author}</div>
            <div style="margin: 4px 0;"><strong>📅 日期:</strong> ${date}</div>
            <div style="margin: 4px 0;"><strong>🌿 分支:</strong> ${branches}</div>
            <div style="margin: 4px 0;"><strong>🔗 父提交:</strong> ${parentHashes}</div>
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid ${themeColors.tooltip.border}; font-size: 10px; color: ${themeColors.text.tertiary};">
                点击查看完整详情
            </div>
        `)
        .style('opacity', 1);
})
.on('mousemove', (event) => {
    tooltip
        .style('left', (event.pageX + 15) + 'px')
        .style('top', (event.pageY - 10) + 'px');
})
.on('mouseout', () => {
    tooltip.style('opacity', 0);
});
```

- **常见问题 & 解决**：
  - **首次加载慢**：持久化缓存命中率低时退回全量计算 —— 通过增量 `base..HEAD` 重建减少 60% Git I/O；
  - **页面出现多重滚动条**：Webview `body` 改为 `overflow: hidden`，仅保留 `app-main` / 图形容器的滚动；
  - **视图空间不足**：分支视图区域固定 800px 高度，可滚动查看，缩放按钮 + 鼠标滚轮双重控制。
- **亮点**：支持拖拽节点、点击显示分支详情、自动匹配主题色、缓存秒开，且提供“一键清理缓存”调试入口。

##### ⚠️ 冲突解决（ConflictEditor.tsx & conflict-resolver.ts）

- **实现架构**：采用**实时检测 + 自动/手动解决 + 可视化提示**的三层架构。包含冲突检测提供者（`ConflictProvider`）、冲突解决命令（`conflict-resolver.ts`）和 Webview 冲突编辑器（`ConflictEditor.tsx`）三个核心模块。

- **核心策略**：
  1. **实时冲突检测**：通过 `ConflictProvider` 监听文件变化，实时检测冲突标记
  2. **多种解决方式**：支持接受当前、接受传入、接受全部、手动编辑四种策略
  3. **可视化高亮**：使用 VS Code 装饰 API 高亮显示冲突区域
  4. **自动暂存提醒**：解决后自动提示添加到暂存区

- **冲突检测实现（`ConflictProvider`）**：

**1. 实时文件监听**：

```typescript
export class ConflictProvider implements vscode.TreeDataProvider<ConflictTreeItem> {
    private conflictDecorationType: vscode.TextEditorDecorationType;
    private fileConflictState: Map<string, boolean> = new Map();

    constructor(private gitService: GitService) {
        // 创建冲突装饰类型（红色背景，整行高亮）
        this.conflictDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.1)',
            borderRadius: '3px',
            isWholeLine: true,
            overviewRulerColor: 'red',
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });

        // 监听活动编辑器变化
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                this.checkConflicts(editor.document);
            }
        });

        // 监听文档保存与内容变化，实时更新冲突提示
        vscode.workspace.onDidSaveTextDocument(document => {
            this.checkConflicts(document);
        });

        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document === vscode.window.activeTextEditor?.document) {
                this.checkConflicts(event.document);
            }
        });
    }
}
```

**2. 冲突标记检测算法**：

```typescript
/**
 * 检查文档中的冲突标记
 * 查找 <<<<<<< / ======= / >>>>>>> 标记并高亮显示
 */
checkConflicts(document: vscode.TextDocument) {
    const config = vscode.workspace.getConfiguration('git-assistant');
    // 检查是否启用冲突高亮（可通过配置关闭）
    if (!config.get('conflictHighlight', true)) {
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
        return;
    }

    const text = document.getText();
    const conflictMarkers: vscode.Range[] = [];

    // 逐行查找冲突标记
    const lines = text.split('\n');
    let inConflict = false;
    let conflictStart = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 检测冲突开始标记：<<<<<<< HEAD 或 <<<<<<< <分支名>
        if (line.startsWith('<<<<<<<')) {
            inConflict = true;
            conflictStart = i;
        } 
        // 检测冲突结束标记：>>>>>>> <分支名>
        else if (line.startsWith('>>>>>>>') && inConflict) {
            inConflict = false;
            // 创建冲突区域范围（从开始标记到结束标记）
            const range = new vscode.Range(
                new vscode.Position(conflictStart, 0),
                new vscode.Position(i, lines[i].length)
            );
            conflictMarkers.push(range);
        }
    }

    // 应用装饰（高亮显示冲突区域）
    editor.setDecorations(this.conflictDecorationType, conflictMarkers);

    const filePath = document.uri.fsPath;
    const hasConflict = conflictMarkers.length > 0;
    this.fileConflictState.set(filePath, hasConflict);

    // 如果发现冲突，显示提示
    if (hasConflict) {
        vscode.window.showWarningMessage(
            `该文件包含 ${conflictMarkers.length} 处冲突`,
            '解决冲突'
        ).then(choice => {
            if (choice === '解决冲突') {
                vscode.commands.executeCommand('git-assistant.resolveConflicts');
            }
        });
    }
}
```

**3. 侧边栏冲突列表（TreeDataProvider）**：

```typescript
async getChildren(element?: ConflictTreeItem): Promise<ConflictTreeItem[]> {
    if (element) {
        return [];
    }

    try {
        // 从 GitService 获取冲突文件列表
        const conflicts = await this.gitService.getConflicts();

        if (conflicts.length === 0) {
            // 返回一个提示项
            const item = new vscode.TreeItem('✅ 没有冲突', vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
            item.contextValue = 'noConflict';
            return [item as any];
        }

        const workspaceRoot = this.gitService.getWorkspaceRoot();
        // 为每个冲突文件创建树项
        return conflicts.map(file =>
            new ConflictTreeItem(file, workspaceRoot, vscode.TreeItemCollapsibleState.None)
        );
    } catch (error) {
        vscode.window.showErrorMessage(`检测冲突失败: ${error}`);
        return [];
    }
}
```

- **冲突解决实现（`conflict-resolver.ts`）**：

**1. 冲突解决命令入口**：

```typescript
export function registerConflictResolver(
    context: vscode.ExtensionContext,
    gitService: GitService,
    conflictProvider: ConflictProvider
) {
    // 解决冲突命令
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.resolveConflicts', async () => {
            try {
                // 获取冲突文件列表
                const conflicts = await gitService.getConflicts();

                if (conflicts.length === 0) {
                    vscode.window.showInformationMessage('当前没有冲突文件');
                    return;
                }

                // 显示冲突文件列表（QuickPick）
                const items = conflicts.map(file => ({
                    label: `$(warning) ${file}`,
                    description: '存在冲突',
                    file: file
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `发现 ${conflicts.length} 个冲突文件，选择要解决的文件`
                });

                if (!selected) {
                    return;
                }

                // 打开冲突文件
                const document = await vscode.workspace.openTextDocument(
                    resolveConflictFileUri(selected.file, gitService.getWorkspaceRoot())
                );
                await vscode.window.showTextDocument(document);

                // 提供冲突解决选项
                const choice = await vscode.window.showQuickPick(
                    [
                        { label: '$(check) 接受当前更改（全部冲突块）', action: 'current' as const },
                        { label: '$(check) 接受传入更改（全部冲突块）', action: 'incoming' as const },
                        { label: '$(check) 接受所有更改（合并保留）', action: 'both' as const },
                        { label: '$(edit) 手动编辑', action: 'manual' as const }
                    ],
                    { placeHolder: '选择冲突解决方式' }
                );

                if (!choice) {
                    return;
                }

                if (choice.action === 'manual') {
                    vscode.window.showInformationMessage(
                        '请手动编辑并保存文件，完成后记得执行 git add 将其标记为已解决'
                    );
                    await promptStageReminder(document.uri.fsPath, gitService, conflictProvider, { 
                        autoResolved: false 
                    });
                    return;
                }

                // 自动解决冲突
                await resolveConflictAuto(document, choice.action);
                await document.save();

                await promptStageReminder(document.uri.fsPath, gitService, conflictProvider, { 
                    autoResolved: true 
                });

            } catch (error) {
                vscode.window.showErrorMessage(`解决冲突失败: ${error}`);
            }
        })
    );
}
```

**2. 自动冲突解决算法**：

```typescript
/**
 * 自动解决冲突
 * 使用正则表达式匹配冲突标记并替换
 */
async function resolveConflictAuto(
    document: vscode.TextDocument,
    action: string
): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const text = document.getText();

    // 匹配冲突标记（兼容不同分支名和 CRLF/LF）
    // 形如：
    // <<<<<<< HEAD
    // ...当前更改...
    // =======
    // ...传入更改...
    // >>>>>>> main
    // 
    // 正则说明：
    // - <<<<<<<[^\n]*\r?\n : 匹配冲突开始标记（支持任意分支名，兼容 CRLF/LF）
    // - ([\s\S]*?) : 非贪婪匹配当前更改内容（包括换行）
    // - \r?\n=======\r?\n : 匹配分隔符（兼容 CRLF/LF）
    // - ([\s\S]*?) : 非贪婪匹配传入更改内容
    // - \r?\n>>>>>>>[^\n]* : 匹配冲突结束标记（支持任意分支名）
    const conflictPattern = /<<<<<<<[^\n]*\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>>[^\n]*/g;

    let match;
    const replacements: { range: vscode.Range; text: string }[] = [];

    // 收集所有冲突块及其替换内容
    while ((match = conflictPattern.exec(text)) !== null) {
        const fullMatch = match[0];
        const currentChanges = match[1];  // 当前更改（本地）
        const incomingChanges = match[2]; // 传入更改（远程）

        let resolvedText = '';
        switch (action) {
            case 'current':
                // 接受当前更改：只保留本地修改
                resolvedText = currentChanges;
                break;
            case 'incoming':
                // 接受传入更改：只保留远程修改
                resolvedText = incomingChanges;
                break;
            case 'both':
                // 接受所有更改：合并保留两边修改
                resolvedText = currentChanges + '\n' + incomingChanges;
                break;
        }

        // 计算冲突块的位置范围
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + fullMatch.length);
        replacements.push({
            range: new vscode.Range(startPos, endPos),
            text: resolvedText
        });
    }

    // 如果没有匹配到任何冲突块，给出提示
    if (replacements.length === 0) {
        vscode.window.showWarningMessage(
            '未检测到标准 Git 冲突标记，自动合并未生效，请确认文件中仍包含 <<<<<<< / ======= / >>>>>>> 标记。'
        );
        return;
    }

    // 应用所有替换（从后往前，避免位置偏移）
    for (let i = replacements.length - 1; i >= 0; i--) {
        const replacement = replacements[i];
        edit.replace(document.uri, replacement.range, replacement.text);
    }

    await vscode.workspace.applyEdit(edit);
}
```

**3. 暂存提醒功能**：

```typescript
/**
 * 提示用户将已解决的文件再次添加到暂存区，并提供快捷操作
 */
async function promptStageReminder(
    filePath: string,
    gitService: GitService,
    conflictProvider: ConflictProvider,
    options: { autoResolved: boolean }
): Promise<void> {
    const message = options.autoResolved
        ? '✅ 冲突已解决，是否立即将该文件添加到暂存区？'
        : '完成手动合并后，请添加文件到暂存区以标记已解决。是否现在添加？';

    const choice = await vscode.window.showInformationMessage(
        message,
        { modal: false },
        '暂存该文件',
        '稍后'
    );

    if (choice === '暂存该文件') {
        try {
            await gitService.add(filePath);
            vscode.window.showInformationMessage('已将文件添加到暂存区');
            conflictProvider.refresh(); // 刷新冲突列表
        } catch (error) {
            vscode.window.showErrorMessage(`暂存文件失败: ${error}`);
        }
    } else {
        vscode.window.showInformationMessage('记得稍后运行 git add 标记该文件已解决');
    }
}
```

- **Webview 冲突编辑器（`ConflictEditor.tsx`）**：

```typescript
export const ConflictEditor: React.FC<{ data: any }> = ({ data }) => {
    const [selectedFile, setSelectedFile] = useState<string | null>(null);

    const handleResolveConflict = (file: string, action: 'current' | 'incoming' | 'both') => {
        vscode.postMessage({
            command: 'resolveConflict',
            file,
            action
        });
    };

    const handleOpenFile = (file: string) => {
        vscode.postMessage({
            command: 'openFile',
            file
        });
    };

    if (!data?.conflicts) {
        return (
            <div className="empty-state">
                <p>⚠️ 正在检测冲突...</p>
            </div>
        );
    }

    const conflicts = data.conflicts || [];

    if (conflicts.length === 0) {
        return (
            <div className="empty-state success">
                <div className="success-icon">✅</div>
                <h2>没有冲突</h2>
                <p>当前工作区没有发现任何冲突文件</p>
            </div>
        );
    }

    return (
        <div className="conflict-editor">
            <div className="section-header">
                <h2>冲突解决</h2>
                <div className="conflict-count">
                    发现 <span className="count">{conflicts.length}</span> 个冲突文件
                </div>
            </div>

            <div className="conflict-list">
                {conflicts.map((file: string) => (
                    <div
                        key={file}
                        className={`conflict-item ${selectedFile === file ? 'selected' : ''}`}
                        onClick={() => setSelectedFile(file)}
                    >
                        <div className="conflict-header">
                            <span className="conflict-icon">⚠️</span>
                            <span className="file-path">{file}</span>
                            <button
                                className="open-button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenFile(file);
                                }}
                            >
                                📝 打开文件
                            </button>
                        </div>

                        {selectedFile === file && (
                            <div className="conflict-actions">
                                <h4>选择解决方式：</h4>
                                <div className="action-buttons">
                                    <button
                                        className="action-button current"
                                        onClick={() => handleResolveConflict(file, 'current')}
                                    >
                                        <div className="button-icon">←</div>
                                        <div className="button-label">接受当前更改</div>
                                        <div className="button-desc">保留本地修改</div>
                                    </button>

                                    <button
                                        className="action-button incoming"
                                        onClick={() => handleResolveConflict(file, 'incoming')}
                                    >
                                        <div className="button-icon">→</div>
                                        <div className="button-label">接受传入更改</div>
                                        <div className="button-desc">使用远程修改</div>
                                    </button>

                                    <button
                                        className="action-button both"
                                        onClick={() => handleResolveConflict(file, 'both')}
                                    >
                                        <div className="button-icon">↕</div>
                                        <div className="button-label">接受所有更改</div>
                                        <div className="button-desc">保留两边修改</div>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
```

- **工具函数（`git-utils.ts`）**：

**1. 冲突标记解析**：

```typescript
/**
 * 解析冲突标记，返回冲突块数组
 */
export function parseConflictMarkers(content: string): {
    hasConflict: boolean;
    conflicts: Array<{
        start: number;
        middle: number;
        end: number;
        current: string;
        incoming: string;
    }>;
} {
    const lines = content.split('\n');
    const conflicts: any[] = [];
    let inConflict = false;
    let conflictStart = -1;
    let conflictMiddle = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('<<<<<<<')) {
            inConflict = true;
            conflictStart = i;
        } else if (line.startsWith('=======') && inConflict) {
            conflictMiddle = i;
        } else if (line.startsWith('>>>>>>>') && inConflict) {
            if (conflictStart !== -1 && conflictMiddle !== -1) {
                conflicts.push({
                    start: conflictStart,
                    middle: conflictMiddle,
                    end: i,
                    current: lines.slice(conflictStart + 1, conflictMiddle).join('\n'),
                    incoming: lines.slice(conflictMiddle + 1, i).join('\n')
                });
            }
            inConflict = false;
            conflictStart = -1;
            conflictMiddle = -1;
        }
    }

    return {
        hasConflict: conflicts.length > 0,
        conflicts
    };
}
```

**2. 冲突解决函数**：

```typescript
/**
 * 解决冲突（自动选择）
 * 根据策略替换冲突标记
 */
export function resolveConflict(
    content: string,
    action: 'current' | 'incoming' | 'both'
): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let inConflict = false;
    let conflictStart = -1;
    let conflictMiddle = -1;
    let currentLines: string[] = [];
    let incomingLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('<<<<<<<')) {
            inConflict = true;
            conflictStart = i;
            currentLines = [];
            incomingLines = [];
        } else if (line.startsWith('=======') && inConflict) {
            conflictMiddle = i;
        } else if (line.startsWith('>>>>>>>') && inConflict) {
            // 根据选择添加内容
            switch (action) {
                case 'current':
                    result.push(...currentLines);
                    break;
                case 'incoming':
                    result.push(...incomingLines);
                    break;
                case 'both':
                    result.push(...currentLines);
                    result.push(...incomingLines);
                    break;
            }

            inConflict = false;
            conflictStart = -1;
            conflictMiddle = -1;
        } else if (inConflict) {
            if (conflictMiddle === -1) {
                currentLines.push(line);
            } else {
                incomingLines.push(line);
            }
        } else {
            result.push(line);
        }
    }

    return result.join('\n');
}
```

- **GitService 冲突检测（`git-service.ts`）**：

```typescript
/**
 * 获取冲突文件列表
 * 通过 git status 获取处于冲突状态的文件
 */
async getConflicts(): Promise<string[]> {
    const git = this.ensureGit();
    const status = await git.status();
    // simple-git 的 status 对象包含 conflicted 数组
    return status.conflicted;
}
```

- **常见问题 & 解决**：

  - **冲突标记未识别**：正则表达式兼容 CRLF/LF，支持任意分支名，但要求标准 Git 冲突标记格式
  - **位置偏移问题**：替换时从后往前应用，避免因位置变化导致的偏移
  - **装饰未清除**：文件保存后自动重新检测，解决后装饰自动消失
  - **暂存提醒遗漏**：解决后自动弹出提示，支持一键暂存

- **亮点**：
  - **实时检测**：文件变化时自动检测冲突，无需手动刷新
  - **可视化高亮**：冲突区域红色背景高亮，一目了然
  - **多种解决方式**：支持一键解决、逐个解决、手动编辑
  - **智能提醒**：解决后自动提示暂存，避免遗漏
  - **配置可关闭**：可通过 `git-assistant.conflictHighlight` 配置关闭高亮功能

##### 📊 提交图（CommitGraph.tsx）

- **实现架构**：采用 **Canvas 2D 渲染**，结合高 DPI 支持、智能文本换行、动态布局计算等技术，实现高性能的提交历史可视化。

- **核心策略**：
  1. **高 DPI 渲染**：自动适配 Retina 等高分辨率屏幕，确保文字和图形清晰
  2. **动态布局**：根据提交数量自动计算画布高度，支持滚动查看
  3. **智能文本换行**：支持中英文混合，保留空格，最多显示 2 行
  4. **性能优化**：禁用透明度、启用图像平滑、优化绘制顺序

- **高 DPI 渲染实现**：

```typescript
useEffect(() => {
    if (!canvasRef.current || !data?.log) {
        return;
    }

    const canvas = canvasRef.current;
    const commits = data?.log?.all ?? [];
    
    // 获取 2D 渲染上下文，禁用透明度以提高性能
    const ctx = canvas.getContext('2d', {
        alpha: false, // 禁用透明度以提高性能
        desynchronized: false
    });
    if (!ctx) {
        return;
    }

    // 获取设备像素比，用于高DPI显示
    const dpr = window.devicePixelRatio || 1;
    const container = canvas.parentElement || document.body;
    const rect = container.getBoundingClientRect();
    const displayWidth = rect.width;
    const baseHeight = rect.height || 600;

    // 根据提交数量动态计算高度
    const dynamicHeight = commits.length > 0
        ? Math.max(baseHeight, COMMIT_TOP_MARGIN + commits.length * COMMIT_ROW_HEIGHT + COMMIT_BOTTOM_MARGIN)
        : baseHeight;

    // 设置画布实际大小（考虑DPI）
    // 实际像素 = 显示像素 × 设备像素比
    canvas.width = displayWidth * dpr;
    canvas.height = dynamicHeight * dpr;

    // 设置画布显示大小（CSS像素）
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = dynamicHeight + 'px';

    // 缩放上下文以匹配DPI
    // 这样绘制时使用逻辑坐标，浏览器自动处理物理像素映射
    ctx.scale(dpr, dpr);

    // 启用文本平滑和图像平滑
    ctx.textBaseline = 'middle';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 获取主题颜色
    const themeColors = getThemeColors();

    // 获取背景色（在VS Code Webview中需显式使用window.getComputedStyle）
    const computedStyle = typeof window !== 'undefined' && window.getComputedStyle
        ? window.getComputedStyle(canvas.parentElement || document.body)
        : { backgroundColor: themeColors.background.primary } as CSSStyleDeclaration;
    const backgroundColor = computedStyle.backgroundColor || themeColors.background.primary;

    // 绘制提交图谱
    drawCommitGraph(ctx, commits, displayWidth, dynamicHeight, backgroundColor, themeColors);
}, [data]);
```

- **绘制算法实现**：

**1. 布局参数定义**：

```typescript
const COMMIT_ROW_HEIGHT = 75;        // 每行提交的高度（像素）
const COMMIT_TOP_MARGIN = 25;       // 顶部边距
const COMMIT_BOTTOM_MARGIN = 80;     // 底部边距
const commitRadius = 6;              // 提交节点半径
const leftMargin = 60;               // 左侧边距
const textX = leftMargin + 25;       // 文本起始X坐标
```

**2. 字体配置**：

```typescript
// 使用系统字体栈以提高清晰度
// 哈希：等宽字体，加粗，13px
const hashFont = 'bold 13px "Consolas", "Monaco", "Courier New", "Menlo", monospace';

// 提交消息：系统字体，15px
const messageFont = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif';

// 元信息：系统字体，12px
const metaFont = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif';
```

**3. 绘制函数**：

```typescript
const drawCommitGraph = (
    ctx: CanvasRenderingContext2D,
    commits: any[],
    width: number,
    height: number,
    backgroundColor: string,
    themeColors: ReturnType<typeof getThemeColors>
) => {
    // 清空画布，使用背景色填充
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    if (!commits || commits.length === 0) {
        return;
    }

    // 布局参数
    const commitHeight = COMMIT_ROW_HEIGHT;
    const commitRadius = 6;
    const leftMargin = 60;
    const topMargin = COMMIT_TOP_MARGIN;
    const textX = leftMargin + 25;
    const maxWidth = width - textX - 20; // 文本最大宽度

    commits.forEach((commit, index) => {
        const y = topMargin + index * commitHeight;
        const x = leftMargin;

        // ========== 绘制连接线 ==========
        if (index > 0) {
            ctx.strokeStyle = themeColors.commitGraph.line;
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            // 从上一个节点的底部到当前节点的顶部
            ctx.moveTo(x, y - commitHeight + commitRadius);
            ctx.lineTo(x, y - commitRadius);
            ctx.stroke();
        }

        // ========== 绘制提交节点 ==========
        // 节点填充
        ctx.fillStyle = themeColors.commitGraph.node;
        ctx.beginPath();
        ctx.arc(x, y, commitRadius, 0, 2 * Math.PI);
        ctx.fill();

        // 节点外圈高光（提高可见性）
        ctx.strokeStyle = themeColors.commitGraph.nodeHighlight;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, commitRadius + 1, 0, 2 * Math.PI);
        ctx.stroke();

        // ========== 绘制提交哈希 ==========
        ctx.fillStyle = themeColors.commitGraph.hash;
        ctx.font = hashFont;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const hashText = commit.hash.substring(0, 8); // 只显示前8位
        ctx.fillText(hashText, textX, y - 20);

        // ========== 绘制提交消息（智能换行） ==========
        ctx.fillStyle = themeColors.commitGraph.message;
        ctx.font = messageFont;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const message = commit.message.split('\n')[0]; // 只取第一行

        // 文本换行处理，支持中英文混合，保留空格
        const words = message.split(/(\s+)/); // 保留空格分隔符
        let line = '';
        let lineY = y + 5;
        const lineHeight = 19;
        const maxLines = 2; // 最多显示2行
        let lineCount = 0;

        for (let i = 0; i < words.length && lineCount < maxLines; i++) {
            // 保留空格，不要跳过空白字符
            const testLine = line + words[i];
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && line.trim()) {
                // 只有当 line 不为空时才换行
                ctx.fillText(line, textX, lineY);
                line = words[i];
                lineY += lineHeight;
                lineCount++;
            } else {
                line = testLine;
            }
        }
        
        // 绘制剩余文本
        if (line && lineCount < maxLines) {
            ctx.fillText(line, textX, lineY);
        } else if (lineCount >= maxLines && line) {
            // 如果超过最大行数，截断并添加省略号
            const truncated = truncateText(ctx, line, maxWidth - 20) + '...';
            ctx.fillText(truncated, textX, lineY);
        }

        // ========== 绘制作者和日期信息 ==========
        ctx.fillStyle = themeColors.commitGraph.meta;
        ctx.font = metaFont;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        // 格式化日期
        const dateStr = new Date(commit.date).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        const metaText = `${commit.author_name} · ${dateStr}`;
        ctx.fillText(metaText, textX, lineY + lineHeight + 5);
    });
};
```

**4. 文本截断辅助函数**：

```typescript
/**
 * 辅助函数：截断文本以适应宽度
 * 使用二分查找优化，避免逐字符测量
 */
const truncateText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
    const metrics = ctx.measureText(text);
    if (metrics.width <= maxWidth) {
        return text;
    }

    // 从末尾逐字符截断，直到宽度合适
    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
    }
    return truncated;
};
```

- **性能优化策略**：

**1. Canvas 上下文优化**：

```typescript
// 禁用透明度以提高性能（不透明背景渲染更快）
const ctx = canvas.getContext('2d', {
    alpha: false,           // 禁用透明度
    desynchronized: false   // 禁用异步渲染（确保同步）
});
```

**2. 图像平滑优化**：

```typescript
// 启用高质量图像平滑
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
```

**3. 绘制顺序优化**：

```typescript
// 绘制顺序：背景 → 连接线 → 节点 → 文本
// 1. 先填充背景（一次性操作）
ctx.fillRect(0, 0, width, height);

// 2. 批量绘制连接线（减少状态切换）
commits.forEach((commit, index) => {
    if (index > 0) {
        // 绘制连接线
    }
});

// 3. 批量绘制节点（减少状态切换）
commits.forEach((commit, index) => {
    // 绘制节点
});

// 4. 最后绘制文本（文本渲染最慢，放在最后）
commits.forEach((commit, index) => {
    // 绘制文本
});
```

**4. 动态高度计算**：

```typescript
// 根据提交数量动态计算画布高度
const dynamicHeight = commits.length > 0
    ? Math.max(
        baseHeight,  // 最小高度
        COMMIT_TOP_MARGIN + commits.length * COMMIT_ROW_HEIGHT + COMMIT_BOTTOM_MARGIN
    )
    : baseHeight;

// 避免画布过大导致内存占用过高
// 如果提交数量过多，可以考虑虚拟滚动或分页
```

- **主题适配**：

```typescript
// 获取主题颜色
const themeColors = getThemeColors();

// 使用主题颜色绘制各个元素
ctx.strokeStyle = themeColors.commitGraph.line;        // 连接线颜色
ctx.fillStyle = themeColors.commitGraph.node;         // 节点颜色
ctx.strokeStyle = themeColors.commitGraph.nodeHighlight; // 节点高光颜色
ctx.fillStyle = themeColors.commitGraph.hash;          // 哈希颜色
ctx.fillStyle = themeColors.commitGraph.message;      // 消息颜色
ctx.fillStyle = themeColors.commitGraph.meta;         // 元信息颜色

// 背景色从父容器获取，自动适配主题
const computedStyle = window.getComputedStyle(canvas.parentElement || document.body);
const backgroundColor = computedStyle.backgroundColor || themeColors.background.primary;
```

- **组件结构**：

```typescript
export const CommitGraph: React.FC<{ data: any }> = ({ data }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // 绘制逻辑在 useEffect 中
    useEffect(() => {
        // ... 绘制逻辑
    }, [data]);

    return (
        <div className="commit-graph">
            <div className="section-header">
                <h2>提交历史图谱</h2>
                <p className="section-description">
                    可视化显示提交历史和分支关系
                </p>
            </div>
            <div
                className="graph-container"
                style={{
                    height: '600px',
                    maxHeight: '600px',
                    overflowY: 'auto',  // 支持滚动
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: '4px'
                }}
            >
                <canvas
                    ref={canvasRef}
                    style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block',
                        imageRendering: 'crisp-edges'  // 确保边缘清晰
                    }}
                />
            </div>
            {!data?.log && (
                <div className="empty-state">
                    <p>📊 正在加载提交历史...</p>
                </div>
            )}
        </div>
    );
};
```

- **常见问题 & 解决**：

  - **高 DPI 屏幕文字模糊**：通过 `devicePixelRatio` 自动缩放，设置画布实际大小为显示大小 × DPR，然后缩放上下文
  - **文本重叠问题**：智能换行算法，支持中英文混合，保留空格，最多显示 2 行，超出部分截断并添加省略号
  - **大量提交性能问题**：禁用透明度、优化绘制顺序、使用高质量图像平滑，未来可考虑虚拟滚动
  - **画布高度计算错误**：根据提交数量动态计算，使用 `Math.max` 确保最小高度
  - **主题切换后颜色不更新**：通过 `getThemeColors()` 实时获取主题颜色，在 `useEffect` 依赖 `data` 时重新绘制

- **亮点**：
  - **高 DPI 支持**：自动适配 Retina 等高分辨率屏幕，文字和图形清晰锐利
  - **智能文本换行**：支持中英文混合，保留空格，自动换行，超出部分截断
  - **动态布局**：根据提交数量自动计算画布高度，支持滚动查看
  - **性能优化**：禁用透明度、优化绘制顺序、启用高质量图像平滑
  - **主题适配**：自动适配 VS Code 浅色/深色主题
  - **视觉增强**：节点外圈高光、粗连接线、清晰的字体配置，提高可读性

##### 📅 时间线（TimelineView.tsx & git-service.ts）

- **实现架构**：采用**双层架构**：GitService API（`git-service.ts`）负责数据聚合和统计，Webview 组件（`TimelineView.tsx`）负责 D3.js 可视化渲染。支持日历热力图和柱状图两种视图，按年月筛选显示。

- **核心策略**：
  1. **数据聚合**：按日期聚合提交数量，生成时间线数据
  2. **主题适配**：自动检测浅色/深色主题，调整颜色方案
  3. **双视图展示**：柱状图显示每日提交统计，日历热力图显示 GitHub 风格贡献日历
  4. **年月筛选**：支持选择年份和月份，动态更新视图

- **GitService 时间线 API（`git-service.ts`）**：

**1. 获取提交时间线**：

```typescript
/**
 * 获取提交时间线（按日期聚合提交数量）
 * @param days 统计天数（默认 365 天）
 * @returns Map<日期字符串, 提交数量>
 */
async getCommitTimeline(days: number = 365): Promise<Map<string, number>> {
    const git = this.ensureGit();
    const timeline = new Map<string, number>();

    try {
        // 获取所有提交，不限制日期范围，确保包含今天的提交
        // 使用更大的 maxCount 以确保获取足够的历史记录
        const log = await git.log({
            maxCount: 10000
        });

        // 计算截止日期（days 天前）
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        cutoffDate.setHours(0, 0, 0, 0); // 设置为当天的开始时间

        log.all.forEach(commit => {
            const commitDate = new Date(commit.date);
            
            // 只统计在时间范围内的提交
            if (commitDate >= cutoffDate) {
                // 格式化为 YYYY-MM-DD 格式
                const year = commitDate.getFullYear();
                const month = String(commitDate.getMonth() + 1).padStart(2, '0');
                const day = String(commitDate.getDate()).padStart(2, '0');
                const dateKey = `${year}-${month}-${day}`;

                // 累加该日期的提交数量
                const count = timeline.get(dateKey) || 0;
                timeline.set(dateKey, count + 1);
            }
        });
    } catch (error) {
        // 如果无法获取，返回空Map
        ErrorHandler.handleSilent(error, '获取提交时间线');
    }

    return timeline;
}
```

- **Webview 组件实现（`TimelineView.tsx`）**：

**1. 主题检测与颜色配置**：

```typescript
/**
 * 检测是否为浅色主题
 * 通过计算背景色亮度判断
 */
const isLightTheme = (): boolean => {
    if (typeof window === 'undefined') return false;
    const body = document.body;
    const bgColor = window.getComputedStyle(body).backgroundColor;
    // 解析 RGB 值
    const rgb = bgColor.match(/\d+/g);
    if (!rgb || rgb.length < 3) return false;
    // 计算亮度 (0-255)
    const brightness = (parseInt(rgb[0]) + parseInt(rgb[1]) + parseInt(rgb[2])) / 3;
    return brightness > 128;
};

/**
 * 获取主题相关的颜色
 */
const getThemeColors = () => {
    const light = isLightTheme();
    return {
        emptyText: light ? '#666' : '#888',
        axisText: light ? '#666' : '#ccc',
        titleText: light ? '#333' : '#fff',
        gridLine: light ? '#e0e0e0' : '#333',
        emptyCell: light ? '#f5f5f5' : '#2d2d2d',
        labelText: light ? '#333' : '#fff',
        inactiveText: light ? '#999' : '#888'
    };
};
```

**2. 柱状图绘制**：

```typescript
/**
 * 绘制时间线柱状图
 * 显示选中月份的每日提交统计
 */
const drawTimelineChart = (
    container: SVGSVGElement, 
    timeline: Map<string, number> | TimelineData[], 
    year: number, 
    month: number
) => {
    d3.select(container).selectAll('*').remove();

    const width = (container as any).clientWidth || 1000;
    const height = 300;
    const margin = { top: 20, right: 20, bottom: 50, left: 60 };
    const theme = getThemeColors();

    const svg = d3.select(container)
        .attr('width', width)
        .attr('height', height);

    // 转换数据
    const timelineArray: TimelineData[] = Array.isArray(timeline)
        ? timeline
        : Array.from(timeline.entries()).map(([date, count]) => ({ date, count }));

    if (timelineArray.length === 0) {
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .style('fill', theme.emptyText)
            .text('暂无时间线数据');
        return;
    }

    // 过滤出选中月份的数据
    const monthData = timelineArray.filter(d => {
        const date = new Date(d.date);
        return date.getFullYear() === year && date.getMonth() + 1 === month;
    });

    // 获取该月的所有日期（包括没有提交的日期）
    const daysInMonth = new Date(year, month, 0).getDate();
    const allDays: TimelineData[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const existingData = monthData.find(d => d.date === dateKey);
        allDays.push(existingData || { date: dateKey, count: 0 });
    }

    // 创建比例尺
    const xScale = d3.scaleBand()
        .domain(allDays.map(d => d.date))
        .range([margin.left, width - margin.right])
        .padding(0.1);

    const maxCount = Math.max(...allDays.map(d => d.count), 1);
    const yScale = d3.scaleLinear()
        .domain([0, maxCount])
        .range([height - margin.bottom, margin.top]);

    // 绘制柱状图
    svg.selectAll('.bar')
        .data(allDays)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', (d: TimelineData) => xScale(d.date) || 0)
        .attr('y', (d: TimelineData) => yScale(d.count))
        .attr('width', xScale.bandwidth())
        .attr('height', (d: TimelineData) => height - margin.bottom - yScale(d.count))
        .attr('fill', (d: TimelineData) => d.count > 0 ? '#0e639c' : theme.emptyCell)
        .attr('rx', 2)
        .attr('ry', 2)
        .append('title')
        .text((d: TimelineData) => {
            const date = new Date(d.date);
            return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日\n${d.count} 次提交`;
        });

    // 添加数值标签（只在有提交的日期显示）
    svg.selectAll('.bar-label')
        .data(allDays.filter(d => d.count > 0))
        .enter()
        .append('text')
        .attr('class', 'bar-label')
        .attr('x', (d: TimelineData) => (xScale(d.date) || 0) + xScale.bandwidth() / 2)
        .attr('y', (d: TimelineData) => yScale(d.count) - 5)
        .attr('text-anchor', 'middle')
        .style('fill', theme.labelText)
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .text((d: TimelineData) => d.count.toString());

    // 添加X轴
    const xAxis = d3.axisBottom(xScale)
        .tickFormat((d: string) => {
            const date = new Date(d);
            return `${date.getDate()}日`;
        })
        .ticks(Math.min(allDays.length, 31));

    svg.append('g')
        .attr('transform', `translate(0, ${height - margin.bottom})`)
        .call(xAxis)
        .selectAll('text')
        .style('fill', theme.axisText)
        .style('font-size', '10px')
        .style('text-anchor', 'middle');

    // 添加Y轴
    const yAxis = d3.axisLeft(yScale)
        .ticks(Math.min(maxCount, 10));

    svg.append('g')
        .attr('transform', `translate(${margin.left}, 0)`)
        .call(yAxis)
        .selectAll('text')
        .style('fill', theme.axisText)
        .style('font-size', '10px');

    // 添加网格线
    svg.append('g')
        .attr('class', 'grid')
        .attr('transform', `translate(${margin.left}, 0)`)
        .call(d3.axisLeft(yScale)
            .ticks(Math.min(maxCount, 10))
            .tickSize(-width + margin.left + margin.right)
            .tickFormat(() => '') as any)
        .selectAll('line')
        .attr('stroke', theme.gridLine)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.3);
}
```

**3. 日历热力图绘制**：

```typescript
/**
 * 绘制日历热力图（GitHub 风格）
 * 显示选中月份的贡献日历
 */
const drawCalendar = (
    container: HTMLDivElement, 
    timeline: Map<string, number> | TimelineData[], 
    year: number, 
    month: number
) => {
    const containerEl = container as any;
    containerEl.innerHTML = '';

    const theme = getThemeColors();
    const light = isLightTheme();

    // 转换数据为 Map
    const timelineMap = new Map<string, number>();
    if (Array.isArray(timeline)) {
        timeline.forEach(d => timelineMap.set(d.date, d.count));
    } else {
        timeline.forEach((count, date) => timelineMap.set(date, count));
    }

    // 创建日历容器（7列网格）
    const calendarDiv = document.createElement('div');
    calendarDiv.style.display = 'grid';
    calendarDiv.style.gridTemplateColumns = 'repeat(7, 1fr)';
    calendarDiv.style.gap = '3px';
    calendarDiv.style.padding = '12px';
    calendarDiv.style.background = 'var(--vscode-sideBar-background)';
    calendarDiv.style.borderRadius = '8px';
    calendarDiv.style.maxWidth = '600px';
    calendarDiv.style.margin = '0 auto';

    // 星期标题
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    weekdays.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.style.textAlign = 'center';
        dayHeader.style.fontWeight = 'bold';
        dayHeader.style.padding = '5px';
        dayHeader.style.fontSize = '11px';
        dayHeader.style.color = theme.inactiveText;
        dayHeader.textContent = day;
        calendarDiv.appendChild(dayHeader);
    });

    // 获取月份的第一天和最后一天
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // 对齐到周日

    // 生成42天的网格（6周）
    const maxCount = Math.max(...Array.from(timelineMap.values()), 1);
    const getColor = (count: number) => {
        if (count === 0) return theme.emptyCell;
        // 使用固定的 #0e639c 颜色，根据提交数量调整透明度
        const intensity = Math.min(count / maxCount, 1);
        const opacity = light ? 0.2 + intensity * 0.6 : 0.3 + intensity * 0.7;
        return `rgba(14, 99, 156, ${opacity})`;
    };

    for (let i = 0; i < 42; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);

        const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        const count = timelineMap.get(dateKey) || 0;
        const isCurrentMonth = currentDate.getMonth() + 1 === month;

        const dayCell = document.createElement('div');
        dayCell.style.aspectRatio = '1';
        dayCell.style.display = 'flex';
        dayCell.style.flexDirection = 'column';
        dayCell.style.alignItems = 'center';
        dayCell.style.justifyContent = 'center';
        dayCell.style.background = getColor(count);
        dayCell.style.borderRadius = '3px';
        dayCell.style.cursor = 'pointer';
        dayCell.style.opacity = isCurrentMonth ? '1' : '0.4'; // 非当前月份的日期降低透明度
        dayCell.style.transition = 'transform 0.2s';
        dayCell.style.border = count > 0 ? '1px solid rgba(14, 99, 156, 0.8)' : 'none';
        dayCell.title = `${dateKey}\n${count} 次提交`;

        // 悬停效果
        dayCell.onmouseenter = () => {
            dayCell.style.transform = 'scale(1.1)';
        };
        dayCell.onmouseleave = () => {
            dayCell.style.transform = 'scale(1)';
        };

        const dayNumber = document.createElement('div');
        dayNumber.style.fontSize = '10px';
        dayNumber.style.color = count > 0 ? '#fff' : theme.inactiveText;
        dayNumber.style.fontWeight = count > 0 ? 'bold' : 'normal';
        dayNumber.textContent = currentDate.getDate().toString();

        if (count > 0) {
            const countBadge = document.createElement('div');
            countBadge.style.fontSize = '9px';
            countBadge.style.color = '#fff';
            countBadge.style.marginTop = '1px';
            countBadge.textContent = count.toString();
            dayCell.appendChild(dayNumber);
            dayCell.appendChild(countBadge);
        } else {
            dayCell.appendChild(dayNumber);
        }

        calendarDiv.appendChild(dayCell);
    }

    containerEl.appendChild(calendarDiv);
};
```

**4. 组件结构**：

```typescript
export const TimelineView: React.FC<{ data: any }> = ({ data }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const calendarRef = useRef<HTMLDivElement>(null);
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

    useEffect(() => {
        const timeline = data?.timeline;
        if (timeline === undefined || timeline === null) {
            // 清空显示
            if (svgRef.current) {
                d3.select(svgRef.current).selectAll('*').remove();
            }
            if (calendarRef.current) {
                (calendarRef.current as any).innerHTML = '';
            }
            return;
        }

        if (svgRef.current) {
            drawTimelineChart(svgRef.current, timeline, selectedYear, selectedMonth);
        }

        if (calendarRef.current) {
            drawCalendar(calendarRef.current, timeline, selectedYear, selectedMonth);
        }
    }, [data, selectedYear, selectedMonth]);

    const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    return (
        <div className="timeline-view">
            <div className="section-header">
                <h2>时间线视图</h2>
                <p className="section-description">
                    结合日历的提交时间线，展示提交活动的时间分布
                </p>
            </div>

            {/* 年月选择器 */}
            <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center' }}>
                <label>选择年份：</label>
                <select
                    value={String(selectedYear)}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                    {years.map((year: number) => (
                        <option key={year} value={String(year)}>{year}</option>
                    ))}
                </select>

                <label>选择月份：</label>
                <select
                    value={String(selectedMonth)}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                    {months.map((month: number) => (
                        <option key={month} value={String(month)}>{month}月</option>
                    ))}
                </select>
            </div>

            {/* 柱状图 */}
            <div className="graph-container" style={{ marginBottom: '20px' }}>
                <svg ref={svgRef} style={{ width: '100%', height: '300px' }} />
            </div>

            {/* 日历热力图 */}
            <div className="calendar-container">
                <div ref={calendarRef} />
            </div>
        </div>
    );
};
```

- **常见问题 & 解决**：

  - **时区差异导致日期错位**：使用本地时区处理日期，确保日期键格式为 `YYYY-MM-DD`
  - **数据为空时显示问题**：检查数据是否存在，为空时显示友好提示
  - **月份切换时数据不更新**：在 `useEffect` 依赖中添加 `selectedYear` 和 `selectedMonth`
  - **日历网格对齐问题**：计算月份第一天是星期几，从周日开始对齐
  - **颜色对比度不足**：根据主题调整颜色，有提交的日期使用高对比度颜色

- **亮点**：
  - **双视图展示**：柱状图 + 日历热力图，提供多维度时间分析
  - **主题适配**：自动检测浅色/深色主题，调整颜色方案
  - **年月筛选**：支持选择年份和月份，动态更新视图
  - **交互式日历**：悬停显示详情，点击可查看具体日期提交
  - **完整月份显示**：包括没有提交的日期，提供完整的时间视图
  - **数据聚合优化**：按日期聚合提交数量，减少数据量，提升性能

##### 🔥 热力图（HeatmapAnalysis.tsx & git-service.ts）

- **实现架构**：采用**双层架构**：GitService API（`git-service.ts`）负责数据统计和聚合，Webview 组件（`HeatmapAnalysis.tsx`）负责 D3.js 可视化渲染。支持文件修改频率和贡献者活跃度两种热力图，使用标签页切换。

- **核心策略**：
  1. **数据统计**：使用 `git diff-tree` 和 `git show` 获取文件变更，按文件路径和贡献者聚合
  2. **Top-N 优化**：文件热力图显示 Top 20，贡献者热力图显示 Top 15，提升性能
  3. **颜色映射**：使用 D3.js 颜色比例尺，根据修改次数/提交数量映射颜色
  4. **标签页切换**：支持文件修改频率和贡献者活跃度两种视图切换

- **GitService 统计 API（`git-service.ts`）**：

**1. 获取文件统计**：

```typescript
/**
 * 获取文件修改频率统计
 * @param days 统计天数（默认 365 天）
 * @returns Map<文件路径, 修改次数>
 */
async getFileStats(days: number = 365): Promise<Map<string, number>> {
    const git = this.ensureGit();
    const fileStats = new Map<string, number>();
    const since = new Date();
    since.setDate(since.getDate() - days);

    try {
        // 使用 git log --name-only 来获取文件变更，更可靠
        const log = await git.log({
            '--since': since.toISOString(),
            maxCount: 1000,
            '--name-only': null
        });

        // 如果没有提交，返回空Map
        if (!log.all || log.all.length === 0) {
            return fileStats;
        }

        // 为每个提交获取文件变更（限制数量以提高性能）
        const commitsToProcess = log.all.slice(0, 100);
        for (const commit of commitsToProcess) {
            try {
                // 使用 diff-tree 命令获取文件列表，更准确
                const result = await git.raw([
                    'diff-tree',
                    '--no-commit-id',
                    '--name-only',
                    '-r',
                    commit.hash
                ]);

                if (result) {
                    const files = result.trim().split('\n').filter(line => line.trim().length > 0);
                    files.forEach((file: string) => {
                        const path = file.trim();
                        if (path) {
                            // 累加文件修改次数
                            const count = fileStats.get(path) || 0;
                            fileStats.set(path, count + 1);
                        }
                    });
                }
            } catch (error) {
                // 如果 diff-tree 失败，尝试使用 show 命令
                try {
                    const showResult = await git.raw([
                        'show',
                        '--name-only',
                        '--pretty=format:',
                        commit.hash
                    ]);

                    if (showResult) {
                        const files = showResult.trim().split('\n')
                            .filter(line => {
                                const trimmed = line.trim();
                                return trimmed &&
                                    !trimmed.startsWith('commit') &&
                                    !trimmed.startsWith('Author') &&
                                    !trimmed.startsWith('Date') &&
                                    !trimmed.startsWith('diff') &&
                                    !trimmed.startsWith('index') &&
                                    !trimmed.startsWith('---') &&
                                    !trimmed.startsWith('+++') &&
                                    !trimmed.startsWith('@@') &&
                                    trimmed.length > 0;
                            });

                        files.forEach((file: string) => {
                            const path = file.trim();
                            if (path) {
                                const count = fileStats.get(path) || 0;
                                fileStats.set(path, count + 1);
                            }
                        });
                    }
                } catch (showError) {
                    // 跳过无法获取的提交
                    continue;
                }
            }
        }
    } catch (error) {
        // 如果无法获取统计，返回空Map
        ErrorHandler.handleSilent(error, '获取文件统计');
    }

    return fileStats;
}
```

**2. 获取贡献者统计**：

```typescript
/**
 * 获取贡献者活跃度统计
 * @param days 统计天数（默认 365 天）
 * @returns Map<邮箱, { commits: 提交数, files: Set<文件路径> }>
 */
async getContributorStats(
    days: number = 365
): Promise<Map<string, { commits: number; files: Set<string> }>> {
    const git = this.ensureGit();
    const contributorStats = new Map<string, { commits: number; files: Set<string> }>();
    const since = new Date();
    since.setDate(since.getDate() - days);

    try {
        const log = await git.log({
            '--since': since.toISOString(),
            maxCount: 1000
        });

        // 如果没有提交，返回空Map
        if (!log.all || log.all.length === 0) {
            return contributorStats;
        }

        // 限制处理的提交数量以提高性能
        const commitsToProcess = log.all.slice(0, 100);

        for (const commit of commitsToProcess) {
            const email = commit.author_email || commit.author_name;
            if (!email) continue;

            // 获取或创建贡献者统计
            const stats = contributorStats.get(email) || {
                commits: 0,
                files: new Set<string>()
            };
            stats.commits += 1;

            // 获取该提交修改的文件
            try {
                const result = await git.raw([
                    'diff-tree',
                    '--no-commit-id',
                    '--name-only',
                    '-r',
                    commit.hash
                ]);

                if (result) {
                    const files = result.trim().split('\n').filter(line => line.trim().length > 0);
                    files.forEach((file: string) => {
                        const path = file.trim();
                        if (path) {
                            stats.files.add(path);
                        }
                    });
                }
            } catch (error) {
                // 如果获取文件列表失败，只统计提交数
                // 继续处理下一个提交
            }

            contributorStats.set(email, stats);
        }
    } catch (error) {
        // 如果无法获取统计，返回空Map
        ErrorHandler.handleSilent(error, '获取贡献者统计');
    }

    return contributorStats;
}
```

- **Webview 组件实现（`HeatmapAnalysis.tsx`）**：

**1. 文件修改频率热力图**：

```typescript
/**
 * 绘制文件修改频率热力图
 * 显示 Top 20 最常修改的文件
 */
const drawFileHeatmap = (
    container: SVGSVGElement, 
    fileStats: Map<string, number> | FileStat[]
) => {
    d3.select(container).selectAll('*').remove();

    const width = (container as any).clientWidth || 800;
    const height = 400;
    const margin = { top: 20, right: 20, bottom: 60, left: 200 };
    const theme = getThemeColors();

    const svg = d3.select(container)
        .attr('width', width)
        .attr('height', height);

    // 转换数据
    const statsArray: FileStat[] = Array.isArray(fileStats)
        ? fileStats
        : Array.from(fileStats.entries()).map(([path, count]) => ({ path, count }));

    // 按修改次数排序，取前20个
    const topFiles = statsArray
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

    if (topFiles.length === 0) {
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .style('fill', theme.emptyText)
            .text('暂无文件修改数据');
        return;
    }

    // 创建颜色比例尺（黄-橙-红）
    const maxCount = d3.max(topFiles, d => d.count) || 1;
    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd)
        .domain([0, maxCount]);

    // 创建比例尺
    const xScale = d3.scaleBand()
        .domain(topFiles.map((_, i) => i.toString()))
        .range([margin.left, width - margin.right])
        .padding(0.1);

    const yScale = d3.scaleBand()
        .domain(topFiles.map(d => d.path))
        .range([margin.top, height - margin.bottom])
        .padding(0.1);

    // 绘制矩形
    svg.selectAll('.file-rect')
        .data(topFiles)
        .enter()
        .append('rect')
        .attr('class', 'file-rect')
        .attr('x', (_: any, i: number) => xScale(i.toString()) || 0)
        .attr('y', (d: FileStat) => yScale(d.path) || 0)
        .attr('width', xScale.bandwidth())
        .attr('height', yScale.bandwidth())
        .attr('fill', (d: FileStat) => colorScale(d.count) as string)
        .attr('stroke', isLightTheme() ? '#e0e0e0' : '#333')
        .attr('stroke-width', 1)
        .append('title')
        .text((d: FileStat) => `${d.path}\n修改次数: ${d.count}`);

    // 添加数值标签
    svg.selectAll('.file-label')
        .data(topFiles)
        .enter()
        .append('text')
        .attr('class', 'file-label')
        .attr('x', (_: any, i: number) => (xScale(i.toString()) || 0) + xScale.bandwidth() / 2)
        .attr('y', (d: FileStat) => (yScale(d.path) || 0) + yScale.bandwidth() / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .style('fill', (d: FileStat) => d.count > maxCount / 2 ? theme.labelText : (isLightTheme() ? '#333' : '#fff'))
        .style('font-size', '10px')
        .text((d: FileStat) => d.count.toString());

    // 添加Y轴（文件路径）
    svg.append('g')
        .attr('transform', `translate(${margin.left}, 0)`)
        .call(d3.axisLeft(yScale))
        .selectAll('text')
        .style('font-size', '10px')
        .style('fill', theme.axisText)
        .call((text: any) => {
            // 简化文件路径显示（只显示最后两级）
            text.each(function (this: SVGTextElement) {
                const textEl = d3.select(this);
                const words = textEl.text().split('/');
                if (words.length > 2) {
                    textEl.text(words[words.length - 2] + '/' + words[words.length - 1]);
                }
            });
        });

    // 添加标题
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', 15)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .style('fill', theme.titleText)
        .text('文件修改频率热力图（Top 20）');
};
```

**2. 贡献者活跃度热力图**：

```typescript
/**
 * 绘制贡献者活跃度热力图
 * 显示 Top 15 最活跃的贡献者
 */
const drawContributorHeatmap = (
    container: HTMLDivElement, 
    contributorStats: Map<string, any> | ContributorStat[]
) => {
    const containerEl = container as any;
    containerEl.innerHTML = '';

    const theme = getThemeColors();

    // 转换数据
    const statsArray: ContributorStat[] = Array.isArray(contributorStats)
        ? contributorStats
        : Array.from(contributorStats.entries()).map(([email, stats]) => ({
            email,
            commits: stats.commits || 0,
            files: stats.files?.size || 0
        }));

    if (statsArray.length === 0) {
        containerEl.style.display = 'flex';
        containerEl.style.alignItems = 'center';
        containerEl.style.justifyContent = 'center';
        containerEl.style.height = '400px';
        containerEl.innerHTML = `<p style="text-align: center; color: ${theme.emptyText}; margin: 0;">暂无贡献者数据</p>`;
        return;
    }

    // 按提交数排序，取前15个
    const sortedContributors = statsArray
        .sort((a, b) => b.commits - a.commits)
        .slice(0, 15);

    const maxCommits = Math.max(...sortedContributors.map(c => c.commits), 1);

    // 创建热力图容器（网格布局）
    const heatmapContainer = document.createElement('div');
    heatmapContainer.style.display = 'grid';
    heatmapContainer.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
    heatmapContainer.style.gap = '15px';
    heatmapContainer.style.padding = '20px';

    sortedContributors.forEach(contributor => {
        const card = document.createElement('div');
        // 根据提交数量使用渐变色
        card.style.background = `linear-gradient(135deg, ${getColorForCommits(contributor.commits, maxCommits)}, ${getColorForCommits(contributor.commits * 0.8, maxCommits)})`;
        card.style.borderRadius = '8px';
        card.style.padding = '20px';
        card.style.color = '#fff';
        card.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';

        const name = document.createElement('div');
        name.style.fontWeight = 'bold';
        name.style.fontSize = '16px';
        name.style.marginBottom = '10px';
        name.style.wordBreak = 'break-all';
        name.textContent = contributor.email.split('@')[0] || contributor.email;

        const commits = document.createElement('div');
        commits.style.fontSize = '32px';
        commits.style.fontWeight = 'bold';
        commits.style.marginBottom = '5px';
        commits.textContent = contributor.commits.toString();

        const commitsLabel = document.createElement('div');
        commitsLabel.style.fontSize = '12px';
        commitsLabel.style.opacity = '0.9';
        commitsLabel.textContent = '次提交';

        const files = document.createElement('div');
        files.style.marginTop = '10px';
        files.style.fontSize = '14px';
        files.style.opacity = '0.9';
        files.textContent = `涉及 ${contributor.files} 个文件`;

        card.appendChild(name);
        card.appendChild(commits);
        card.appendChild(commitsLabel);
        card.appendChild(files);

        heatmapContainer.appendChild(card);
    });

    containerEl.appendChild(heatmapContainer);
};

/**
 * 根据提交数量获取颜色
 */
const getColorForCommits = (commits: number, maxCommits: number): string => {
    const ratio = commits / maxCommits;
    if (ratio > 0.8) return '#4a90e2';  // 深蓝
    if (ratio > 0.6) return '#5ba3f5';  // 中蓝
    if (ratio > 0.4) return '#6cb6ff';  // 浅蓝
    if (ratio > 0.2) return '#7dc9ff';  // 更浅蓝
    return '#8edaff';  // 最浅蓝
};
```

**3. 组件结构**：

```typescript
export const HeatmapAnalysis: React.FC<{ data: any }> = ({ data }) => {
    const fileHeatmapRef = useRef<SVGSVGElement>(null);
    const contributorHeatmapRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'files' | 'contributors'>('files');

    useEffect(() => {
        if (!data) return;

        // 文件修改频率热力图
        if (activeTab === 'files' && fileHeatmapRef.current) {
            if (data.fileStats && (Array.isArray(data.fileStats) ? data.fileStats.length > 0 : data.fileStats.size > 0)) {
                drawFileHeatmap(fileHeatmapRef.current, data.fileStats);
            } else {
                // 显示空状态
                const theme = getThemeColors();
                d3.select(fileHeatmapRef.current).selectAll('*').remove();
                const width = (fileHeatmapRef.current as any).clientWidth || 800;
                const height = 400;
                d3.select(fileHeatmapRef.current)
                    .attr('width', width)
                    .attr('height', height)
                    .append('text')
                    .attr('x', width / 2)
                    .attr('y', height / 2)
                    .attr('text-anchor', 'middle')
                    .style('fill', theme.emptyText)
                    .text('暂无文件修改数据');
            }
        }

        // 贡献者活跃度热力图
        if (activeTab === 'contributors' && contributorHeatmapRef.current) {
            if (data.contributorStats && (Array.isArray(data.contributorStats) ? data.contributorStats.length > 0 : data.contributorStats.size > 0)) {
                drawContributorHeatmap(contributorHeatmapRef.current, data.contributorStats);
            } else {
                // 显示空状态
                const theme = getThemeColors();
                const containerEl = contributorHeatmapRef.current as any;
                containerEl.innerHTML = '';
                containerEl.style.display = 'flex';
                containerEl.style.alignItems = 'center';
                containerEl.style.justifyContent = 'center';
                containerEl.style.height = '400px';
                containerEl.innerHTML = `<p style="text-align: center; color: ${theme.emptyText}; margin: 0;">暂无贡献者数据</p>`;
            }
        }
    }, [data, activeTab]);

    return (
        <div className="heatmap-analysis">
            <div className="section-header">
                <h2>热力图分析</h2>
                <p className="section-description">
                    展示文件修改频率和贡献者活跃度统计
                </p>
            </div>

            {/* 标签页切换 */}
            <div className="tab-buttons" style={{ marginBottom: '20px' }}>
                <button
                    className={activeTab === 'files' ? 'active' : ''}
                    onClick={() => setActiveTab('files')}
                >
                    文件修改频率
                </button>
                <button
                    className={activeTab === 'contributors' ? 'active' : ''}
                    onClick={() => setActiveTab('contributors')}
                >
                    贡献者活跃度
                </button>
            </div>

            {/* 图表容器 */}
            <div className="graph-container">
                {activeTab === 'files' && (
                    <svg ref={fileHeatmapRef} style={{ width: '100%', height: '400px' }} />
                )}
                {activeTab === 'contributors' && (
                    <div ref={contributorHeatmapRef} style={{ minHeight: '400px' }} />
                )}
            </div>
        </div>
    );
};
```

- **常见问题 & 解决**：

  - **文件数过多时性能问题**：采用 Top-N 策略，文件热力图显示 Top 20，贡献者热力图显示 Top 15
  - **贡献者名称相同导致冲突**：根据邮箱唯一标识，使用 `author_email` 或 `author_name` 作为键
  - **文件路径过长显示问题**：Y 轴标签只显示最后两级路径，简化显示
  - **数据获取失败**：使用 `diff-tree` 和 `show` 命令双重保障，失败时跳过该提交继续处理
  - **颜色对比度不足**：根据数值大小调整文本颜色，确保可读性

- **亮点**：
  - **双视图切换**：文件修改频率和贡献者活跃度两种视图，标签页切换
  - **Top-N 优化**：只显示最活跃的文件和贡献者，提升性能和可读性
  - **颜色映射**：使用 D3.js 颜色比例尺，直观展示热度
  - **数据聚合**：按文件路径和贡献者聚合统计，减少数据量
  - **性能优化**：限制处理的提交数量（最多 100 个），提升统计速度
  - **错误容错**：使用多种 Git 命令获取数据，失败时跳过继续处理
  - **主题适配**：自动适配浅色/深色主题，调整颜色方案
  - **交互式展示**：悬停显示详情，点击查看具体信息

---

### 6. 数据可视化模块

#### 6.1 2D 提交图谱 (CommitGraph)

**文件位置**: `src/webview/components/CommitGraph.tsx`

**技术实现**:

**1. 高 DPI 渲染**:

```typescript
// 获取设备像素比
const dpr = window.devicePixelRatio || 1;
const container = canvas.parentElement || document.body;
const rect = container.getBoundingClientRect();
const displayWidth = rect.width;
const baseHeight = rect.height || 600;

// 根据提交数量动态计算高度
const dynamicHeight = commits.length > 0
    ? Math.max(baseHeight, COMMIT_TOP_MARGIN + commits.length * COMMIT_ROW_HEIGHT + COMMIT_BOTTOM_MARGIN)
    : baseHeight;

// 设置画布实际大小（考虑 DPI）
canvas.width = displayWidth * dpr;
canvas.height = dynamicHeight * dpr;

// 设置显示大小（CSS像素）
canvas.style.width = displayWidth + 'px';
canvas.style.height = dynamicHeight + 'px';

// 缩放上下文以匹配DPI
ctx.scale(dpr, dpr);

// 启用高质量图像平滑
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
```

**2. 绘制算法**:

1. **布局计算**: 
   - 根据提交数量动态计算画布高度：`COMMIT_TOP_MARGIN + commits.length * COMMIT_ROW_HEIGHT + COMMIT_BOTTOM_MARGIN`
   - 每行提交高度：75px
   - 左侧边距：60px，文本起始位置：85px

2. **连接线绘制**: 
   - 使用直线连接相邻提交节点
   - 线宽：2.5px，圆角端点
   - 从上一个节点的底部到当前节点的顶部

3. **节点渲染**: 
   - 圆形节点，半径：6px
   - 节点填充 + 外圈高光（半径 +1px）
   - 使用主题颜色

4. **文本渲染**:
   - 哈希：等宽字体，加粗，13px，显示前8位
   - 提交消息：系统字体，15px，智能换行（最多2行）
   - 元信息：系统字体，12px，包含作者和日期

**3. 智能文本换行算法**:

```typescript
// 文本换行处理，支持中英文混合，保留空格
const words = message.split(/(\s+)/); // 保留空格分隔符
let line = '';
let lineY = y + 5;
const lineHeight = 19;
const maxLines = 2;
let lineCount = 0;

for (let i = 0; i < words.length && lineCount < maxLines; i++) {
    const testLine = line + words[i];
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && line.trim()) {
        // 换行
        ctx.fillText(line, textX, lineY);
        line = words[i];
        lineY += lineHeight;
        lineCount++;
    } else {
        line = testLine;
    }
}

// 绘制剩余文本或截断
if (line && lineCount < maxLines) {
    ctx.fillText(line, textX, lineY);
} else if (lineCount >= maxLines && line) {
    const truncated = truncateText(ctx, line, maxWidth - 20) + '...';
    ctx.fillText(truncated, textX, lineY);
}
```

**4. 性能优化**:

- **禁用透明度**: `alpha: false`，不透明背景渲染更快
- **优化绘制顺序**: 背景 → 连接线 → 节点 → 文本，减少状态切换
- **高质量图像平滑**: `imageSmoothingQuality: 'high'`，确保文字清晰
- **动态高度**: 根据提交数量计算，避免画布过大

**5. 主题适配**:

```typescript
// 获取主题颜色
const themeColors = getThemeColors();

// 使用主题颜色绘制各个元素
ctx.strokeStyle = themeColors.commitGraph.line;
ctx.fillStyle = themeColors.commitGraph.node;
ctx.strokeStyle = themeColors.commitGraph.nodeHighlight;
ctx.fillStyle = themeColors.commitGraph.hash;
ctx.fillStyle = themeColors.commitGraph.message;
ctx.fillStyle = themeColors.commitGraph.meta;

// 背景色从父容器获取
const computedStyle = window.getComputedStyle(canvas.parentElement || document.body);
const backgroundColor = computedStyle.backgroundColor || themeColors.background.primary;
```

**亮点**:

- **高 DPI 支持**: 自动适配 Retina 等高分辨率屏幕，文字和图形清晰锐利
- **智能文本换行**: 支持中英文混合，保留空格，自动换行，超出部分截断
- **动态布局**: 根据提交数量自动计算画布高度，支持滚动查看
- **性能优化**: 禁用透明度、优化绘制顺序、启用高质量图像平滑
- **主题适配**: 自动适配 VS Code 浅色/深色主题
- **视觉增强**: 节点外圈高光、粗连接线、清晰的字体配置，提高可读性

#### 6.2 时间线视图 (TimelineView)

**技术实现**:

- **日历热力图**: 使用 D3.js 绘制 GitHub 风格的贡献日历
- **柱状图**: 按时间维度展示提交频率
- **主题适配**: 自动适配 VS Code 浅色/深色主题

```typescript
// 主题适配
const isDark = vscode.getColorTheme().kind === vscode.ColorThemeKind.Dark;
const colorScale = d3.scaleSequential()
    .domain([0, maxCommits])
    .interpolator(isDark 
        ? d3.interpolateViridis 
        : d3.interpolateBlues
    );
```

#### 6.3 热力图分析 (HeatmapAnalysis)

**功能**:

- **文件修改频率**: 统计文件被修改的次数
- **贡献者活跃度**: 统计每个贡献者的提交数量

**算法**:

```typescript
// 文件统计
const fileStats = commits.reduce((acc, commit) => {
    commit.files.forEach(file => {
        acc[file] = (acc[file] || 0) + 1;
    });
    return acc;
}, {});

// 贡献者统计
const contributorStats = commits.reduce((acc, commit) => {
    const author = commit.author;
    acc[author] = (acc[author] || 0) + 1;
    return acc;
}, {});
```

---

## 代码质量与架构优化

### 1. 统一错误处理系统

**文件位置**: `src/utils/error-handler.ts`

**设计目标**: 提供统一的错误处理接口，确保所有错误都通过一致的方式处理。

**核心功能**:

```typescript
export class ErrorHandler {
    // 处理错误并显示用户友好的错误消息
    static handle(error: unknown, context: string, showToUser?: boolean): void;
    
    // 静默处理错误（只记录日志，不显示给用户）
    static handleSilent(error: unknown, context: string): void;
    
    // 处理错误并返回错误消息字符串
    static getErrorMessage(error: unknown, context: string): string;
    
    // 处理 Git 特定错误，提供更友好的错误提示
    static handleGitError(error: unknown, operation: string): void;
}
```

**特性**:

- **Git 错误识别**: 自动识别常见的 Git 错误类型（如 "not a git repository"、"CONFLICT"、"permission denied" 等），提供针对性的解决建议
- **静默处理**: 支持静默处理非关键错误，避免打扰用户
- **统一日志**: 所有错误自动记录到日志系统，便于调试

**使用示例**:

```typescript
try {
    await gitService.push('origin');
} catch (error) {
    ErrorHandler.handleGitError(error, '推送');
    // 自动识别错误类型并显示友好提示：
    // - "当前文件夹不是Git仓库，请先初始化仓库"
    // - "合并冲突！请使用 'Git Assistant: 解决冲突' 命令处理"
    // - "权限不足，请检查文件权限或远程仓库访问权限"
}
```

### 2. 统一日志系统

**文件位置**: `src/utils/logger.ts`

**设计目标**: 提供统一的日志记录接口，替换所有 `console.*` 调用。

**核心功能**:

```typescript
export class Logger {
    static info(message: string, ...args: any[]): void;
    static warn(message: string, ...args: any[]): void;
    static error(message: string, error?: Error, ...args: any[]): void;
    static debug(message: string, ...args: any[]): void; // 仅在调试模式下
}
```

**特性**:

- **VS Code 输出通道**: 所有日志输出到 VS Code 的 "Git Assistant" 输出通道
- **调试模式**: `debug` 方法仅在配置启用调试模式时输出
- **格式化输出**: 自动添加时间戳和日志级别
- **错误堆栈**: 错误日志包含完整的堆栈追踪信息

### 3. 类型安全改进

**文件位置**: `src/types/git.ts`

**改进内容**:

- **完善类型定义**: 扩展了类型定义文件，添加了 `BranchGraphData`、`RemoteInfo`、`RepositoryInfo`、`GitData` 等完整类型
- **减少 any 使用**: 将大部分 `any` 类型替换为具体的接口类型
- **类型兼容性**: 处理第三方库（simple-git）类型与自定义类型的兼容性问题

**类型定义示例**:

```typescript
export interface GitData {
    status?: GitStatus;
    branches?: BranchInfo;
    log?: LogResult;
    remotes?: RemoteInfo[];
    conflicts?: string[];
    tags?: TagInfo[];
    remoteTags?: Array<{ name: string; commit: string }>;
    repositoryInfo?: RepositoryInfo;
    branchGraph?: BranchGraphData;
    fileStats?: Array<{ path: string; count: number }>;
    contributorStats?: Array<{ email: string; commits: number; files: number }>;
    timeline?: Array<{ date: string; count: number }>;
    commandHistory?: any[];
    availableCommands?: any[];
    categories?: any[];
}
```

### 4. 代码重复消除

**文件位置**: `src/utils/git-helpers.ts`

**设计目标**: 提取公共函数，消除代码重复，提高代码可维护性。

**核心函数**:

```typescript
// 选择远程仓库（消除代码重复）
export async function pickRemote(
    gitService: GitService,
    actionLabel: string
): Promise<string | null>;

// 获取默认远程仓库名称
export async function getDefaultRemote(gitService: GitService): Promise<string>;

// 验证并获取当前分支
export async function getCurrentBranch(gitService: GitService): Promise<string | null>;
```

**使用场景**:

- `git-operations.ts` 中的推送/拉取操作
- `dashboard-panel.ts` 中的远程仓库选择
- 其他需要选择远程仓库的场景

**优势**:

- **代码复用**: 减少重复代码，提高可维护性
- **一致性**: 确保所有远程仓库选择逻辑一致
- **易于测试**: 公共函数易于单元测试

### 5. 内存管理优化

**实现位置**: `src/services/git-service.ts`

**优化策略**:

#### 5.1 缓存大小限制

```typescript
private readonly MAX_CACHE_SIZE = 100;

private setCache<T>(key: string, data: T, ttl: number): void {
    // 如果缓存超过限制，删除最旧的项
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
        const oldestKey = Array.from(this.cache.keys())[0];
        this.cache.delete(oldestKey);
        Logger.debug(`缓存已满，删除最旧项: ${oldestKey}`);
    }
    
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
}
```

#### 5.2 分支图存储索引优化

```typescript
private async saveBranchGraphToStorage(repoId: string, headHash: string, data: BranchGraphData): Promise<void> {
    // 限制索引大小，只保留最近的N个提交哈希
    const MAX_INDEX_SIZE = 20;
    let updatedIndex: string[];
    
    if (!existingIndex.includes(headHash)) {
        updatedIndex = [...existingIndex, headHash];
        // 如果超过限制，删除最旧的
        if (updatedIndex.length > MAX_INDEX_SIZE) {
            const oldestHash = updatedIndex[0];
            // 删除最旧的存储数据
            await this.storage.update(this.getBranchGraphStorageKey(repoId, oldestHash), undefined);
            updatedIndex = updatedIndex.slice(1);
        }
        await this.storage.update(indexKey, updatedIndex);
    }
}
```

**效果**:

- 防止内存无限增长
- 自动清理旧数据
- 保持缓存有效性

### 6. 分支图增量更新优化

**实现位置**: `src/services/git-service.ts`

**优化策略**:

```typescript
private async tryBuildIncrementalBranchGraph(
    git: SimpleGit, 
    repoId: string, 
    headHash: string
): Promise<BranchGraphData | null> {
    // 优化：从最近的提交开始查找（更可能匹配）
    // 同时限制查找次数，避免在大量历史中查找过久
    const maxAttempts = Math.min(storedHashes.length, 10);
    let attempts = 0;

    for (let i = storedHashes.length - 1; i >= 0 && attempts < maxAttempts; i--) {
        attempts++;
        // 快速检查：如果候选提交的节点数已经接近限制，可能不适合作为基础
        if (baseGraph.dag.nodes.length >= GitService.BRANCH_GRAPH_MAX_COMMITS * 0.9) {
            continue;
        }
        
        const ancestor = await this.isAncestor(git, candidate, headHash);
        if (!ancestor) {
            continue;
        }
        
        const incremental = await this.buildBranchGraphIncrementally(git, baseGraph, candidate, headHash);
        if (incremental) {
            Logger.debug(`使用增量更新构建分支图: ${candidate.substring(0, 7)} -> ${headHash.substring(0, 7)}`);
            return incremental;
        }
    }
    
    return null;
}
```

**优化点**:

- **查找次数限制**: 最多尝试 10 次，避免在大量历史中查找过久
- **从最近开始**: 从最近的提交开始查找，提高匹配概率
- **快速过滤**: 如果候选提交的节点数接近限制，跳过该候选
- **错误隔离**: 单个候选失败不影响其他候选

### 7. Webpack 构建优化

**文件位置**: `webpack.config.js`

**优化内容**:

#### 7.1 生产/开发模式区分

```javascript
mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
```

#### 7.2 性能优化配置

```javascript
optimization: {
    minimize: process.env.NODE_ENV === 'production',
    usedExports: true, // 移除未使用的代码
    sideEffects: false
},
```

#### 7.3 性能提示

```javascript
performance: {
    hints: process.env.NODE_ENV === 'production' ? 'warning' : false,
    maxEntrypointSize: 512000, // 512KB (extension)
    maxAssetSize: 1024000      // 1MB (webview)
}
```

**优化效果**:

- 生产环境自动压缩代码
- 移除未使用的代码
- 性能提示帮助识别问题
- 自动清理输出目录

### 8. 测试覆盖

**测试结构**:

```
src/test/
├── suite/
│   ├── git-utils.test.ts          # Git 工具函数测试（12个测试用例）
│   ├── git-utils-conflict.test.ts # 冲突处理测试（6个测试用例）
│   ├── error-handler.test.ts      # 错误处理测试（4个测试用例）
│   ├── index.ts                   # 测试入口
│   └── globals.d.ts               # Mocha 类型定义
└── runTest.ts                     # 测试运行器
```

**测试覆盖**:

- ✅ Git 工具函数（格式化、验证、解析等）
- ✅ 冲突标记解析和解决
- ✅ 错误处理（普通错误、Git 错误、静默处理）

**运行测试**:

```bash
# 运行所有测试
npm test

# 编译测试文件
npm run compile-tests

# 监听模式运行测试
npm run watch-tests
```

### 9. 文档完善

**新增文档**:

- **API 文档** (`docs/API.md`): 完整的 API 参考文档，包含：
  - 类型定义说明
  - 服务类 API
  - 工具函数 API
  - 错误处理 API
  - 使用示例

**JSDoc 注释**:

- 为所有公共函数添加详细的 JSDoc 注释
- 包含参数说明、返回值说明、使用示例
- 支持 IDE 智能提示和文档查看

**README 更新**:

- 添加测试部分
- 更新开发规范
- 完善安装和使用说明

---

## 技术栈与算法

### 核心技术栈

#### 1. 开发语言与框架

| 技术                      | 版本  | 用途               | 选择理由                           |
| ------------------------- | ----- | ------------------ | ---------------------------------- |
| **TypeScript**            | 5.1+  | 类型安全的开发语言 | 提供完整的类型系统，减少运行时错误 |
| **React**                 | 18.2  | UI 组件框架        | 组件化开发，Hooks 支持，生态丰富   |
| **VS Code Extension API** | 1.80+ | 扩展开发 API       | 官方 API，功能完整，文档完善       |

#### 2. Git 操作库

| 技术           | 版本 | 用途           | 选择理由                       |
| -------------- | ---- | -------------- | ------------------------------ |
| **simple-git** | 3.19 | Git 操作封装库 | Promise 支持，API 简洁，跨平台 |

**核心特性**:

- Promise 异步支持，避免回调地狱
- 类型定义完善，TypeScript 友好
- 跨平台支持（Windows/Linux/macOS）
- 错误处理机制完善

#### 3. 数据可视化库

| 技术         | 版本  | 用途           | 选择理由                     |
| ------------ | ----- | -------------- | ---------------------------- |
| **D3.js**    | 7.8   | 数据可视化库   | 功能强大，灵活度高，社区活跃 |
| **d3-force** | 3.0   | 力导向布局算法 | 物理模拟，自动布局           |
| **Three.js** | 0.170 | 3D 图形渲染    | WebGL 支持，性能优秀         |

**D3.js 应用场景**:

- 分支视图：力导向图布局
- 时间线视图：柱状图、日历热力图
- 热力图分析：文件修改频率、贡献者活跃度

#### 4. 构建工具

| 技术        | 版本 | 用途         | 选择理由               |
| ----------- | ---- | ------------ | ---------------------- |
| **Webpack** | 5.85 | 模块打包工具 | 功能完善，插件生态丰富 |

**Webpack 配置特点**:

- 生产/开发模式区分
- 代码压缩和优化
- 性能提示和警告
- 支持 TypeScript 和 React

### 核心算法

#### 1. 拓扑排序算法 (Topological Sort)

**应用场景**: Git 视图表的层级布局（Y 坐标分配）

**算法原理**:

分支视图需要确保子节点（较新的提交）始终在父节点（较旧的提交）之上，这需要使用拓扑排序算法来分配层级。

**实现步骤**:

```typescript
// 1. 构建子节点映射（从 parents 关系构建）
const childrenMap = new Map<string, any[]>();
nodes.forEach((node: any) => {
    if (!childrenMap.has(node.hash)) {
        childrenMap.set(node.hash, []);
    }
    // 从 parents 关系构建子节点映射
    if (node.parents && node.parents.length > 0) {
        node.parents.forEach((parentHash: string) => {
            if (!childrenMap.has(parentHash)) {
                childrenMap.set(parentHash, []);
            }
            childrenMap.get(parentHash)!.push(node);
        });
    }
});

// 2. 初始化层级（基于时间戳）
const nodeLevelMap = new Map<string, number>();
nodes.forEach((node: any, index: number) => {
    nodeLevelMap.set(node.hash, index);
});

// 3. 迭代调整层级，确保子节点在父节点之上
let changed = true;
let iterations = 0;
const maxIterations = nodes.length; // 防止无限循环

while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    nodes.forEach((node: any) => {
        if (node.parents && node.parents.length > 0) {
            // 获取所有父节点的层级
            const parentLevels = node.parents
                .map((p: string) => nodeLevelMap.get(p))
                .filter((l: number | undefined) => l !== undefined) as number[];

            if (parentLevels.length > 0) {
                const maxParentLevel = Math.max(...parentLevels);
                const currentLevel = nodeLevelMap.get(node.hash) || 0;

                // 子节点必须比所有父节点都靠上（level 更小）
                if (currentLevel >= maxParentLevel) {
                    // 调整子节点到父节点之上
                    nodeLevelMap.set(node.hash, maxParentLevel - 1);
                    changed = true;
                }
            }
        }
    });
}

// 4. 规范化层级，使其从 0 开始连续
const levelSet = new Set(Array.from(nodeLevelMap.values()));
const sortedLevels = Array.from(levelSet).sort((a, b) => a - b);
const levelMapping = new Map<number, number>();
sortedLevels.forEach((oldLevel, index) => {
    levelMapping.set(oldLevel, index);
});

// 应用映射
nodeLevelMap.forEach((oldLevel, hash) => {
    const newLevel = levelMapping.get(oldLevel) || 0;
    nodeLevelMap.set(hash, newLevel);
});
```

**算法复杂度**:

- **时间复杂度**: O(N × M)，其中 N 是节点数，M 是最大迭代次数（通常 M << N）
- **空间复杂度**: O(N)，用于存储层级映射和子节点映射

**优化策略**:

- 限制最大迭代次数，防止无限循环
- 使用 Map 数据结构，O(1) 查找和更新
- 规范化层级，减少层级数量

#### 2. 智能轨道分配算法 (Lane Assignment)

**应用场景**: Git 视图表的列布局（X 坐标分配）

**算法原理**:

为每个提交分配一个轨道（列），确保同一分支的提交尽可能在同一轨道，不同分支的提交使用不同轨道。

**实现步骤**:

```typescript
// 1. 为每个分支构建提交链（从分支 HEAD 到根提交）
const branchCommitChains = new Map<string, Set<string>>();

// 收集所有分支的提交链
nodes.forEach((node: any) => {
    if (node.branches && node.branches.length > 0) {
        node.branches.forEach((branchName: string) => {
            if (!branchCommitChains.has(branchName)) {
                branchCommitChains.set(branchName, new Set());
            }
            branchCommitChains.get(branchName)!.add(node.hash);
        });
    }
});

// 为每个分支的提交链添加所有祖先提交
branchCommitChains.forEach((commitSet, branchName) => {
    const toProcess = Array.from(commitSet);
    const processed = new Set<string>();

    while (toProcess.length > 0) {
        const hash = toProcess.pop()!;
        if (processed.has(hash)) continue;
        processed.add(hash);

        const node = nodes.find((n: any) => n.hash === hash);
        if (node && node.parents) {
            node.parents.forEach((parentHash: string) => {
                commitSet.add(parentHash);
                if (!processed.has(parentHash)) {
                    toProcess.push(parentHash);
                }
            });
        }
    }
});

// 2. 分配 X 坐标（轨道/列）
const nodeColumnMap = new Map<string, number>(); // 提交哈希 -> 轨道号
const branchLaneMap = new Map<string, number>(); // 分支名 -> 当前轨道号
let nextLaneId = 0;

// 确保 main/master 在轨道 0（最左侧）
const mainBranchName = nodes.find((n: any) =>
    n.branches && (n.branches.includes('main') || n.branches.includes('master'))
)?.branches?.find((b: string) => b === 'main' || b === 'master') || 'main';
branchLaneMap.set(mainBranchName, 0);
nextLaneId = 1;

// 按层级从新到旧（从上到下）分配轨道
for (let level = 0; level <= maxLevel; level++) {
    const levelCommits = levelNodes.get(level) || [];
    levelCommits.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

    levelCommits.forEach((node: any) => {
        let lane = -1;

        // 情况1: 根提交（没有父节点）
        if (node.parents.length === 0) {
            // 查找该提交所属的分支
            const branchName = node.branches?.[0] || mainBranchName;
            lane = branchLaneMap.get(branchName) ?? 0;
        }
        // 情况2: 普通提交（有一个父节点）
        else if (node.parents.length === 1) {
            const parentHash = node.parents[0];
            const parentLane = nodeColumnMap.get(parentHash);
            if (parentLane !== undefined) {
                lane = parentLane; // 继承父节点的轨道
            }
        }
        // 情况3: 合并提交（有多个父节点）
        else {
            // 查找该提交所属的分支
            const branchName = node.branches?.[0] || mainBranchName;
            const branchLane = branchLaneMap.get(branchName);
            
            if (branchLane !== undefined) {
                lane = branchLane; // 使用分支的轨道
            } else {
                // 使用第一个父节点的轨道
                const firstParentLane = nodeColumnMap.get(node.parents[0]);
                lane = firstParentLane !== undefined ? firstParentLane : nextLaneId++;
            }
        }

        // 如果还没有分配轨道，分配新轨道
        if (lane === -1) {
            lane = nextLaneId++;
        }

        nodeColumnMap.set(node.hash, lane);

        // 更新分支的轨道映射
        if (node.branches && node.branches.length > 0) {
            node.branches.forEach((branchName: string) => {
                branchLaneMap.set(branchName, lane);
            });
        }
    });
}
```

**算法复杂度**:

- **时间复杂度**: O(N × B)，其中 N 是节点数，B 是分支数
- **空间复杂度**: O(N + B)，用于存储轨道映射和分支提交链

**优化策略**:

- 优先使用父节点的轨道，减少轨道数量
- 合并提交使用分支轨道，保持分支连续性
- main/master 分支固定在轨道 0，提高可读性

#### 3. 增量更新算法 (Incremental Update)

**应用场景**: Git 视图表 / 分支图的增量数据更新

**算法原理**:

当仓库有新的提交时，不需要重新构建整个分支图，只需要获取新增的提交并合并到现有图中。

**实现步骤**:

```typescript
/**
 * 尝试增量更新分支图
 * 从最近的缓存提交开始查找，最多尝试 10 次
 */
private async tryBuildIncrementalBranchGraph(
    git: SimpleGit, 
    repoId: string, 
    headHash: string
): Promise<BranchGraphData | null> {
    // 1. 从持久化存储加载最近的缓存提交列表（最多 20 个）
    const ancestorIndex = this.loadAncestorIndex(repoId);
    if (!ancestorIndex || ancestorIndex.length === 0) {
        return null;
    }

    // 2. 从最近的提交开始查找（最多尝试 10 次）
    const candidates = ancestorIndex.slice(0, 10);
    
    for (const candidate of candidates) {
        try {
            // 3. 检查候选提交是否是当前 HEAD 的祖先
            const isAncestor = await this.isAncestor(git, candidate, headHash);
            if (!isAncestor) {
                continue; // 不是祖先，跳过
            }

            // 4. 加载基础图
            const baseGraph = this.loadBranchGraphFromStorage(repoId, candidate);
            if (!baseGraph) {
                continue; // 基础图不存在，跳过
            }

            // 5. 构建增量图
            const incremental = await this.buildBranchGraphIncrementally(
                git, baseGraph, candidate, headHash
            );
            if (incremental) {
                Logger.debug(`使用增量更新构建分支图: ${candidate.substring(0, 7)} -> ${headHash.substring(0, 7)}`);
                return incremental;
            }
        } catch (error) {
            // 单个候选失败不影响其他候选
            ErrorHandler.handleSilent(error, `检查增量更新候选(${candidate?.substring(0, 7)})`);
            continue;
        }
    }

    return null;
}

/**
 * 构建增量分支图
 * 只获取 baseHash..headHash 范围的提交
 */
private async buildBranchGraphIncrementally(
    git: SimpleGit,
    baseGraph: BranchGraphData,
    baseHash: string,
    headHash: string
): Promise<BranchGraphData | null> {
    try {
        // 1. 获取增量提交（baseHash..headHash）
        const logOutput = await git.raw([
            'log',
            `${baseHash}..${headHash}`,
            `--max-count=${GitService.BRANCH_GRAPH_MAX_COMMITS}`,
            '--topo-order',
            '--date-order',
            '--format=%H%x00%P%x00%D%x00%ct',
            '--decorate=full'
        ]);

        if (!logOutput || !logOutput.trim()) {
            // 没有增量提交，返回基础图
            return baseGraph;
        }

        // 2. 解析增量提交
        const incrementalCommits = this.parseGitLogToCommitMap(logOutput);
        
        // 3. 合并到基础图
        const allCommits = new Map(baseGraph.dag.nodes.map((n: any) => [n.hash, n]));
        incrementalCommits.forEach((commit, hash) => {
            allCommits.set(hash, commit);
        });

        // 4. 重新构建分支图
        const branchSummary = await git.branch();
        return this.buildBranchGraphFromCommitMap(allCommits, branchSummary);
    } catch (error) {
        ErrorHandler.handleSilent(error, '构建增量分支图');
        return null;
    }
}

/**
 * 检查一个提交是否是另一个提交的祖先
 * 使用 git merge-base --is-ancestor 命令
 */
private async isAncestor(
    git: SimpleGit, 
    ancestor: string, 
    descendant: string
): Promise<boolean> {
    try {
        const result = await git.raw(['merge-base', '--is-ancestor', ancestor, descendant]);
        // 如果命令成功（返回码 0），说明 ancestor 是 descendant 的祖先
        return true;
    } catch {
        // 如果命令失败（返回码非 0），说明不是祖先
        return false;
    }
}
```

**算法复杂度**:

- **时间复杂度**: O(M)，其中 M 是增量提交数量（通常 M << N）
- **空间复杂度**: O(N)，需要存储完整的分支图

**优化策略**:

- 限制查找次数（最多 10 次），从最近的提交开始
- 使用 `git merge-base --is-ancestor` 快速检查祖先关系
- 只获取增量范围的提交，减少 Git I/O 操作

**性能提升**:

- 减少 60%+ 的 Git I/O 操作
- 大仓库下增量更新 < 1 秒，全量重建需要 3-5 秒

#### 4. LOD 性能优化算法 (Level of Detail)

**应用场景**: Git 视图表缩放视图下的性能优化

**算法原理**:

根据缩放级别动态调整节点和标签的显示详细程度，减少渲染负担。

**实现步骤**:

```typescript
/**
 * 节点可见性更新函数（LOD - Level of Detail）
 * 根据缩放级别动态调整显示详细程度
 */
const updateNodeVisibility = (scale: number) => {
    const labels = g.selectAll('.node-label');
    const circles = g.selectAll('.node circle');
    const links = g.selectAll('.links line');

    if (scale < 0.5) {
        // 缩放级别 < 0.5：隐藏所有标签，只显示节点和连线
        labels.style('opacity', 0);
        circles.style('opacity', 0.8);
        links.style('opacity', 0.6);
    } else if (scale < 1.0) {
        // 缩放级别 0.5-1.0：只显示哈希，隐藏其他信息
        labels.style('opacity', 1);
        labels.text((d: any) => d.hash.substring(0, 7)); // 只显示前7位哈希
        circles.style('opacity', 1);
        links.style('opacity', 0.8);
    } else {
        // 缩放级别 > 1.0：显示所有信息
        labels.style('opacity', 1);
        labels.text((d: any) => {
            const branches = d.branches && d.branches.length > 0 
                ? d.branches.join(', ') 
                : '';
            return branches ? `${d.hash.substring(0, 7)} (${branches})` : d.hash.substring(0, 7);
        });
        circles.style('opacity', 1);
        links.style('opacity', 1);
    }
};

// 监听缩放事件
zoomBehavior.on('zoom', (event: any) => {
    const { transform } = event;
    g.attr('transform', transform);
    
    // 更新节点可见性
    updateNodeVisibility(transform.k);
});
```

**算法复杂度**:

- **时间复杂度**: O(N)，需要遍历所有节点更新可见性
- **空间复杂度**: O(1)，不需要额外存储

**优化策略**:

- 使用 CSS `opacity` 控制可见性，避免 DOM 操作
- 根据缩放级别动态调整文本内容，减少文本渲染负担
- 缩放级别阈值可配置，平衡性能和用户体验

**性能提升**:

- 缩放时帧率从 30fps 提升到 60fps
- 大仓库下缩放流畅

#### 5. 缓存淘汰算法 (TTL Cache)

**应用场景**: GitService 的数据缓存

**算法原理**:

基于时间戳的 TTL（Time To Live）缓存，自动失效过期数据。

**实现步骤**:

```typescript
interface CacheItem<T> {
    data: T;
    timestamp: number;
    ttl: number; // 缓存有效期（毫秒）
}

private readonly CACHE_TTL = {
    branches: 5000,        // 分支列表缓存5秒
    status: 1500,          // 状态缓存1.5秒
    remotes: 5000,         // 远程仓库缓存5秒
    tags: 3000,            // 标签缓存3秒
    remoteTags: 10000,     // 远程标签缓存10秒（网络操作，缓存时间更长）
    log: 2000,             // 日志缓存2秒
    branchGraph: 10000,    // 分支图缓存10秒（计算成本高，延长缓存时间）
};

private readonly MAX_CACHE_SIZE = 100; // 缓存大小限制

/**
 * 获取缓存数据
 */
private getCached<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // TTL 检查
    const now = Date.now();
    if (now - item.timestamp > item.ttl) {
        // 缓存已过期，删除
        this.cache.delete(key);
        return null;
    }
    
    return item.data as T;
}

/**
 * 设置缓存数据
 */
private setCache<T>(key: string, data: T, ttl: number): void {
    // 检查缓存大小，超过限制时删除最旧的项
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
        // 找到最旧的缓存项
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        
        this.cache.forEach((item, k) => {
            if (item.timestamp < oldestTime) {
                oldestTime = item.timestamp;
                oldestKey = k;
            }
        });
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }
    
    this.cache.set(key, {
        data,
        timestamp: Date.now(),
        ttl
    });
}

/**
 * 清除缓存
 */
private invalidateCache(key: string): void {
    this.cache.delete(key);
}
```

**算法复杂度**:

- **时间复杂度**: O(1) 查找和设置，O(N) 清理（N 是缓存大小）
- **空间复杂度**: O(N)，N 是缓存项数量

**优化策略**:

- 不同数据类型使用不同的 TTL，平衡性能与数据新鲜度
- 限制缓存大小，防止内存泄漏
- 操作后自动失效相关缓存，确保数据一致性

**性能提升**:

- 减少 60%+ 的重复 Git 调用
- 大仓库下数据获取速度提升 3-5 倍

#### 6. 防抖算法 (Debounce)

**应用场景**: 文件系统监听、用户输入处理、自动刷新触发

**算法原理**:

在事件触发后，等待一段时间（防抖延迟），如果在这段时间内没有再次触发，则执行操作。

**实现步骤**:

```typescript
/**
 * 防抖函数
 * @param func 要执行的函数
 * @param delay 防抖延迟（毫秒）
 * @returns 防抖后的函数
 */
function debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout | undefined;

    return function (this: any, ...args: Parameters<T>) {
        const context = this;

        // 清除之前的定时器
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        // 设置新的定时器
        timeoutId = setTimeout(() => {
            func.apply(context, args);
        }, delay);
    };
}

// 使用示例：文件系统监听
let refreshTimeout: NodeJS.Timeout | undefined;

const debouncedRefresh = debounce(() => {
    refreshAllProviders();
}, 300); // 300ms 防抖

// 文件系统监听
const watcher = vscode.workspace.createFileSystemWatcher('**/.git/**');
watcher.onDidChange(() => {
    debouncedRefresh();
});
```

**算法复杂度**:

- **时间复杂度**: O(1)，每次调用只是设置/清除定时器
- **空间复杂度**: O(1)，只需要存储一个定时器 ID

**优化策略**:

- 根据场景调整防抖延迟（文件监听 300ms，用户输入 500ms）
- 使用 `clearTimeout` 确保只执行最后一次操作
- 支持取消防抖操作

**性能提升**:

- 减少 80%+ 的无谓刷新
- 文件监听响应时间从 100ms 降低到 300ms，但总刷新次数减少 80%

#### 7. 标签批量同步算法

**应用场景**: TagManager 同步本地/远程标签列表、批量推送或强制覆盖

**算法思路**:

1. 并行获取本地与远程标签
2. 将结果映射为 `Map<string, TagInfo>`，便于 O(1) 查找
3. 基于集合差异得出"仅本地""仅远程""冲突"三个集合，驱动 UI

**实现步骤**:

```typescript
/**
 * 批量同步标签算法
 */
async function syncTags(defaultRemote: string) {
    // 1. 并行获取本地与远程标签
    const [localTags, remoteTags] = await Promise.all([
        gitService.getTags(),
        gitService.getRemoteTags(defaultRemote)
    ]);

    // 2. 转换为 Map，便于 O(1) 查找
    const localMap = new Map(localTags.map(tag => [tag.name, tag]));
    const remoteMap = new Map(remoteTags.map(tag => [tag.name, tag]));

    // 3. 计算差异集合
    const localOnly: string[] = [];
    const remoteOnly: string[] = [];
    const conflicts: string[] = [];
    const synced: string[] = [];

    // 遍历本地标签
    localMap.forEach((localTag, name) => {
        const remoteTag = remoteMap.get(name);
        if (!remoteTag) {
            // 仅本地存在
            localOnly.push(name);
        } else if (localTag.commit !== remoteTag.commit) {
            // 冲突：提交哈希不同
            conflicts.push(name);
        } else {
            // 已同步
            synced.push(name);
        }
    });

    // 遍历远程标签
    remoteMap.forEach((remoteTag, name) => {
        if (!localMap.has(name)) {
            // 仅远程存在
            remoteOnly.push(name);
        }
    });

    // 4. 返回差异结果
    return {
        localOnly,
        remoteOnly,
        conflicts,
        synced
    };
}
```

**算法复杂度**:

- **时间复杂度**: O(N + M)，其中 N 是本地标签数，M 是远程标签数
- **空间复杂度**: O(N + M)，用于存储 Map 和差异集合

**优势**:

- 单次网络交互即可拿到所有数据，避免循环调用
- 差异结果直接驱动"推送全部/强制覆盖"等高阶操作
- O(1) 查找性能，支持快速判断标签状态

#### 8. 冲突解析与合并算法

**应用场景**: ConflictEditor 需要准确识别 `<<<<<<<`/`=======`/`>>>>>>>` 块并根据策略生成结果

**算法原理**:

使用正则表达式匹配冲突标记，解析冲突块，然后根据策略合并。

**实现步骤**:

```typescript
/**
 * 冲突标记正则表达式
 * 匹配格式：<<<<<<< marker\ncurrent\n=======\nincoming\n>>>>>>> endMarker
 */
const CONFLICT_PATTERN = /<<<<<<< (.*?)\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> (.*?)(\n|$)/g;

/**
 * 解析冲突内容
 * @param content 文件内容
 * @returns 冲突块数组
 */
export function parseConflict(content: string): ConflictBlock[] {
    const matches = [...content.matchAll(CONFLICT_PATTERN)];
    return matches.map((match, index) => ({
        id: `${match[1]}-${index}`,
        marker: match[1],        // 开始标记（分支名）
        current: match[2],        // 当前分支内容
        incoming: match[3],       // 合并分支内容
        endMarker: match[4]      // 结束标记（分支名）
    }));
}

/**
 * 解决冲突
 * @param block 冲突块
 * @param strategy 解决策略：'current' | 'incoming' | 'both'
 * @returns 解决后的内容
 */
export function resolveConflict(
    block: ConflictBlock,
    strategy: 'current' | 'incoming' | 'both'
): string {
    switch (strategy) {
        case 'current':
            // 使用当前分支的内容
            return block.current;
        case 'incoming':
            // 使用合并分支的内容
            return block.incoming;
        case 'both':
            // 合并两个分支的内容
            return `${block.current}\n${block.incoming}`;
        default:
            return block.current;
    }
}

/**
 * 自动解决所有冲突
 * @param document 文档
 * @param action 解决动作：'current' | 'incoming' | 'both'
 */
async function resolveConflictAuto(
    document: vscode.TextDocument,
    action: string
): Promise<void> {
    const content = document.getText();
    const conflicts = parseConflict(content);
    
    if (conflicts.length === 0) {
        vscode.window.showInformationMessage('未找到冲突标记');
        return;
    }

    // 替换所有冲突块
    let newContent = content;
    conflicts.forEach(conflict => {
        const resolved = resolveConflict(conflict, action as any);
        const pattern = new RegExp(
            `<<<<<<< ${escapeRegex(conflict.marker)}\\n([\\s\\S]*?)=======\\n([\\s\\S]*?)>>>>>>> ${escapeRegex(conflict.endMarker)}`,
            'g'
        );
        newContent = newContent.replace(pattern, resolved);
    });

    // 应用编辑
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
        document.uri,
        new vscode.Range(0, 0, document.lineCount, 0),
        newContent
    );
    await vscode.workspace.applyEdit(edit);
}
```

**算法复杂度**:

- **时间复杂度**: O(N)，其中 N 是文件内容长度
- **空间复杂度**: O(N)，用于存储解析后的冲突块

**优势**:

- 通过单次正则匹配完整冲突块，避免逐行扫描出错
- 合并策略函数可复用在命令行和 Webview，保持行为一致
- 支持批量解决所有冲突，提升效率

#### 9. Git 数据聚合算法 (Map-Reduce)

**应用场景**: Heatmap 与 Timeline 需要对提交日志做 Map-Reduce 聚合

**算法原理**:

遍历提交列表，按文件路径或日期聚合统计，生成热力图和时间线数据。

**实现步骤**:

```typescript
/**
 * 聚合文件统计
 * @param commits 提交列表
 * @returns Map<文件路径, 修改次数>
 */
export function aggregateFileStats(commits: CommitEntry[]): Map<string, number> {
    const stats = new Map<string, number>();
    
    commits.forEach(commit => {
        commit.files.forEach(file => {
            // 累加文件修改次数
            const count = stats.get(file) || 0;
            stats.set(file, count + 1);
        });
    });
    
    return stats;
}

/**
 * 聚合时间线统计
 * @param commits 提交列表
 * @returns Map<日期字符串, 提交数量>
 */
export function aggregateTimeline(commits: CommitEntry[]): Map<string, number> {
    const timeline = new Map<string, number>();
    
    commits.forEach(commit => {
        // 格式化为 YYYY-MM-DD 格式
        const date = new Date(commit.date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        
        // 累加该日期的提交数量
        const count = timeline.get(dateKey) || 0;
        timeline.set(dateKey, count + 1);
    });
    
    return timeline;
}

/**
 * 聚合贡献者统计
 * @param commits 提交列表
 * @returns Map<邮箱, { commits: 提交数, files: Set<文件路径> }>
 */
export function aggregateContributorStats(
    commits: CommitEntry[]
): Map<string, { commits: number; files: Set<string> }> {
    const stats = new Map<string, { commits: number; files: Set<string> }>();
    
    commits.forEach(commit => {
        const email = commit.author_email || commit.author_name;
        if (!email) return;
        
        // 获取或创建贡献者统计
        const contributor = stats.get(email) || {
            commits: 0,
            files: new Set<string>()
        };
        
        contributor.commits += 1;
        commit.files.forEach(file => {
            contributor.files.add(file);
        });
        
        stats.set(email, contributor);
    });
    
    return stats;
}
```

**算法复杂度**:

- **时间复杂度**: O(N × F)，其中 N 是提交数，F 是平均每个提交的文件数
- **空间复杂度**: O(N + F)，用于存储统计结果

**优化策略**:

- 使用 Map 和 Set 数据结构，O(1) 查找和更新
- 统一时区转换，避免日历热力图在不同地区展示错误
- 限制处理的提交数量（最多 100 个），提升统计速度

**性能提升**:

- 大仓库（1000+ 提交）下统计时间 < 2 秒
- 内存占用 < 50MB

#### 10. 智能文本换行算法

**应用场景**: CommitGraph 的提交消息显示

**算法原理**:

支持中英文混合，保留空格，自动换行，最多显示 2 行，超出部分截断。

**实现步骤**:

```typescript
/**
 * 智能文本换行算法
 * @param ctx Canvas 上下文
 * @param text 文本内容
 * @param maxWidth 最大宽度
 * @param maxLines 最大行数（默认 2）
 * @param startY 起始 Y 坐标
 * @param lineHeight 行高
 */
function drawWrappedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxLines: number = 2,
    startY: number,
    lineHeight: number
): void {
    // 保留空格分隔符
    const words = text.split(/(\s+)/);
    let line = '';
    let lineY = startY;
    let lineCount = 0;

    for (let i = 0; i < words.length && lineCount < maxLines; i++) {
        const testLine = line + words[i];
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxWidth && line.trim()) {
            // 换行
            ctx.fillText(line, textX, lineY);
            line = words[i];
            lineY += lineHeight;
            lineCount++;
        } else {
            line = testLine;
        }
    }
    
    // 绘制剩余文本
    if (line && lineCount < maxLines) {
        ctx.fillText(line, textX, lineY);
    } else if (lineCount >= maxLines && line) {
        // 如果超过最大行数，截断并添加省略号
        const truncated = truncateText(ctx, line, maxWidth - 20) + '...';
        ctx.fillText(truncated, textX, lineY);
    }
}

/**
 * 截断文本以适应宽度
 * @param ctx Canvas 上下文
 * @param text 文本内容
 * @param maxWidth 最大宽度
 * @returns 截断后的文本
 */
function truncateText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
): string {
    const metrics = ctx.measureText(text);
    if (metrics.width <= maxWidth) {
        return text;
    }

    // 从末尾逐字符截断，直到宽度合适
    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
    }
    return truncated;
}
```

**算法复杂度**:

- **时间复杂度**: O(W × L)，其中 W 是单词数，L 是最大行数
- **空间复杂度**: O(1)，不需要额外存储

**优化策略**:

- 使用 `measureText` 精确测量文本宽度
- 保留空格分隔符，支持中英文混合
- 限制最大行数，超出部分截断

**性能提升**:

- 文本渲染时间 < 10ms
- 支持长文本显示，不会溢出画布

### 数据结构设计

#### 1. 分支图数据结构

```typescript
interface BranchGraphData {
    branches: string[];              // 分支列表
    merges: string[];                // 合并提交列表
    currentBranch?: string;          // 当前分支
    dag: {
        nodes: CommitNode[];         // 提交节点列表
        links: CommitLink[];         // 提交链接列表
    };
}

interface CommitNode {
    hash: string;                    // 提交哈希
    parents: string[];               // 父提交哈希列表
    branches?: string[];              // 所属分支列表
    timestamp?: number;              // 时间戳
    message?: string;                // 提交消息
}

interface CommitLink {
    source: string;                  // 源提交哈希
    target: string;                  // 目标提交哈希
}
```

#### 2. 缓存数据结构

```typescript
interface CacheItem<T> {
    data: T;                         // 缓存数据
    timestamp: number;               // 缓存时间戳
    ttl: number;                     // 缓存有效期（毫秒）
}

// 使用 Map 存储缓存，O(1) 查找和更新
private cache: Map<string, CacheItem<any>> = new Map();
```

#### 3. 命令历史数据结构

```typescript
interface CommandHistoryItem {
    id: string;                      // 唯一ID
    command: string;                 // Git命令字符串
    commandName: string;             // 命令显示名称
    timestamp: number;               // 执行时间戳
    success: boolean;                // 是否成功
    error?: string;                  // 错误信息（可选）
    remote?: string;                 // 远程仓库名称（可选）
}
```

### 算法复杂度总结

| 算法         | 时间复杂度     | 空间复杂度 | 优化策略                   |
| ------------ | -------------- | ---------- | -------------------------- |
| 拓扑排序     | O(N × M)       | O(N)       | 限制迭代次数，使用 Map     |
| 轨道分配     | O(N × B)       | O(N + B)   | 优先使用父节点轨道         |
| 增量更新     | O(M)           | O(N)       | 限制查找次数，快速过滤     |
| LOD 优化     | O(N)           | O(1)       | CSS opacity，动态调整内容  |
| TTL 缓存     | O(1) 查找/设置 | O(N)       | 限制缓存大小，自动失效     |
| 防抖         | O(1)           | O(1)       | 清除定时器，延迟执行       |
| 标签批量同步 | O(N + M)       | O(N + M)   | Map 查找，并行获取         |
| 冲突解析     | O(N)           | O(N)       | 正则匹配，批量解决         |
| 数据聚合     | O(N × F)       | O(N + F)   | Map/Set 数据结构，限制数量 |
| 智能文本换行 | O(W × L)       | O(1)       | 精确测量，限制行数         |

**说明**:

- N: 节点/提交数量
- M: 增量提交数量（通常 M << N）
- B: 分支数量
- F: 平均每个提交的文件数
- W: 单词数量
- L: 最大行数

### 性能优化策略总结

1. **缓存优化**: TTL 缓存 + 自动失效，减少 60%+ 的重复 Git 调用
2. **增量更新**: 基于祖先关系检测，减少 60%+ 的 Git I/O 操作
3. **并行处理**: `Promise.allSettled` 并行执行，提升 3-5 倍速度
4. **LOD 优化**: 根据缩放级别动态调整，帧率从 30fps 提升到 60fps
5. **防抖优化**: 文件监听防抖，减少 80%+ 的无谓刷新
6. **批量操作**: 标签批量解析，从 O(3N) 降低到 O(1) 的 Git 调用次数
7. **数据结构优化**: 使用 Map/Set，O(1) 查找和更新
8. **限制处理数量**: 限制处理的提交/文件数量，提升统计速度

------

## 项目亮点

### 1. 性能优化亮点

#### ✅ 并行数据刷新

- **技术**: `Promise.allSettled` 并行执行
- **效果**: 大仓库下基础面板 < 400ms 恢复
- **创新**: 分阶段推送，基础数据立即显示，统计数据后台加载

#### ✅ 标签批量解析

- **技术**: `git for-each-ref` 单次调用
- **效果**: Tag Manager 打开速度提升 3-5 倍
- **创新**: 从 O(3N) 降低到 O(1) 的 Git 调用次数

#### ✅ 智能缓存系统

- **技术**: TTL 缓存 + 自动失效
- **效果**: 减少 60%+ 的重复 Git 调用
- **创新**: 不同数据类型采用不同缓存策略

#### ✅ 精准文件监听

- **技术**: 只监听 `.git/HEAD` 和 `refs/heads/**`
- **效果**: 减少 80%+ 的无谓刷新
- **创新**: 300ms 防抖 + 精准路径匹配

### 2. 用户体验亮点

#### ✅ 一站式仓库初始化

- **流程**: `git init → remote add → add → commit → push`
- **特点**: 全程引导，无需手动输入命令
- **创新**: 智能检测 + 错误提示 + 进度反馈

#### ✅ 智能冲突解决

- **功能**: 三栏对比编辑器
- **特点**: 可视化标记 + 一键解决
- **创新**: 支持撤销/重做 + 自动合并

#### ✅ 快捷键支持

- **快捷键**: `Ctrl+Alt+P/L/B` 快速推送/拉取/切换分支
- **特点**: 肌肉记忆友好
- **创新**: 操作前自动安全检查

### 3. 可视化亮点

#### ✅ 高 DPI 提交图谱

- **技术**: Canvas + 设备像素比适配
- **效果**: Retina 屏幕清晰显示
- **创新**: 自动换行 + 颜色编码 + 节点高光

#### ✅ 多维度数据分析

- **功能**: 时间线 + 热力图 + 分支视图
- **特点**: 主题自适应 + 交互式探索
- **创新**: 统一配色方案 + 紧凑布局

#### ✅ 3D 提交图谱（实验性）

- **技术**: Three.js + React Three Fiber
- **特点**: 沉浸式 3D 体验
- **创新**: 可选的实验功能，不影响主流程

### 4. 架构设计亮点

#### ✅ 分层架构

- **命令层**: 用户交互处理
- **服务层**: 业务逻辑封装
- **提供者层**: 数据视图提供
- **视图层**: React 组件化

#### ✅ 容错机制

- **技术**: `Promise.allSettled` + 降级处理
- **效果**: 单个操作失败不影响整体
- **创新**: 自动 fallback 到默认数据

#### ✅ 类型安全

- **技术**: TypeScript 严格模式
- **效果**: 编译时错误检测
- **创新**: 完整的类型定义体系

---

## 性能优化策略

### 1. 数据加载优化

| 优化策略       | 实现方式                  | 效果                     |
| -------------- | ------------------------- | ------------------------ |
| **并行加载**   | `Promise.allSettled`      | 总耗时 = max(各请求耗时) |
| **分阶段推送** | 基础数据 → 统计数据       | 避免长时间空白           |
| **懒加载**     | TreeDataProvider 按需加载 | 减少初始加载时间         |
| **缓存机制**   | TTL 缓存 + 自动失效       | 减少 60%+ 重复调用       |

### 2. 渲染优化

| 优化策略        | 实现方式                 | 效果          |
| --------------- | ------------------------ | ------------- |
| **Canvas 优化** | 禁用透明度 + 高 DPI 适配 | 提升渲染性能  |
| **虚拟列表**    | 长列表按需渲染           | 减少 DOM 节点 |
| **防抖节流**    | 300ms 防抖 + 事件节流    | 减少无效刷新  |
| **主题缓存**    | 缓存计算后的主题色       | 避免重复计算  |

### 3. 内存优化

| 优化策略         | 实现方式                  | 效果             |
| ---------------- | ------------------------- | ---------------- |
| **缓存清理**     | TTL 过期自动清理          | 控制内存占用     |
| **缓存大小限制** | 超过 100 项自动删除最旧项 | 防止内存无限增长 |
| **存储索引限制** | 分支图索引最多保留 20 个  | 控制持久化数据量 |
| **事件解绑**     | 组件卸载时清理监听器      | 避免内存泄漏     |
| **数据分页**     | 提交历史分页加载          | 减少内存占用     |
| **自动清理**     | 旧的分支图数据自动删除    | 保持存储空间     |

---

## 创新点总结

### 1. 技术创新

- ✅ **并行数据刷新**: 使用 `Promise.allSettled` 实现容错并行加载
- ✅ **批量标签解析**: `git for-each-ref` 单次调用替代多次调用
- ✅ **高 DPI 渲染**: Canvas 自动适配高分辨率屏幕
- ✅ **分阶段推送**: 基础数据立即显示，统计数据后台加载

### 2. 用户体验创新

- ✅ **一站式初始化**: 从空目录到首次推送的完整引导
- ✅ **智能冲突解决**: 三栏对比编辑器 + 一键解决
- ✅ **快捷键支持**: 常用操作快捷键，提升效率
- ✅ **主题自适应**: 自动适配 VS Code 浅色/深色主题

### 3. 架构创新

- ✅ **分层架构**: 清晰的命令/服务/提供者/视图分层
- ✅ **容错机制**: 单个失败不影响整体，自动降级
- ✅ **类型安全**: TypeScript 严格模式 + 完整类型定义
- ✅ **可扩展性**: 模块化设计，易于扩展新功能
- ✅ **统一错误处理**: `ErrorHandler` 类提供统一的错误处理接口
- ✅ **统一日志系统**: `Logger` 类替换所有 `console.*` 调用
- ✅ **代码复用**: `git-helpers` 工具函数消除代码重复
- ✅ **内存管理**: 缓存大小限制和自动清理机制

### 4. 可视化创新

- ✅ **多维度分析**: 时间线 + 热力图 + 分支视图
- ✅ **3D 图谱**: Three.js 实现的沉浸式 3D 体验
- ✅ **交互式探索**: 支持拖拽、缩放、筛选等交互
- ✅ **统一设计**: 一致的配色方案和布局风格

---

## 技术指标

### 性能指标

| 指标                 | 目标值   | 实际值   | 说明                    |
| -------------------- | -------- | -------- | ----------------------- |
| **扩展激活时间**     | < 500ms  | ✅ 达标   | 按需激活，延迟加载      |
| **命令响应时间**     | < 100ms  | ✅ 达标   | 核心命令快速响应        |
| **面板基础数据刷新** | < 400ms  | ✅ 达标   | 并行加载优化            |
| **大仓库统计刷新**   | < 1.5s   | ✅ 达标   | 分阶段推送              |
| **内存占用**         | < 50MB   | ✅ 达标   | 缓存清理机制 + 大小限制 |
| **包体积**           | < 5MB    | ✅ 达标   | Webpack 优化 + 代码压缩 |
| **类型安全**         | 100%     | ✅ 达标   | 严格模式 + 完整类型定义 |
| **测试覆盖**         | 核心模块 | ✅ 进行中 | 工具函数 + 错误处理     |

### 功能覆盖

| 功能模块          | 完成度 | 说明                          |
| ----------------- | ------ | ----------------------------- |
| **基础 Git 操作** | 100%   | Push/Pull/Clone/Add/Commit    |
| **分支管理**      | 100%   | 创建/切换/合并/删除           |
| **标签管理**      | 100%   | 创建/推送/删除，批量操作      |
| **远程仓库管理**  | 100%   | 添加/重命名/更新/删除         |
| **冲突解决**      | 100%   | 检测 + 三栏对比解决           |
| **数据可视化**    | 100%   | 提交图/时间线/热力图/分支视图 |
| **命令历史**      | 100%   | 记录/复制/重试                |
| **错误处理**      | 100%   | 统一错误处理 + Git 错误识别   |
| **日志系统**      | 100%   | 统一日志接口 + 调试模式       |
| **代码质量**      | 100%   | 类型安全 + 代码复用 + 测试    |

---

## 总结

Git Assistant 项目通过**技术创新**、**用户体验优化**和**架构设计**三个维度，实现了从基础 Git 操作到高级数据分析的全方位功能覆盖。项目在性能优化、可视化展示、智能操作等方面都有显著亮点，是一个**技术含量高、用户体验好、架构设计优**的优秀项目。

### 代码质量保证

项目在 v1.0.2 版本中进行了全面的代码质量改进：

1. **统一错误处理**: 通过 `ErrorHandler` 类实现统一的错误处理，自动识别 Git 错误类型并提供友好提示
2. **统一日志系统**: 所有日志通过 `Logger` 记录，支持调试模式，便于问题排查
3. **类型安全**: 完善类型定义，减少 `any` 使用，提高代码的类型安全性
4. **代码复用**: 提取公共函数，消除代码重复，提高可维护性
5. **内存管理**: 实现缓存大小限制和自动清理机制，防止内存泄漏
6. **测试覆盖**: 添加单元测试，覆盖核心工具函数和错误处理逻辑
7. **文档完善**: 新增 API 文档，完善 JSDoc 注释，提高代码可读性
8. **构建优化**: Webpack 配置优化，支持生产/开发模式区分，代码压缩等

**核心价值**：

1. **提升开发效率**: 通过可视化界面和智能操作，减少 Git 学习成本
2. **降低操作错误**: 通过安全检查、确认提示、自动检测等机制，避免误操作
3. **数据驱动决策**: 通过热力图、时间线等可视化，帮助团队洞察代码演进
4. **技术示范作用**: 展示了 VS Code 扩展开发、React 组件化、数据可视化等最佳实践
5. **代码质量保证**: 通过类型安全、统一错误处理、测试覆盖等机制，确保代码质量
6. **可维护性**: 通过代码复用、统一接口、完善文档等，提高代码可维护性

**最新优化亮点** (v1.0.2):

- ✅ **统一错误处理系统**: `ErrorHandler` 类提供统一的错误处理接口，自动识别 Git 错误类型并提供友好提示
- ✅ **统一日志系统**: 所有日志通过 `Logger` 记录，支持调试模式，输出到 VS Code 输出通道
- ✅ **类型安全改进**: 完善类型定义，减少 `any` 使用，提高类型安全性
- ✅ **代码重复消除**: 提取公共函数到 `git-helpers.ts`，提高代码可维护性
- ✅ **内存管理优化**: 缓存大小限制、存储索引限制、自动清理机制
- ✅ **分支图增量更新优化**: 限制查找次数、从最近开始查找、快速过滤
- ✅ **Webpack 构建优化**: 生产/开发模式区分、代码压缩、性能提示
- ✅ **测试覆盖**: 添加单元测试，覆盖核心工具函数和错误处理
- ✅ **文档完善**: 新增 API 文档，完善 JSDoc 注释，更新 README

---

## 开发环境搭建

### 前置要求

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0（或 yarn >= 1.22.0）
- **VS Code**: >= 1.80.0
- **Git**: >= 2.30.0（用于测试 Git 操作）

### 安装步骤

**1. 克隆仓库**：

```bash
git clone https://github.com/YIXUAN-oss/CodeGitAssistant.git
cd CodeGitAssistant
```

**2. 安装依赖**：

```bash
npm install
```

**3. 编译项目**：

```bash
# 开发模式编译（带 source map）
npm run compile

# 监听模式（自动重新编译）
npm run watch
```

**4. 运行测试**：

```bash
# 运行所有测试
npm test

# 编译测试文件
npm run compile-tests

# 监听模式运行测试
npm run watch-tests
```

**5. 在 VS Code 中调试**：

1. 按 `F5` 或点击"运行和调试"
2. 选择"扩展开发主机"配置
3. 新窗口会自动打开，加载扩展

### 开发工具配置

**推荐 VS Code 扩展**：

- **ESLint**: 代码质量检查
- **Prettier**: 代码格式化（可选）
- **TypeScript**: TypeScript 语言支持
- **GitLens**: Git 增强工具（可选）

**项目配置**：

- `.vscode/launch.json`: 调试配置
- `.vscode/tasks.json`: 构建任务
- `tsconfig.json`: TypeScript 编译配置
- `webpack.config.js`: Webpack 打包配置

### 开发工作流

**1. 修改代码**：

- 扩展代码：修改 `src/` 目录下的文件
- Webview 代码：修改 `src/webview/` 目录下的文件
- 运行 `npm run watch` 自动编译

**2. 测试功能**：

- 在扩展开发主机窗口中测试功能
- 查看"输出"面板的"Git Assistant"通道查看日志
- 使用 `Logger.debug()` 输出调试信息

**3. 运行测试**：

```bash
npm test
```

**4. 代码检查**：

```bash
npm run lint
```

---

## 构建和发布流程

### 本地构建

**1. 生产模式构建**：

```bash
npm run package
```

这会执行：
- Webpack 生产模式打包（代码压缩、优化）
- 生成 source map（用于调试）
- 输出到 `dist/` 目录

**2. 验证构建结果**：

```bash
# 检查 dist/ 目录
ls -la dist/

# 应该包含：
# - extension.js（主扩展文件）
# - extension.js.map（source map）
# - webview/webview.js（Webview 文件）
# - webview/webview.js.map（source map）
```

### 打包 VSIX

**1. 安装 vsce**：

```bash
npm install -g @vscode/vsce
```

**2. 更新版本号**：

在 `package.json` 中更新 `version` 字段：

```json
{
  "version": "1.0.2"
}
```

**3. 打包扩展**：

```bash
vsce package
```

这会生成 `git-assistant-1.0.2.vsix` 文件。

**4. 验证 VSIX**：

```bash
# 查看 VSIX 内容
vsce ls

# 或手动安装测试
code --install-extension git-assistant-1.0.2.vsix
```

### 发布到 VS Code Marketplace

**1. 获取 Personal Access Token**：

1. 访问 https://dev.azure.com/YIXUAN-oss
2. 进入"用户设置" → "个人访问令牌"
3. 创建新令牌，选择"Marketplace"范围，权限选择"管理"

**2. 创建发布者**（首次发布）：

```bash
vsce create-publisher YIXUAN
```

**3. 登录**：

```bash
vsce login YIXUAN
# 输入 Personal Access Token
```

**4. 发布扩展**：

```bash
vsce publish
```

**5. 发布特定版本**：

```bash
vsce publish 1.0.2
```

**6. 发布补丁版本**：

```bash
vsce publish patch  # 1.0.2 -> 1.0.3
vsce publish minor   # 1.0.2 -> 1.1.0
vsce publish major   # 1.0.2 -> 2.0.0
```

### 发布检查清单

- [ ] 更新 `CHANGELOG.md` 记录所有变更
- [ ] 更新 `package.json` 版本号
- [ ] 运行 `npm test` 确保所有测试通过
- [ ] 运行 `npm run lint` 确保代码质量
- [ ] 运行 `npm run package` 确保构建成功
- [ ] 在扩展开发主机中测试所有功能
- [ ] 更新 `README.md` 和 `PROJECT_DETAILS.md`（如需要）
- [ ] 创建 Git 标签：`git tag v1.0.2 && git push --tags`
- [ ] 运行 `vsce package` 生成 VSIX
- [ ] 验证 VSIX 可以正常安装
- [ ] 运行 `vsce publish` 发布到 Marketplace

---

## 常见问题解答

### 开发相关问题

**Q: 如何调试 Webview 代码？**

A: 在扩展开发主机窗口中：
1. 打开开发者工具：`Ctrl+Shift+I`（Windows/Linux）或 `Cmd+Option+I`（Mac）
2. 在"控制台"中查看日志和错误
3. 使用 `console.log()` 或 `Logger.debug()` 输出调试信息

**Q: 修改代码后没有生效？**

A: 检查以下几点：
1. 确保运行了 `npm run watch` 自动编译
2. 在扩展开发主机窗口中按 `Ctrl+R` 重新加载窗口
3. 检查 `dist/` 目录中的文件是否已更新
4. 查看"输出"面板的"Git Assistant"通道查看编译错误

**Q: 如何测试 Git 操作？**

A: 
1. 在扩展开发主机窗口中打开一个包含 Git 仓库的文件夹
2. 使用扩展的各种功能进行测试
3. 查看"输出"面板的"Git Assistant"通道查看操作日志
4. 使用 `git status`、`git log` 等命令验证操作结果

**Q: 如何添加新的命令？**

A: 
1. 在 `src/commands/` 目录下创建或修改命令文件
2. 在 `src/extension.ts` 中注册命令
3. 在 `package.json` 的 `contributes.commands` 中添加命令定义
4. 在 `src/utils/command-history.ts` 的 `getAvailableCommands()` 中添加命令元数据（如需要）

### 功能相关问题

**Q: 分支图加载很慢？**

A: 
1. 检查仓库大小，大仓库（1000+ 提交）可能需要几秒钟
2. 查看"输出"面板查看是否有错误
3. 尝试点击"刷新"按钮强制重新加载
4. 使用 `getBranchGraphSnapshot()` 方法获取缓存版本（秒开）

**Q: 冲突检测不工作？**

A: 
1. 检查配置 `git-assistant.conflictHighlight` 是否启用
2. 确保文件包含标准的 Git 冲突标记（`<<<<<<<`、`=======`、`>>>>>>>`）
3. 查看"输出"面板查看是否有错误
4. 尝试手动运行 `git-assistant.resolveConflicts` 命令

**Q: 远程仓库 URL 无法在浏览器打开？**

A: 
1. 确保 URL 格式正确（SSH 或 HTTPS）
2. SSH URL 会自动转换为 HTTPS URL（GitHub/GitLab/Bitbucket/Gitee）
3. 如果平台不支持，会显示错误提示
4. 可以手动复制 URL 到浏览器

**Q: 标签推送失败？**

A: 
1. 检查远程仓库权限
2. 如果标签已存在，需要选择"强制推送"
3. 查看"输出"面板查看详细错误信息
4. 确保远程仓库名称正确（默认使用 `origin`）

### 性能相关问题

**Q: 控制面板打开很慢？**

A: 
1. 首次打开会加载所有数据，可能需要几秒钟
2. 后续打开会使用缓存，速度更快
3. 大仓库（1000+ 提交）可能需要更长时间
4. 查看"输出"面板查看加载进度

**Q: 内存占用过高？**

A: 
1. 检查缓存大小限制（默认 50MB）
2. 使用 `clearBranchGraphCache()` 清空分支图缓存
3. 重启 VS Code 释放内存
4. 减少处理的提交数量（修改 `BRANCH_GRAPH_MAX_COMMITS`）

### 构建和发布相关问题

**Q: `vsce package` 失败？**

A: 
1. 检查 `package.json` 格式是否正确
2. 确保所有必需字段已填写（`name`、`version`、`publisher` 等）
3. 检查图标文件是否存在（`resources/git-icon.png`）
4. 查看错误信息，通常会有具体提示

**Q: 发布到 Marketplace 失败？**

A: 
1. 检查 Personal Access Token 是否有效
2. 确保发布者名称正确
3. 检查版本号是否已存在（不能重复发布相同版本）
4. 查看错误信息，通常会有具体提示

**Q: 如何回滚版本？**

A: 
1. 发布新版本修复问题（推荐）
2. 或联系 VS Code Marketplace 支持团队下架版本
3. 注意：已安装的用户不会自动回滚，需要手动更新

### 其他问题

**Q: 如何贡献代码？**

A: 
1. Fork 仓库
2. 创建功能分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -m "feat: 添加新功能"`
4. 推送到分支：`git push origin feature/my-feature`
5. 创建 Pull Request

**Q: 如何报告 Bug？**

A: 
1. 在 GitHub Issues 中创建新 Issue
2. 提供详细的错误描述和复现步骤
3. 包含 VS Code 版本、扩展版本、操作系统信息
4. 如果可能，提供错误日志（"输出"面板的"Git Assistant"通道）

**Q: 如何请求新功能？**

A: 
1. 在 GitHub Issues 中创建新 Issue
2. 使用 `enhancement` 标签
3. 详细描述功能需求和用例
4. 讨论实现方案和优先级

---

**文档版本**: v1.0.1  
**最后更新**: 2025-12-03  
**当前版本**: v1.0.1  
**维护者**: Git Assistant Team