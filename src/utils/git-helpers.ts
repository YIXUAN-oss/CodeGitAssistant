import * as vscode from 'vscode';
import { GitService } from '../services/git-service';
import { RemoteInfo } from '../types/git';

/**
 * Git 操作辅助函数集合
 * 
 * 提供常用的 Git 操作辅助函数，消除代码重复，提高代码可维护性。
 * 
 * @module git-helpers
 */

/**
 * 选择远程仓库（消除代码重复）
 * 
 * 显示一个快速选择菜单，让用户从可用的远程仓库中选择一个。
 * 如果只有一个远程仓库，直接返回该仓库名称。
 * 如果没有远程仓库，显示警告并返回 null。
 * 
 * @param gitService - Git服务实例，用于获取远程仓库列表
 * @param actionLabel - 操作标签（用于提示信息，如"推送"、"拉取"等）
 * @returns 选中的远程仓库名称，如果取消或没有远程仓库则返回 null
 * 
 * @example
 * ```typescript
 * const remote = await pickRemote(gitService, '推送');
 * if (remote) {
 *     await gitService.push(remote);
 * }
 * ```
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

        if (remotes.length === 1) {
            return remotes[0].name;
        }

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

/**
 * 获取默认远程仓库名称
 * 
 * 优先使用配置的默认远程仓库，如果未配置或不存在，则返回第一个远程仓库。
 * 如果没有任何远程仓库，返回 'origin'。
 * 
 * @param gitService - Git服务实例，用于获取远程仓库列表
 * @returns 默认远程仓库名称，如果没有则返回 'origin'
 * 
 * @example
 * ```typescript
 * const defaultRemote = await getDefaultRemote(gitService);
 * await gitService.push(defaultRemote);
 * ```
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

/**
 * 验证并获取当前分支
 * 
 * 从 Git 服务获取当前分支名称。如果获取失败（例如不在 Git 仓库中），返回 null。
 * 
 * @param gitService - Git服务实例，用于获取分支信息
 * @returns 当前分支名称，如果获取失败则返回 null
 * 
 * @example
 * ```typescript
 * const currentBranch = await getCurrentBranch(gitService);
 * if (currentBranch) {
 *     console.log(`当前分支: ${currentBranch}`);
 * }
 * ```
 */
export async function getCurrentBranch(gitService: GitService): Promise<string | null> {
    try {
        const branches = await gitService.getBranches();
        return branches.current || null;
    } catch {
        return null;
    }
}

