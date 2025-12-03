import * as vscode from 'vscode';
import simpleGit, { SimpleGit, StatusResult, BranchSummary, LogResult } from 'simple-git';
import { MergeHistory } from '../utils/merge-history';

/**
 * 缓存项接口
 */
interface CacheItem<T> {
    data: T;
    timestamp: number;
    ttl: number; // 缓存有效期（毫秒）
}

/**
 * 分支视图 DAG 结构
 */
interface BranchGraphDag {
    nodes: Array<{
        hash: string;
        parents: string[];
        branches: string[];
        timestamp: number;
        isMerge: boolean;
    }>;
    links: Array<{
        source: string;
        target: string;
    }>;
}

/**
 * 分支视图整体数据
 */
export interface BranchGraphData {
    branches: string[];
    merges: Array<{ from: string; to: string; commit: string; type: 'three-way' | 'fast-forward'; description?: string; timestamp?: number }>;
    currentBranch?: string;
    dag?: BranchGraphDag;
}

interface CommitNodeInfo {
    hash: string;
    parents: string[];
    timestamp: number;
    branches: Set<string>;
}

/**
 * Git服务类 - 封装所有Git操作
 */
export class GitService {
    private git: SimpleGit | null = null;
    private workspaceRoot: string | undefined;

    // 缓存存储（内存级）
    private cache: Map<string, CacheItem<unknown>> = new Map();

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
    };

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
            console.error('Error getting branch graph:', error);
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

        for (let i = storedHashes.length - 1; i >= 0; i--) {
            const candidate = storedHashes[i];
            if (!candidate || candidate === headHash) {
                continue;
            }
            const baseGraph = this.loadBranchGraphFromStorage(repoId, candidate);
            if (!baseGraph || !baseGraph.dag) {
                continue;
            }
            const ancestor = await this.isAncestor(git, candidate, headHash);
            if (!ancestor) {
                continue;
            }
            const incremental = await this.buildBranchGraphIncrementally(git, baseGraph, candidate, headHash);
            if (incremental) {
                return incremental;
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
            console.warn('增量获取分支图失败:', error);
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
            console.warn('读取合并历史失败:', error);
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
        if (!existingIndex.includes(headHash)) {
            await this.storage.update(indexKey, [...existingIndex, headHash]);
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
     * 设置缓存
     */
    private setCache<T>(key: string, data: T, ttl: number): void {
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
            console.warn('清空分支图缓存失败:', error);
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
            console.warn('检查快进合并失败:', error);
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
                console.warn('计算分支差异失败:', error);
            }

            return {
                canFastForward,
                commitsAhead,
                commitsBehind,
                hasDiverged
            };
        } catch (error) {
            console.warn('获取分支合并信息失败:', error);
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
            } catch (error: any) {
                // 某些环境可能不支持 --no-ff，退回普通合并
                if (error?.message?.includes('--no-ff')) {
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
            console.warn('记录合并历史失败:', error);
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
            console.warn('检查分支是否已合并失败:', error);
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
     */
    async getLog(maxCount: number = 100, forceRefresh: boolean = false): Promise<LogResult> {
        const cacheKey = `log:${maxCount}`;

        if (!forceRefresh) {
            const cached = this.getCached<LogResult>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const git = this.ensureGit();
        const result = await git.log({ maxCount });
        this.setCache(cacheKey, result, this.CACHE_TTL.log);
        return result;
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
     * 获取远程仓库列表（带缓存）
     */
    async getRemotes(forceRefresh: boolean = false): Promise<any[]> {
        const cacheKey = 'remotes';

        if (!forceRefresh) {
            const cached = this.getCached<any[]>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const git = this.ensureGit();
        const result = await git.getRemotes(true);
        this.setCache(cacheKey, result, this.CACHE_TTL.remotes);
        return result;
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
            console.error('Error getting file stats:', error);
        }

        return fileStats;
    }

    /**
     * 获取贡献者活跃度统计
     */
    async getContributorStats(days: number = 365): Promise<Map<string, { commits: number; files: Set<string> }>> {
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
            console.error('Error getting contributor stats:', error);
        }

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
                // 只统计在日期范围内的提交
                if (commitDate >= cutoffDate) {
                    // 使用本地时区格式化日期，确保今天的提交能被正确识别
                    const year = commitDate.getFullYear();
                    const month = String(commitDate.getMonth() + 1).padStart(2, '0');
                    const day = String(commitDate.getDate()).padStart(2, '0');
                    const dateKey = `${year}-${month}-${day}`;
                    const count = timeline.get(dateKey) || 0;
                    timeline.set(dateKey, count + 1);
                }
            });
        } catch (error) {
            // 如果无法获取，返回空Map
            console.error('Error getting commit timeline:', error);
        }

        return timeline;
    }

    /**
     * 获取详细的提交历史（包含文件变更信息）
     */
    async getDetailedLog(maxCount: number = 100): Promise<any> {
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
    async getTags(forceRefresh: boolean = false): Promise<Array<{ name: string; commit: string; message?: string; date?: string }>> {
        const cacheKey = 'tags';

        if (!forceRefresh) {
            const cached = this.getCached<Array<{ name: string; commit: string; message?: string; date?: string }>>(cacheKey);
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

            const tags = tagsOutput
                .trim()
                .split('\n')
                .filter(line => !!line.trim())
                .map((line) => {
                    const [name, objectName, objectType, subject, date] = line.split('|');
                    const cleanMessage = subject?.trim();
                    const isAnnotated = (objectType || '').trim() === 'tag';
                    return {
                        name: name?.trim() || '',
                        commit: (objectName || '').trim(),
                        message: isAnnotated && cleanMessage ? cleanMessage : undefined,
                        date: date?.trim() || undefined
                    };
                })
                .filter(tag => tag.name && tag.commit);

            // 缓存结果
            this.setCache(cacheKey, tags, this.CACHE_TTL.tags);
            return tags;
        } catch (error) {
            console.error('Error getting tags:', error);
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
            console.error(`Error getting remote tags for ${remote}:`, error);
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
}

