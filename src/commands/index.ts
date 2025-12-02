import * as vscode from 'vscode';
import { GitService } from '../services/git-service';
import { BranchProvider } from '../providers/branch-provider';
import { HistoryProvider } from '../providers/history-provider';
import { ConflictProvider } from '../providers/conflict-provider';
import { registerGitOperations } from './git-operations';
import { registerBranchManager } from './branch-manager';
import { registerConflictResolver } from './conflict-resolver';
import { registerRepositoryInit } from './repository-init';
import { registerTagManager } from './tag-manager';
import { DashboardPanel } from '../webview/dashboard-panel';
import { CommandHistory } from '../utils/command-history';

/**
 * 注册所有命令
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    gitService: GitService,
    branchProvider: BranchProvider,
    historyProvider: HistoryProvider,
    conflictProvider: ConflictProvider
) {
    // 注册Git操作命令
    registerGitOperations(context, gitService, branchProvider, historyProvider);

    // 注册分支管理命令
    registerBranchManager(context, gitService, branchProvider);

    // 注册标签管理命令
    registerTagManager(context, gitService);

    // 注册冲突解决命令
    registerConflictResolver(context, gitService, conflictProvider);

    // 注册仓库初始化命令
    registerRepositoryInit(context, gitService, branchProvider, historyProvider);

    // QuickPick 选项类型定义
    type CommitQuickPickItem = vscode.QuickPickItem & {
        commitType: 'staged' | 'all' | 'stagedOnly';
    };

    type BranchQuickPickItem = vscode.QuickPickItem & {
        branchAction: 'create' | 'switch' | 'merge' | 'rename' | 'delete';
    };

    // 分支视图快捷操作入口（QuickPick 菜单）
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.branchQuickActions', async () => {
            // 一级菜单（类似 VS Code Git 顶层分类）
            const items: (vscode.QuickPickItem & { action?: string })[] = [
                { label: '$(cloud-download) 拉取', description: '从远程仓库拉取最新更改', action: 'pull' },
                { label: '$(cloud-upload) 推送', description: '将本地提交推送到远程仓库', action: 'push' },
                { label: '$(repo-clone) 克隆', description: '从远程地址克隆新的仓库', action: 'clone' },
                { label: '$(add) 提交', description: '打开提交相关操作子菜单', action: 'commitMenu' },
                { label: '$(git-branch) 分支', description: '分支相关操作', action: 'branchMenu' },
                { label: '$(dashboard) 打开控制面板', description: '使用可视化仪表盘执行更多操作', action: 'dashboard' }
            ];

            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: '选择要执行的 Git 操作'
            });

            if (!picked || !picked.action) {
                return;
            }

            switch (picked.action) {
                case 'pull':
                    await vscode.commands.executeCommand('git-assistant.quickPull');
                    break;
                case 'push':
                    await vscode.commands.executeCommand('git-assistant.quickPush');
                    break;
                case 'clone':
                    await vscode.commands.executeCommand('git-assistant.quickClone');
                    break;
                case 'commitMenu': {
                    // 二级菜单：提交相关操作（模仿截图中的“提交”子菜单）
                    const commitItems: CommitQuickPickItem[] = [
                        { label: '提交', description: '提交已暂存的更改', commitType: 'staged' },
                        { label: '提交已暂存文件', description: '只提交暂存区中的更改', commitType: 'stagedOnly' },
                        { label: '全部提交', description: '将所有更改添加到暂存区并提交', commitType: 'all' }
                    ];

                    const pickedCommit = await vscode.window.showQuickPick<CommitQuickPickItem>(commitItems, {
                        placeHolder: '选择提交方式'
                    });

                    if (!pickedCommit) {
                        return;
                    }

                    switch (pickedCommit.commitType) {
                        case 'staged':
                        case 'stagedOnly':
                            await vscode.commands.executeCommand('git-assistant.commitChanges');
                            break;
                        case 'all':
                            // 先添加所有文件，再进入提交流程
                            await vscode.commands.executeCommand('git-assistant.addFiles');
                            await vscode.commands.executeCommand('git-assistant.commitChanges');
                            break;
                        default:
                            break;
                    }
                    break;
                }
                case 'branchMenu': {
                    // 二级菜单：分支相关操作
                    const branchItems: BranchQuickPickItem[] = [
                        { label: '创建分支', description: '基于当前提交创建新分支', branchAction: 'create' },
                        { label: '切换分支', description: '切换到其他分支', branchAction: 'switch' },
                        { label: '合并分支', description: '将其他分支合并到当前分支', branchAction: 'merge' },
                        { label: '重命名分支', description: '重命名现有本地分支', branchAction: 'rename' },
                        { label: '删除分支', description: '删除本地分支（不可删除当前分支）', branchAction: 'delete' }
                    ];

                    const pickedBranch = await vscode.window.showQuickPick<BranchQuickPickItem>(branchItems, {
                        placeHolder: '选择分支操作'
                    });

                    if (!pickedBranch) {
                        return;
                    }

                    switch (pickedBranch.branchAction) {
                        case 'create':
                            await vscode.commands.executeCommand('git-assistant.createBranch');
                            break;
                        case 'switch':
                            await vscode.commands.executeCommand('git-assistant.switchBranch');
                            break;
                        case 'merge':
                            await vscode.commands.executeCommand('git-assistant.mergeBranch');
                            break;
                        case 'rename':
                            await vscode.commands.executeCommand('git-assistant.renameBranch');
                            break;
                        case 'delete':
                            await vscode.commands.executeCommand('git-assistant.deleteBranch');
                            break;
                        default:
                            break;
                    }
                    break;
                }
                case 'dashboard':
                    await vscode.commands.executeCommand('git-assistant.openDashboard');
                    break;
                default:
                    break;
            }
        })
    );

    // 添加文件到暂存区
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.addFiles', async () => {
            try {
                // 检查是否是Git仓库
                const isRepo = await gitService.isRepository();
                if (!isRepo) {
                    vscode.window.showWarningMessage('当前文件夹不是Git仓库');
                    return;
                }

                // 获取仓库状态
                const status = await gitService.getStatus();
                const hasFiles = status.modified.length > 0 ||
                    status.created.length > 0 ||
                    status.not_added.length > 0 ||
                    (status.staged?.length || 0) > 0 ||
                    (status.files && status.files.length > 0);

                if (!hasFiles) {
                    vscode.window.showInformationMessage('没有需要添加的文件');
                    return;
                }

                // 询问用户选择：添加所有文件或选择文件
                const choice = await vscode.window.showQuickPick(
                    [
                        { label: '添加所有文件', description: 'git add .', value: 'all' },
                        { label: '选择文件', description: '从列表中选择文件', value: 'select' }
                    ],
                    {
                        placeHolder: '选择添加方式'
                    }
                );

                if (!choice) {
                    return;
                }

                if (choice.value === 'all') {
                    // 添加所有文件
                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: '正在添加文件到暂存区...',
                            cancellable: false
                        },
                        async (progress) => {
                            progress.report({ increment: 50 });
                            await gitService.addAll();
                            progress.report({ increment: 50 });
                        }
                    );
                    vscode.window.showInformationMessage('✅ 所有文件已添加到暂存区');
                    CommandHistory.addCommand('git add .', '添加所有文件到暂存区', true);
                } else {
                    // 选择文件
                    const filesToAdd = [
                        ...status.not_added,
                        ...status.modified,
                        ...status.created
                    ];

                    if (filesToAdd.length === 0) {
                        vscode.window.showInformationMessage('没有可添加的文件');
                        return;
                    }

                    const selectedFiles = await vscode.window.showQuickPick(
                        filesToAdd.map(file => ({ label: file, value: file })),
                        {
                            placeHolder: '选择要添加的文件（可多选）',
                            canPickMany: true
                        }
                    );

                    if (!selectedFiles || selectedFiles.length === 0) {
                        return;
                    }

                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: '正在添加文件到暂存区...',
                            cancellable: false
                        },
                        async (progress) => {
                            progress.report({ increment: 50 });
                            await gitService.add(selectedFiles.map(f => f.value));
                            progress.report({ increment: 50 });
                        }
                    );

                    const fileCount = selectedFiles.length;
                    vscode.window.showInformationMessage(`✅ ${fileCount} 个文件已添加到暂存区`);
                    CommandHistory.addCommand(
                        `git add ${selectedFiles.map(f => f.value).join(' ')}`,
                        `添加 ${fileCount} 个文件到暂存区`,
                        true
                    );
                }

                // 刷新视图
                branchProvider.refresh();
                historyProvider.refresh();
                DashboardPanel.refresh();

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`添加文件失败: ${errorMessage}`);
                CommandHistory.addCommand('git add', '添加文件到暂存区', false, errorMessage);
            }
        })
    );

    // 提交更改
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.commitChanges', async () => {
            try {
                // 检查是否是Git仓库
                const isRepo = await gitService.isRepository();
                if (!isRepo) {
                    vscode.window.showWarningMessage('当前文件夹不是Git仓库');
                    return;
                }

                // 获取仓库状态
                const status = await gitService.getStatus();
                const hasStagedFiles = (status.staged?.length || 0) > 0 ||
                    (status.files?.some((f) => {
                        return f && typeof f === 'object' && 'index' in f &&
                            f.index !== ' ' && f.index !== '?';
                    }) || false);

                if (!hasStagedFiles) {
                    vscode.window.showWarningMessage('没有已暂存的文件。请先使用"添加文件"命令将文件添加到暂存区。');
                    return;
                }

                // 输入提交信息
                const commitMessage = await vscode.window.showInputBox({
                    prompt: '输入提交信息',
                    placeHolder: '例如: feat: 添加新功能',
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return '请输入提交信息';
                        }
                        if (value.trim().length > 200) {
                            return '提交信息不能超过200个字符';
                        }
                        return null;
                    }
                });

                if (!commitMessage) {
                    return;
                }

                // 执行提交
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: '正在提交更改...',
                        cancellable: false
                    },
                    async (progress) => {
                        progress.report({ increment: 50 });
                        await gitService.commit(commitMessage.trim());
                        progress.report({ increment: 50 });
                    }
                );

                vscode.window.showInformationMessage('✅ 提交成功！');
                CommandHistory.addCommand(`git commit -m "${commitMessage.trim()}"`, '提交更改', true);

                // 刷新视图
                branchProvider.refresh();
                historyProvider.refresh();
                DashboardPanel.refresh();

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`提交失败: ${errorMessage}`);
                CommandHistory.addCommand('git commit', '提交更改', false, errorMessage);
            }
        })
    );

    // 刷新分支列表
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.refreshBranches', () => {
            branchProvider.refresh();
            historyProvider.refresh();
            conflictProvider.refresh();
            vscode.window.showInformationMessage('已刷新 Git 数据');
        })
    );

    // 打开控制面板
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.openDashboard', () => {
            DashboardPanel.createOrShow(context.extensionUri, gitService);
        })
    );

    // 显示提交历史
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.showHistory', async () => {
            DashboardPanel.createOrShow(context.extensionUri, gitService);
            // 自动切换到历史视图
        })
    );
}

