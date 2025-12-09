import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../services/git-service';
import { CommandHistory } from '../utils/command-history';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';
import { GitData, RemoteInfo, RepositoryInfo, BranchGraphData, BranchGraphNode, GitStatus, BranchInfo, CommitInfo } from '../types/git';

/**
 * Webview 消息类型
 */
interface WebviewMessage {
    command: string;
    commandId?: string;
    branch?: string;
    branchName?: string;
    isCurrent?: boolean;
    tagName?: string;
    remoteName?: string;
    remote?: string;
    file?: string;
    action?: 'current' | 'incoming' | 'both';
    text?: string;
    url?: string;
    commitHash?: string;
    parentHash?: string;
    filePath?: string;
    state?: unknown;
    x?: number;
    y?: number;
    [key: string]: unknown;
}

// 类型定义已移至 src/types/git.ts

/**
 * Git Assistant 控制面板
 */
export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _disposed = false;
    private _isInitialized = false; // 标记是否已初始化 HTML

    // 防抖刷新定时器
    private _refreshTimer: NodeJS.Timeout | null = null;
    private _pendingRefresh = false;
    private static readonly REFRESH_DEBOUNCE_MS = 300; // 300毫秒防抖
    private _lastWebviewState: unknown = null;
    // 避免重复触发检出分支操作的标记
    private _checkoutBranchInProgress = false;

    public static createOrShow(extensionUri: vscode.Uri, gitService: GitService) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // 如果面板已存在，则显示它
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        // 否则创建新面板
        const panel = vscode.window.createWebviewPanel(
            'gitAssistantDashboard',
            'Git Assistant 控制面板',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true, // 保持上下文，避免切换时重新加载
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media')
                ]
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, gitService);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, private gitService: GitService) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // 设置HTML内容（仅在首次创建时）
        this._update();

        // 监听面板关闭事件
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // 监听面板可见性变化，只在变为可见时刷新数据（不重新加载 HTML）
        this._panel.onDidChangeViewState(
            async (e) => {
                if (e.webviewPanel.visible && this._isInitialized) {
                    // 面板变为可见且已初始化，只刷新数据，不重新设置 HTML
                    await this._sendGitData();
                }
            },
            null,
            this._disposables
        );

        // 处理来自webview的消息
        this._panel.webview.onDidReceiveMessage(
            async (message: WebviewMessage) => {
                try {
                    switch (message.command) {
                        case 'getData':
                            // 仅刷新 Git 数据，避免重复重建 Webview
                            await this._sendGitData();
                            break;
                        case 'refresh':
                            // 刷新数据而不重置整个 HTML，提升刷新速度
                            await this._sendGitData();
                            break;
                        case 'executeCommand':
                            if (message.commandId) {
                                await this._executeCommand(message.commandId);
                            }
                            break;
                        case 'clearHistory':
                            CommandHistory.clear();
                            await this._sendGitData();
                            break;
                        case 'push':
                            await this._executeCommand('git-assistant.quickPush');
                            break;
                        case 'pull':
                            await this._executeCommand('git-assistant.quickPull');
                            break;
                        case 'createBranch':
                            await this._executeCommand('git-assistant.createBranch');
                            break;
                        case 'switchBranch':
                            if (message.branch) {
                                await this._handleSwitchBranch(message.branch);
                            }
                            break;
                        case 'mergeBranch':
                            if (message.branch) {
                                await this._handleMergeBranch(message.branch);
                            }
                            break;
                        case 'branchActions':
                            if (message.branch) {
                                await this._showBranchActionsMenu(message.branch, message.isCurrent);
                            }
                            break;
                        case 'renameBranch':
                            if (message.branch) {
                                await vscode.commands.executeCommand('git-assistant.renameBranch', message.branch);
                            } else {
                                await this._executeCommand('git-assistant.renameBranch');
                            }
                            break;
                        case 'deleteBranch':
                            if (message.branch) {
                                await vscode.commands.executeCommand('git-assistant.deleteBranch', message.branch);
                            } else {
                                await this._executeCommand('git-assistant.deleteBranch');
                            }
                            break;
                        case 'createTag':
                            await this._executeCommand('git-assistant.createTag');
                            break;
                        case 'deleteTag':
                            if (message.tagName) {
                                await this._handleDeleteTag(message.tagName);
                            }
                            break;
                        case 'pushTag':
                            if (message.tagName) {
                                await this._handlePushTag(message.tagName);
                            }
                            break;
                        case 'pushAllTags':
                            await this._handlePushAllTags();
                            break;
                        case 'clearBranchGraphCache':
                            try {
                                await this.gitService.clearBranchGraphCache();
                                vscode.window.showInformationMessage('分支图缓存已清空，将重新加载数据');
                                await this._sendGitData();
                            } catch (error) {
                                const errorMessage = error instanceof Error ? error.message : String(error);
                                vscode.window.showErrorMessage(`清空分支图缓存失败: ${errorMessage}`);
                            }
                            break;
                        case 'initRepository':
                            try {
                                // 执行初始化命令（命令内部会记录命令历史）
                                await vscode.commands.executeCommand('git-assistant.initRepository');
                                // 等待一小段时间确保初始化完成
                                await new Promise(resolve => setTimeout(resolve, 500));
                                // 初始化成功后，强制更新整个界面（从初始化页面切换到主面板）
                                await this._update(true);
                            } catch (error) {
                                // 如果初始化失败，刷新以显示错误状态
                                const errorMessage = error instanceof Error ? error.message : String(error);
                                vscode.window.showErrorMessage(`初始化失败: ${errorMessage}`);
                                await this._update(true);
                            }
                            break;
                        case 'cloneRepository':
                            try {
                                await vscode.commands.executeCommand('git-assistant.cloneIntoWorkspace');
                                await new Promise(resolve => setTimeout(resolve, 500));
                                // 克隆成功后，强制更新整个界面
                                await this._update(true);
                            } catch (error) {
                                const errorMessage = error instanceof Error ? error.message : String(error);
                                vscode.window.showErrorMessage(`克隆失败: ${errorMessage}`);
                                await this._update(true);
                            }
                            break;
                        case 'addRemote':
                            await this._executeCommand('git-assistant.addRemote');
                            break;
                        case 'editRemote':
                            if (message.remote) {
                                await this._handleEditRemote(message.remote);
                            }
                            break;
                        case 'deleteRemote':
                            if (message.remote) {
                                await this._handleDeleteRemote(message.remote);
                            }
                            break;
                        case 'resolveConflict':
                            if (message.file && message.action) {
                                await this._resolveConflict(message.file, message.action);
                            }
                            break;
                        case 'openFile':
                            if (message.file) {
                                await this._openFile(message.file);
                            }
                            break;
                        case 'openFileAtRevision':
                            if (message.commitHash && message.filePath) {
                                await this._openFileAtRevision(message.commitHash as string, message.filePath as string);
                            }
                            break;
                        case 'openCommitDiff':
                            if (message.commitHash && message.filePath) {
                                await this._openCommitDiff(
                                    message.commitHash as string,
                                    typeof message.parentHash === 'string' ? message.parentHash : undefined,
                                    message.filePath as string
                                );
                            }
                            break;
                        case 'loadCommitFiles':
                            if (message.commitHash) {
                                await this._loadCommitFiles(message.commitHash as string);
                            }
                            break;
                        case 'createPatchFromCommit':
                            if (message.commitHash) {
                                await this._createPatchFromCommit(message.commitHash as string);
                            }
                            break;
                        case 'saveState':
                            this._saveWebviewState(message.state);
                            break;
                        case 'copyToClipboard':
                            if (message.text) {
                                await this._copyToClipboard(message.text);
                            }
                            break;
                        case 'openRemoteUrl':
                            if (message.url) {
                                await this._openRemoteUrl(message.url);
                            }
                            break;
                        case 'showCommitContextMenu':
                            if (message.commitHash) {
                                await this._showCommitContextMenu(
                                    message.commitHash as string,
                                    0,
                                    0
                                );
                            }
                            break;
                        case 'checkoutCommit':
                            if (message.commitHash && typeof message.commitHash === 'string') {
                                await this._checkoutCommit(message.commitHash as string);
                            }
                            break;
                        case 'checkoutBranch':
                            if (message.branchName && typeof message.branchName === 'string') {
                                await this._handleCheckoutBranch(message.branchName as string);
                            }
                            break;
                        case 'showBranchContextMenu':
                            if (message.branchName && typeof message.branchName === 'string' &&
                                typeof message.x === 'number' && typeof message.y === 'number') {
                                await this._showBranchContextMenu(
                                    message.branchName as string,
                                    message.commitHash as string | undefined,
                                    message.x as number,
                                    message.y as number
                                );
                            }
                            break;
                        default:
                            Logger.warn(`未知命令: ${message.command}`);
                            break;
                    }
                } catch (error) {
                    ErrorHandler.handle(error, '处理消息');
                }
            },
            null,
            this._disposables
        );
    }

    private async _executeCommand(commandId: string) {
        const commandName = CommandHistory.getAvailableCommands().find(c => c.id === commandId)?.name || commandId;

        try {
            await vscode.commands.executeCommand(commandId);

            // 只有在命令实际执行成功后，才记录为成功
            CommandHistory.addCommand(commandId, commandName, true);
            await this._sendGitData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // 执行出错时，记录失败状态和错误信息
            CommandHistory.addCommand(commandId, commandName, false, errorMessage);
            await this._sendGitData();
        }
    }

    /**
     * 处理切换分支
     */
    private async _handleSwitchBranch(branchName: string) {
        try {
            if (!branchName) {
                vscode.window.showErrorMessage('分支名称不能为空');
                return;
            }

            // 获取当前分支
            const branches = await this.gitService.getBranches();
            const currentBranch = branches.current;

            if (branchName === currentBranch) {
                vscode.window.showInformationMessage('已经在当前分支');
                return;
            }

            // 检查未提交的更改
            const status = await this.gitService.getStatus();
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
                    await this.gitService.stash();
                }
            }

            await this.gitService.checkout(branchName);
            vscode.window.showInformationMessage(`✅ 已切换到分支 "${branchName}"`);
            await this._sendGitData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`切换分支失败: ${errorMessage}`);
            await this._sendGitData();
        }
    }

    /**
     * 处理检出分支（双击分支标签时调用）
     */
    private async _handleCheckoutBranch(branchName: string) {
        try {
            if (!branchName) {
                vscode.window.showErrorMessage('分支名称不能为空');
                return;
            }

            // 避免同一时间重复检出导致的多次刷新
            if (this._checkoutBranchInProgress) {
                Logger.warn('忽略重复的分支检出请求（已有检出操作进行中）');
                return;
            }
            this._checkoutBranchInProgress = true;

            // 获取当前分支
            const branches = await this.gitService.getBranches();
            const currentBranch = branches.current;

            if (branchName === currentBranch) {
                vscode.window.showInformationMessage(`已经在分支 "${branchName}"`);
                return;
            }

            // 检查未提交的更改
            const status = await this.gitService.getStatus();
            if (status.modified.length > 0 || status.created.length > 0 || status.deleted.length > 0) {
                const choice = await vscode.window.showWarningMessage(
                    `有未提交的更改，是否暂存(stash)后再切换到分支 "${branchName}"？`,
                    '暂存并切换',
                    '放弃更改并切换',
                    '取消'
                );

                if (choice === '取消' || !choice) {
                    return;
                }

                if (choice === '暂存并切换') {
                    await this.gitService.stash();
                    vscode.window.showInformationMessage('✅ 更改已暂存');
                }
            }

            await this.gitService.checkout(branchName);
            vscode.window.showInformationMessage(`✅ 已切换到分支 "${branchName}"`);
            await this._sendGitData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`检出分支失败: ${errorMessage}`);
            await this._sendGitData();
        } finally {
            this._checkoutBranchInProgress = false;
        }
    }

    /**
     * 显示分支上下文菜单（右键分支标签时调用）
     */
    private async _showBranchContextMenu(
        branchName: string,
        commitHash: string | undefined,
        x: number,
        y: number
    ) {
        try {
            const branches = await this.gitService.getBranches();
            const currentBranch = branches.current;
            const isCurrent = branchName === currentBranch;

            const actions = [
                {
                    label: '检出分支',
                    action: 'checkout',
                    visible: !isCurrent
                },
                {
                    label: '重命名分支...',
                    action: 'rename',
                    visible: true
                },
                {
                    label: '删除分支...',
                    action: 'delete',
                    visible: !isCurrent
                },
                {
                    label: '合并到当前分支...',
                    action: 'merge',
                    visible: !isCurrent && currentBranch !== null
                },
                {
                    label: '复制分支名称',
                    action: 'copyName',
                    visible: true
                }
            ].filter(item => item.visible);

            const picked = await vscode.window.showQuickPick(
                actions.map(item => ({
                    label: item.label,
                    action: item.action
                })),
                {
                    placeHolder: `分支 "${branchName}"`,
                    ignoreFocusOut: false  // 允许点击外部区域关闭菜单
                }
            );

            if (!picked) return;

            switch (picked.action) {
                case 'checkout':
                    await this._handleCheckoutBranch(branchName);
                    break;
                case 'rename':
                    await vscode.commands.executeCommand('git-assistant.renameBranch', branchName);
                    await this._sendGitData();
                    break;
                case 'delete':
                    await vscode.commands.executeCommand('git-assistant.deleteBranch', branchName);
                    await this._sendGitData();
                    break;
                case 'merge':
                    await this._handleMergeBranch(branchName);
                    break;
                case 'copyName':
                    await vscode.env.clipboard.writeText(branchName);
                    vscode.window.showInformationMessage(`✅ 已复制分支名称 "${branchName}"`);
                    break;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`显示分支菜单失败: ${errorMessage}`);
        }
    }

    /**
     * 处理合并分支
     */
    private async _handleMergeBranch(branchName: string) {
        try {
            // 由于 mergeBranch 命令不支持直接传递分支名，我们需要直接调用 gitService
            const branches = await this.gitService.getBranches();
            const currentBranch = branches.current;

            if (branchName === currentBranch) {
                vscode.window.showWarningMessage('不能合并当前分支到自身');
                return;
            }

            // ========== 合并前状态检查 ==========
            const status = await this.gitService.getStatus();
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
                    await this.gitService.stash(`Stash before merging ${branchName}`);
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
                    return await this.gitService.getBranchMergeInfo(branchName);
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
            let confirmMessage = `确定要将 "${branchName}" 以"${strategyLabel}"合并到 "${currentBranch}" 吗？`;

            if (mergeInfo.commitsAhead > 0) {
                confirmMessage += `\n\n将合并 ${mergeInfo.commitsAhead} 个提交到 ${currentBranch}`;
            }
            if (mergeInfo.canFastForward === false && strategyPick.value === 'fast-forward') {
                confirmMessage += `\n\n⚠️ 警告：此合并可能无法快进，操作可能失败`;
            }

            const mergeAction = '合并';
            const confirm = await vscode.window.showWarningMessage(
                confirmMessage,
                { modal: true },
                mergeAction
            );

            if (confirm !== '合并') {
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `正在合并分支 ${branchName}...`,
                    cancellable: false
                },
                async () => {
                    await this.gitService.merge(branchName, strategyPick.value === 'fast-forward' ? 'fast-forward' : 'three-way');
                    // 等待一小段时间，确保 Git 合并操作完成
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            );

            vscode.window.showInformationMessage(
                `✅ 分支 "${branchName}" 已通过${strategyPick.value === 'fast-forward' ? '快速合并' : '三路合并'}合并到 "${currentBranch}"`
            );
            // 延迟一点再刷新，确保 Git 数据已经更新
            await new Promise(resolve => setTimeout(resolve, 200));
            await this._sendGitData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('CONFLICT')) {
                vscode.window.showErrorMessage(
                    '合并冲突！请使用 "Git Assistant: 解决冲突" 命令处理'
                );
            } else {
                vscode.window.showErrorMessage(`合并失败: ${errorMessage}`);
            }
            await this._sendGitData();
        }
    }

    /**
     * 在 VS Code 端弹出“分支更多操作”菜单
     * 这样用户点击侧边栏中的图标时，会看到类似 VS Code Git 菜单的原生弹窗体验
     */
    private async _showBranchActionsMenu(branchName: string, isCurrentFromWebview?: boolean) {
        try {
            if (!branchName) {
                vscode.window.showErrorMessage('分支名称不能为空');
                return;
            }

            const branches = await this.gitService.getBranches();
            const currentBranch = branches.current;
            const isCurrent = typeof isCurrentFromWebview === 'boolean'
                ? isCurrentFromWebview
                : currentBranch === branchName;

            type BranchAction =
                | 'switch'
                | 'merge'
                | 'rename'
                | 'delete';

            const items: (vscode.QuickPickItem & { action: BranchAction })[] = [];

            if (!isCurrent) {
                items.push(
                    {
                        label: '切换到此分支',
                        description: `checkout ${branchName}`,
                        detail: '会自动处理未提交更改（可选择暂存或放弃）',
                        action: 'switch'
                    },
                    {
                        label: '将此分支合并到当前分支',
                        description: currentBranch ? `${branchName} → ${currentBranch}` : undefined,
                        detail: '提供快进 / 三路合并策略选择，并进行安全检查',
                        action: 'merge'
                    }
                );
            }

            items.push({
                label: isCurrent ? '重命名当前分支' : '重命名此分支',
                description: branchName,
                action: 'rename'
            });

            if (!isCurrent) {
                items.push({
                    label: '删除此本地分支',
                    description: branchName,
                    detail: '会检查是否已合并并给出安全提示，可选择强制删除',
                    action: 'delete'
                });
            }

            if (items.length === 0) {
                vscode.window.showInformationMessage('当前分支暂无可用操作');
                return;
            }

            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: `选择对分支 "${branchName}" 执行的操作`,
                ignoreFocusOut: false
            });

            if (!picked) {
                return;
            }

            switch (picked.action) {
                case 'switch':
                    await this._handleSwitchBranch(branchName);
                    break;
                case 'merge':
                    await this._handleMergeBranch(branchName);
                    break;
                case 'rename':
                    await vscode.commands.executeCommand('git-assistant.renameBranch', branchName);
                    break;
                case 'delete':
                    await vscode.commands.executeCommand('git-assistant.deleteBranch', branchName);
                    break;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`处理分支操作菜单时出错: ${errorMessage}`);
        }
    }

    /**
     * 解决冲突
     */
    private async _resolveConflict(file: string, action: 'current' | 'incoming' | 'both') {
        try {
            const workspaceRoot = this.gitService.getWorkspaceRoot();
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('无法获取工作区根目录');
                return;
            }

            const filePath = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), file);
            const document = await vscode.workspace.openTextDocument(filePath);
            const text = document.getText();

            // 解析冲突标记并解决
            const conflictPattern = /<<<<<<< HEAD\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> .+/g;
            const edit = new vscode.WorkspaceEdit();
            const replacements: Array<{ range: vscode.Range; text: string }> = [];
            let match;

            // 收集所有冲突及其替换内容
            while ((match = conflictPattern.exec(text)) !== null) {
                const fullMatch = match[0];
                const currentChanges = match[1];
                const incomingChanges = match[2];

                let replacement = '';
                switch (action) {
                    case 'current':
                        replacement = currentChanges;
                        break;
                    case 'incoming':
                        replacement = incomingChanges;
                        break;
                    case 'both':
                        replacement = currentChanges + '\n' + incomingChanges;
                        break;
                }

                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + fullMatch.length);
                replacements.push({
                    range: new vscode.Range(startPos, endPos),
                    text: replacement
                });
            }

            // 从后往前应用替换，避免位置偏移问题
            for (let i = replacements.length - 1; i >= 0; i--) {
                const { range, text } = replacements[i];
                edit.replace(document.uri, range, text);
            }

            // 应用所有更改
            await vscode.workspace.applyEdit(edit);
            await document.save();

            vscode.window.showInformationMessage(`✅ 冲突已解决: ${file}`);
            await this._sendGitData(); // 刷新数据
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`解决冲突失败: ${errorMessage}`);
        }
    }

    /**
     * 打开文件
     */
    private async _openFile(file: string) {
        try {
            const workspaceRoot = this.gitService.getWorkspaceRoot();
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('无法获取工作区根目录');
                return;
            }

            const filePath = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), file);
            await vscode.window.showTextDocument(filePath);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`打开文件失败: ${errorMessage}`);
        }
    }

    /**
     * 在指定提交中查看文件内容（只读）
     */
    /**
     * 构造 git 虚拟文件系统的 URI
     */
    private _toGitUri(fileUri: vscode.Uri, ref: string): vscode.Uri {
        // Git 虚拟文件系统要求 path 保持文件的绝对路径（POSIX 分隔符），query 中提供 ref
        const absPath = fileUri.fsPath.replace(/\\/g, '/');
        const query = JSON.stringify({ path: absPath, ref });
        return fileUri.with({ scheme: 'git', query });
    }

    private async _openFileAtRevision(commitHash: string, filePath: string) {
        try {
            const workspaceRoot = this.gitService.getWorkspaceRoot();
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('无法获取工作区根目录');
                return;
            }

            const fileUri = vscode.Uri.file(path.join(workspaceRoot, filePath));
            const targetUri = this._toGitUri(fileUri, commitHash);
            const document = await vscode.workspace.openTextDocument(targetUri);
            await vscode.window.showTextDocument(document, { preview: true });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`无法打开指定提交的文件: ${errorMessage}`);
        }
    }

    /**
     * 打开提交文件差异视图
     */
    private async _openCommitDiff(commitHash: string, parentHash: string | undefined, filePath: string) {
        try {
            const workspaceRoot = this.gitService.getWorkspaceRoot();
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('无法获取工作区根目录');
                return;
            }

            const fileUri = vscode.Uri.file(path.join(workspaceRoot, filePath));
            const fromRef = parentHash?.trim();

            // 检查是否是新增文件（前端会发送 'EMPTY' 标记）
            const isAdded = fromRef === 'EMPTY';

            let leftUri: vscode.Uri;
            let title: string;

            const rightUri = this._toGitUri(fileUri, commitHash);

            if (isAdded) {
                // 对于新增的文件，左侧是一个代表空内容的 untitled 文件
                // 使用 path.sep 确保跨平台兼容性
                const untitledPath = path.join(workspaceRoot, filePath);
                leftUri = vscode.Uri.parse(`untitled:${untitledPath}`);
                title = `${path.basename(filePath)} (Added in ${commitHash.slice(0, 7)})`;
            } else {
                // 对于修改或删除的文件，左侧是父提交中的版本
                leftUri = this._toGitUri(fileUri, fromRef!);
                title = `${path.basename(filePath)} (${fromRef!} ↔ ${commitHash.slice(0, 7)})`;
            }

            await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`无法打开差异视图: ${errorMessage}`);
        }
    }

    /**
     * 加载提交文件列表并推送给 Webview
     */
    private async _loadCommitFiles(commitHash: string) {
        try {
            const files = await this.gitService.getCommitFiles(commitHash);
            if (this._disposed) {
                return;
            }
            this._panel.webview.postMessage({
                type: 'gitDataUpdate',
                data: {
                    commitFiles: {
                        [commitHash]: files
                    }
                }
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`加载提交文件列表失败: ${errorMessage}`);
            if (!this._disposed) {
                this._panel.webview.postMessage({
                    type: 'gitDataUpdate',
                    data: {
                        commitFiles: {
                            [commitHash]: []
                        }
                    }
                });
            }
        }
    }

    /**
     * 生成指定提交的补丁并打开
     */
    private async _createPatchFromCommit(commitHash: string) {
        try {
            const patch = await this.gitService.createPatchFromCommit(commitHash);
            const document = await vscode.workspace.openTextDocument({
                language: 'diff',
                content: patch
            });
            await vscode.window.showTextDocument(document, { preview: true });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`生成补丁失败: ${errorMessage}`);
        }
    }

    /**
     * 存储 Webview 状态（当前用于与前端保持协议）
     */
    private _saveWebviewState(state: unknown) {
        this._lastWebviewState = state;
    }

    /**
     * 复制文本到剪贴板
     */
    private async _copyToClipboard(text: string) {
        try {
            await vscode.env.clipboard.writeText(text);
            // 只显示简短的提示，避免打扰用户
            vscode.window.setStatusBarMessage(`✅ 已复制: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`, 2000);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`复制失败: ${errorMessage}`);
        }
    }

    /**
     * 在浏览器中打开远程仓库 URL
     */
    private async _openRemoteUrl(url: string) {
        try {
            await vscode.env.openExternal(vscode.Uri.parse(url));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`无法打开链接: ${errorMessage}`);
        }
    }

    /**
     * 刷新控制面板数据（公共方法，带防抖）
     */
    public static refresh() {
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._debouncedRefresh();
        }
    }

    /**
     * 快速刷新远程仓库数据（公共方法，用于远程仓库操作后）
     */
    public static refreshRemotesOnly() {
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._refreshRemotesOnly();
        }
    }

    /**
     * 防抖刷新
     */
    private _debouncedRefresh() {
        // 如果有待处理的刷新，清除之前的定时器
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }

        this._pendingRefresh = true;

        // 设置新的定时器
        this._refreshTimer = setTimeout(() => {
            if (this._pendingRefresh && !this._disposed) {
                this._pendingRefresh = false;
                this._refreshTimer = null;
                this._sendGitData();
            }
        }, DashboardPanel.REFRESH_DEBOUNCE_MS);
    }

    /**
     * 立即刷新（跳过防抖）
     */
    public static refreshImmediate() {
        if (DashboardPanel.currentPanel) {
            // 清除防抖定时器
            if (DashboardPanel.currentPanel._refreshTimer) {
                clearTimeout(DashboardPanel.currentPanel._refreshTimer);
                DashboardPanel.currentPanel._refreshTimer = null;
            }
            DashboardPanel.currentPanel._pendingRefresh = false;
            DashboardPanel.currentPanel._sendGitData();
        }
    }

    public dispose() {
        if (this._disposed) {
            return;
        }
        this._disposed = true;

        // 清除防抖定时器
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
            this._refreshTimer = null;
        }

        // 重置初始化标志
        this._isInitialized = false;
        DashboardPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private async _update(forceUpdate: boolean = false) {
        const webview = this._panel.webview;

        try {
            // 检查是否是Git仓库
            const isRepo = await this.gitService.isRepository();

            // 如果已经初始化过且不是强制更新，检查仓库状态是否变化
            if (this._isInitialized && !forceUpdate) {
                // 检查当前 HTML 是否与仓库状态匹配
                const currentHtml = this._panel.webview.html;
                const shouldShowInit = !isRepo;
                const isShowingInit = currentHtml.includes('欢迎使用 Git Assistant') || currentHtml.includes('尚未初始化为Git仓库');

                // 如果状态匹配，跳过更新
                if ((shouldShowInit && isShowingInit) || (!shouldShowInit && !isShowingInit)) {
                    return;
                }
            }

            if (!isRepo) {
                // 显示初始化界面
                this._panel.webview.html = this._getInitHtml();
                this._isInitialized = true;
                return;
            }

            // 使用 React 应用。数据加载交给前端通过消息触发，避免重复加载。
            this._panel.webview.html = this._getReactHtml(webview);
            this._isInitialized = true;
        } catch (error) {
            this._panel.webview.html = this._getErrorHtml(String(error));
            this._isInitialized = true;
        }
    }

    private async _sendGitData(forceRefreshLog: boolean = false) {
        try {
            if (this._disposed) {
                return;
            }
            const isRepo = await this.gitService.isRepository();
            if (!isRepo) {
                // 如果不是仓库，重新加载页面显示初始化界面
                await this._update();
                return;
            }

            const workspaceRoot = this.gitService.getWorkspaceRoot();
            const repositoryInfo = workspaceRoot ? {
                path: workspaceRoot,
                name: path.basename(workspaceRoot)
            } : null;

            // 分批加载数据，先加载关键数据，延迟加载耗时数据
            const [
                statusResult,
                branchesResult,
                logResult,
                remotesResult,
                conflictsResult,
                tagsResult
            ] = await Promise.allSettled([
                this.gitService.getStatus(),
                this.gitService.getBranches(),
                // 初始加载使用足够的提交数量，确保与分支图数据对齐，避免出现"无提交信息"
                // 使用 800 个提交，与 BRANCH_GRAPH_MAX_COMMITS 保持一致
                this.gitService.getLog(800, undefined, forceRefreshLog),
                this.gitService.getRemotes(),
                this.gitService.getConflicts(),
                this.gitService.getTags()
            ]);

            // 先发送关键数据，让界面快速响应
            const status = statusResult.status === 'fulfilled'
                ? statusResult.value as any
                : {
                    current: null,
                    tracking: null,
                    modified: [],
                    created: [],
                    deleted: [],
                    renamed: [],
                    conflicted: [],
                    staged: [],
                    not_added: [],
                    ahead: 0,
                    behind: 0,
                    files: []
                };

            const branches = branchesResult.status === 'fulfilled'
                ? branchesResult.value as any
                : { all: [], current: null, branches: {} };

            const log = logResult.status === 'fulfilled'
                ? logResult.value as any
                : { all: [], total: 0, latest: null };

            const remotes = remotesResult.status === 'fulfilled' ? remotesResult.value : [];
            const currentBranch = branches.current || null;
            const conflicts = conflictsResult.status === 'fulfilled' ? conflictsResult.value : [];
            const tags = tagsResult.status === 'fulfilled' ? tagsResult.value : [];

            // 先尝试读取缓存的分支图；若为空则立即构建，保证首屏有 dag / parents
            let branchGraphSnapshot = await this.gitService.getBranchGraphSnapshot().catch(() => null);
            if (!branchGraphSnapshot) {
                try {
                    branchGraphSnapshot = await this.gitService.getBranchGraph(true);
                } catch (error) {
                    ErrorHandler.handleSilent(error, '获取分支图（首屏）');
                    branchGraphSnapshot = null;
                }
            }

            // 使用分支图补全 log 的 parents，确保前端绘图数据完整
            const enrichedLog = this._enrichLogWithParents(log, branchGraphSnapshot);

            // 异步加载耗时数据（分支图、统计等），不阻塞主界面
            const loadHeavyData = async () => {
                try {
                    // 再次检查是否是仓库（可能在加载过程中文件夹被删除）
                    const isRepo = await this.gitService.isRepository();
                    if (!isRepo || this._disposed) {
                        if (!isRepo && !this._disposed) {
                            await this._update();
                        }
                        return;
                    }

                    // 分支图加载优先级降低，先加载其他数据
                    const [
                        fileStatsResult,
                        contributorStatsResult,
                        timelineResult,
                        branchGraphResult,
                        // 强制刷新更完整的提交日志，确保与最新分支图对齐（避免出现“无提交信息”）
                        logRefreshResult
                    ] = await Promise.allSettled([
                        // 缩短统计时间范围，减轻大仓库压力
                        this.gitService.getFileStats(180),
                        this.gitService.getContributorStats(180),
                        this.gitService.getCommitTimeline(180),
                        // 分支图放在最后加载（计算成本最高）
                        this.gitService.getBranchGraph(), // 使用缓存
                        // 获取更大的提交窗口并强制刷新，确保包含最新提交信息
                        // 使用 800 个提交，确保与分支图的最大提交数一致，避免出现"无提交信息"
                        this.gitService.getLog(800, undefined, true)
                    ]);

                    if (this._disposed) {
                        return;
                    }

                    // 再次检查仓库状态（可能在异步操作过程中文件夹被删除）
                    const stillRepo = await this.gitService.isRepository();
                    if (!stillRepo) {
                        await this._update();
                        return;
                    }

                    // 发送更新数据
                    this._sendUpdateData({
                        fileStatsResult,
                        contributorStatsResult,
                        branchGraphResult,
                        timelineResult,
                        logRefreshResult,
                        status,
                        branches,
                        log,
                        remotes,
                        currentBranch,
                        conflicts,
                        tags
                    });
                } catch (error) {
                    ErrorHandler.handleSilent(error, '加载耗时数据');
                    // 如果加载失败，检查是否是仓库不存在
                    if (!this._disposed) {
                        try {
                            const isRepo = await this.gitService.isRepository();
                            if (!isRepo) {
                                await this._update();
                            }
                        } catch {
                            // 如果检查也失败，可能是文件夹被删除，重新加载页面
                            await this._update();
                        }
                    }
                }
            };

            // 发送初始数据（尽可能带上缓存的分支图，远程标签异步加载）
            this._sendInitialData({
                status,
                branches,
                log: enrichedLog,
                remotes,
                currentBranch,
                conflicts,
                tags,
                remoteTags: [], // 初始为空，异步加载
                repositoryInfo,
                branchGraphSnapshot: branchGraphSnapshot || null
            });

            // 异步加载远程标签（使用缓存，加快速度）
            if (remotes.length > 0) {
                const defaultRemote = remotes[0]?.name || 'origin';
                this.gitService.getRemoteTags(defaultRemote).then(remoteTags => {
                    if (this._disposed) {
                        return;
                    }
                    // 发送远程标签更新
                    this._panel.webview.postMessage({
                        type: 'gitDataUpdate',
                        data: {
                            remoteTags
                        }
                    });
                }).catch(error => {
                    ErrorHandler.handleSilent(error, '获取远程标签');
                });
            }

            // 启动后台加载
            loadHeavyData();
        } catch (error) {
            ErrorHandler.handleSilent(error, '发送Git数据');
            // 如果面板已经被销毁，则不再尝试发送消息
            if (this._disposed) {
                return;
            }

            // 检查是否是仓库不存在或文件夹被删除的情况
            try {
                const isRepo = await this.gitService.isRepository();
                if (!isRepo) {
                    // 如果不是仓库，重新加载页面显示初始化界面
                    await this._update();
                    return;
                }
            } catch {
                // 如果检查仓库状态也失败，可能是文件夹被删除，重新加载页面
                await this._update();
                return;
            }

            // 其他错误情况，发送空数据避免一直加载
            this._sendInitialData({
                status: {
                    current: null,
                    tracking: null,
                    modified: [],
                    created: [],
                    deleted: [],
                    renamed: [],
                    conflicted: [],
                    staged: [],
                    not_added: [],
                    ahead: 0,
                    behind: 0,
                    files: []
                },
                branches: { all: [], current: null, branches: {} },
                log: { all: [], total: 0, latest: null },
                remotes: [],
                currentBranch: null,
                conflicts: [],
                tags: [],
                remoteTags: [],
                repositoryInfo: null,
                branchGraphSnapshot: null
            });
        }
    }

    /**
     * 将branchGraph中的parents信息合并到log数据中
     * 确保每个commit都有parents字段（即使是空数组），以匹配官方GitCommit接口
     */
    private _enrichLogWithParents(log: any, branchGraph: BranchGraphData | null): any {
        if (!log || !log.all) {
            return log;
        }

        try {
            // 创建hash到node的映射（优化性能）
            const nodeMap = new Map<string, BranchGraphNode>();
            if (branchGraph?.dag?.nodes) {
                const nodes = branchGraph.dag.nodes;
                for (let i = 0; i < nodes.length; i++) {
                    nodeMap.set(nodes[i].hash, nodes[i]);
                }
            }

            // 为每个commit添加parents信息（确保所有commit都有parents字段）
            const enrichedCommits = log.all.map((commit: any) => {
                const node = nodeMap.get(commit.hash);
                // 确保每个commit都有parents字段，即使为空数组
                const parents = node?.parents || commit.parents || [];
                return {
                    ...commit,
                    parents: Array.isArray(parents) ? parents : []
                };
            });

            return {
                ...log,
                all: enrichedCommits
            };
        } catch (error) {
            console.error('Error enriching log with parents:', error);
            // 出错时至少确保每个commit都有parents字段
            return {
                ...log,
                all: log.all.map((commit: any) => ({
                    ...commit,
                    parents: commit.parents || []
                }))
            };
        }
    }

    /**
     * 发送初始数据（关键数据，快速响应）
     */
    private _sendInitialData(data: {
        status: any; // StatusResult 类型，需要转换
        branches: any; // BranchSummary 类型，需要转换
        log: any; // LogResult 类型
        remotes: RemoteInfo[];
        currentBranch: string | null;
        conflicts: string[];
        tags: GitData['tags'];
        remoteTags: Array<{ name: string; commit: string }>;
        repositoryInfo: RepositoryInfo | null;
        branchGraphSnapshot: BranchGraphData | null;
    }) {
        if (this._disposed) {
            return;
        }

        const branchGraph = {
            branches: data.branchGraphSnapshot?.branches || (data.branches?.all || []),
            merges: data.branchGraphSnapshot?.merges || [],
            currentBranch: data.branchGraphSnapshot?.currentBranch || data.currentBranch,
            dag: data.branchGraphSnapshot?.dag || {
                nodes: [],
                links: []
            }
        };

        // 将parents信息添加到log数据中
        const enrichedLog = this._enrichLogWithParents(data.log, data.branchGraphSnapshot);

        this._panel.webview.postMessage({
            type: 'gitData',
            data: {
                ...data,
                log: enrichedLog,
                fileStats: [],
                contributorStats: [],
                branchGraph,
                timeline: [],
                commandHistory: CommandHistory.getHistory(20),
                availableCommands: CommandHistory.getAvailableCommands(),
                categories: CommandHistory.getCommandCategories()
            }
        });
    }

    /**
     * 只刷新远程仓库数据（快速更新，不重新加载所有数据）
     */
    private async _refreshRemotesOnly() {
        try {
            if (this._disposed) {
                return;
            }

            // 强制刷新远程仓库数据（清除缓存）
            const remotes = await this.gitService.getRemotes(true);

            // 获取当前分支信息以确定跟踪的远程仓库
            const branches = await this.gitService.getBranches();
            const currentBranch = branches.current || null;
            const status = await this.gitService.getStatus();
            const trackingInfo = status.tracking || '';

            // 只发送远程仓库数据的增量更新
            this._panel.webview.postMessage({
                type: 'gitDataUpdate',
                data: {
                    remotes,
                    status: {
                        ...status,
                        tracking: trackingInfo
                    },
                    currentBranch
                }
            });
        } catch (error) {
            ErrorHandler.handleSilent(error, '刷新远程仓库数据');
            // 如果快速刷新失败，回退到完整刷新
            await this._sendGitData();
        }
    }

    /**
     * 发送更新数据（耗时数据，增量更新）
     */
    private _sendUpdateData(results: {
        fileStatsResult: PromiseSettledResult<Map<string, number>>;
        contributorStatsResult: PromiseSettledResult<Map<string, { commits: number; files: Set<string> }>>;
        branchGraphResult: PromiseSettledResult<any>;
        timelineResult: PromiseSettledResult<Map<string, number>>;
        logRefreshResult: PromiseSettledResult<any>;
        status: any;
        branches: any;
        log: any;
        remotes: any[];
        currentBranch: string | null;
        conflicts: string[];
        tags: any[];
    }) {
        if (this._disposed) {
            return;
        }

        const fileStatsArray = results.fileStatsResult.status === 'fulfilled'
            ? Array.from(results.fileStatsResult.value.entries()).map((entry: [string, number]) => ({
                path: entry[0],
                count: entry[1]
            }))
            : [];

        const contributorStatsArray = results.contributorStatsResult.status === 'fulfilled'
            ? Array.from(results.contributorStatsResult.value.entries()).map((entry: [string, { commits: number; files: Set<string> }]) => ({
                email: entry[0],
                commits: entry[1].commits,
                files: entry[1].files.size
            }))
            : [];

        const resolvedBranchGraph = results.branchGraphResult.status === 'fulfilled'
            ? results.branchGraphResult.value
            : {
                branches: results.branches.all || [],
                merges: [],
                currentBranch: results.currentBranch,
                dag: {
                    nodes: [],
                    links: []
                }
            };

        const timeline = results.timelineResult.status === 'fulfilled'
            ? Array.from(results.timelineResult.value.entries()).map((entry: [string, number]) => ({
                date: entry[0],
                count: entry[1]
            }))
            : [];

        // 如果后台刷新日志成功，使用最新日志；否则保持原有数据
        let resolvedLog = results.logRefreshResult.status === 'fulfilled'
            ? results.logRefreshResult.value
            : results.log;

        // 将parents信息添加到log数据中
        resolvedLog = this._enrichLogWithParents(resolvedLog, resolvedBranchGraph);

        // 获取远程标签并发送更新
        if (results.remotes.length > 0) {
            this.gitService.getRemoteTags(results.remotes[0]?.name || 'origin').then(tags => {
                if (this._disposed) {
                    return;
                }
                this._panel.webview.postMessage({
                    type: 'gitDataUpdate',
                    data: {
                        fileStats: fileStatsArray,
                        contributorStats: contributorStatsArray,
                        branchGraph: {
                            branches: resolvedBranchGraph.branches || [],
                            merges: resolvedBranchGraph.merges || [],
                            currentBranch: resolvedBranchGraph.currentBranch || results.currentBranch,
                            dag: resolvedBranchGraph.dag || {
                                nodes: [],
                                links: []
                            }
                        },
                        timeline,
                        log: resolvedLog,
                        remoteTags: tags
                    }
                });
            }).catch(() => {
                if (this._disposed) {
                    return;
                }
                this._panel.webview.postMessage({
                    type: 'gitDataUpdate',
                    data: {
                        fileStats: fileStatsArray,
                        contributorStats: contributorStatsArray,
                        branchGraph: {
                            branches: resolvedBranchGraph.branches || [],
                            merges: resolvedBranchGraph.merges || [],
                            currentBranch: resolvedBranchGraph.currentBranch || results.currentBranch,
                            dag: resolvedBranchGraph.dag || {
                                nodes: [],
                                links: []
                            }
                        },
                        timeline,
                        log: resolvedLog,
                        remoteTags: []
                    }
                });
            });
        } else {
            if (this._disposed) {
                return;
            }
            this._panel.webview.postMessage({
                type: 'gitDataUpdate',
                data: {
                    fileStats: fileStatsArray,
                    contributorStats: contributorStatsArray,
                    branchGraph: {
                        branches: resolvedBranchGraph.branches || [],
                        merges: resolvedBranchGraph.merges || [],
                        currentBranch: resolvedBranchGraph.currentBranch || results.currentBranch,
                        dag: resolvedBranchGraph.dag || {
                            nodes: [],
                            links: []
                        }
                    },
                    timeline,
                    log: resolvedLog,
                    remoteTags: []
                }
            });
        }
    }

    /**
     * 发送完整更新消息
     */
    private _sendFullUpdate(
        fileStatsArray: any[],
        contributorStatsArray: any[],
        resolvedBranchGraph: any,
        timeline: any[],
        remoteTags: Array<{ name: string; commit: string }>,
        results: any
    ) {
        if (this._disposed) {
            return;
        }

        this._panel.webview.postMessage({
            type: 'gitDataUpdate',
            data: {
                fileStats: fileStatsArray,
                contributorStats: contributorStatsArray,
                branchGraph: {
                    branches: resolvedBranchGraph.branches || [],
                    merges: resolvedBranchGraph.merges || [],
                    currentBranch: resolvedBranchGraph.currentBranch || results.currentBranch,
                    dag: resolvedBranchGraph.dag || {
                        nodes: [],
                        links: []
                    }
                },
                timeline,
                remoteTags
            }
        });
    }

    /**
     * 处理删除标签
     */
    private async _handleDeleteTag(tagName: string) {
        try {
            if (!tagName) {
                vscode.window.showErrorMessage('标签名称不能为空');
                return;
            }

            const deleteAction = '删除';
            const confirm = await vscode.window.showWarningMessage(
                `确定要删除标签 "${tagName}" 吗？此操作无法撤销。`,
                { modal: true },
                deleteAction
            );

            if (confirm !== '删除') {
                return;
            }

            // 询问是否同时删除远程标签
            const deleteRemote = await vscode.window.showQuickPick(
                [
                    { label: '$(check) 仅删除本地标签', value: 'local' },
                    { label: '$(cloud) 同时删除远程标签', value: 'both' }
                ],
                { placeHolder: '选择删除范围' }
            );

            if (!deleteRemote) {
                return;
            }

            // 删除本地标签
            await this.gitService.deleteTag(tagName);
            vscode.window.showInformationMessage(`✅ 本地标签 "${tagName}" 已删除`);

            // 如果需要，删除远程标签
            if (deleteRemote.value === 'both') {
                try {
                    const remote = await this._pickRemote('删除标签');
                    if (!remote) {
                        vscode.window.showInformationMessage('已取消远程标签删除');
                        await this._sendGitData();
                        return;
                    }
                    await this.gitService.deleteRemoteTag(tagName, remote);
                    vscode.window.showInformationMessage(`✅ 标签 "${tagName}" 已从本地和远程删除`);
                } catch (remoteError) {
                    vscode.window.showWarningMessage(
                        `本地标签已删除，但删除远程标签失败: ${remoteError}`
                    );
                }
            }

            await this._sendGitData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`删除标签失败: ${errorMessage}`);
            await this._sendGitData();
        }
    }

    /**
     * 处理推送所有标签
     */
    private async _handlePushAllTags() {
        try {
            const remote = await this._pickRemote('推送所有标签');
            if (!remote) {
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `确定要推送所有标签到远程仓库 "${remote}" 吗？`,
                { modal: true },
                '推送'
            );

            if (confirm !== '推送') {
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `正在推送所有标签到 ${remote}...`,
                    cancellable: false
                },
                async () => {
                    await this.gitService.pushAllTags(remote);
                }
            );

            vscode.window.showInformationMessage(`✅ 所有标签已推送到 ${remote}`);
            await this._sendGitData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`推送标签失败: ${errorMessage}`);
            await this._sendGitData();
        }
    }

    /**
     * 处理推送标签
     */
    private async _handlePushTag(tagName: string) {
        try {
            if (!tagName) {
                vscode.window.showErrorMessage('标签名称不能为空');
                return;
            }

            const remote = await this._pickRemote('推送标签');
            if (!remote) {
                return;
            }

            // 检查远程标签是否已存在
            const tagExists = await this.gitService.remoteTagExists(tagName, remote);
            let force = false;

            if (tagExists) {
                const choice = await vscode.window.showWarningMessage(
                    `远程仓库 "${remote}" 已存在标签 "${tagName}"。是否要覆盖？`,
                    { modal: true },
                    '强制推送（覆盖）'
                );

                if (!choice) {
                    return;
                }

                if (choice === '强制推送（覆盖）') {
                    force = true;
                }
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `正在推送标签 "${tagName}" 到 ${remote}...`,
                    cancellable: false
                },
                async () => {
                    await this.gitService.pushTag(tagName, remote, force);
                }
            );

            vscode.window.showInformationMessage(
                `✅ 标签 "${tagName}" 已${force ? '强制' : ''}推送到 ${remote}`
            );
            await this._sendGitData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // 提供更友好的错误提示
            if (errorMessage.includes('already exists') || errorMessage.includes('already exists')) {
                vscode.window.showErrorMessage(
                    `推送标签失败: 远程仓库已存在同名标签 "${tagName}"。请使用强制推送来覆盖。`
                );
            } else {
                vscode.window.showErrorMessage(`推送标签失败: ${errorMessage}`);
            }
            await this._sendGitData();
        }
    }

    /**
     * 编辑远程仓库
     */
    private async _handleEditRemote(remoteName: string) {
        try {
            if (!remoteName) {
                vscode.window.showErrorMessage('远程仓库名称不能为空');
                return;
            }

            const remotes = await this.gitService.getRemotes();
            const target = remotes.find((remote) => remote.name === remoteName);

            if (!target) {
                vscode.window.showWarningMessage(`未找到远程仓库 "${remoteName}"`);
                return;
            }

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

            const currentUrl = target.refs?.fetch || target.refs?.push || '';
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
                await this.gitService.renameRemote(remoteName, newName);
                remoteName = newName;
                updated = true;
            }

            if (newUrl !== currentUrl) {
                await this.gitService.updateRemoteUrl(remoteName, newUrl);
                updated = true;
            }

            if (updated) {
                vscode.window.showInformationMessage(`✅ 远程仓库 "${remoteName}" 已更新`);
            } else {
                vscode.window.showInformationMessage('未检测到更改，远程仓库保持不变');
            }

            // 使用快速刷新，只更新远程仓库数据
            await this._refreshRemotesOnly();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`编辑远程仓库失败: ${errorMessage}`);
            // 出错时也使用快速刷新
            await this._refreshRemotesOnly();
        }
    }

    /**
     * 删除远程仓库
     */
    private async _handleDeleteRemote(remoteName: string) {
        try {
            if (!remoteName) {
                vscode.window.showErrorMessage('远程仓库名称不能为空');
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `确定要删除远程仓库 "${remoteName}" 吗？此操作会移除所有与其相关的推送/拉取配置。`,
                { modal: true },
                '删除',
                '取消'
            );

            if (confirm !== '删除') {
                return;
            }

            await this.gitService.removeRemote(remoteName);
            vscode.window.showInformationMessage(`✅ 远程仓库 "${remoteName}" 已删除`);
            // 使用快速刷新，只更新远程仓库数据
            await this._refreshRemotesOnly();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`删除远程仓库失败: ${errorMessage}`);
            // 出错时也使用快速刷新
            await this._refreshRemotesOnly();
        }
    }

    /**
     * 让用户选择远程仓库（多远程场景）
     * 使用公共辅助函数，消除代码重复
     */
    private async _pickRemote(actionLabel: string): Promise<string | null> {
        const { pickRemote } = await import('../utils/git-helpers');
        return pickRemote(this.gitService, actionLabel);
    }

    /**
     * 显示提交上下文菜单
     */
    private async _showCommitContextMenu(commitHash: string, _x: number, _y: number) {
        try {
            const menuItems = [
                {
                    label: '检出此提交',
                    description: `checkout ${commitHash.substring(0, 8)}`,
                    action: 'checkout'
                },
                {
                    label: '从此提交创建分支',
                    description: '创建新分支',
                    action: 'createBranch'
                },
                {
                    label: '创建标签',
                    description: '为此提交打标签',
                    action: 'createTag'
                },
                {
                    label: '复制提交哈希',
                    description: commitHash,
                    action: 'copyHash'
                },
                {
                    label: '回滚提交',
                    description: 'Revert this commit',
                    action: 'revert'
                },
                {
                    label: '拣选提交',
                    description: 'Cherry-pick this commit',
                    action: 'cherryPick'
                }
            ];

            const picked = await vscode.window.showQuickPick(menuItems, {
                placeHolder: `提交 ${commitHash.substring(0, 8)}`,
                ignoreFocusOut: false  // 允许点击外部区域关闭菜单
            });

            if (!picked) return;

            switch (picked.action) {
                case 'checkout':
                    await this._checkoutCommit(commitHash);
                    break;
                case 'createBranch':
                    await this._createBranchFromCommit(commitHash);
                    break;
                case 'createTag':
                    await vscode.commands.executeCommand('git-assistant.createTag', commitHash);
                    break;
                case 'copyHash':
                    await vscode.env.clipboard.writeText(commitHash);
                    vscode.window.showInformationMessage(`已复制: ${commitHash}`);
                    break;
                case 'revert':
                    await this._revertCommit(commitHash);
                    break;
                case 'cherryPick':
                    await this._cherryPickCommit(commitHash);
                    break;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`操作失败: ${errorMessage}`);
        }
    }


    /**
     * 检出提交
     */
    private async _checkoutCommit(commitHash: string) {
        try {
            const status = await this.gitService.getStatus();
            if (status.modified.length > 0 || status.created.length > 0) {
                const choice = await vscode.window.showWarningMessage(
                    '有未提交的更改，是否暂存(stash)？',
                    '暂存并检出',
                    '放弃更改并检出',
                    '取消'
                );

                if (choice === '取消' || !choice) {
                    return;
                }

                if (choice === '暂存并检出') {
                    await this.gitService.stash();
                }
            }

            await this.gitService.checkout(commitHash);
            vscode.window.showInformationMessage(`✅ 已检出提交 ${commitHash.substring(0, 8)}`);
            await this._sendGitData(true);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`检出失败: ${errorMessage}`);
        }
    }

    /**
     * 从提交创建分支
     */
    private async _createBranchFromCommit(commitHash: string) {
        try {
            const branchName = await vscode.window.showInputBox({
                prompt: '输入新分支名称',
                placeHolder: 'feature/new-branch',
                validateInput: (value: string) => {
                    if (!value) {
                        return '分支名称不能为空';
                    }
                    if (!/^[a-zA-Z0-9_\-/]+$/.test(value)) {
                        return '分支名称只能包含字母、数字、下划线、横线和斜线';
                    }
                    return null;
                }
            });

            if (!branchName) {
                return;
            }

            // createBranch 方法签名: createBranch(name: string, checkout: boolean, startPoint?: string)
            await this.gitService.createBranch(branchName, false, commitHash);
            vscode.window.showInformationMessage(`✅ 已从提交 ${commitHash.substring(0, 8)} 创建分支 "${branchName}"`);
            await this._sendGitData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`创建分支失败: ${errorMessage}`);
        }
    }

    /**
     * 回滚提交
     */
    private async _revertCommit(commitHash: string) {
        try {
            const confirm = await vscode.window.showWarningMessage(
                `确定要回滚提交 ${commitHash.substring(0, 8)} 吗？`,
                { modal: true },
                '回滚'
            );

            if (confirm !== '回滚') {
                return;
            }

            await this.gitService.revert(commitHash);
            vscode.window.showInformationMessage(`✅ 已回滚提交 ${commitHash.substring(0, 8)}`);
            await this._sendGitData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`回滚失败: ${errorMessage}`);
        }
    }

    /**
     * 拣选提交
     */
    private async _cherryPickCommit(commitHash: string) {
        try {
            const confirm = await vscode.window.showWarningMessage(
                `确定要拣选提交 ${commitHash.substring(0, 8)} 到当前分支吗？`,
                { modal: true },
                '拣选'
            );

            if (confirm !== '拣选') {
                return;
            }

            await this.gitService.cherryPick(commitHash);
            vscode.window.showInformationMessage(`✅ 已拣选提交 ${commitHash.substring(0, 8)}`);
            await this._sendGitData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`拣选失败: ${errorMessage}`);
        }
    }

    private _getReactHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'index.js')
        );
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'styles', 'main.css')
        );
        const gitGraphCssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'styles', 'git-graph.css')
        );
        const contextMenuCssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'styles', 'context-menu.css')
        );
        const cspSource = webview.cspSource;
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data: https:; font-src ${cspSource} data:;">
    <title>Git Assistant 可视化面板</title>
    <link rel="stylesheet" href="${cssUri}">
    <link rel="stylesheet" href="${gitGraphCssUri}">
    <link rel="stylesheet" href="${contextMenuCssUri}">
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        #root {
            width: 100%;
            height: 100vh;
        }
        .error-message {
            padding: 20px;
            color: var(--vscode-errorForeground);
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            margin: 20px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div id="root">
        <div class="error-message" id="loading-message">正在加载...</div>
    </div>
    <script>
        // 只在未初始化时获取 VS Code API
        if (!window.vscode) {
            window.vscode = acquireVsCodeApi();
        }
        
        // 错误处理
        window.addEventListener('error', (event) => {
            const root = document.getElementById('root');
            if (root) {
                root.innerHTML = '<div class="error-message"><h3>加载错误</h3><p>' + 
                    (event.message || '未知错误') + '</p><p>文件: ' + (event.filename || '') + '</p><p>行号: ' + (event.lineno || '') + '</p></div>';
            }
            console.error('Webview error:', event);
        });
        
        // 模块加载错误处理
        window.addEventListener('unhandledrejection', (event) => {
            const root = document.getElementById('root');
            if (root) {
                root.innerHTML = '<div class="error-message"><h3>模块加载错误</h3><p>' + 
                    (event.reason?.message || String(event.reason) || '未知错误') + '</p></div>';
            }
            console.error('Module load error:', event.reason);
        });
    </script>
    <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private _getHtmlForWebview(webview: vscode.Webview, data: GitData) {
        const { status, branches, log } = data;
        const safeStatus: GitStatus = status || {
            current: null,
            tracking: null,
            ahead: 0,
            behind: 0,
            modified: [],
            created: [],
            deleted: [],
            renamed: [],
            conflicted: [],
            staged: [],
            files: []
        };
        const safeBranches: BranchInfo = branches || { all: [], current: null, branches: {} };
        const safeLog = log || { all: [], total: 0, latest: null };

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Assistant 控制面板</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        h1 {
            font-size: 28px;
            margin-bottom: 20px;
            color: var(--vscode-foreground);
        }

        .section {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .section-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            color: var(--vscode-textLink-foreground);
        }

        .button-group {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
        }

        button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .status-item {
            padding: 10px;
            margin: 8px 0;
            background: var(--vscode-list-hoverBackground);
            border-radius: 4px;
            display: flex;
            align-items: center;
        }

        .status-icon {
            margin-right: 10px;
            font-weight: bold;
        }

        .modified { color: #f9a825; }
        .created { color: #66bb6a; }
        .deleted { color: #ef5350; }

        .branch-item {
            padding: 8px 12px;
            margin: 5px 0;
            background: var(--vscode-list-inactiveSelectionBackground);
            border-radius: 4px;
            cursor: pointer;
        }

        .branch-item.current {
            background: var(--vscode-list-activeSelectionBackground);
            font-weight: bold;
        }

        .commit-item {
            padding: 12px;
            margin: 8px 0;
            background: var(--vscode-list-hoverBackground);
            border-left: 3px solid var(--vscode-gitDecoration-addedResourceForeground);
            border-radius: 4px;
        }

        .commit-hash {
            font-family: monospace;
            color: var(--vscode-textLink-foreground);
            font-size: 12px;
        }

        .commit-message {
            margin: 5px 0;
            font-weight: bold;
        }

        .commit-author {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }

        .stat-card {
            background: var(--vscode-textCodeBlock-background);
            padding: 15px;
            border-radius: 6px;
            text-align: center;
        }

        .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }

        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }

        .refresh-btn {
            float: right;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .refresh-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Git Assistant 控制面板</h1>
        
        <!-- 快捷操作 -->
        <div class="section">
            <div class="section-title">
                快捷操作
                <button class="refresh-btn" onclick="refresh()">刷新</button>
            </div>
            <div class="button-group">
                <button onclick="initRepository()">🆕 初始化仓库</button>
                <button onclick="push()">📤 推送 (Push)</button>
                <button onclick="pull()">📥 拉取 (Pull)</button>
                <button onclick="createBranch()">🌿 创建分支</button>
                <button onclick="switchBranch()">🔀 切换分支</button>
                <button onclick="mergeBranch()">🔗 合并分支</button>
            </div>
        </div>

        <!-- 远程仓库管理 -->
        <div class="section">
            <div class="section-title">远程仓库</div>
            ${data.remotes && data.remotes.length > 0
                ? data.remotes.map((remote: RemoteInfo) => `
                    <div class="status-item">
                        <span class="status-icon" style="color: #569cd6;">☁️</span>
                        <span><strong>${remote.name}</strong>: ${remote.refs?.fetch || remote.refs?.push || 'N/A'}</span>
                    </div>
                `).join('')
                : '<div class="status-item">⚠️ 尚未添加远程仓库</div>'
            }
            <div class="button-group" style="margin-top: 15px;">
                <button onclick="addRemote()">➕ 添加远程仓库</button>
            </div>
        </div>

        <!-- 统计信息 -->
        <div class="section">
            <div class="section-title">仓库状态</div>
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-value">${safeStatus.modified.length}</div>
                    <div class="stat-label">已修改</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${safeStatus.created.length}</div>
                    <div class="stat-label">新创建</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${safeStatus.deleted.length}</div>
                    <div class="stat-label">已删除</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${safeBranches.all.length}</div>
                    <div class="stat-label">分支总数</div>
                </div>
            </div>
        </div>

        <!-- 当前状态 -->
        <div class="section">
            <div class="section-title">工作区状态</div>
            ${safeStatus.modified.length === 0 && safeStatus.created.length === 0 && safeStatus.deleted.length === 0
                ? '<div class="status-item">✅ 工作区是干净的</div>'
                : ''}
            ${safeStatus.modified.map((file: string) => `
                <div class="status-item">
                    <span class="status-icon modified">M</span>
                    <span>${file}</span>
                </div>
            `).join('')}
            ${safeStatus.created.map((file: string) => `
                <div class="status-item">
                    <span class="status-icon created">A</span>
                    <span>${file}</span>
                </div>
            `).join('')}
            ${safeStatus.deleted.map((file: string) => `
                <div class="status-item">
                    <span class="status-icon deleted">D</span>
                    <span>${file}</span>
                </div>
            `).join('')}
        </div>

        <!-- 分支列表 -->
        <div class="section">
            <div class="section-title">分支列表 (当前: ${safeBranches.current || 'N/A'})</div>
            ${safeBranches.all.slice(0, 10).map((branch: string) => `
                <div class="branch-item ${branch === safeBranches.current ? 'current' : ''}">
                    ${branch === safeBranches.current ? '✓' : '○'} ${branch}
                </div>
            `).join('')}
        </div>

        <!-- 提交历史 -->
        <div class="section">
            <div class="section-title">最近提交</div>
            ${safeLog.all.map((commit: CommitInfo) => `
                <div class="commit-item">
                    <div class="commit-hash">${commit.hash.substring(0, 8)}</div>
                    <div class="commit-message">${commit.message.split('\n')[0]}</div>
                    <div class="commit-author">${commit.author_name} · ${new Date(commit.date).toLocaleString('zh-CN')}</div>
                </div>
            `).join('')}
        </div>
    </div>

    <script>
        // 只在未初始化时获取 VS Code API
        if (!window.vscode) {
            window.vscode = acquireVsCodeApi();
        }
        const vscode = window.vscode;

        function push() {
            vscode.postMessage({ command: 'push' });
        }

        function pull() {
            vscode.postMessage({ command: 'pull' });
        }

        function createBranch() {
            vscode.postMessage({ command: 'createBranch' });
        }

        function switchBranch() {
            vscode.postMessage({ command: 'switchBranch' });
        }

        function mergeBranch() {
            vscode.postMessage({ command: 'mergeBranch' });
        }

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function addRemote() {
            vscode.postMessage({ command: 'addRemote' });
        }


        function initRepository() {
            vscode.postMessage({ command: 'initRepository' });
        }
    </script>
</body>
</html>`;
    }

    private _getInitHtml(): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Assistant - 初始化</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 40px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }

        .init-container {
            max-width: 600px;
            text-align: center;
        }

        .init-icon {
            font-size: 80px;
            margin-bottom: 30px;
        }

        h1 {
            font-size: 32px;
            margin-bottom: 15px;
        }

        .subtitle {
            font-size: 16px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 40px;
        }

        .steps {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
            text-align: left;
        }

        .step {
            display: flex;
            align-items: flex-start;
            margin-bottom: 25px;
        }

        .step:last-child {
            margin-bottom: 0;
        }

        .step-number {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            flex-shrink: 0;
            margin-right: 15px;
        }

        .step-content {
            flex: 1;
        }

        .step-title {
            font-weight: bold;
            margin-bottom: 5px;
            font-size: 16px;
        }

        .step-desc {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }

        .action-buttons {
            display: flex;
            gap: 15px;
            justify-content: center;
        }

        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 12px 30px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
            transition: background 0.2s;
        }

        button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .quick-start {
            margin-top: 20px;
            padding: 15px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
            border-radius: 4px;
            text-align: left;
        }

        .quick-start-title {
            font-weight: bold;
            margin-bottom: 10px;
        }

        .quick-start code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <div class="init-container">
        <div class="init-icon">📦</div>
        <h1>欢迎使用 Git Assistant</h1>
        <p class="subtitle">当前文件夹尚未初始化为Git仓库</p>

        <div class="steps">
            <div class="step">
                <div class="step-number">1</div>
                <div class="step-content">
                    <div class="step-title">初始化Git仓库</div>
                    <div class="step-desc">在当前文件夹创建 .git 目录，开始版本控制</div>
                </div>
            </div>

            <div class="step">
                <div class="step-number">2</div>
                <div class="step-content">
                    <div class="step-title">添加远程仓库</div>
                    <div class="step-desc">连接到 GitHub、GitLab 等远程仓库</div>
                </div>
            </div>

            <div class="step">
                <div class="step-number">3</div>
                <div class="step-content">
                    <div class="step-title">初始提交</div>
                    <div class="step-desc">添加所有文件并创建第一次提交</div>
                </div>
            </div>
        </div>

        <div class="action-buttons">
            <button onclick="initRepository()">🚀 Git Init</button>
            <button onclick="cloneRepository()">📦 Git Clone</button>
            <button class="secondary" onclick="refresh()">🔄 刷新</button>
        </div>

        <div class="quick-start">
            <div class="quick-start-title">💡 快速开始：</div>
            <p>您可以选择以下方式进入版本控制：</p>
            <ul style="margin-top: 10px; padding-left: 20px;">
                <li><strong>Git Init</strong>：在当前文件夹执行 <code>git init -b main</code></li>
                <li><strong>Git Clone</strong>：在当前文件夹执行 <code>git clone &lt;repo&gt; .</code></li>
            </ul>
            <p style="margin-top: 15px;">完成上述任意操作后，您可以：</p>
            <ul style="margin-top: 10px; padding-left: 20px;">
                <li>添加远程仓库（<code>git remote add origin</code>）</li>
                <li>添加文件到暂存区（<code>git add .</code>）</li>
                <li>提交更改（<code>git commit</code>）</li>
                <li>推送到远程仓库（<code>git push -u origin main</code>）</li>
            </ul>
        </div>
    </div>

    <script>
        // 只在未初始化时获取 VS Code API
        if (!window.vscode) {
            window.vscode = acquireVsCodeApi();
        }
        const vscode = window.vscode;

        function initRepository() {
            vscode.postMessage({ command: 'initRepository' });
        }

        function cloneRepository() {
            vscode.postMessage({ command: 'cloneRepository' });
        }

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;
    }

    private _getErrorHtml(error: string): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 40px;
            text-align: center;
        }
        .error-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        h1 {
            color: var(--vscode-errorForeground);
        }
        .error-message {
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 20px;
            border-radius: 8px;
            margin-top: 20px;
            text-align: left;
        }
    </style>
</head>
<body>
    <div class="error-icon">⚠️</div>
    <h1>加载失败</h1>
    <p>无法加载 Git 数据，请确保当前工作区包含 Git 仓库。</p>
    <div class="error-message">
        <strong>错误详情:</strong><br/>
        ${error}
    </div>
</body>
</html>`;
    }
}

