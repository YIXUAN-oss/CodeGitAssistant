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
     * 提交更改
     */
    async commit(message: string): Promise<void> {
        const git = this.ensureGit();
        await git.commit(message);
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
     */
    async getBranchGraph(): Promise<{ branches: string[]; merges: Array<{ from: string; to: string; commit: string; type: 'three-way' | 'fast-forward'; description?: string; timestamp?: number }>; currentBranch?: string }> {
        const git = this.ensureGit();
        const merges: Array<{ from: string; to: string; commit: string; type: 'three-way' | 'fast-forward'; description?: string; timestamp?: number }> = [];

        try {
            // 获取所有分支
            const branches = await git.branch();
            const allBranches = branches.all.filter(b => !b.startsWith('remotes/')); // 只使用本地分支
            const currentBranch = branches.current || 'main';

            // 方法1: 检查合并提交（真正的合并，有多个父提交）
            try {
                const mergeLog = await git.log({
                    '--merges': null,
                    maxCount: 100
                });

                // 用于缓存每个提交属于哪些分支
                const commitToBranchesCache = new Map<string, string[]>();

                // 辅助函数：获取提交所属的分支列表
                const getBranchesContainingCommit = async (commitHash: string): Promise<string[]> => {
                    if (commitToBranchesCache.has(commitHash)) {
                        return commitToBranchesCache.get(commitHash)!;
                    }

                    const branchesContaining: string[] = [];
                    for (const branch of allBranches) {
                        try {
                            // 使用 --merged 检查分支是否包含该提交
                            const result = await git.raw(['branch', '--contains', commitHash]);
                            if (result.trim().split('\n').some(line => line.trim() === branch || line.trim().includes(branch))) {
                                branchesContaining.push(branch);
                            }
                        } catch {
                            // 跳过错误
                        }
                    }

                    commitToBranchesCache.set(commitHash, branchesContaining);
                    return branchesContaining;
                };

                // 处理每个合并提交
                for (const commit of mergeLog.all) {
                    try {
                        // 获取合并提交的父提交列表
                        const parentResult = await git.raw(['rev-list', '--parents', '-n', '1', commit.hash]);
                        const parts = parentResult.trim().split(/\s+/);

                        if (parts.length < 3) {
                            continue; // 不是有效的合并提交
                        }

                        const mergeCommitHash = parts[0];
                        const firstParent = parts[1]; // 第一个父提交（目标分支的HEAD）
                        const secondParent = parts[2]; // 第二个父提交（被合并分支的HEAD）

                        // 获取合并提交本身所在的分支（通常是目标分支）
                        const mergeCommitBranches = await getBranchesContainingCommit(mergeCommitHash);

                        // 获取每个父提交所属的分支
                        const firstParentBranches = await getBranchesContainingCommit(firstParent);
                        const secondParentBranches = await getBranchesContainingCommit(secondParent);

                        // 找出目标分支：合并提交所在的分支中，第一个父提交也在的分支
                        const toBranchCandidates = mergeCommitBranches.filter(b =>
                            firstParentBranches.includes(b) && !secondParentBranches.includes(b)
                        );

                        // 找出被合并的分支：第二个父提交在但第一个父提交不在的分支
                        const fromBranchCandidates = secondParentBranches.filter(b =>
                            !firstParentBranches.includes(b) || (mergeCommitBranches.includes(b) && !toBranchCandidates.includes(b))
                        );

                        let toBranch: string | null = null;
                        let fromBranch: string | null = null;

                        // 优先选择当前分支作为目标分支
                        if (toBranchCandidates.includes(currentBranch)) {
                            toBranch = currentBranch;
                        } else if (toBranchCandidates.length > 0) {
                            toBranch = toBranchCandidates[0];
                        } else if (mergeCommitBranches.length > 0) {
                            // 如果找不到明确的目标，使用合并提交所在的分支
                            toBranch = mergeCommitBranches.includes(currentBranch) ? currentBranch : mergeCommitBranches[0];
                        }

                        // 选择被合并的分支
                        if (fromBranchCandidates.length > 0) {
                            fromBranch = fromBranchCandidates[0];
                        }

                        // 如果找到了有效的合并关系，记录它
                        if (fromBranch && toBranch && fromBranch !== toBranch) {
                            const commitTimestamp = commit.date ? new Date(commit.date).getTime() : Date.now();
                            const description = `三路合并：${fromBranch} → ${toBranch}`;
                            const existingIndex = merges.findIndex(m =>
                                m.from === fromBranch && m.to === toBranch
                            );

                            if (existingIndex >= 0) {
                                merges[existingIndex] = {
                                    from: fromBranch,
                                    to: toBranch,
                                    commit: mergeCommitHash,
                                    type: 'three-way',
                                    description,
                                    timestamp: commitTimestamp
                                };
                            } else {
                                merges.push({
                                    from: fromBranch,
                                    to: toBranch,
                                    commit: mergeCommitHash,
                                    type: 'three-way',
                                    description,
                                    timestamp: commitTimestamp
                                });
                            }
                        }
                    } catch (error) {
                        // 如果处理某个提交失败，继续处理下一个
                        console.warn(`Error processing merge commit ${commit.hash}:`, error);
                        continue;
                    }
                }
            } catch (error) {
                console.warn('Error getting merge commits:', error);
            }

            // 方法2: 检查分支之间的合并关系（包括快进合并和未检测到的合并）
            // 通过检查每个分支是否包含其他分支的最新提交来判断合并关系
            try {
                // 获取每个分支的最新提交
                const branchHeads = new Map<string, { hash: string; timestamp?: number }>();
                for (const branch of allBranches) {
                    try {
                        const log = await git.log([branch, '-1']);
                        if (log.all.length > 0) {
                            branchHeads.set(branch, {
                                hash: log.all[0].hash,
                                timestamp: log.all[0].date ? new Date(log.all[0].date).getTime() : undefined
                            });
                        }
                    } catch {
                        // 跳过无法获取的分支
                    }
                }

                // 检查分支之间的合并关系
                for (const [branchA, headInfoA] of branchHeads.entries()) {
                    for (const [branchB, headInfoB] of branchHeads.entries()) {
                        if (branchA === branchB) continue;
                        const headA = headInfoA.hash;
                        const headB = headInfoB.hash;
                        const headBTimestamp = headInfoB.timestamp;

                        try {
                            // 检查是否已经记录了这个合并关系
                            const existingIndex = merges.findIndex(m => m.from === branchB && m.to === branchA);
                            if (existingIndex >= 0 && merges[existingIndex].type === 'three-way') {
                                continue;
                            }

                            // 检查分支A是否包含分支B的最新提交
                            // 使用 git merge-base 来检查两个分支的关系
                            const mergeBase = await git.raw(['merge-base', branchA, branchB]);
                            if (!mergeBase.trim()) continue;

                            // 检查分支A是否包含分支B的HEAD（更直接的方法）
                            const containsResult = await git.raw(['branch', '--contains', headB]);
                            const branchAContainsB = containsResult.includes(branchA) || containsResult.includes(`* ${branchA}`);

                            if (branchAContainsB && headB !== headA) {
                                let mergeType: 'three-way' | 'fast-forward' = 'fast-forward';
                                let mergeCommitHash = headB; // 默认使用分支B的HEAD
                                let mergeTimestamp: number | undefined = headBTimestamp;

                                // 检查是否有明确的合并提交
                                try {
                                    // 查找从merge-base到branchA之间的合并提交
                                    const mergeCommits = await git.raw([
                                        'log',
                                        '--merges',
                                        '--ancestry-path',
                                        '--format=%H',
                                        `${mergeBase.trim()}..${branchA}`
                                    ]);

                                    if (mergeCommits.trim()) {
                                        // 找到合并提交，检查它的父提交是否包含分支B
                                        const mergeHashes = mergeCommits.trim().split('\n');
                                        for (const mergeHash of mergeHashes) {
                                            try {
                                                const parents = await git.raw(['rev-list', '--parents', '-n', '1', mergeHash]);
                                                const parentParts = parents.trim().split(/\s+/);
                                                if (parentParts.length >= 3) {
                                                    const secondParent = parentParts[2];
                                                    // 检查第二个父提交是否属于分支B
                                                    const secondParentBranches = await git.raw(['branch', '--contains', secondParent]);
                                                    if (secondParentBranches.includes(branchB)) {
                                                        mergeCommitHash = mergeHash;
                                                        mergeType = 'three-way';
                                                        try {
                                                            const tsOutput = await git.raw(['show', '-s', '--format=%ct', mergeHash]);
                                                            const seconds = parseInt(tsOutput.trim(), 10);
                                                            if (!Number.isNaN(seconds)) {
                                                                mergeTimestamp = seconds * 1000;
                                                            }
                                                        } catch {
                                                            mergeTimestamp = headBTimestamp;
                                                        }
                                                        break;
                                                    }
                                                }
                                            } catch {
                                                // 继续检查下一个合并提交
                                            }
                                        }
                                    }

                                    const currentRecord = {
                                        from: branchB,
                                        to: branchA,
                                        commit: mergeCommitHash,
                                        type: mergeType,
                                        description: `${mergeType === 'three-way' ? '三路合并' : '快速合并（推断）'}：${branchB} → ${branchA}`,
                                        timestamp: mergeTimestamp ?? headBTimestamp ?? Date.now()
                                    } as { from: string; to: string; commit: string; type: 'three-way' | 'fast-forward'; description?: string; timestamp?: number };

                                    if (existingIndex >= 0) {
                                        merges[existingIndex] = currentRecord;
                                    } else {
                                        merges.push(currentRecord);
                                    }
                                } catch {
                                    // 如果查找合并提交失败，仍然记录快进关系
                                    if (existingIndex >= 0) {
                                        merges[existingIndex] = {
                                            from: branchB,
                                            to: branchA,
                                            commit: headB,
                                            type: merges[existingIndex].type,
                                            description: merges[existingIndex].description || `快速合并（推断）：${branchB} → ${branchA}`,
                                            timestamp: merges[existingIndex].timestamp ?? headBTimestamp ?? Date.now()
                                        };
                                    } else {
                                        merges.push({
                                            from: branchB,
                                            to: branchA,
                                            commit: headB,
                                            type: 'fast-forward',
                                            description: `快速合并（推断）：${branchB} → ${branchA}`,
                                            timestamp: headBTimestamp ?? Date.now()
                                        });
                                    }
                                }
                            }
                        } catch (error) {
                            // 跳过错误，继续检查下一个分支对
                            continue;
                        }
                    }
                }
            } catch (error) {
                console.warn('Error checking branch merge relationships:', error);
            }

            // 合并历史中记录的关系（弥补快进合并无法识别的问题）
            try {
                const recorded = MergeHistory.getHistory();
                for (const item of recorded) {
                    if (!allBranches.includes(item.from) || !allBranches.includes(item.to)) {
                        continue;
                    }
                    const existingIndex = merges.findIndex(m => m.from === item.from && m.to === item.to);
                    if (existingIndex >= 0) {
                        if (merges[existingIndex].type === 'fast-forward' && item.type === 'three-way') {
                            merges[existingIndex] = item;
                        }
                    } else {
                        merges.push(item);
                    }
                }
            } catch (error) {
                console.warn('读取合并历史失败:', error);
            }

        } catch (error) {
            console.error('Error getting branch graph:', error);
            // 如果无法获取，返回空数组
        }

        // 再次获取分支列表（确保获取最新）
        const finalBranches = await git.branch();
        return {
            branches: finalBranches.all,
            merges,
            currentBranch: finalBranches.current
        };
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

