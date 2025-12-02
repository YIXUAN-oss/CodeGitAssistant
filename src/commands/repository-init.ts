import * as vscode from 'vscode';
import { GitService } from '../services/git-service';
import { BranchProvider } from '../providers/branch-provider';
import { HistoryProvider } from '../providers/history-provider';
import { CommandHistory } from '../utils/command-history';
import { DashboardPanel } from '../webview/dashboard-panel';

/**
 * 注册仓库初始化相关命令
 */
export function registerRepositoryInit(
    context: vscode.ExtensionContext,
    gitService: GitService,
    branchProvider: BranchProvider,
    historyProvider: HistoryProvider
) {
    // 初始化仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.initRepository', async () => {
            try {
                // 检查是否已经是Git仓库
                const isRepo = await gitService.isRepository();
                if (isRepo) {
                    // 检查当前分支是否是 master，如果是则提示重命名
                    try {
                        const branches = await gitService.getBranches();
                        const currentBranch = branches.current;

                        if (currentBranch === 'master') {
                            const rename = await vscode.window.showWarningMessage(
                                '当前文件夹已经是Git仓库，且当前分支是 master。是否重命名为 main？',
                                '重命名',
                                '取消'
                            );

                            if (rename === '重命名') {
                                await gitService.renameCurrentBranch('main');
                                CommandHistory.addCommand('git branch -m main', '重命名分支为 main', true);
                                vscode.window.showInformationMessage('✅ 分支已重命名为 main');
                                branchProvider.refresh();
                                historyProvider.refresh();
                                DashboardPanel.refresh();
                            }
                        } else {
                            vscode.window.showWarningMessage('当前文件夹已经是Git仓库');
                        }
                    } catch (error) {
                        vscode.window.showWarningMessage('当前文件夹已经是Git仓库');
                    }
                    return;
                }

                // 确认初始化
                const confirm = await vscode.window.showInformationMessage(
                    '是否在当前文件夹初始化Git仓库？',
                    { modal: false },
                    '初始化',
                    '取消'
                );

                if (confirm !== '初始化') {
                    return;
                }

                // 执行初始化
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: '正在初始化Git仓库...',
                        cancellable: false
                    },
                    async (progress) => {
                        // 1. 初始化仓库（直接创建 main 分支）
                        progress.report({ increment: 100, message: '初始化Git仓库（创建 main 分支）...' });
                        await gitService.initRepository();

                        // 初始化后刷新 git 实例以确保获取最新分支信息
                        gitService.reinitialize();

                        // 验证分支名称（作为后备检查）
                        try {
                            const branches = await gitService.getBranches();
                            const currentBranch = branches.current;

                            // 如果当前分支不是 main（可能是旧版本 Git 或配置问题），则重命名为 main
                            if (currentBranch && currentBranch !== 'main') {
                                await gitService.renameCurrentBranch('main');
                                // 记录到命令历史
                                CommandHistory.addCommand('git branch -m main', '重命名分支为 main', true);
                            }
                        } catch (error) {
                            // 如果获取分支信息失败，不影响初始化流程，只记录警告
                            console.warn('验证分支名称失败:', error);
                        }
                    }
                );

                vscode.window.showInformationMessage('✅ Git仓库初始化成功！');

                // 记录命令历史
                CommandHistory.addCommand('git init -b main', '初始化Git仓库', true);

                // 刷新视图
                branchProvider.refresh();
                historyProvider.refresh();
                // 刷新控制面板数据
                DashboardPanel.refresh();

            } catch (error) {
                vscode.window.showErrorMessage(`初始化失败: ${error}`);
            }
        })
    );

    // 在当前文件夹执行 git clone
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.cloneIntoWorkspace', async () => {
            try {
                const workspaceRoot = gitService.getWorkspaceRoot();
                if (!workspaceRoot) {
                    vscode.window.showErrorMessage('无法获取当前工作区，请先打开文件夹');
                    return;
                }

                const isRepo = await gitService.isRepository();
                if (isRepo) {
                    vscode.window.showWarningMessage('当前文件夹已经是Git仓库，无法再次执行 git clone');
                    return;
                }

                const workspaceUri = vscode.Uri.file(workspaceRoot);
                const entries = await vscode.workspace.fs.readDirectory(workspaceUri);
                if (entries.length > 0) {
                    const confirm = await vscode.window.showWarningMessage(
                        '当前文件夹非空，继续执行 git clone 可能会失败或覆盖文件，是否仍要继续？',
                        '继续',
                        '取消'
                    );
                    if (confirm !== '继续') {
                        return;
                    }
                }

                const repoUrl = await vscode.window.showInputBox({
                    prompt: '输入Git仓库地址（将克隆到当前文件夹）',
                    placeHolder: 'https://github.com/username/repo.git',
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return '请输入仓库地址';
                        }
                        if (!value.includes('http') && !value.includes('git@')) {
                            return '请输入有效的Git仓库地址';
                        }
                        return null;
                    }
                });

                if (!repoUrl) {
                    return;
                }

                const sanitizedUrl = repoUrl.trim();

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: '正在克隆仓库...',
                        cancellable: false
                    },
                    async (progress) => {
                        progress.report({ increment: 30, message: '连接远程仓库...' });
                        await gitService.cloneIntoWorkspace(sanitizedUrl);
                        progress.report({ increment: 70, message: '克隆完成，正在加载仓库...' });
                    }
                );

                gitService.reinitialize();

                vscode.window.showInformationMessage('✅ 仓库克隆完成！');

                CommandHistory.addCommand(`git clone ${sanitizedUrl} .`, '克隆仓库到当前文件夹', true);

                branchProvider.refresh();
                historyProvider.refresh();
                DashboardPanel.refresh();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                CommandHistory.addCommand('git clone <repo> .', '克隆仓库到当前文件夹', false, errorMessage);
                vscode.window.showErrorMessage(`克隆失败: ${errorMessage}`);
            }
        })
    );

    // 添加远程仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.addRemote', async () => {
            try {
                // 检查是否是Git仓库
                const isRepo = await gitService.isRepository();
                if (!isRepo) {
                    const init = await vscode.window.showWarningMessage(
                        '当前文件夹不是Git仓库，是否先初始化？',
                        '初始化',
                        '取消'
                    );
                    if (init === '初始化') {
                        await vscode.commands.executeCommand('git-assistant.initRepository');
                    }
                    return;
                }

                // 输入远程仓库名称
                const remoteName = await vscode.window.showInputBox({
                    prompt: '输入远程仓库名称',
                    value: 'origin',
                    placeHolder: 'origin',
                    validateInput: (value) => {
                        if (!value) {
                            return '请输入远程仓库名称';
                        }
                        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                            return '名称只能包含字母、数字、下划线和横线';
                        }
                        return null;
                    }
                });

                if (!remoteName) {
                    return;
                }

                // 检查远程仓库是否已存在
                const remotes = await gitService.getRemotes();
                const existingRemote = remotes.find(r => r.name === remoteName);

                // 输入远程仓库地址
                const remoteUrl = await vscode.window.showInputBox({
                    prompt: '输入远程仓库地址',
                    placeHolder: 'https://github.com/username/repo.git',
                    validateInput: (value) => {
                        if (!value) {
                            return '请输入远程仓库地址';
                        }
                        if (!value.includes('http') && !value.includes('git@')) {
                            return '请输入有效的Git仓库地址';
                        }
                        return null;
                    }
                });

                if (!remoteUrl) {
                    return;
                }

                const sanitizedUrl = remoteUrl.trim();

                if (existingRemote) {
                    const overwrite = await vscode.window.showWarningMessage(
                        `远程仓库 "${remoteName}" 已存在，是否更新远程地址？`,
                        { modal: true },
                        '更新',
                        '取消'
                    );
                    if (overwrite !== '更新') {
                        return;
                    }
                    await gitService.updateRemoteUrl(remoteName, sanitizedUrl);
                    vscode.window.showInformationMessage(`✅ 远程仓库 "${remoteName}" 地址已更新`);
                    CommandHistory.addCommand(
                        `git remote set-url ${remoteName} ${sanitizedUrl}`,
                        '更新远程仓库地址',
                        true,
                        undefined,
                        remoteName
                    );
                } else {
                    await gitService.addRemote(remoteName, sanitizedUrl);
                    vscode.window.showInformationMessage(`✅ 远程仓库 "${remoteName}" 添加成功！`);
                    CommandHistory.addCommand(
                        `git remote add ${remoteName} ${sanitizedUrl}`,
                        '添加远程仓库',
                        true,
                        undefined,
                        remoteName
                    );
                }

                branchProvider.refresh();
                historyProvider.refresh();
                DashboardPanel.refresh();

            } catch (error) {
                vscode.window.showErrorMessage(`添加远程仓库失败: ${error}`);
            }
        })
    );

    // 切换默认远程（用于快速推送 / 拉取等操作）
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.switchRemote', async () => {
            try {
                const isRepo = await gitService.isRepository();
                if (!isRepo) {
                    vscode.window.showWarningMessage('当前文件夹不是Git仓库，无法配置远程。');
                    return;
                }

                const remotes = await gitService.getRemotes();
                if (remotes.length === 0) {
                    vscode.window.showWarningMessage('当前仓库没有配置远程仓库，请先创建远程。');
                    return;
                }

                const currentConfig = vscode.workspace.getConfiguration('git-assistant');
                const currentDefault = (currentConfig.get<string>('defaultRemote') || '').trim();

                const picked = await vscode.window.showQuickPick(
                    remotes.map(remote => ({
                        label: `$(cloud) ${remote.name}`,
                        description: remote.refs?.fetch || remote.refs?.push || '',
                        detail: remote.name === currentDefault ? '当前默认远程' : undefined,
                        remote: remote.name
                    })),
                    {
                        placeHolder: currentDefault
                            ? `选择新的默认远程（当前：${currentDefault}）`
                            : '选择要作为默认的远程仓库'
                    }
                );

                if (!picked) {
                    return;
                }

                await currentConfig.update('defaultRemote', picked.remote, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(`✅ 默认远程已设置为 "${picked.remote}"，快捷推送 / 拉取将优先使用该远程。`);
            } catch (error) {
                vscode.window.showErrorMessage(`切换默认远程失败: ${error}`);
            }
        })
    );

    // 编辑远程仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.editRemote', async () => {
            try {
                const isRepo = await gitService.isRepository();
                if (!isRepo) {
                    vscode.window.showWarningMessage('当前文件夹不是Git仓库，无法编辑远程仓库。');
                    return;
                }

                const remotes = await gitService.getRemotes();
                if (remotes.length === 0) {
                    vscode.window.showWarningMessage('当前仓库没有配置远程仓库。');
                    return;
                }

                const selected = await vscode.window.showQuickPick(
                    remotes.map(remote => ({
                        label: `$(cloud) ${remote.name}`,
                        description: remote.refs?.fetch || remote.refs?.push || '',
                        remote: remote.name
                    })),
                    {
                        placeHolder: '选择要编辑的远程仓库'
                    }
                );

                if (!selected) {
                    return;
                }

                let remoteName = selected.remote;

                const newName = await vscode.window.showInputBox({
                    prompt: '输入新的远程仓库名称',
                    value: remoteName,
                    validateInput: (value: string) => {
                        if (!value) {
                            return '远程仓库名称不能为空';
                        }
                        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                            return '名称只能包含字母、数字、下划线和横线';
                        }
                        return null;
                    }
                });

                if (!newName) {
                    return;
                }

                const currentUrl = selected.description || '';
                const newUrl = await vscode.window.showInputBox({
                    prompt: '输入新的远程仓库地址',
                    placeHolder: 'https://github.com/username/repo.git',
                    value: currentUrl,
                    validateInput: (value: string) => {
                        if (!value) {
                            return '远程仓库地址不能为空';
                        }
                        if (!value.includes('http') && !value.includes('git@')) {
                            return '请输入有效的Git仓库地址';
                        }
                        return null;
                    }
                });

                if (!newUrl) {
                    return;
                }

                let updated = false;
                if (newName !== remoteName) {
                    await gitService.renameRemote(remoteName, newName);
                    remoteName = newName;
                    updated = true;
                }

                if (newUrl !== currentUrl) {
                    await gitService.updateRemoteUrl(remoteName, newUrl);
                    updated = true;
                }

                if (updated) {
                    vscode.window.showInformationMessage(`✅ 远程仓库 "${remoteName}" 已更新`);
                } else {
                    vscode.window.showInformationMessage('未检测到更改，远程仓库保持不变');
                }

                branchProvider.refresh();
                historyProvider.refresh();
                DashboardPanel.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`编辑远程仓库失败: ${error}`);
            }
        })
    );

    // 删除远程仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.deleteRemote', async () => {
            try {
                const isRepo = await gitService.isRepository();
                if (!isRepo) {
                    vscode.window.showWarningMessage('当前文件夹不是Git仓库，无法删除远程仓库。');
                    return;
                }

                const remotes = await gitService.getRemotes();
                if (remotes.length === 0) {
                    vscode.window.showWarningMessage('当前仓库没有配置远程仓库。');
                    return;
                }

                const selected = await vscode.window.showQuickPick(
                    remotes.map(remote => ({
                        label: `$(cloud) ${remote.name}`,
                        description: remote.refs?.fetch || remote.refs?.push || '',
                        remote: remote.name
                    })),
                    {
                        placeHolder: '选择要删除的远程仓库'
                    }
                );

                if (!selected) {
                    return;
                }

                const confirm = await vscode.window.showWarningMessage(
                    `确定要删除远程仓库 "${selected.remote}" 吗？此操作会移除所有与其相关的推送/拉取配置。`,
                    { modal: true },
                    '删除',
                    '取消'
                );

                if (confirm !== '删除') {
                    return;
                }

                await gitService.removeRemote(selected.remote);
                vscode.window.showInformationMessage(`✅ 远程仓库 "${selected.remote}" 已删除`);

                // 如果删除的是当前默认远程，则清空配置
                const config = vscode.workspace.getConfiguration('git-assistant');
                const currentDefault = (config.get<string>('defaultRemote') || '').trim();
                if (currentDefault === selected.remote) {
                    await config.update('defaultRemote', '', vscode.ConfigurationTarget.Workspace);
                }

                branchProvider.refresh();
                historyProvider.refresh();
                DashboardPanel.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`删除远程仓库失败: ${error}`);
            }
        })
    );

    // 初始提交 - 已取消，仅保留 git init 功能
    /*
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.initialCommit', async () => {
            try {
                // 检查是否是Git仓库
                const isRepo = await gitService.isRepository();
                if (!isRepo) {
                    vscode.window.showWarningMessage('当前文件夹不是Git仓库');
                    return;
                }

                // 获取仓库状态
                let status;
                try {
                    status = await gitService.getStatus();
                } catch (error) {
                    vscode.window.showErrorMessage(`获取仓库状态失败: ${error}`);
                    return;
                }

                // 检查所有可能的文件状态：未跟踪、已修改、已创建、已暂存
                const totalFiles = status.modified.length +
                    status.created.length +
                    status.not_added.length +
                    (status.staged?.length || 0);

                // 如果通过数组检查没有文件，再检查 files 数组（更全面的检查）
                const hasFilesInArrays = totalFiles > 0;
                const hasFilesInStatus = status.files && status.files.length > 0;

                if (!hasFilesInArrays && !hasFilesInStatus) {
                    const createFile = await vscode.window.showWarningMessage(
                        '当前没有需要提交的文件。是否创建 README.md 文件？',
                        '创建并提交',
                        '取消'
                    );

                    if (createFile === '创建并提交') {
                        const workspaceRoot = gitService.getWorkspaceRoot();
                        if (workspaceRoot) {
                            const readmePath = path.join(workspaceRoot, 'README.md');
                            if (!fs.existsSync(readmePath)) {
                                fs.writeFileSync(readmePath, '# ' + path.basename(workspaceRoot) + '\n\n项目描述\n', 'utf8');
                                vscode.window.showInformationMessage('✅ README.md 文件已创建，请重新执行初始提交');
                            }
                        }
                    }
                    return;
                }

                // 计算实际文件数量（包括已暂存的文件）
                const actualFileCount = hasFilesInStatus ? status.files.length : totalFiles;

                // 显示待提交文件
                const message = `准备添加 ${actualFileCount} 个文件到暂存区`;
                const confirm = await vscode.window.showInformationMessage(
                    message,
                    { modal: false },
                    '继续',
                    '取消'
                );

                if (confirm !== '继续') {
                    return;
                }

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: '正在处理文件...',
                        cancellable: false
                    },
                    async (progress) => {
                        // 1. 添加所有文件
                        progress.report({ increment: 25, message: '添加文件到暂存区...' });
                        await gitService.addAll();

                        // 2. 输入提交信息
                        const commitMessage = await vscode.window.showInputBox({
                            prompt: '输入提交信息',
                            value: 'Initial commit',
                            placeHolder: 'Initial commit',
                            validateInput: (value) => {
                                if (!value || value.trim().length === 0) {
                                    return '请输入提交信息';
                                }
                                return null;
                            }
                        });

                        if (!commitMessage) {
                            throw new Error('已取消提交');
                        }

                        // 3. 提交
                        progress.report({ increment: 25, message: '提交到本地仓库...' });
                        await gitService.commit(commitMessage);

                        // 4. 询问是否推送
                        progress.report({ increment: 25 });
                        const remotes = await gitService.getRemotes();

                        if (remotes.length > 0) {
                            const doPush = await vscode.window.showInformationMessage(
                                '是否推送到远程仓库？',
                                '推送',
                                '稍后'
                            );

                            if (doPush === '推送') {
                                progress.report({ increment: 25, message: '推送到远程仓库...' });
                                try {
                                    await gitService.pushSetUpstream();
                                    vscode.window.showInformationMessage('✅ 提交并推送成功！');
                                } catch (pushError) {
                                    vscode.window.showWarningMessage(
                                        `提交成功，但推送失败: ${pushError}\n请稍后手动推送`
                                    );
                                }
                            } else {
                                vscode.window.showInformationMessage('✅ 提交成功！');
                            }
                        } else {
                            vscode.window.showInformationMessage(
                                '✅ 提交成功！\n提示：尚未添加远程仓库，无法推送'
                            );
                        }
                    }
                );

                // 刷新视图
                branchProvider.refresh();
                historyProvider.refresh();
                // 刷新控制面板数据
                DashboardPanel.refresh();

            } catch (error) {
                if (String(error).includes('已取消')) {
                    vscode.window.showInformationMessage('已取消提交');
                } else {
                    vscode.window.showErrorMessage(`提交失败: ${error}`);
                }
            }
        })
    );
    */
}

