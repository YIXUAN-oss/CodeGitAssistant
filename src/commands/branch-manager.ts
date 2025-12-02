import * as vscode from 'vscode';
import { GitService } from '../services/git-service';
import { BranchProvider } from '../providers/branch-provider';
import { DashboardPanel } from '../webview/dashboard-panel';

/**
 * 注册分支管理命令
 */
export function registerBranchManager(
    context: vscode.ExtensionContext,
    gitService: GitService,
    branchProvider: BranchProvider
) {
    // 创建分支
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.createBranch', async () => {
            try {
                const branchName = await vscode.window.showInputBox({
                    prompt: '输入新分支名称',
                    placeHolder: 'feature/new-feature',
                    validateInput: (value) => {
                        if (!value) {
                            return '分支名称不能为空';
                        }
                        if (!/^[a-zA-Z0-9/_-]+$/.test(value)) {
                            return '分支名称只能包含字母、数字、下划线和横线';
                        }
                        return null;
                    }
                });

                if (!branchName) {
                    return;
                }

                // 询问是否立即切换
                const shouldCheckout = await vscode.window.showQuickPick(
                    ['创建并切换', '仅创建'],
                    { placeHolder: '选择操作' }
                );

                if (!shouldCheckout) {
                    return;
                }

                await gitService.createBranch(branchName, shouldCheckout === '创建并切换');

                vscode.window.showInformationMessage(`✅ 分支 "${branchName}" 创建成功`);
                branchProvider.refresh();
                DashboardPanel.refresh();

            } catch (error) {
                vscode.window.showErrorMessage(`创建分支失败: ${error}`);
            }
        })
    );

    // 切换分支
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.switchBranch', async () => {
            try {
                // 获取所有分支
                const branches = await gitService.getBranches();
                const currentBranch = branches.current;

                // 只允许切换本地分支
                const localBranches = branches.all.filter(branch => !branch.startsWith('remotes/'));

                if (localBranches.length === 0) {
                    vscode.window.showInformationMessage('没有可切换的本地分支');
                    return;
                }

                // 创建快速选择项
                const items = localBranches.map(branch => ({
                    label: branch === currentBranch ? `$(check) ${branch}` : `$(git-branch) ${branch}`,
                    description: branch === currentBranch ? '当前分支' : '',
                    branch: branch
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: '选择要切换的分支'
                });

                if (!selected || selected.branch === currentBranch) {
                    return;
                }

                // 检查未提交的更改
                const status = await gitService.getStatus();
                if (status.modified.length > 0 || status.created.length > 0) {
                    const choice = await vscode.window.showWarningMessage(
                        '有未提交的更改，是否暂存(stash)？',
                        '暂存并切换',
                        '放弃更改并切换',
                        '取消'
                    );

                    if (choice === '取消' || !choice) {
                        return;
                    }

                    if (choice === '暂存并切换') {
                        await gitService.stash();
                    }
                }

                await gitService.checkout(selected.branch);
                vscode.window.showInformationMessage(`✅ 已切换到分支 "${selected.branch}"`);
                branchProvider.refresh();
                DashboardPanel.refresh();

            } catch (error) {
                vscode.window.showErrorMessage(`切换分支失败: ${error}`);
            }
        })
    );

    // 合并分支
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.mergeBranch', async () => {
            try {
                // 获取当前分支
                const branches = await gitService.getBranches();
                const currentBranch = branches.current;

                // 仅显示本地分支
                const localBranches = branches.all.filter(branch => !branch.startsWith('remotes/'));

                // 选择要合并的分支
                const items = localBranches
                    .filter(b => b !== currentBranch)
                    .map(branch => ({
                        label: `$(git-branch) ${branch}`,
                        branch: branch
                    }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `选择要合并到 "${currentBranch}" 的分支`
                });

                if (!selected) {
                    return;
                }

                // ========== 合并前状态检查 ==========
                const status = await gitService.getStatus();
                const hasUncommittedChanges = status.modified.length > 0 ||
                    status.created.length > 0 ||
                    status.deleted.length > 0 ||
                    status.not_added.length > 0;

                if (hasUncommittedChanges) {
                    const changeCount = status.modified.length + status.created.length + status.deleted.length + status.not_added.length;
                    const changeDetails = [
                        status.modified.length > 0 ? `${status.modified.length} 个已修改文件` : '',
                        status.created.length > 0 ? `${status.created.length} 个新文件` : '',
                        status.deleted.length > 0 ? `${status.deleted.length} 个已删除文件` : '',
                        status.not_added.length > 0 ? `${status.not_added.length} 个未跟踪文件` : ''
                    ].filter(Boolean).join('、');

                    const choice = await vscode.window.showWarningMessage(
                        `合并前检测到 ${changeCount} 个未提交的更改 (${changeDetails})。建议先提交或暂存这些更改。`,
                        { modal: true },
                        '暂存后继续',
                        '提交后继续',
                        '直接合并',
                        '取消'
                    );

                    if (!choice || choice === '取消') {
                        return;
                    }

                    if (choice === '暂存后继续') {
                        await gitService.stash(`Stash before merging ${selected.branch}`);
                        vscode.window.showInformationMessage('✅ 更改已暂存');
                    } else if (choice === '提交后继续') {
                        // 提示用户先提交
                        vscode.window.showWarningMessage(
                            '请先使用 "Git: 提交所有更改" 命令提交更改，然后再进行合并操作。',
                            '打开命令面板'
                        ).then(selected => {
                            if (selected === '打开命令面板') {
                                vscode.commands.executeCommand('workbench.action.showCommands');
                            }
                        });
                        return;
                    }
                    // '直接合并' 继续执行合并流程
                }

                // ========== 合并策略智能建议 ==========
                const mergeInfo = await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: '正在分析分支关系...',
                        cancellable: false
                    },
                    async () => {
                        return await gitService.getBranchMergeInfo(selected.branch);
                    }
                );

                // 根据分析结果构建策略选项
                const strategyOptions: Array<{
                    label: string;
                    description: string;
                    value: 'fast-forward' | 'three-way';
                    recommended?: boolean;
                }> = [];

                if (mergeInfo.canFastForward === true) {
                    // 可以快进，推荐快速合并
                    strategyOptions.push({
                        label: '⚡ 快速合并 (fast-forward) $(star) 推荐',
                        description: '保持线性历史，当前分支可以直接快进',
                        value: 'fast-forward',
                        recommended: true
                    });
                    strategyOptions.push({
                        label: '🔀 三路合并 (三方合并提交)',
                        description: '强制创建合并提交，保留分支结构',
                        value: 'three-way'
                    });
                } else if (mergeInfo.canFastForward === false || mergeInfo.hasDiverged) {
                    // 不能快进或已分叉，推荐三路合并
                    strategyOptions.push({
                        label: '🔀 三路合并 (三方合并提交) $(star) 推荐',
                        description: mergeInfo.hasDiverged
                            ? `分支已分叉 (${mergeInfo.commitsAhead} 个新提交, ${mergeInfo.commitsBehind} 个不同提交)，建议创建合并提交`
                            : `无法快进 (${mergeInfo.commitsAhead} 个新提交)，建议创建合并提交`,
                        value: 'three-way',
                        recommended: true
                    });
                    strategyOptions.push({
                        label: '⚡ 快速合并 (fast-forward)',
                        description: '仅当可以快进时成功（可能失败）',
                        value: 'fast-forward'
                    });
                } else {
                    // 无法确定，提供两个选项
                    strategyOptions.push({
                        label: '⚡ 快速合并 (fast-forward)',
                        description: '保持线性历史，仅当可以快进时成功',
                        value: 'fast-forward'
                    });
                    strategyOptions.push({
                        label: '🔀 三路合并 (三方合并提交)',
                        description: '创建合并提交，保留分支结构',
                        value: 'three-way'
                    });
                }

                const strategyPick = await vscode.window.showQuickPick(
                    strategyOptions,
                    {
                        placeHolder: mergeInfo.canFastForward === true
                            ? '✅ 检测到可快进合并，推荐使用快速合并'
                            : mergeInfo.hasDiverged
                                ? '⚠️ 分支已分叉，推荐使用三路合并'
                                : '选择合并策略'
                    }
                );

                if (!strategyPick) {
                    return;
                }

                // 构建确认消息
                const strategyLabel = strategyPick.label.replace(/\s*\$\(star\)\s*推荐\s*/g, '').trim();
                let confirmMessage = `确定要将 "${selected.branch}" 以"${strategyLabel}"合并到 "${currentBranch}" 吗？`;

                if (mergeInfo.commitsAhead > 0) {
                    confirmMessage += `\n\n将合并 ${mergeInfo.commitsAhead} 个提交到 ${currentBranch}`;
                }
                if (mergeInfo.canFastForward === false && strategyPick.value === 'fast-forward') {
                    confirmMessage += `\n\n⚠️ 警告：此合并可能无法快进，操作可能失败`;
                }

                const confirm = await vscode.window.showWarningMessage(
                    confirmMessage,
                    { modal: true },
                    '合并',
                    '取消'
                );

                if (confirm !== '合并') {
                    return;
                }

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `正在合并分支 ${selected.branch}...`,
                        cancellable: false
                    },
                    async () => {
                        await gitService.merge(selected.branch, strategyPick.value === 'fast-forward' ? 'fast-forward' : 'three-way');
                        // 等待一小段时间，确保 Git 合并操作完成
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                );

                vscode.window.showInformationMessage(
                    `✅ 分支 "${selected.branch}" 已通过${strategyPick.value === 'fast-forward' ? '快速合并' : '三路合并'}合并到 "${currentBranch}"`
                );
                branchProvider.refresh();
                // 延迟一点再刷新，确保 Git 数据已经更新
                await new Promise(resolve => setTimeout(resolve, 200));
                DashboardPanel.refresh();

            } catch (error) {
                const errorMsg = String(error);
                if (errorMsg.includes('CONFLICT')) {
                    vscode.window.showErrorMessage(
                        '合并冲突！请使用 "Git Assistant: 解决冲突" 命令处理'
                    );
                } else {
                    vscode.window.showErrorMessage(`合并失败: ${error}`);
                }
            }
        })
    );

    // 重命名分支
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.renameBranch', async (branchName?: string) => {
            try {
                const branches = await gitService.getBranches();
                const currentBranch = branches.current;

                if (!branches.all || branches.all.length === 0) {
                    vscode.window.showInformationMessage('当前仓库没有可重命名的分支');
                    return;
                }

                let targetBranch = branchName;

                if (!targetBranch) {
                    const items = branches.all.map(branch => ({
                        label: branch === currentBranch ? `$(check) ${branch}` : `$(git-branch) ${branch}`,
                        description: branch === currentBranch ? '当前分支' : '',
                        branch
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: '选择要重命名的分支'
                    });

                    if (!selected) {
                        return;
                    }
                    targetBranch = selected.branch;
                }

                const newName = await vscode.window.showInputBox({
                    prompt: `输入分支 "${targetBranch}" 的新名称`,
                    value: targetBranch,
                    placeHolder: 'feature/new-name',
                    validateInput: (value) => {
                        if (!value) {
                            return '分支名称不能为空';
                        }
                        if (value === targetBranch) {
                            return '新名称不能与原名称相同';
                        }
                        if (!/^[a-zA-Z0-9/_-]+$/.test(value)) {
                            return '分支名称只能包含字母、数字、下划线和横线';
                        }
                        return null;
                    }
                });

                if (!newName) {
                    return;
                }

                // 如果目标分支是当前分支，使用 renameCurrentBranch；否则指定旧分支名
                if (targetBranch === currentBranch) {
                    await gitService.renameCurrentBranch(newName);
                } else {
                    await gitService.renameBranch(targetBranch, newName);
                }

                vscode.window.showInformationMessage(`✅ 分支 "${targetBranch}" 已重命名为 "${newName}"`);
                branchProvider.refresh();
                DashboardPanel.refresh();

            } catch (error) {
                vscode.window.showErrorMessage(`重命名分支失败: ${error}`);
            }
        })
    );

    // 删除分支
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.deleteBranch', async (branchName?: string) => {
            try {
                const branches = await gitService.getBranches();
                const currentBranch = branches.current;

                let targetBranch = branchName;

                if (!targetBranch) {
                    const items = branches.all
                        .filter(b => b !== currentBranch)
                        .map(branch => ({
                            label: `$(git-branch) ${branch}`,
                            branch: branch
                        }));

                    if (items.length === 0) {
                        vscode.window.showInformationMessage('没有可删除的本地分支（不能删除当前分支）');
                        return;
                    }

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: '选择要删除的分支'
                    });

                    if (!selected) {
                        return;
                    }
                    targetBranch = selected.branch;
                }

                if (targetBranch === currentBranch) {
                    vscode.window.showWarningMessage('不能删除当前所在的分支，请先切换到其他分支。');
                    return;
                }

                // 判断分支是否已合并到当前分支，用于给出更友好的安全提示
                const isMerged = await gitService.isBranchMergedIntoCurrent(targetBranch);

                let confirm: string | undefined;

                if (isMerged) {
                    // 已合并分支：正常删除提示，说明删除不会丢失已合并到当前分支的内容
                    confirm = await vscode.window.showWarningMessage(
                        `分支 "${targetBranch}" 已合并到当前分支 "${currentBranch}"。\n\n删除该分支不会丢失已合并到当前分支的提交，是否继续？`,
                        { modal: true },
                        '删除',
                        '取消'
                    );

                    if (confirm !== '删除') {
                        return;
                    }

                    await gitService.deleteBranch(targetBranch, false);
                    vscode.window.showInformationMessage(`✅ 已删除已合并分支 "${targetBranch}"`);
                } else {
                    // 未合并分支：提示风险，并提供“强制删除”选项
                    confirm = await vscode.window.showWarningMessage(
                        `⚠️ 分支 "${targetBranch}" 尚未完全合并到当前分支 "${currentBranch}"。\n\n强制删除可能导致该分支上的未合并提交无法通过普通方式找回（仍可通过 reflog 等方式手动恢复）。\n\n确定要强制删除该分支吗？`,
                        { modal: true },
                        '强制删除（未合并）',
                        '取消'
                    );

                    if (confirm !== '强制删除（未合并）') {
                        return;
                    }

                    await gitService.deleteBranch(targetBranch, true);
                    vscode.window.showInformationMessage(`✅ 已强制删除未合并分支 "${targetBranch}"`);
                }

                branchProvider.refresh();
                DashboardPanel.refresh();

            } catch (error) {
                vscode.window.showErrorMessage(`删除分支失败: ${error}`);
            }
        })
    );
}

