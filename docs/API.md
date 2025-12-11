# Git Assistant API 文档

本文档描述了 Git Assistant 扩展的核心 API 和类型定义。

## 目录

- [类型定义](#类型定义)
- [服务类](#服务类)
- [工具函数](#工具函数)
- [错误处理](#错误处理)

## 类型定义

### Git 相关类型

所有 Git 相关的类型定义位于 `src/types/git.ts`。

#### `GitStatus`

表示 Git 仓库的状态信息（封装自 `simple-git` 的 `StatusResult`，并做了补充）。

```typescript
interface GitStatus {
    current: string | null;           // 当前分支
    tracking: string | null;          // 跟踪的远程分支
    ahead: number;                    // 领先远程的提交数
    behind: number;                   // 落后远程的提交数
    modified: string[];               // 已修改的文件
    created: string[];                // 新创建的文件
    deleted: string[];                // 已删除的文件
    renamed: string[];                // 已重命名的文件
    conflicted: string[];             // 冲突的文件
    staged: string[];                 // 已暂存的文件
    not_added?: string[];             // 未跟踪的文件
    files: FileStatus[];              // 文件状态详情
}
```

#### `BranchGraphData`

表示分支图数据，用于可视化分支关系。

```typescript
interface BranchGraphData {
    branches: string[];                // 所有分支列表
    merges: Array<{                    // 合并记录
        from: string;
        to: string;
        commit: string;
        type: 'three-way' | 'fast-forward';
        description?: string;
        timestamp?: number;
    }>;
    currentBranch?: string;            // 当前分支
    dag?: BranchGraphDag;              // DAG 结构
}
```

#### `RemoteInfo`

远程仓库信息。

```typescript
interface RemoteInfo {
    name: string;                      // 远程仓库名称
    refs?: {
        fetch?: string;                // Fetch URL
        push?: string;                 // Push URL
    };
}
```

#### `TagInfo`

标签信息。

```typescript
interface TagInfo {
    name: string;                      // 标签名称
    commit: string;                    // 指向的提交哈希
    message?: string;                  // 标签消息（带注释标签）
    date?: string;                     // 创建日期
}
```

#### `CommitInfo`

提交信息（用于日志视图、Git 图等）。

```typescript
interface CommitInfo {
    hash: string;                      // 提交哈希
    date: string;                      // ISO 日期字符串
    message: string;                   // 提交标题
    author_name: string;               // 作者姓名
    author_email: string;              // 作者邮箱
    body: string;                      // 完整提交消息（多行）
    refs?: string;                     // 关联引用（分支/标签装饰）
    parents?: string[];                // 父提交哈希列表
    branches?: string[];               // 该提交所属的分支列表
}
```

#### `GitData`

发送到 Webview 的聚合数据模型，集中承载控制面板所需的所有 Git 信息：

```typescript
interface GitData {
    status?: GitStatus;                        // 当前状态
    branches?: BranchInfo;                     // 分支摘要
    log?: LogResult;                           // 提交历史（CommitInfo[]）
    remotes?: RemoteInfo[];                    // 远程仓库
    conflicts?: string[];                      // 冲突文件路径
    tags?: TagInfo[];                          // 本地标签
    remoteTags?: { name: string; commit: string }[];
    repositoryInfo?: RepositoryInfo;           // 仓库路径/名称
    branchGraph?: BranchGraphData;             // 分支图 DAG 数据
    fileStats?: { path: string; count: number }[];              // 文件热力图
    contributorStats?: { email: string; commits: number; files: number }[]; // 贡献者热力图
    timeline?: { date: string; count: number }[];               // 提交时间线
    commandHistory?: CommandHistoryItem[];      // 命令历史
    availableCommands?: Command[];              // 快捷指令列表
    categories?: Category[];                    // 快捷指令分类
    currentBranch?: string | null;              // 当前分支（冗余字段，便于前端使用）
    commitFiles?: Record<string, CommitFileChange[]>; // 各提交的文件变更
    commitDetails?: Record<string, CommitInfo>;       // 按需补全的提交详情
}
```

## 服务类

### `GitService`

Git 操作的核心服务类，封装了所有 Git 操作。

#### 主要方法

##### `getStatus(forceRefresh?: boolean): Promise<StatusResult>`

获取仓库状态（带缓存）。

- `forceRefresh`: 是否强制刷新（默认 false）
- 返回: Promise<StatusResult>

##### `getBranches(forceRefresh?: boolean): Promise<BranchSummary>`

获取分支列表（带缓存）。

- `forceRefresh`: 是否强制刷新（默认 false）
- 返回: Promise<BranchSummary>

##### `getBranchGraph(forceRefresh?: boolean): Promise<BranchGraphData>`

获取分支关系图数据（支持增量更新和持久化缓存）。

- `forceRefresh`: 是否强制刷新（默认 false）
- 返回: Promise<BranchGraphData>

##### `getBranchGraphSnapshot(): Promise<BranchGraphData | null>`

获取当前 HEAD 对应的分支图快照（用于控制面板快速渲染）。

- 返回: Promise<BranchGraphData | null>，如果存在缓存则返回，否则返回 null

##### `clearBranchGraphCache(): Promise<void>`

清空分支图缓存（内存 + workspaceState）。

- 返回: Promise<void>

##### `push(remote?: string, branch?: string): Promise<void>`

推送到远程仓库。

- `remote`: 远程仓库名称（默认 'origin'）
- `branch`: 分支名称（默认当前分支）
- 返回: Promise<void>

##### `pull(remote?: string, branch?: string): Promise<void>`

从远程仓库拉取。

- `remote`: 远程仓库名称（默认 'origin'）
- `branch`: 分支名称（默认当前分支）
- 返回: Promise<void>

##### `getRemotes(forceRefresh?: boolean): Promise<RemoteInfo[]>`

获取远程仓库列表（带缓存）。

- `forceRefresh`: 是否强制刷新（默认 false）
- 返回: Promise<RemoteInfo[]>

##### `getTags(forceRefresh?: boolean): Promise<TagInfo[]>`

获取标签列表（本地标签，使用 `git for-each-ref` 批量解析）。

- `forceRefresh`: 是否强制刷新（默认 false）
- 返回: Promise<TagInfo[]>

##### 其他关键方法（摘要）

> 以下方法在代码中有完整实现，这里只做能力概览：

- `clone(repoUrl: string, targetPath: string): Promise<void>`  
  克隆远程仓库到指定目录（用于初始化新项目）。

- `cloneIntoWorkspace(repoUrl: string): Promise<void>`  
  在当前打开的工作区目录中执行 `git clone <repo> .`，适合空文件夹场景。

- `createBranch(branchName: string, checkout?: boolean, startPoint?: string): Promise<void>`  
  创建分支，可选择是否切换、以及从指定提交/分支起点创建。

- `checkout(branchName: string): Promise<void>`  
  切换分支，并自动失效状态/分支/日志缓存。

- `canFastForwardMerge(branchName: string): Promise<boolean | null>`  
  判断当前分支是否可以对 `branchName` 做快进合并。

- `getBranchMergeInfo(branchName: string): Promise<{ canFastForward: boolean | null; commitsAhead: number; commitsBehind: number; hasDiverged: boolean; }>`  
  计算当前分支与目标分支之间的提交差异，用于合并策略提示。

- `merge(branchName: string, strategy: 'fast-forward' | 'three-way' = 'three-way'): Promise<void>`  
  执行合并操作，并记录合并历史以供分支图视图使用。

- `deleteBranch(branchName: string, force?: boolean): Promise<void>` / `isBranchMergedIntoCurrent(branchName: string): Promise<boolean>`  
  删除分支与删除前安全检查（是否已合并）。

- `fileExistsInCommit(commitHash: string, filePath: string): Promise<boolean>`  
  基于 `git cat-file` 检查某个提交中是否存在指定文件（用于安全打开虚拟文件）。

- `clearBranchGraphCache(): Promise<void>` / `invalidateAllCache(): void`  
  清空分支图缓存或全部内存缓存，通常在重要 Git 操作后调用。

## 工具函数

### `git-helpers.ts`

提供常用的 Git 操作辅助函数。

#### `pickRemote(gitService: GitService, actionLabel: string): Promise<string | null>`

选择远程仓库（消除代码重复）。

- `gitService`: Git 服务实例
- `actionLabel`: 操作标签（用于提示）
- 返回: 选中的远程仓库名称，如果取消则返回 null

#### `getDefaultRemote(gitService: GitService): Promise<string>`

获取默认远程仓库名称。

- `gitService`: Git 服务实例
- 返回: 默认远程仓库名称，如果没有则返回 'origin'

#### `getCurrentBranch(gitService: GitService): Promise<string | null>`

验证并获取当前分支。

- `gitService`: Git 服务实例
- 返回: 当前分支名称，如果获取失败则返回 null

### `git-utils.ts`

提供 Git 相关的工具函数。

#### `formatBranchName(branch: string): string`

格式化分支名称，移除 `refs/heads/` 和 `remotes/` 前缀。

#### `isRemoteBranch(branch: string): boolean`

检查是否是远程分支。

#### `validateBranchName(name: string): { valid: boolean; error?: string }`

验证分支名称是否符合 Git 规范。

#### `parseConflictMarkers(content: string): ConflictParseResult`

解析冲突标记。

#### `resolveConflict(content: string, action: 'current' | 'incoming' | 'both'): string`

解决冲突（自动选择）。

## 错误处理

### `ErrorHandler`

统一错误处理工具类。

#### `handle(error: unknown, context: string, showToUser?: boolean): void`

处理错误并显示用户友好的错误消息。

- `error`: 错误对象
- `context`: 操作上下文描述
- `showToUser`: 是否向用户显示错误消息（默认 true）

#### `handleSilent(error: unknown, context: string): void`

静默处理错误（只记录日志，不显示给用户）。

- `error`: 错误对象
- `context`: 操作上下文描述

#### `getErrorMessage(error: unknown, context: string): string`

处理错误并返回错误消息字符串。

- `error`: 错误对象
- `context`: 操作上下文描述
- 返回: 错误消息字符串

#### `handleGitError(error: unknown, operation: string): void`

处理 Git 特定错误，提供更友好的错误提示。

- `error`: 错误对象
- `operation`: Git 操作名称

## 日志系统

### `Logger`

日志记录器，提供统一的日志接口。

#### `info(message: string, ...args: any[]): void`

记录信息。

#### `warn(message: string, ...args: any[]): void`

记录警告。

#### `error(message: string, error?: Error, ...args: any[]): void`

记录错误。

#### `debug(message: string, ...args: any[]): void`

记录调试信息（仅在调试模式下）。

## 使用示例

### 基本 Git 操作

```typescript
import { GitService } from './services/git-service';
import { ErrorHandler } from './utils/error-handler';

const gitService = new GitService(context);

try {
    // 获取状态
    const status = await gitService.getStatus();
    console.log(`当前分支: ${status.current}`);

    // 推送
    await gitService.push('origin');
} catch (error) {
    ErrorHandler.handleGitError(error, '推送');
}
```

### 使用辅助函数

```typescript
import { pickRemote, getDefaultRemote } from './utils/git-helpers';

// 选择远程仓库
const remote = await pickRemote(gitService, '推送');
if (remote) {
    await gitService.push(remote);
}

// 获取默认远程
const defaultRemote = await getDefaultRemote(gitService);
await gitService.pull(defaultRemote);
```

### 错误处理

```typescript
import { ErrorHandler } from './utils/error-handler';

try {
    await someOperation();
} catch (error) {
    // 显示错误给用户
    ErrorHandler.handle(error, '执行操作');

    // 或静默处理
    ErrorHandler.handleSilent(error, '可选操作');

    // 或获取错误消息
    const message = ErrorHandler.getErrorMessage(error, '执行操作');
    customHandler(message);
}
```

## 更多信息

- [开发文档](./DEVELOPMENT.md)
- [快速开始指南](./QUICKSTART.md)
- [测试文档](./TESTING.md)

