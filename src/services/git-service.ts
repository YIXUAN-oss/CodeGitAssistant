import * as vscode from 'vscode';
import simpleGit, { SimpleGit, StatusResult, BranchSummary, LogResult } from 'simple-git';
import { CommitInfo } from '../types/git';
import { MergeHistory } from '../utils/merge-history';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';
import { BranchGraphData, CommitFileChange, CommitNodeInfo, RemoteInfo, TagInfo } from '../types/git';

/**
 * 缓存项接口
 */
interface CacheItem<T> {
    data: T;
    timestamp: number;
    ttl: number; // 缓存有效期（毫秒）
}

// 类型定义已移至 src/types/git.ts

/**
 * Git服务类 - 封装所有Git操作
 */
export class GitService {
    private git: SimpleGit | null = null;
    private workspaceRoot: string | undefined;

    // 缓存存储（内存级）
    private cache: Map<string, CacheItem<unknown>> = new Map();

    // 记录获取详情时已失败的提交，避免重复打 git 命令
    private failedCommitDetails: Set<string> = new Set();

    // 持久化存储（workspace 级）
    private storage: vscode.Memento | null = null;

    // 缓存配置
    private readonly CACHE_TTL = {
        branches: 5000,        // 分支列表缓存5秒（提升到5秒，减少重复获取）
        status: 1500,          // 状态缓存1.5秒
        remotes: 5000,         // 远程仓库缓存5秒
        tags: 3000,            // 标签缓存3秒
        remoteTags: 10000,     // 远程标签缓存10秒（网络操作，缓存时间更长）
        log: 2000,             // 日志缓存2秒
        branchGraph: 10000,    // 分支图缓存10秒（计算成本高，延长缓存时间）
        fileStats: 30000,      // 文件热力图统计缓存30秒
        contributorStats: 30000, // 贡献者统计缓存30秒
        timeline: 30000        // 提交时间线缓存30秒
    };

    // 缓存大小限制（防止内存泄漏）
    private readonly MAX_CACHE_SIZE = 100;

    // 分支视图最大分析提交数，避免在超大仓库中遍历所有历史导致卡顿
    // 800 左右在大多数仓库下可以覆盖最近的分支/合并关系，同时保证加载速度
    private static readonly BRANCH_GRAPH_MAX_COMMITS = 800;

    constructor(context?: vscode.ExtensionContext) {
        // 使用 workspaceState 进行持久化缓存（随工作区而变）
        this.storage = context?.workspaceState ?? null;
        this.initialize();
    }

    private async buildFullBranchGraph(git: SimpleGit): Promise<BranchGraphData> {
        try {
            const logOutput = await git.raw([
                'log',
                '--all',
                `--max-count=${GitService.BRANCH_GRAPH_MAX_COMMITS}`,
                '--topo-order',
                '--date-order',
                '--format=%H%x00%P%x00%D%x00%ct',
                '--decorate=full'
            ]);

            const commits = this.parseGitLogToCommitMap(logOutput);
            this.enforceCommitLimit(commits);
            const branchSummary = await git.branch();

            if (commits.size === 0) {
                return {
                    branches: branchSummary.all.filter(b => !b.startsWith('remotes/')),
                    merges: [],
                    currentBranch: branchSummary.current || undefined,
                    dag: {
                        nodes: [],
                        links: []
                    }
                };
            }

            return this.buildBranchGraphFromCommitMap(commits, branchSummary);
        } catch (error) {
            ErrorHandler.handleSilent(error, '获取分支图');
            return {
                branches: [],
                merges: [],
                currentBranch: undefined,
                dag: {
                    nodes: [],
                    links: []
                }
            };
        }
    }

    private async tryBuildIncrementalBranchGraph(git: SimpleGit, repoId: string, headHash: string): Promise<BranchGraphData | null> {
        if (!this.storage) {
            return null;
        }

        const indexKey = this.getBranchGraphIndexKey(repoId);
        const storedHashes = this.storage.get<string[]>(indexKey) || [];
        if (storedHashes.length === 0) {
            return null;
        }

        // 优化：从最近的提交开始查找（更可能匹配）
        // 同时限制查找次数，避免在大量历史中查找过久
        const maxAttempts = Math.min(storedHashes.length, 10);
        let attempts = 0;

        for (let i = storedHashes.length - 1; i >= 0 && attempts < maxAttempts; i--) {
            attempts++;
            const candidate = storedHashes[i];
            if (!candidate || candidate === headHash) {
                continue;
            }

            try {
                const baseGraph = this.loadBranchGraphFromStorage(repoId, candidate);
                if (!baseGraph || !baseGraph.dag) {
                    continue;
                }

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
            } catch (error) {
                // 单个候选失败不影响其他候选
                ErrorHandler.handleSilent(error, `检查增量更新候选(${candidate?.substring(0, 7)})`);
                continue;
            }
        }

        return null;
    }

    private async buildBranchGraphIncrementally(git: SimpleGit, baseGraph: BranchGraphData, baseHash: string, headHash: string): Promise<BranchGraphData | null> {
        if (!baseGraph.dag) {
            return null;
        }

        let logOutput = '';
        try {
            logOutput = await git.raw([
                'log',
                `${baseHash}..${headHash}`,
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

        newCommits.forEach((node, hash) => combinedCommits.set(hash, node));

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

        if (combinedCommits.size === 0) {
            return {
                ...baseGraph,
                branches: branchSummary.all.filter(b => !b.startsWith('remotes/')),
                currentBranch: branchSummary.current || baseGraph.currentBranch
            };
        }

        this.enforceCommitLimit(combinedCommits);
        return this.buildBranchGraphFromCommitMap(combinedCommits, branchSummary);
    }

    private parseGitLogToCommitMap(logOutput: string): Map<string, CommitNodeInfo> {
        const commits = new Map<string, CommitNodeInfo>();
        if (!logOutput || !logOutput.trim()) {
            return commits;
        }

        const logLines = logOutput.trim().split('\n').filter(line => line.trim());
        for (const line of logLines) {
            const parts = line.split('\x00');
            if (parts.length < 4) {
                continue;
            }

            const hash = parts[0].trim();
            if (!hash) {
                continue;
            }
            const parentStr = parts[1].trim();
            const refStr = parts[2].trim();
            const timestampStr = parts[3].trim();

            const parents = parentStr ? parentStr.split(/\s+/).filter(p => p.trim()) : [];
            const refs = refStr ? refStr.split(',').map(r => r.trim()).filter(r => r) : [];
            const branchNames = refs
                .filter(r => r.startsWith('refs/heads/'))
                .map(r => r.replace('refs/heads/', ''));
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

    private enforceCommitLimit(commits: Map<string, CommitNodeInfo>): void {
        const limit = GitService.BRANCH_GRAPH_MAX_COMMITS;
        while (commits.size > limit) {
            let lastKey: string | undefined;
            for (const key of commits.keys()) {
                lastKey = key;
            }
            if (!lastKey) {
                break;
            }
            commits.delete(lastKey);
        }
    }

    private buildBranchGraphFromCommitMap(commits: Map<string, CommitNodeInfo>, branchSummary: BranchSummary): BranchGraphData {
        const allBranches = branchSummary.all.filter(b => !b.startsWith('remotes/'));
        const currentBranch = branchSummary.current || 'main';
        const merges: Array<{ from: string; to: string; commit: string; type: 'three-way' | 'fast-forward'; description?: string; timestamp?: number }> = [];

        for (const [commitHash, commitNode] of commits.entries()) {
            if (commitNode.parents.length >= 2) {
                const firstParentNode = commits.get(commitNode.parents[0]);
                const secondParentNode = commits.get(commitNode.parents[1]);
                if (!firstParentNode || !secondParentNode) {
                    continue;
                }

                const commitBranches = commitNode.branches;
                const toBranchCandidates = Array.from(commitBranches).filter(branch =>
                    firstParentNode.branches.has(branch) && !secondParentNode.branches.has(branch)
                );

                const fromBranchCandidates = Array.from(secondParentNode.branches).filter(branch => {
                    if (firstParentNode.branches.has(branch)) {
                        return commitBranches.has(branch) && !toBranchCandidates.includes(branch);
                    }
                    return true;
                });

                if (toBranchCandidates.length > 0 && fromBranchCandidates.length > 0) {
                    const toBranch = toBranchCandidates.includes(currentBranch)
                        ? currentBranch
                        : toBranchCandidates[0];
                    const fromBranch = fromBranchCandidates[0];

                    if (fromBranch !== toBranch) {
                        const existingIndex = merges.findIndex(m => m.from === fromBranch && m.to === toBranch);
                        if (existingIndex < 0) {
                            merges.push({
                                from: fromBranch,
                                to: toBranch,
                                commit: commitHash,
                                type: 'three-way',
                                description: `三路合并：${fromBranch} → ${toBranch}`,
                                timestamp: commitNode.timestamp
                            });
                        }
                    }
                }
            }
        }

        try {
            const recorded = MergeHistory.getHistory();
            for (const item of recorded) {
                if (item.type !== 'three-way') {
                    continue;
                }
                if (!allBranches.includes(item.from) || !allBranches.includes(item.to)) {
                    continue;
                }
                const existingIndex = merges.findIndex(m => m.from === item.from && m.to === item.to);
                if (existingIndex < 0) {
                    merges.push(item);
                }
            }
        } catch (error) {
            ErrorHandler.handleSilent(error, '读取合并历史');
        }

        const threeWayMerges = merges.filter(m => m.type === 'three-way');

        const dagNodes = Array.from(commits.values()).map(commit => ({
            hash: commit.hash,
            parents: commit.parents,
            branches: Array.from(commit.branches),
            timestamp: commit.timestamp,
            isMerge: commit.parents.length >= 2
        }));

        const dagLinks: Array<{ source: string; target: string }> = [];
        commits.forEach((commit, hash) => {
            commit.parents.forEach(parent => {
                dagLinks.push({
                    source: parent,
                    target: hash
                });
            });
        });

        return {
            branches: allBranches,
            merges: threeWayMerges,
            currentBranch,
            dag: {
                nodes: dagNodes,
                links: dagLinks
            }
        };
    }

    private async isAncestor(git: SimpleGit, ancestor: string, descendant: string): Promise<boolean> {
        if (!ancestor || !descendant) {
            return false;
        }
        try {
            await git.raw(['merge-base', '--is-ancestor', ancestor, descendant]);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取用于存储的仓库唯一标识（编码后的工作区路径）
     */
    private getRepoStorageId(): string {
        const root =
            this.workspaceRoot ||
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
            'default';
        return encodeURIComponent(root);
    }

    private getBranchGraphStorageKey(repoId: string, headHash: string): string {
        return `branchGraph:${repoId}:${headHash}`;
    }

    private getBranchGraphIndexKey(repoId: string): string {
        return `branchGraphIndex:${repoId}`;
    }

    private loadBranchGraphFromStorage(repoId: string, headHash: string): BranchGraphData | null {
        if (!this.storage || !repoId || !headHash) {
            return null;
        }
        return this.storage.get<BranchGraphData>(this.getBranchGraphStorageKey(repoId, headHash)) || null;
    }

    private async saveBranchGraphToStorage(repoId: string, headHash: string, data: BranchGraphData): Promise<void> {
        if (!this.storage || !repoId || !headHash) {
            return;
        }

        const storageKey = this.getBranchGraphStorageKey(repoId, headHash);
        await this.storage.update(storageKey, data);

        const indexKey = this.getBranchGraphIndexKey(repoId);
        const existingIndex = this.storage.get<string[]>(indexKey) || [];

        // 优化：限制索引大小，只保留最近的N个提交哈希
        // 这样可以避免索引无限增长，同时保持增量更新的有效性
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

    /**
     * 获取缓存数据
     */
    private getCached<T>(key: string): T | null {
        const item = this.cache.get(key);
        if (!item) {
            return null;
        }

        const now = Date.now();
        if (now - item.timestamp > item.ttl) {
            this.cache.delete(key);
            return null;
        }

        return item.data as T;
    }

    /**
     * 设置缓存（带大小限制）
     */
    private setCache<T>(key: string, data: T, ttl: number): void {
        // 如果缓存超过限制，删除最旧的项
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            const oldestKey = Array.from(this.cache.keys())[0];
            this.cache.delete(oldestKey);
            Logger.debug(`缓存已满，删除最旧项: ${oldestKey}`);
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }

    /**
     * 清除指定缓存
     */
    private invalidateCache(pattern?: string): void {
        if (!pattern) {
            this.cache.clear();
            return;
        }

        // 支持部分匹配清除
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * 清空分支图缓存（内存 + 持久化）
     */
    async clearBranchGraphCache(): Promise<void> {
        // 清除内存缓存
        this.invalidateCache('branchGraph');

        if (!this.storage) {
            return;
        }

        try {
            const repoId = this.getRepoStorageId();
            const indexKey = this.getBranchGraphIndexKey(repoId);
            const storedHashes = this.storage.get<string[]>(indexKey) || [];

            for (const hash of storedHashes) {
                await this.storage.update(this.getBranchGraphStorageKey(repoId, hash), undefined);
            }

            await this.storage.update(indexKey, []);
        } catch (error) {
            ErrorHandler.handleSilent(error, '清空分支图缓存');
        }
    }

    /**
     * 清除所有缓存（在Git操作后调用）
     */
    public invalidateAllCache(): void {
        this.cache.clear();
    }

    /**
     * 初始化Git实例
     */
    private initialize() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.workspaceRoot = workspaceFolders[0].uri.fsPath;
            this.git = simpleGit(this.workspaceRoot);
        }
    }

    /**
     * 重新初始化Git实例（用于工作区变化时）
     */
    reinitialize() {
        this.initialize();
    }

    /**
     * 确保Git已初始化
     */
    private ensureGit(): SimpleGit {
        if (!this.git) {
            this.initialize();
            if (!this.git) {
                throw new Error('无法初始化Git，请确保工作区包含Git仓库');
            }
        }
        return this.git;
    }

    /**
     * 获取仓库状态（带缓存）
     */
    async getStatus(forceRefresh: boolean = false): Promise<StatusResult> {
        const cacheKey = 'status';

        if (!forceRefresh) {
            const cached = this.getCached<StatusResult>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const git = this.ensureGit();
        const result = await git.status();
        this.setCache(cacheKey, result, this.CACHE_TTL.status);
        return result;
    }

    /**
     * 推送到远程仓库
     */
    async push(remote: string = 'origin', branch?: string): Promise<void> {
        const git = this.ensureGit();
        if (!branch) {
            const status = await git.status();
            branch = status.current || 'main';
        }
        await git.push(remote, branch);
    }

    /**
     * 从远程仓库拉取
     */
    async pull(remote: string = 'origin', branch?: string): Promise<void> {
        const git = this.ensureGit();
        await git.pull(remote, branch);
    }

    /**
     * 克隆仓库
     */
    async clone(repoUrl: string, targetPath: string): Promise<void> {
        const git = simpleGit();
        await git.clone(repoUrl, targetPath);
    }

    /**
     * 在当前工作区克隆仓库
     * 适用于用户已经打开空文件夹但尚未初始化Git的场景
     */
    async cloneIntoWorkspace(repoUrl: string): Promise<void> {
        if (!this.workspaceRoot) {
            throw new Error('无法获取工作区根目录');
        }

        // 在当前工作区执行 `git clone <repo> .`
        const git = simpleGit(this.workspaceRoot);
        await git.clone(repoUrl, '.');

        // 克隆完成后重新初始化 simple-git 实例
        this.git = simpleGit(this.workspaceRoot);
    }

    /**
     * 获取分支列表（带缓存）
     */
    async getBranches(forceRefresh: boolean = false): Promise<BranchSummary> {
        const cacheKey = 'branches';

        if (!forceRefresh) {
            const cached = this.getCached<BranchSummary>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const git = this.ensureGit();
        const result = await git.branch();
        this.setCache(cacheKey, result, this.CACHE_TTL.branches);
        return result;
    }

    /**
     * 创建分支
     */
    async createBranch(branchName: string, checkout: boolean = false, startPoint?: string): Promise<void> {
        const git = this.ensureGit();
        // 在创建新分支前，先记录当前分支
        const status = await this.getStatus(true); // 强制刷新状态
        const previousBranch = status.current;

        if (startPoint) {
            // 从指定提交创建分支
            await git.raw(['checkout', '-b', branchName, startPoint]);
        } else {
            await git.checkoutLocalBranch(branchName);
        }

        // 清除相关缓存
        this.invalidateCache('branches');
        this.invalidateCache('status');

        if (!checkout && previousBranch) {
            // 切换回原分支（优先使用之前记录的分支）
            await git.checkout(previousBranch);
            this.invalidateCache('status');
        }
    }

    /**
     * 切换分支
     */
    async checkout(branchName: string): Promise<void> {
        const git = this.ensureGit();
        await git.checkout(branchName);

        // 清除相关缓存
        this.invalidateCache('branches');
        this.invalidateCache('status');
        this.invalidateCache('log');
    }

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

    private async recordMergeHistory(fromBranch: string, toBranch: string | null, type: 'three-way' | 'fast-forward') {
        if (!toBranch) {
            return;
        }
        try {
            const git = this.ensureGit();
            const commitHash = (await git.raw(['rev-parse', toBranch])).trim();
            if (!commitHash) {
                return;
            }
            MergeHistory.recordMerge({
                from: fromBranch,
                to: toBranch,
                commit: commitHash,
                type,
                description: `${type === 'fast-forward' ? '快速合并' : '三路合并'}：${fromBranch} → ${toBranch}`
            });
        } catch (error) {
            ErrorHandler.handleSilent(error, '记录合并历史');
        }
    }

    /**
     * 删除分支
     */
    async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
        const git = this.ensureGit();
        await git.deleteLocalBranch(branchName, force);

        // 清除相关缓存
        this.invalidateCache('branches');
    }

    /**
     * 判断指定分支是否已经合并到当前分支（用于安全删除提示）
     * 等价于判断该分支是否出现在 `git branch --merged` 列表中
     */
    async isBranchMergedIntoCurrent(branchName: string): Promise<boolean> {
        try {
            const git = this.ensureGit();
            const output = await git.raw(['branch', '--merged']);
            if (!output || !output.trim()) {
                return false;
            }

            const mergedBranches = output
                .split('\n')
                .map(line => line.replace('*', '').trim())
                .filter(Boolean);

            return mergedBranches.includes(branchName);
        } catch (error) {
            ErrorHandler.handleSilent(error, '检查分支是否已合并');
            // 出错时返回 false，让上层用更保守的提示逻辑
            return false;
        }
    }

    /**
     * 重命名当前分支
     */
    async renameCurrentBranch(newName: string): Promise<void> {
        const git = this.ensureGit();
        await git.raw(['branch', '-m', newName]);

        // 清除相关缓存
        this.invalidateCache('branches');
        this.invalidateCache('status');
    }

    /**
     * 重命名指定分支
     */
    async renameBranch(oldName: string, newName: string): Promise<void> {
        const git = this.ensureGit();
        await git.raw(['branch', '-m', oldName, newName]);

        // 清除相关缓存
        this.invalidateCache('branches');
    }

    /**
     * 暂存更改
     */
    async stash(message?: string): Promise<void> {
        const git = this.ensureGit();
        if (message) {
            await git.stash(['push', '-m', message]);
        } else {
            await git.stash();
        }
    }

    /**
     * 恢复暂存
     */
    async stashPop(): Promise<void> {
        const git = this.ensureGit();
        await git.stash(['pop']);
    }

    /**
     * 取消暂存指定文件（默认全部）
     */
    async unstage(files?: string | string[]): Promise<void> {
        const git = this.ensureGit();
        if (files) {
            const targets = Array.isArray(files) ? files : [files];
            await git.raw(['reset', 'HEAD', '--', ...targets]);
        } else {
            await git.raw(['reset', 'HEAD']);
        }
    }

    /**
     * 放弃指定文件的更改（默认全部）
     */
    async discardChanges(files?: string | string[]): Promise<void> {
        const git = this.ensureGit();
        if (files) {
            const targets = Array.isArray(files) ? files : [files];
            await git.checkout(['--', ...targets]);
        } else {
            await git.checkout(['--', '.']);
        }
    }

    /**
     * 提交所有已暂存更改
     */
    async commit(message: string): Promise<void> {
        const git = this.ensureGit();
        await git.commit(message);
    }

    /**
     * 提交所有已跟踪的更改（等同 git commit -a）
     */
    async commitTrackedChanges(message: string): Promise<void> {
        const git = this.ensureGit();
        await git.raw(['commit', '-am', message]);
    }

    /**
     * 软重置到指定提交
     */
    async resetSoft(ref: string): Promise<void> {
        const git = this.ensureGit();
        await git.reset(['--soft', ref]);
    }

    /**
     * 获取提交历史（带缓存）
     * @param maxCount 最大提交数量
     * @param commitHash 可选：指定提交哈希，只返回该提交
     * @param forceRefresh 是否强制刷新
     */
    async getLog(maxCount: number = 100, commitHash?: string, forceRefresh: boolean = false): Promise<LogResult> {
        const cacheKey = `log:${maxCount}:${commitHash || 'all'}`;

        if (!forceRefresh && !commitHash) {
            const cached = this.getCached<LogResult>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const git = this.ensureGit();

        if (commitHash) {
            // 查询特定提交（直接指定提交哈希，避免范围错误导致总是返回最近提交）
            // 部分 simple-git 版本的类型未暴露 options + customArgs 的 Promise 重载，这里做一次显式转换
            const result = await (git.log as unknown as (options: any, customArgs?: string[]) => Promise<LogResult>)(
                { maxCount: 1 },
                [commitHash]
            );
            return result;
        } else {
            const result = await git.log({ maxCount });
            this.setCache(cacheKey, result, this.CACHE_TTL.log);
            return result;
        }
    }

    /**
     * 添加文件到暂存区
     */
    async add(files: string | string[]): Promise<void> {
        const git = this.ensureGit();
        await git.add(files);
    }

    /**
     * 获取冲突文件
     */
    async getConflicts(): Promise<string[]> {
        const git = this.ensureGit();
        const status = await git.status();
        return status.conflicted;
    }

    /**
     * 获取文件差异
     */
    async getDiff(file?: string): Promise<string> {
        const git = this.ensureGit();
        if (file) {
            return await git.diff([file]);
        }
        return await git.diff();
    }

    /**
     * 获取一组提交的详细信息（用于前端按需补齐缺失的 message/author）
     */
    async getCommitDetails(hashes: string[]): Promise<Record<string, CommitInfo>> {
        const git = this.ensureGit();
        const result: Record<string, CommitInfo> = {};

        for (const hash of hashes) {
            if (!hash) continue;
            if (this.failedCommitDetails.has(hash)) {
                continue;
            }
            try {
                const show = await git.raw([
                    'log',
                    '-1',
                    '--format=%H%x00%P%x00%an%x00%ae%x00%ad%x00%B',
                    hash
                ]);
                const parts = show.split('\x00');
                const h = parts[0]?.trim() || hash;
                const parentsRaw = parts[1] || '';
                const an = parts[2]?.trim() || '';
                const ae = parts[3]?.trim() || '';
                const ad = parts[4] || '';
                const body = (parts.slice(5).join('\x00') || '').trim();
                result[hash] = {
                    hash: h,
                    author_name: an,
                    author_email: ae,
                    date: ad ? new Date(ad).toISOString() : '',
                    message: body,
                    body,
                    parents: parentsRaw ? parentsRaw.split(/\s+/).filter(Boolean) : [],
                    branches: []
                };
            } catch (error) {
                this.failedCommitDetails.add(hash);
                ErrorHandler.handleSilent(error, `获取提交详情失败: ${hash.substring(0, 8)}`);
                continue;
            }
        }

        return result;
    }

    /**
     * 获取提交的文件变更列表（包含增删统计）
     */
    async getCommitFiles(commitHash: string): Promise<CommitFileChange[]> {
        if (!commitHash) {
            return [];
        }

        const git = this.ensureGit();

        try {
            const [statusOutput, statsOutput] = await Promise.all([
                git.raw(['show', '--name-status', '--format=', commitHash]),
                git.raw(['show', '--numstat', '--format=', commitHash])
            ]);

            const statusMap = new Map<string, string>();
            statusOutput.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) {
                    return;
                }
                const parts = trimmed.split('\t').filter(Boolean);
                if (parts.length === 0) {
                    return;
                }
                const status = parts[0];
                const path = parts.length > 2 && status.startsWith('R')
                    ? parts[2]
                    : parts[1] || '';
                if (path) {
                    statusMap.set(path.replace(/\\/g, '/'), status);
                }
            });

            const statsMap = new Map<string, { additions?: number; deletions?: number }>();
            statsOutput.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) {
                    return;
                }
                const parts = trimmed.split('\t');
                if (parts.length < 3) {
                    return;
                }
                const add = parseInt(parts[0], 10);
                const del = parseInt(parts[1], 10);
                let path = parts.slice(2).join('\t').trim();
                if (path.includes(' => ')) {
                    path = path.split(' => ').pop() || path;
                }
                path = path.replace(/\"/g, '').replace(/\\/g, '/');
                statsMap.set(path, {
                    additions: isNaN(add) ? undefined : add,
                    deletions: isNaN(del) ? undefined : del
                });
            });

            const allPaths = new Set<string>([...statusMap.keys(), ...statsMap.keys()]);
            const files: CommitFileChange[] = [];
            allPaths.forEach(p => {
                if (!p) return;
                const stats = statsMap.get(p);
                const additions = stats?.additions;
                const deletions = stats?.deletions;
                files.push({
                    path: p,
                    status: statusMap.get(p) || 'M',
                    additions,
                    deletions,
                    changes: typeof additions === 'number' && typeof deletions === 'number'
                        ? additions + deletions
                        : undefined
                });
            });

            return files.sort((a, b) => a.path.localeCompare(b.path));
        } catch (error) {
            ErrorHandler.handleSilent(error, '获取提交文件列表');
            return [];
        }
    }

    /**
     * 为指定提交生成补丁文本（格式同 git format-patch）
     */
    async createPatchFromCommit(commitHash: string): Promise<string> {
        if (!commitHash) {
            throw new Error('提交哈希不能为空');
        }

        const git = this.ensureGit();
        try {
            return await git.raw(['format-patch', '-1', commitHash, '--stdout']);
        } catch (error) {
            ErrorHandler.handle(error, '生成提交补丁');
            throw error;
        }
    }

    /**
     * 获取远程仓库列表（带缓存）
     */
    async getRemotes(forceRefresh: boolean = false): Promise<RemoteInfo[]> {
        const cacheKey = 'remotes';

        if (!forceRefresh) {
            const cached = this.getCached<RemoteInfo[]>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const git = this.ensureGit();
        const result = await git.getRemotes(true);
        // 转换为 RemoteInfo 类型
        const remotes: RemoteInfo[] = result.map((remote: { name: string; refs?: { fetch?: string; push?: string } }) => ({
            name: remote.name,
            refs: {
                fetch: remote.refs?.fetch,
                push: remote.refs?.push
            }
        }));
        this.setCache(cacheKey, remotes, this.CACHE_TTL.remotes);
        return remotes;
    }

    /**
     * 获取当前分支
     */
    async getCurrentBranch(): Promise<string | null> {
        const git = this.ensureGit();
        const status = await git.status();
        return status.current;
    }

    /**
     * 检查是否是Git仓库
     */
    async isRepository(): Promise<boolean> {
        try {
            const git = this.ensureGit();
            await git.status();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取工作区根目录
     */
    getWorkspaceRoot(): string | undefined {
        return this.workspaceRoot;
    }

    /**
     * 初始化Git仓库
     */
    async initRepository(): Promise<void> {
        if (!this.workspaceRoot) {
            throw new Error('无法获取工作区根目录');
        }
        const git = simpleGit(this.workspaceRoot);
        // 使用 -b main 参数直接创建 main 分支，而不是默认的 master
        await git.raw(['init', '-b', 'main']);
        // 重新初始化git实例
        this.git = simpleGit(this.workspaceRoot);
    }

    /**
     * 添加远程仓库
     */
    async addRemote(name: string, url: string): Promise<void> {
        const git = this.ensureGit();
        await git.addRemote(name, url);
        // 清除远程仓库缓存，确保下次获取最新数据
        this.invalidateCache('remotes');
    }

    /**
     * 移除远程仓库
     */
    async removeRemote(name: string): Promise<void> {
        const git = this.ensureGit();
        await git.removeRemote(name);
        // 清除远程仓库缓存，确保下次获取最新数据
        this.invalidateCache('remotes');
    }

    /**
     * 重命名远程仓库
     */
    async renameRemote(oldName: string, newName: string): Promise<void> {
        const git = this.ensureGit();
        await git.raw(['remote', 'rename', oldName, newName]);
        // 清除远程仓库缓存，确保下次获取最新数据
        this.invalidateCache('remotes');
    }

    /**
     * 更新远程仓库地址（同时更新 fetch/push）
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

    /**
     * 添加所有文件到暂存区
     */
    async addAll(): Promise<void> {
        const git = this.ensureGit();
        await git.add('.');
    }

    /**
     * 推送到远程仓库（带上游设置）
     */
    async pushSetUpstream(remote: string = 'origin', branch?: string): Promise<void> {
        const git = this.ensureGit();
        if (!branch) {
            const status = await git.status();
            branch = status.current || 'main';
        }
        await git.push(['-u', remote, branch]);
    }

    /**
     * 获取文件修改统计（用于热力图）
     */
    async getFileStats(days: number = 365): Promise<Map<string, number>> {
        const cacheKey = `fileStats:${days}`;
        const cached = this.getCached<Map<string, number>>(cacheKey);
        if (cached) {
            return cached;
        }

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

        this.setCache(cacheKey, fileStats, this.CACHE_TTL.fileStats);
        return fileStats;
    }

    /**
     * 获取贡献者活跃度统计
     */
    async getContributorStats(days: number = 365): Promise<Map<string, { commits: number; files: Set<string> }>> {
        const cacheKey = `contributorStats:${days}`;
        const cached = this.getCached<Map<string, { commits: number; files: Set<string> }>>(cacheKey);
        if (cached) {
            return cached;
        }

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

        this.setCache(cacheKey, contributorStats, this.CACHE_TTL.contributorStats);
        return contributorStats;
    }

    /**
     * 获取分支关系图数据
     * 完全基于提交及其 parent 关系构建，不进行推断
     */
    async getBranchGraph(forceRefresh: boolean = false): Promise<BranchGraphData> {
        const cacheKey = 'branchGraph';

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

        if (!forceRefresh && headHash) {
            const persisted = this.loadBranchGraphFromStorage(repoId, headHash);
            if (persisted) {
                this.setCache(cacheKey, persisted, this.CACHE_TTL.branchGraph);
                return persisted;
            }
        }

        if (!forceRefresh && headHash) {
            const incrementalGraph = await this.tryBuildIncrementalBranchGraph(git, repoId, headHash);
            if (incrementalGraph) {
                this.setCache(cacheKey, incrementalGraph, this.CACHE_TTL.branchGraph);
                await this.saveBranchGraphToStorage(repoId, headHash, incrementalGraph);
                return incrementalGraph;
            }
        }

        const fullGraph = await this.buildFullBranchGraph(git);
        this.setCache(cacheKey, fullGraph, this.CACHE_TTL.branchGraph);
        if (headHash) {
            await this.saveBranchGraphToStorage(repoId, headHash, fullGraph);
        }
        return fullGraph;
    }

    async getBranchGraphSnapshot(): Promise<BranchGraphData | null> {
        const cacheKey = 'branchGraph';
        const cached = this.getCached<BranchGraphData>(cacheKey);
        if (cached) {
            return cached;
        }

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

    /**
     * 获取按日期分组的提交统计（用于时间线）
     */
    async getCommitTimeline(days: number = 365): Promise<Map<string, number>> {
        const cacheKey = `timeline:${days}`;
        const cached = this.getCached<Map<string, number>>(cacheKey);
        if (cached) {
            return cached;
        }

        const git = this.ensureGit();
        const timeline = new Map<string, number>();

        try {
            // 计算起始日期（days 天前），交给 git 进行过滤，避免在 JS 中遍历过多历史
            const since = new Date();
            since.setDate(since.getDate() - days);
            since.setHours(0, 0, 0, 0);

            const log = await git.log({
                '--since': since.toISOString(),
                maxCount: 5000
            });

            log.all.forEach(commit => {
                const commitDate = new Date(commit.date);
                const year = commitDate.getFullYear();
                const month = String(commitDate.getMonth() + 1).padStart(2, '0');
                const day = String(commitDate.getDate()).padStart(2, '0');
                const dateKey = `${year}-${month}-${day}`;
                const count = timeline.get(dateKey) || 0;
                timeline.set(dateKey, count + 1);
            });
        } catch (error) {
            // 如果无法获取，返回空Map
            ErrorHandler.handleSilent(error, '获取提交时间线');
        }

        this.setCache(cacheKey, timeline, this.CACHE_TTL.timeline);
        return timeline;
    }

    /**
     * 获取详细的提交历史（包含文件变更信息）
     */
    async getDetailedLog(maxCount: number = 100): Promise<LogResult> {
        const git = this.ensureGit();
        try {
            const log = await git.log({ maxCount, '--stat': null });
            return log;
        } catch (error) {
            return { all: [], total: 0, latest: null };
        }
    }

    /**
     * 获取所有标签列表（带缓存）
     */
    async getTags(forceRefresh: boolean = false): Promise<TagInfo[]> {
        const cacheKey = 'tags';

        if (!forceRefresh) {
            const cached = this.getCached<TagInfo[]>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const git = this.ensureGit();
        try {
            const tagsOutput = await git.raw([
                'for-each-ref',
                'refs/tags',
                '--sort=-creatordate',
                '--format=%(refname:short)|%(objectname)|%(objecttype)|%(contents:subject)|%(creatordate:iso)'
            ]);

            if (!tagsOutput || !tagsOutput.trim()) {
                return [];
            }

            const tags: TagInfo[] = tagsOutput
                .trim()
                .split('\n')
                .filter(line => !!line.trim())
                .map((line) => {
                    const [name, objectName, objectType, subject, date] = line.split('|');
                    const cleanMessage = subject?.trim();
                    const isAnnotated = (objectType || '').trim() === 'tag';
                    const tagName = name?.trim() || '';
                    const tagCommit = (objectName || '').trim();
                    if (!tagName || !tagCommit) {
                        return null;
                    }
                    return {
                        name: tagName,
                        commit: tagCommit,
                        message: isAnnotated && cleanMessage ? cleanMessage : undefined,
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

    /**
     * 获取指定远程仓库的标签列表（带缓存）
     */
    async getRemoteTags(remote: string, forceRefresh: boolean = false): Promise<Array<{ name: string; commit: string }>> {
        const cacheKey = `remoteTags:${remote}`;

        if (!forceRefresh) {
            const cached = this.getCached<Array<{ name: string; commit: string }>>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const git = this.ensureGit();
        try {
            const output = await git.raw(['ls-remote', '--tags', remote]);
            if (!output || !output.trim()) {
                return [];
            }

            const tagsMap = new Map<string, string>();
            output
                .trim()
                .split('\n')
                .forEach(line => {
                    const [hash, ref] = line.trim().split('\t');
                    if (!hash || !ref) {
                        return;
                    }
                    const cleanRef = ref.replace('^{}', '');
                    const match = cleanRef.match(/refs\/tags\/(.+)$/);
                    if (!match) {
                        return;
                    }
                    const tagName = match[1];
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

    /**
     * 创建标签（轻量级或带注释）
     */
    async createTag(tagName: string, message?: string, commit?: string): Promise<void> {
        const git = this.ensureGit();
        if (message) {
            // 带注释的标签
            if (commit) {
                // 使用 raw 方法创建指向特定提交的带注释标签
                await git.raw(['tag', '-a', tagName, '-m', message, commit]);
            } else {
                await git.addAnnotatedTag(tagName, message);
            }
        } else {
            // 轻量级标签
            if (commit) {
                // 使用 raw 方法创建指向特定提交的轻量级标签
                await git.raw(['tag', tagName, commit]);
            } else {
                await git.addTag(tagName);
            }
        }

        // 清除相关缓存
        this.invalidateCache('tags');
    }

    /**
     * 删除标签
     */
    async deleteTag(tagName: string): Promise<void> {
        const git = this.ensureGit();
        await git.tag(['-d', tagName]);

        // 清除相关缓存
        this.invalidateCache('tags');
    }

    /**
     * 检查远程标签是否存在
     */
    async remoteTagExists(tagName: string, remote: string = 'origin'): Promise<boolean> {
        const git = this.ensureGit();
        try {
            // 先获取远程标签列表
            const remoteTags = await git.raw(['ls-remote', '--tags', remote, tagName]);
            return remoteTags.trim().length > 0;
        } catch (error) {
            // 如果获取失败，假设不存在（可能是网络问题）
            return false;
        }
    }

    /**
     * 推送单个标签到远程仓库
     * @param tagName 标签名称
     * @param remote 远程仓库名称
     * @param force 是否强制推送（覆盖远程已存在的标签）
     */
    async pushTag(tagName: string, remote: string = 'origin', force: boolean = false): Promise<void> {
        const git = this.ensureGit();
        const pushArgs = force ? ['--force'] : [];
        await git.push(remote, `refs/tags/${tagName}:refs/tags/${tagName}`, pushArgs);

        // 清除远程标签缓存（推送后远程标签列表已变化）
        this.invalidateCache(`remoteTags:${remote}`);
    }

    /**
     * 推送所有标签到远程仓库
     */
    async pushAllTags(remote: string = 'origin'): Promise<void> {
        const git = this.ensureGit();
        await git.pushTags(remote);

        // 清除远程标签缓存（推送后远程标签列表已变化）
        this.invalidateCache(`remoteTags:${remote}`);
    }

    /**
     * 删除远程标签
     */
    async deleteRemoteTag(tagName: string, remote: string = 'origin'): Promise<void> {
        const git = this.ensureGit();
        await git.push([remote, '--delete', tagName]);

        // 清除远程标签缓存（删除后远程标签列表已变化）
        this.invalidateCache(`remoteTags:${remote}`);
    }

    /**
     * 回滚提交
     */
    async revert(commitHash: string): Promise<void> {
        const git = this.ensureGit();
        // 使用 raw 方法执行 git revert 命令（simple-git 的 revert 方法不接受数组参数）
        await git.raw(['revert', '--no-edit', commitHash]);
        // 清除相关缓存
        this.invalidateCache('log');
        this.invalidateCache('status');
    }

    /**
     * 拣选提交
     */
    async cherryPick(commitHash: string): Promise<void> {
        const git = this.ensureGit();
        await git.raw(['cherry-pick', commitHash]);
        // 清除相关缓存
        this.invalidateCache('log');
        this.invalidateCache('status');
    }
}

