import * as vscode from 'vscode';
import simpleGit, { SimpleGit, StatusResult, BranchSummary, LogResult } from 'simple-git';
import * as path from 'path';

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
     */
    async merge(branchName: string): Promise<void> {
        const git = this.ensureGit();
        await git.merge([branchName]);
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
                since: since.toISOString(),
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
                since: since.toISOString(),
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
    async getBranchGraph(): Promise<{ branches: string[]; merges: Array<{ from: string; to: string; commit: string }> }> {
        const git = this.ensureGit();
        const merges: Array<{ from: string; to: string; commit: string }> = [];

        try {
            const branches = await git.branch();
            const currentBranch = branches.current || 'main';

            const log = await git.log({
                '--merges': null,
                maxCount: 100
            });

            for (const commit of log.all) {
                // 解析合并提交信息
                const message = commit.message || '';
                const mergeMatch = message.match(/Merge (?:branch|commit) ['"](.+?)['"]/);
                if (mergeMatch) {
                    const fromBranch = mergeMatch[1];
                    // 尝试获取合并时的目标分支
                    try {
                        const showResult = await git.show([commit.hash, '--format=%P', '--no-patch']);
                        const parents = showResult.trim().split(' ');
                        if (parents.length >= 2) {
                            // 获取第二个父提交的分支
                            const branchInfo = await git.branch(['--contains', parents[1]]);
                            const targetBranch = branchInfo.all.find(b => b !== fromBranch) || currentBranch;
                            merges.push({
                                from: fromBranch,
                                to: targetBranch,
                                commit: commit.hash
                            });
                        } else {
                            merges.push({
                                from: fromBranch,
                                to: currentBranch,
                                commit: commit.hash
                            });
                        }
                    } catch (error) {
                        merges.push({
                            from: fromBranch,
                            to: currentBranch,
                            commit: commit.hash
                        });
                    }
                }
            }
        } catch (error) {
            // 如果无法获取，返回空数组
        }

        const branches = await git.branch();
        return {
            branches: branches.all,
            merges
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
            const tagsOutput = await git.raw(['tag', '-l', '--sort=-creatordate']);
            if (!tagsOutput || !tagsOutput.trim()) {
                return [];
            }

            const tagNames = tagsOutput.trim().split('\n').filter(name => name.trim());
            const tags: Array<{ name: string; commit: string; message?: string; date?: string }> = [];

            for (const tagName of tagNames) {
                try {
                    // 获取标签指向的提交
                    const commit = await git.raw(['rev-list', '-n', '1', tagName]);
                    const commitHash = commit.trim();

                    // 尝试获取标签注释信息
                    try {
                        const tagInfo = await git.raw(['tag', '-l', '--format=%(refname:short)|%(objectname)|%(contents:subject)|%(creatordate:iso)', tagName]);
                        const parts = tagInfo.trim().split('|');
                        if (parts.length >= 4) {
                            tags.push({
                                name: parts[0] || tagName,
                                commit: parts[1] || commitHash,
                                message: parts[2] || undefined,
                                date: parts[3] || undefined
                            });
                        } else {
                            tags.push({
                                name: tagName,
                                commit: commitHash
                            });
                        }
                    } catch {
                        // 如果没有注释信息，使用基本信息
                        tags.push({
                            name: tagName,
                            commit: commitHash
                        });
                    }
                } catch (error) {
                    // 如果获取标签信息失败，跳过该标签
                    console.error(`Failed to get tag info for ${tagName}:`, error);
                }
            }

            return tags;
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
     * 推送单个标签到远程仓库
     */
    async pushTag(tagName: string, remote: string = 'origin'): Promise<void> {
        const git = this.ensureGit();
        await git.push(remote, `refs/tags/${tagName}:refs/tags/${tagName}`);
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

