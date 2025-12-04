import * as vscode from 'vscode';
import { GitService } from '../services/git-service';
import { BranchProvider } from '../providers/branch-provider';
import { HistoryProvider } from '../providers/history-provider';
import { Logger } from '../utils/logger';
import { CommandHistory } from '../utils/command-history';
import { DashboardPanel } from '../webview/dashboard-panel';
import { pickRemote, getDefaultRemote } from '../utils/git-helpers';
import { ErrorHandler } from '../utils/error-handler';

/**
 * 注册Git操作命令（Push, Pull, Clone）
 */
export function registerGitOperations(
    context: vscode.ExtensionContext,
    gitService: GitService,
    branchProvider: BranchProvider,
    historyProvider: HistoryProvider
) {

    // 快速推送
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.quickPush', async () => {
            let selectedRemote = 'origin'; // 在外部声明，确保 catch 块可以访问
            try {
                const config = vscode.workspace.getConfiguration('git-assistant');
                const needConfirm = config.get('confirmPush', true);

                // 使用辅助函数获取远程仓库
                const defaultRemote = await getDefaultRemote(gitService);
                selectedRemote = defaultRemote;

                // 如果有多个远程仓库，让用户选择
                const remotes = await gitService.getRemotes();
                if (remotes.length > 1) {
                    const picked = await pickRemote(gitService, '推送');
                    if (!picked) {
                        return;
                    }
                    selectedRemote = picked;
                } else if (remotes.length === 0) {
                    vscode.window.showWarningMessage('尚未配置远程仓库，无法推送。请先添加远程仓库。');
                    return;
                }

                // 获取当前状态
                const status = await gitService.getStatus();

                // 检查是否有待推送的提交（ahead）或未提交的更改
                const hasUncommittedChanges = status.modified.length > 0 || status.created.length > 0 || status.deleted.length > 0;
                const hasUnpushedCommits = (status.ahead || 0) > 0;

                // 如果没有设置上游分支，检查是否有提交可以推送
                let hasCommitsToPush = hasUnpushedCommits;
                if (!hasUnpushedCommits && !status.tracking) {
                    // 检查是否有任何提交（可能还没有设置上游分支）
                    try {
                        const log = await gitService.getLog(1);
                        hasCommitsToPush = log.all && log.all.length > 0;
                    } catch (error) {
                        // 如果获取日志失败，假设没有提交
                        hasCommitsToPush = false;
                    }
                }

                // 如果既没有未提交的更改，也没有待推送的提交，则提示
                if (!hasUncommittedChanges && !hasCommitsToPush) {
                    vscode.window.showInformationMessage('没有需要推送的更改或提交');
                    return;
                }

                // 构建推送信息
                let message = '';
                const needsUpstream = !status.tracking && hasCommitsToPush;

                if (hasUncommittedChanges && hasCommitsToPush) {
                    const commitCount = hasUnpushedCommits ? status.ahead : '本地';
                    message = `有未提交的更改和 ${commitCount} 个待推送的提交。推送只会上传已提交的内容。`;
                } else if (hasCommitsToPush) {
                    if (hasUnpushedCommits) {
                        message = `准备推送 ${status.ahead} 个提交到远程仓库`;
                    } else {
                        message = `准备推送本地提交到远程仓库${needsUpstream ? '（将设置上游分支）' : ''}`;
                    }
                } else {
                    message = `有未提交的更改，请先提交后再推送`;
                    vscode.window.showWarningMessage(message);
                    return;
                }

                if (needConfirm && hasCommitsToPush) {
                    const choice = await vscode.window.showWarningMessage(
                        message,
                        { modal: true },
                        '推送'
                    );
                    if (choice !== '推送') {
                        return;
                    }
                }

                // 执行推送
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `正在推送到 ${selectedRemote}...`,
                        cancellable: false
                    },
                    async (progress) => {
                        progress.report({ increment: 30 });
                        // 如果没有设置上游分支，使用 pushSetUpstream 方法
                        const result = needsUpstream
                            ? await gitService.pushSetUpstream(selectedRemote)
                            : await gitService.push(selectedRemote);
                        progress.report({ increment: 70 });
                        return result;
                    }
                );

                // 获取推送后的最新状态并提示上游信息
                const finalStatus = await gitService.getStatus();
                const branch = finalStatus.current || 'main';
                const finalTracking = finalStatus.tracking || null;

                if (needsUpstream) {
                    const upstream = finalTracking || `${selectedRemote}/${branch}`;
                    vscode.window.showInformationMessage(`✅ 已推送到 ${selectedRemote}，并设置上游 ${upstream}`);
                } else if (finalTracking) {
                    vscode.window.showInformationMessage(`✅ 已推送到 ${selectedRemote}（当前上游：${finalTracking}）`);
                } else {
                    vscode.window.showInformationMessage(`✅ 已推送到 ${selectedRemote}`);
                }
                Logger.info('推送成功');

                // 记录命令历史，包含远程仓库名称
                const command = needsUpstream
                    ? `git push -u ${selectedRemote} ${branch}`
                    : `git push ${selectedRemote} ${branch}`;
                CommandHistory.addCommand(command, '快速推送', true, undefined, selectedRemote);

                branchProvider.refresh();
                historyProvider.refresh();

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                ErrorHandler.handleGitError(error, '推送');

                // 记录失败的命令历史
                try {
                    const finalStatus = await gitService.getStatus();
                    const branch = finalStatus.current || 'main';
                    CommandHistory.addCommand(
                        `git push ${selectedRemote ?? 'origin'} ${branch}`,
                        '快速推送',
                        false,
                        errorMessage,
                        selectedRemote
                    );
                } catch {
                    // 如果获取状态失败，仍然记录基本命令
                    CommandHistory.addCommand(
                        'git push',
                        '快速推送',
                        false,
                        errorMessage,
                        selectedRemote
                    );
                }
            }
        })
    );

    // 快速拉取
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.quickPull', async () => {
            let hasStashed = false;
            let selectedRemote = 'origin'; // 在外部声明，确保 catch 块可以访问
            try {
                // 使用辅助函数获取远程仓库
                const defaultRemote = await getDefaultRemote(gitService);
                selectedRemote = defaultRemote;

                // 如果有多个远程仓库，让用户选择
                const remotes = await gitService.getRemotes();
                if (remotes.length > 1) {
                    const picked = await pickRemote(gitService, '拉取');
                    if (!picked) {
                        return;
                    }
                    selectedRemote = picked;
                } else if (remotes.length === 0) {
                    vscode.window.showWarningMessage('尚未配置远程仓库，无法拉取。请先添加远程仓库。');
                    return;
                }

                // 获取仓库状态
                const status = await gitService.getStatus();

                // 检查是否有未提交的更改
                if (status.modified.length > 0 || status.created.length > 0) {
                    const choice = await vscode.window.showWarningMessage(
                        '有未提交的更改，是否先暂存(stash)？',
                        '暂存并拉取',
                        '直接拉取',
                        '取消'
                    );

                    if (choice === '取消' || !choice) {
                        return;
                    }

                    if (choice === '暂存并拉取') {
                        await gitService.stash();
                        hasStashed = true;
                    }
                }

                // 执行拉取
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `正在从 ${selectedRemote} 拉取...`,
                        cancellable: false
                    },
                    async (progress) => {
                        progress.report({ increment: 30 });
                        const result = await gitService.pull(selectedRemote);
                        progress.report({ increment: 70 });
                        return result;
                    }
                );

                // 拉取成功后，如果有暂存则自动恢复
                if (hasStashed) {
                    try {
                        await gitService.stashPop();
                    } catch (stashError) {
                        // 如果恢复失败，可能是冲突或其他原因，提示用户
                        const choice = await vscode.window.showWarningMessage(
                            '拉取成功，但恢复暂存时遇到问题。请手动处理冲突。',
                            '查看日志',
                            '忽略'
                        );
                        if (choice === '查看日志') {
                            // 可以在这里打开日志面板
                        }
                    }
                }

                vscode.window.showInformationMessage('✅ 拉取成功！');
                Logger.info('拉取成功');

                // 记录命令历史，包含远程仓库名称
                const finalStatus = await gitService.getStatus();
                const branch = finalStatus.current || 'main';
                CommandHistory.addCommand(
                    `git pull ${selectedRemote} ${branch}`,
                    '快速拉取',
                    true,
                    undefined,
                    selectedRemote
                );

                branchProvider.refresh();
                historyProvider.refresh();

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                // 如果拉取失败但已暂存，提示用户需要手动恢复
                if (hasStashed) {
                    Logger.warn('拉取失败，但更改已被暂存，需要手动恢复');
                    await vscode.window.showWarningMessage(
                        `拉取失败。您的更改已被暂存，可以使用 'git stash pop' 手动恢复。`,
                        '确定'
                    );
                }
                ErrorHandler.handleGitError(error, '拉取');

                // 记录失败的命令历史
                try {
                    const finalStatus = await gitService.getStatus();
                    const branch = finalStatus.current || 'main';
                    CommandHistory.addCommand(
                        `git pull ${selectedRemote} ${branch}`,
                        '快速拉取',
                        false,
                        errorMessage,
                        selectedRemote
                    );
                } catch {
                    // 如果获取状态失败，仍然记录基本命令
                    CommandHistory.addCommand(
                        'git pull',
                        '快速拉取',
                        false,
                        errorMessage,
                        selectedRemote
                    );
                }
            }
        })
    );

    // 克隆仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.quickClone', async () => {
            try {
                // 输入仓库地址
                const repoUrl = await vscode.window.showInputBox({
                    prompt: '输入Git仓库地址',
                    placeHolder: 'https://github.com/username/repo.git',
                    validateInput: (value) => {
                        if (!value) {
                            return '请输入仓库地址';
                        }
                        if (!value.includes('git') && !value.includes('http')) {
                            return '请输入有效的Git仓库地址';
                        }
                        return null;
                    }
                });

                if (!repoUrl) {
                    return;
                }

                // 选择目标文件夹
                const targetFolder = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: '选择克隆目标文件夹'
                });

                if (!targetFolder || targetFolder.length === 0) {
                    return;
                }

                // 执行克隆
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: '正在克隆仓库...',
                        cancellable: false
                    },
                    async (progress) => {
                        progress.report({ increment: 10, message: '连接远程仓库...' });
                        await gitService.clone(repoUrl, targetFolder[0].fsPath);
                        progress.report({ increment: 90, message: '克隆完成' });
                    }
                );

                const choice = await vscode.window.showInformationMessage(
                    '✅ 克隆成功！是否打开该文件夹？',
                    '打开',
                    '取消'
                );

                if (choice === '打开') {
                    await vscode.commands.executeCommand('vscode.openFolder', targetFolder[0]);
                }

            } catch (error) {
                vscode.window.showErrorMessage(`克隆失败: ${error}`);
            }
        })
    );

    // 取消暂存文件
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.unstageFiles', async () => {
            try {
                const isRepo = await gitService.isRepository();
                if (!isRepo) {
                    vscode.window.showWarningMessage('当前工作区不是Git仓库，无法取消暂存。');
                    return;
                }

                const status = await gitService.getStatus();
                const stagedFiles =
                    status.files
                        ?.filter(file => file.index && file.index !== ' ' && file.index !== '?')
                        .map(file => file.path) || [];

                if (stagedFiles.length === 0) {
                    vscode.window.showInformationMessage('暂无已暂存的文件。');
                    return;
                }

                const choice = await vscode.window.showQuickPick(
                    [
                        { label: '取消所有暂存', description: 'git reset HEAD', value: 'all' },
                        { label: '选择文件', description: 'git reset HEAD <file>', value: 'select' }
                    ],
                    { placeHolder: '选择取消暂存方式' }
                );

                if (!choice) {
                    return;
                }

                if (choice.value === 'all') {
                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: '正在取消所有暂存...',
                            cancellable: false
                        },
                        async () => {
                            await gitService.unstage();
                        }
                    );

                    vscode.window.showInformationMessage('✅ 已取消所有已暂存文件');
                    CommandHistory.addCommand('git reset HEAD', '取消暂存', true);
                } else {
                    const selected = await vscode.window.showQuickPick(
                        stagedFiles.map(file => ({ label: file, value: file })),
                        {
                            placeHolder: '选择要取消暂存的文件',
                            canPickMany: true
                        }
                    );

                    if (!selected || selected.length === 0) {
                        return;
                    }

                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: '正在取消选中文件的暂存...',
                            cancellable: false
                        },
                        async () => {
                            await gitService.unstage(selected.map(item => item.value));
                        }
                    );

                    vscode.window.showInformationMessage(`✅ 已取消 ${selected.length} 个文件的暂存`);
                    CommandHistory.addCommand(
                        `git reset HEAD -- ${selected.map(item => item.value).join(' ')}`,
                        '取消暂存',
                        true
                    );
                }

                branchProvider.refresh();
                historyProvider.refresh();
                DashboardPanel.refresh();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`取消暂存失败: ${errorMessage}`);
                CommandHistory.addCommand('git reset HEAD', '取消暂存', false, errorMessage);
            }
        })
    );

    // 放弃更改
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.discardChanges', async () => {
            try {
                const isRepo = await gitService.isRepository();
                if (!isRepo) {
                    vscode.window.showWarningMessage('当前工作区不是Git仓库，无法放弃更改。');
                    return;
                }

                const status = await gitService.getStatus();
                const discardableFiles = [
                    ...(status.modified || []),
                    ...(status.deleted || [])
                ];

                if (discardableFiles.length === 0) {
                    vscode.window.showInformationMessage('没有可放弃的更改。');
                    return;
                }

                const choice = await vscode.window.showQuickPick(
                    [
                        { label: '放弃所有更改', description: 'git checkout -- .', value: 'all' },
                        { label: '选择文件', description: 'git checkout -- <file>', value: 'select' }
                    ],
                    { placeHolder: '选择放弃方式' }
                );

                if (!choice) {
                    return;
                }

                if (choice.value === 'all') {
                    const discardAction = '放弃';
                    const confirm = await vscode.window.showWarningMessage(
                        '将放弃所有已跟踪文件的修改，且无法恢复。确定继续？',
                        { modal: true },
                        discardAction
                    );

                    if (confirm !== discardAction) {
                        return;
                    }

                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: '正在放弃所有更改...',
                            cancellable: false
                        },
                        async () => {
                            await gitService.discardChanges();
                        }
                    );

                    vscode.window.showInformationMessage('✅ 已放弃所有已跟踪文件的更改');
                    CommandHistory.addCommand('git checkout -- .', '放弃更改', true);
                } else {
                    const selected = await vscode.window.showQuickPick(
                        discardableFiles.map(file => ({ label: file, value: file })),
                        {
                            placeHolder: '选择要放弃更改的文件',
                            canPickMany: true
                        }
                    );

                    if (!selected || selected.length === 0) {
                        return;
                    }

                    const discardActionSelected = '放弃';
                    const confirm = await vscode.window.showWarningMessage(
                        `将放弃 ${selected.length} 个文件的更改，且无法恢复。确定继续？`,
                        { modal: true },
                        discardActionSelected
                    );

                    if (confirm !== discardActionSelected) {
                        return;
                    }

                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: '正在放弃选中文件的更改...',
                            cancellable: false
                        },
                        async () => {
                            await gitService.discardChanges(selected.map(item => item.value));
                        }
                    );

                    vscode.window.showInformationMessage(`✅ 已放弃 ${selected.length} 个文件的更改`);
                    CommandHistory.addCommand(
                        `git checkout -- ${selected.map(item => item.value).join(' ')}`,
                        '放弃更改',
                        true
                    );
                }

                branchProvider.refresh();
                historyProvider.refresh();
                DashboardPanel.refresh();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`放弃更改失败: ${errorMessage}`);
                CommandHistory.addCommand('git checkout -- .', '放弃更改', false, errorMessage);
            }
        })
    );

    // 提交所有已跟踪更改（git commit -a）
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.commitAllChanges', async () => {
            try {
                const isRepo = await gitService.isRepository();
                if (!isRepo) {
                    vscode.window.showWarningMessage('当前工作区不是Git仓库，无法提交。');
                    return;
                }

                const status = await gitService.getStatus();
                const hasChanges =
                    (status.modified?.length || 0) > 0 ||
                    (status.deleted?.length || 0) > 0;

                if (!hasChanges) {
                    vscode.window.showInformationMessage('当前没有可提交的已跟踪更改。');
                    return;
                }

                const message = await vscode.window.showInputBox({
                    prompt: '输入提交信息（提交所有更改）',
                    placeHolder: '例如：chore: 更新配置',
                    validateInput: (value) => {
                        if (!value?.trim()) {
                            return '请输入提交信息';
                        }
                        if (value.trim().length > 200) {
                            return '提交信息不能超过200个字符';
                        }
                        return null;
                    }
                });

                if (!message) {
                    return;
                }

                const trimmedMessage = message.trim();

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: '正在提交所有更改...',
                        cancellable: false
                    },
                    async () => {
                        await gitService.commitTrackedChanges(trimmedMessage);
                    }
                );

                vscode.window.showInformationMessage('✅ 已提交所有已跟踪的更改');
                CommandHistory.addCommand(
                    `git commit -am "${trimmedMessage}"`,
                    '提交所有更改',
                    true
                );

                branchProvider.refresh();
                historyProvider.refresh();
                DashboardPanel.refresh();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`提交失败: ${errorMessage}`);
                // 这里无法安全获取用户输入的信息，使用占位命令记录历史
                CommandHistory.addCommand(
                    'git commit -am "<message>"',
                    '提交所有更改',
                    false,
                    errorMessage
                );
            }
        })
    );

    // 撤销上次提交（软重置）
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.undoLastCommit', async () => {
            try {
                const isRepo = await gitService.isRepository();
                if (!isRepo) {
                    vscode.window.showWarningMessage('当前工作区不是Git仓库，无法撤销提交。');
                    return;
                }

                const log = await gitService.getLog(1);
                const hasCommits = log.all && log.all.length > 0;

                if (!hasCommits) {
                    vscode.window.showInformationMessage('还没有任何提交可撤销。');
                    return;
                }

                const undoAction = '撤销提交';
                const confirm = await vscode.window.showWarningMessage(
                    '该操作会撤销最近一次提交，但保留更改在暂存区。确定继续？',
                    { modal: true },
                    undoAction
                );

                if (confirm !== undoAction) {
                    return;
                }

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: '正在撤销上次提交...',
                        cancellable: false
                    },
                    async () => {
                        await gitService.resetSoft('HEAD~1');
                    }
                );

                vscode.window.showInformationMessage('✅ 已撤销最近一次提交（更改已保留在暂存区）');
                CommandHistory.addCommand('git reset HEAD~1 --soft', '撤销上次提交', true);

                branchProvider.refresh();
                historyProvider.refresh();
                DashboardPanel.refresh();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`撤销提交失败: ${errorMessage}`);
                CommandHistory.addCommand('git reset HEAD~1 --soft', '撤销上次提交', false, errorMessage);
            }
        })
    );
}

