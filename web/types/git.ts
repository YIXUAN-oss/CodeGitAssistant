/**
 * Git相关类型定义（WebView 前端使用）
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
    not_added?: string[];
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
    branches?: string[];
    parents?: string[];
    timestamp?: number;
}

export interface LogResult {
    all: CommitInfo[];
    total: number;
    latest: CommitInfo | null;
}

export interface RemoteInfo {
    name: string;
    refs?: {
        fetch?: string;
        push?: string;
    };
}

export interface TagInfo {
    name: string;
    commit: string;
    message?: string;
    date?: string;
}

export interface BranchGraphDag {
    nodes: BranchGraphNode[];
    links: BranchGraphLink[];
}

export interface BranchGraphNode {
    hash: string;
    parents: string[];
    branches: string[];
    timestamp: number;
    isMerge?: boolean;
}

export interface BranchGraphLink {
    source: string;
    target: string;
}

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

export interface RepositoryInfo {
    path: string;
    name: string;
}

export interface RepositoryState {
    isRepository: boolean;
    hasCommits: boolean;
    hasConflicts: boolean;
    hasRemote: boolean;
    hasUncommittedChanges: boolean;
    hasUnpushedCommits: boolean;
    currentBranch: string | null;
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
    fileStats?: Array<{ path: string; count: number }> | Map<string, number>;
    contributorStats?: Array<{ email: string; commits: number; files: number }> | Map<string, { commits: number; files: Set<string> }>;
    timeline?: Array<{ date: string; count: number }> | Map<string, number>;
    commandHistory?: CommandHistoryItem[];
    availableCommands?: Command[];
    categories?: Category[];
    currentBranch?: string | null;
    commitFiles?: Record<string, CommitFileChange[]>;
}

