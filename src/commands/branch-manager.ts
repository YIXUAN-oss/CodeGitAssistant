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

                // 确认合并
                const strategyPick = await vscode.window.showQuickPick(
                    [
                        {
                            label: '⚡ 快速合并 (fast-forward)',
                            description: '保持线性历史，仅当可以快进时成功',
                            value: 'fast-forward'
                        },
                        {
                            label: '🔀 三路合并 (三方合并提交)',
                            description: '创建合并提交，保留分支结构',
                            value: 'three-way'
                        }
                    ],
                    {
                        placeHolder: '选择合并策略'
                    }
                );

                if (!strategyPick) {
                    return;
                }

                const confirm = await vscode.window.showWarningMessage(
                    `确定要将 "${selected.branch}" 以"${strategyPick.label}"合并到 "${currentBranch}" 吗？`,
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

    // 删除分支
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.deleteBranch', async (branchName?: string) => {
            try {
                let targetBranch = branchName;

                if (!targetBranch) {
                    const branches = await gitService.getBranches();
                    const items = branches.all
                        .filter(b => b !== branches.current)
                        .map(branch => ({
                            label: `$(git-branch) ${branch}`,
                            branch: branch
                        }));

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: '选择要删除的分支'
                    });

                    if (!selected) {
                        return;
                    }
                    targetBranch = selected.branch;
                }

                const confirm = await vscode.window.showWarningMessage(
                    `确定要删除分支 "${targetBranch}" 吗？`,
                    { modal: true },
                    '删除',
                    '取消'
                );

                if (confirm !== '删除') {
                    return;
                }

                await gitService.deleteBranch(targetBranch);
                vscode.window.showInformationMessage(`✅ 分支 "${targetBranch}" 已删除`);
                branchProvider.refresh();
                DashboardPanel.refresh();

            } catch (error) {
                vscode.window.showErrorMessage(`删除分支失败: ${error}`);
            }
        })
    );
}

