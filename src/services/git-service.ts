import * as vscode from 'vscode';
import simpleGit, { SimpleGit, StatusResult, BranchSummary, LogResult } from 'simple-git';
import * as path from 'path';
import { MergeHistory } from '../utils/merge-history';

/**
 * Git服务类 - 封装所有Git操作
 */
export class GitService {
    private git: SimpleGit | null = null;
    private workspaceRoot: string | undefined;

    constructor() {
        this.initialize();
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
     * 获取仓库状态
     */
    async getStatus(): Promise<StatusResult> {
        const git = this.ensureGit();
        return await git.status();
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
     * 获取分支列表
     */
    async getBranches(): Promise<BranchSummary> {
        const git = this.ensureGit();
        return await git.branch();
    }

    /**
     * 创建分支
     */
    async createBranch(branchName: string, checkout: boolean = false): Promise<void> {
        const git = this.ensureGit();
        // 在创建新分支前，先记录当前分支
        const status = await git.status();
        const previousBranch = status.current;

        await git.checkoutLocalBranch(branchName);

        if (!checkout && previousBranch) {
            // 切换回原分支（优先使用之前记录的分支）
            await git.checkout(previousBranch);
        }
    }

    /**
     * 切换分支
     */
    async checkout(branchName: string): Promise<void> {
        const git = this.ensureGit();
        await git.checkout(branchName);
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
            const branchInfo = await git.branch();
            targetBranch = branchInfo.current || null;
        } catch {
            targetBranch = null;
        }

        if (strategy === 'fast-forward') {
            // 仅允许快进，保持线性历史
            await git.merge([branchName, '--ff-only']);
            await this.recordMergeHistory(branchName, targetBranch, 'fast-forward');
            return;
        }

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
    }

    /**
     * 重命名当前分支
     */
    async renameCurrentBranch(newName: string): Promise<void> {
        const git = this.ensureGit();
        await git.raw(['branch', '-m', newName]);
    }

    /**
     * 重命名指定分支
     */
    async renameBranch(oldName: string, newName: string): Promise<void> {
        const git = this.ensureGit();
        await git.raw(['branch', '-m', oldName, newName]);
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
     * 获取提交历史
     */
    async getLog(maxCount: number = 100): Promise<LogResult> {
        const git = this.ensureGit();
        return await git.log({ maxCount });
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
     * 获取远程仓库列表
     */
    async getRemotes(): Promise<any[]> {
        const git = this.ensureGit();
        return await git.getRemotes(true);
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
    }

    /**
     * 移除远程仓库
     */
    async removeRemote(name: string): Promise<void> {
        const git = this.ensureGit();
        await git.removeRemote(name);
    }

    /**
     * 重命名远程仓库
     */
    async renameRemote(oldName: string, newName: string): Promise<void> {
        const git = this.ensureGit();
        await git.raw(['remote', 'rename', oldName, newName]);
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
    async getBranchGraph(): Promise<{
        branches: string[];
        merges: Array<{ from: string; to: string; commit: string; type: 'three-way' | 'fast-forward'; description?: string; timestamp?: number }>;
        currentBranch?: string;
        dag?: {
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
        };
    }> {
        const git = this.ensureGit();
        const merges: Array<{ from: string; to: string; commit: string; type: 'three-way' | 'fast-forward'; description?: string; timestamp?: number }> = [];

        try {
            // 获取所有分支
            const branches = await git.branch();
            const allBranches = branches.all.filter(b => !b.startsWith('remotes/')); // 只使用本地分支
            const currentBranch = branches.current || 'main';

            // ========== 第一步：使用 git log --format="%H %P %D" 一次性获取结构化数据 ==========
            // 使用 --all 获取所有分支，--topo-order 保证拓扑顺序，--date-order 按日期排序
            // %H = 完整哈希，%P = 父提交（空格分隔），%D = 引用（分支/标签），%ct = 时间戳
            // 使用 null 字符 (\x00) 作为分隔符，避免与空格冲突
            const logOutput = await git.raw([
                'log',
                '--all',
                '--topo-order',
                '--date-order',
                '--format=%H%x00%P%x00%D%x00%ct',
                '--decorate=full'
            ]);

            interface CommitNode {
                hash: string;
                parents: string[];
                timestamp: number;
                branches: Set<string>; // 包含这个提交的分支（从 refs/heads/ 提取）
                refs: string[]; // 完整的引用列表
            }

            const commits = new Map<string, CommitNode>();
            const branchHeads = new Map<string, string>(); // 分支名 -> HEAD 提交哈希

            // 解析日志输出（使用 null 字符分隔）
            const logLines = logOutput.trim().split('\n').filter(line => line.trim());
            for (const line of logLines) {
                const parts = line.split('\x00');
                if (parts.length < 4) continue;

                const hash = parts[0].trim();
                const parentStr = parts[1].trim();
                const refStr = parts[2].trim();
                const timestampStr = parts[3].trim();

                // 解析父提交（可能有多个，空格分隔）
                const parents = parentStr ? parentStr.split(/\s+/).filter(p => p.trim()) : [];

                // 解析引用（可能有多个，逗号分隔）
                const refs = refStr ? refStr.split(',').map(r => r.trim()).filter(r => r) : [];

                // 提取分支名（从 refs/heads/ 开头的引用中提取）
                const branchNames = refs
                    .filter(r => r.startsWith('refs/heads/'))
                    .map(r => r.replace('refs/heads/', ''));

                // 解析时间戳
                const timestamp = timestampStr ? parseInt(timestampStr, 10) * 1000 : Date.now();

                // 创建或更新提交节点
                if (!commits.has(hash)) {
                    commits.set(hash, {
                        hash,
                        parents,
                        timestamp,
                        branches: new Set(branchNames),
                        refs
                    });
                } else {
                    // 如果已存在，合并分支信息
                    branchNames.forEach(branch => commits.get(hash)!.branches.add(branch));
                    commits.get(hash)!.refs = [...new Set([...commits.get(hash)!.refs, ...refs])];
                }

                // 记录分支的 HEAD（每个分支的第一个提交就是 HEAD）
                branchNames.forEach(branch => {
                    if (!branchHeads.has(branch)) {
                        branchHeads.set(branch, hash);
                    }
                });
            }

            // ========== 第二步：识别三路合并（有多个 parent 的提交）==========
            for (const [commitHash, commitNode] of commits.entries()) {
                // 合并提交有多个 parent
                if (commitNode.parents.length >= 2) {
                    const firstParent = commitNode.parents[0];
                    const secondParent = commitNode.parents[1];

                    // 获取每个 parent 所属的分支
                    const firstParentNode = commits.get(firstParent);
                    const secondParentNode = commits.get(secondParent);

                    if (!firstParentNode || !secondParentNode) {
                        continue; // parent 不在我们的提交图中
                    }

                    const firstParentBranches = firstParentNode.branches;
                    const secondParentBranches = secondParentNode.branches;

                    // 找出目标分支：包含合并提交，且包含第一个 parent 的分支
                    // 第一个 parent 通常是目标分支的 HEAD
                    const toBranchCandidates = Array.from(commitNode.branches).filter(branch =>
                        firstParentBranches.has(branch) && !secondParentBranches.has(branch)
                    );

                    // 找出被合并的分支：包含第二个 parent 但不包含第一个 parent 的分支
                    // 第二个 parent 是被合并分支的 HEAD
                    // 被合并的分支应该：
                    // 1. 包含第二个 parent（被合并分支的 HEAD）
                    // 2. 不包含第一个 parent（目标分支的 HEAD），或者虽然包含第一个 parent 但合并提交不属于它
                    const fromBranchCandidates = Array.from(secondParentBranches).filter(branch => {
                        // 如果分支包含第一个 parent，需要进一步判断
                        if (firstParentBranches.has(branch)) {
                            // 如果合并提交也属于这个分支，且它不是目标分支，那么它可能是被合并的分支
                            // 但这种情况比较少见，通常被合并的分支不应该包含第一个 parent
                            return commitNode.branches.has(branch) && !toBranchCandidates.includes(branch);
                        }
                        // 不包含第一个 parent 的分支，肯定是候选的被合并分支
                        return true;
                    });

                    // 调试日志（仅在开发模式下）
                    if (process.env.NODE_ENV === 'development' && commitHash) {
                        console.log(`[BranchGraph] 合并提交 ${commitHash.substring(0, 7)}:`, {
                            firstParent: firstParent.substring(0, 7),
                            secondParent: secondParent.substring(0, 7),
                            firstParentBranches: Array.from(firstParentBranches),
                            secondParentBranches: Array.from(secondParentBranches),
                            commitBranches: Array.from(commitNode.branches),
                            toBranchCandidates,
                            fromBranchCandidates
                        });
                    }

                    if (toBranchCandidates.length > 0 && fromBranchCandidates.length > 0) {
                        // 优先选择当前分支作为目标分支
                        const toBranch = toBranchCandidates.includes(currentBranch)
                            ? currentBranch
                            : toBranchCandidates[0];
                        const fromBranch = fromBranchCandidates[0];

                        if (fromBranch !== toBranch) {
                            const existingIndex = merges.findIndex(m =>
                                m.from === fromBranch && m.to === toBranch
                            );

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

            // ========== 第三步：合并历史中记录的关系（只保留三路合并）==========
            try {
                const recorded = MergeHistory.getHistory();
                for (const item of recorded) {
                    // 只处理三路合并，忽略快速合并
                    if (item.type !== 'three-way') {
                        continue;
                    }

                    if (!allBranches.includes(item.from) || !allBranches.includes(item.to)) {
                        continue;
                    }

                    const existingIndex = merges.findIndex(m => m.from === item.from && m.to === item.to);
                    if (existingIndex < 0) {
                        // 如果不存在，添加三路合并记录
                        merges.push(item);
                    }
                    // 如果已存在，保持现有的三路合并记录（不覆盖）
                }
            } catch (error) {
                console.warn('读取合并历史失败:', error);
            }

            // 过滤掉所有快速合并，只保留三路合并
            const threeWayMerges = merges.filter(m => m.type === 'three-way');

            // 再次获取分支列表（确保获取最新）
            const finalBranches = await git.branch();

            // 构建 DAG 数据用于可视化
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
                branches: finalBranches.all,
                merges: threeWayMerges,
                currentBranch: finalBranches.current,
                dag: {
                    nodes: dagNodes,
                    links: dagLinks
                }
            };
        } catch (error) {
            console.error('Error getting branch graph:', error);
            // 如果无法获取，返回空数组
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
     * 获取所有标签列表
     */
    async getTags(): Promise<Array<{ name: string; commit: string; message?: string; date?: string }>> {
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

            return tagsOutput
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
        } catch (error) {
            console.error('Error getting tags:', error);
            return [];
        }
    }

    /**
     * 获取指定远程仓库的标签列表
     */
    async getRemoteTags(remote: string): Promise<Array<{ name: string; commit: string }>> {
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

            return Array.from(tagsMap.entries()).map(([name, commit]) => ({ name, commit }));
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
    }

    /**
     * 删除标签
     */
    async deleteTag(tagName: string): Promise<void> {
        const git = this.ensureGit();
        await git.tag(['-d', tagName]);
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
    }

    /**
     * 推送所有标签到远程仓库
     */
    async pushAllTags(remote: string = 'origin'): Promise<void> {
        const git = this.ensureGit();
        await git.pushTags(remote);
    }

    /**
     * 删除远程标签
     */
    async deleteRemoteTag(tagName: string, remote: string = 'origin'): Promise<void> {
        const git = this.ensureGit();
        await git.push([remote, '--delete', tagName]);
    }
}

