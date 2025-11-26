import * as vscode from 'vscode';
import { GitService } from '../services/git-service';
import { BranchProvider } from '../providers/branch-provider';
import { HistoryProvider } from '../providers/history-provider';
import { Logger } from '../utils/logger';
import { CommandHistory } from '../utils/command-history';

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
            let selectedRemote = 'origin';
            try {
                const config = vscode.workspace.getConfiguration('git-assistant');
                const needConfirm = config.get('confirmPush', true);

                // 检查是否有远程仓库
                const remotes = await gitService.getRemotes();
                if (remotes.length === 0) {
                    vscode.window.showWarningMessage('尚未配置远程仓库，无法推送。请先添加远程仓库。');
                    return;
                }

                // 如果有多个远程仓库，让用户选择
                if (remotes.length > 1) {
                    const remoteItems = remotes.map(remote => ({
                        label: `$(cloud) ${remote.name}`,
                        description: remote.refs?.fetch || remote.refs?.push || '',
                        remote: remote.name
                    }));

                    const selected = await vscode.window.showQuickPick(remoteItems, {
                        placeHolder: '选择要推送到的远程仓库'
                    });

                    if (!selected) {
                        return;
                    }

                    selectedRemote = selected.remote;
                } else {
                    selectedRemote = remotes[0].name;
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
                        '推送',
                        '取消'
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

                vscode.window.showInformationMessage(`✅ 已推送到 ${selectedRemote}！`);
                Logger.info('推送成功');

                // 记录命令历史，包含远程仓库名称
                const finalStatus = await gitService.getStatus();
                const branch = finalStatus.current || 'main';
                const command = needsUpstream
                    ? `git push -u ${selectedRemote} ${branch}`
                    : `git push ${selectedRemote} ${branch}`;
                CommandHistory.addCommand(command, '快速推送', true, undefined, selectedRemote);

                branchProvider.refresh();
                historyProvider.refresh();

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                Logger.error('推送失败', error instanceof Error ? error : new Error(errorMessage));
                vscode.window.showErrorMessage(`推送失败: ${errorMessage}`);

                // 记录失败的命令历史
                try {
                    const finalStatus = await gitService.getStatus();
                    const branch = finalStatus.current || 'main';
                    CommandHistory.addCommand(
                        `git push ${selectedRemote} ${branch}`,
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
            let selectedRemote = 'origin';
            try {
                // 检查是否有远程仓库
                const remotes = await gitService.getRemotes();
                if (remotes.length === 0) {
                    vscode.window.showWarningMessage('尚未配置远程仓库，无法拉取。请先添加远程仓库。');
                    return;
                }

                // 如果有多个远程仓库，让用户选择
                if (remotes.length > 1) {
                    const remoteItems = remotes.map(remote => ({
                        label: `$(cloud) ${remote.name}`,
                        description: remote.refs?.fetch || remote.refs?.push || '',
                        remote: remote.name
                    }));

                    const selected = await vscode.window.showQuickPick(remoteItems, {
                        placeHolder: '选择要从哪个远程仓库拉取'
                    });

                    if (!selected) {
                        return;
                    }

                    selectedRemote = selected.remote;
                } else {
                    selectedRemote = remotes[0].name;
                }

                // 检查是否有未提交的更改
                const status = await gitService.getStatus();
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
                Logger.error('拉取失败', error instanceof Error ? error : new Error(errorMessage));

                // 如果拉取失败但已暂存，提示用户需要手动恢复
                if (hasStashed) {
                    Logger.warn('拉取失败，但更改已被暂存，需要手动恢复');
                    await vscode.window.showWarningMessage(
                        `拉取失败。您的更改已被暂存，可以使用 'git stash pop' 手动恢复。`,
                        '确定'
                    );
                }
                vscode.window.showErrorMessage(`拉取失败: ${errorMessage}`);

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
}

