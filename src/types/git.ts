/**
 * Git相关类型定义
 */

export interface GitStatus {
    current: string | null;
    tracking: string | null;
    ahead: number;
    behind: number;
    modified: string[];
    created: string[];
    deleted: string[];
    renamed: string[];
    conflicted: string[];
    staged: string[];
    not_added?: string[]; // 未跟踪的文件
    files: FileStatus[];
}

export interface FileStatus {
    path: string;
    index: string;
    working_dir: string;
}

export interface BranchInfo {
    current: string | null;
    all: string[];
    branches: {
        [key: string]: BranchDetail;
    };
}

export interface BranchDetail {
    current: boolean;
    name: string;
    commit: string;
    label: string;
}

export interface CommitFileChange {
    path: string;
    status: string;
    additions?: number;
    deletions?: number;
    changes?: number;
}

export interface CommitInfo {
    hash: string;
    date: string;
    message: string;
    author_name: string;
    author_email: string;
    body: string;
    refs?: string;
}

export interface LogResult {
    all: CommitInfo[];
    total: number;
    latest: CommitInfo | null;
}

export interface Remote {
    name: string;
    refs: {
        fetch: string;
        push: string;
    };
}

export interface DiffResult {
    files: DiffFile[];
    insertions: number;
    deletions: number;
    changed: number;
}

export interface DiffFile {
    file: string;
    changes: number;
    insertions: number;
    deletions: number;
    binary: boolean;
}

export interface ConflictInfo {
    file: string;
    ours: string;
    theirs: string;
    ancestor?: string;
}

export interface StashEntry {
    index: number;
    message: string;
    date: string;
}

export interface TagInfo {
    name: string;
    commit: string;
    message?: string;
    date?: string;
}

/**
 * 分支图节点信息
 */
export interface BranchGraphNode {
    hash: string;
    parents: string[];
    branches: string[];
    timestamp: number;
    isMerge: boolean;
}

/**
 * 分支图链接信息
 */
export interface BranchGraphLink {
    source: string;
    target: string;
}

/**
 * 分支图 DAG 结构
 */
export interface BranchGraphDag {
    nodes: BranchGraphNode[];
    links: BranchGraphLink[];
}

/**
 * 分支图数据
 */
export interface BranchGraphData {
    branches: string[];
    merges: Array<{
        from: string;
        to: string;
        commit: string;
        type: 'three-way' | 'fast-forward';
        description?: string;
        timestamp?: number;
    }>;
    currentBranch?: string;
    dag?: BranchGraphDag;
}

/**
 * 提交节点信息（内部使用）
 */
export interface CommitNodeInfo {
    hash: string;
    parents: string[];
    timestamp: number;
    branches: Set<string>;
}

/**
 * 远程仓库信息
 */
export interface RemoteInfo {
    name: string;
    refs?: {
        fetch?: string;
        push?: string;
    };
}

/**
 * 仓库信息
 */
export interface RepositoryInfo {
    path: string;
    name: string;
}

export interface CommandHistoryItem {
    id: string;
    command: string;
    commandName: string;
    timestamp: number;
    success: boolean;
    error?: string;
    remote?: string;
}

export interface Command {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    requires: string;
}

export interface Category {
    id: string;
    name: string;
    description: string;
    icon: string;
}

/**
 * Git 数据（用于 Webview）
 */
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
    commandHistory?: CommandHistoryItem[];
    availableCommands?: Command[];
    categories?: Category[];
    currentBranch?: string | null;
    commitFiles?: Record<string, CommitFileChange[]>;
}

