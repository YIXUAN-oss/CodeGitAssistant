import * as vscode from 'vscode';
import { GitService } from './services/git-service';
import { BranchProvider } from './providers/branch-provider';
import { HistoryProvider } from './providers/history-provider';
import { ConflictProvider } from './providers/conflict-provider';
import { registerCommands } from './commands';
import { DashboardPanel } from './webview/dashboard-panel';
import { Logger } from './utils/logger';
import { CommandHistory } from './utils/command-history';
import { MergeHistory } from './utils/merge-history';

/**
 * 扩展激活函数
 */
export function activate(context: vscode.ExtensionContext) {
    Logger.initialize();
    Logger.info('Git Assistant 扩展已激活');

    // 初始化命令历史与合并历史
    CommandHistory.initialize(context);
    MergeHistory.initialize(context);

    // 初始化Git服务
    const gitService = new GitService();

    // 注册数据提供者
    const branchProvider = new BranchProvider(gitService);
    const historyProvider = new HistoryProvider(gitService);
    const conflictProvider = new ConflictProvider(gitService);

    // 刷新所有提供者的函数
    const refreshAllProviders = () => {
        Logger.debug('刷新所有Git提供者');
        branchProvider.refresh();
        historyProvider.refresh();
        conflictProvider.refresh();
    };

    // 注册树视图
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('git-assistant.branchView', branchProvider)
    );
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('git-assistant.historyView', historyProvider)
    );
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('git-assistant.conflictView', conflictProvider)
    );

    // 注册所有命令
    registerCommands(context, gitService, branchProvider, historyProvider, conflictProvider);

    // 状态栏项
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(git-branch) Git Assistant';
    statusBarItem.tooltip = '打开 Git Assistant 控制面板';
    statusBarItem.command = 'git-assistant.openDashboard';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // 监听工作区文件夹变化（多工作区支持）
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
            Logger.info('工作区文件夹发生变化');
            // 重新初始化Git服务以适应新的工作区
            if (event.added.length > 0 || event.removed.length > 0) {
                gitService.reinitialize();
                refreshAllProviders();
            }
        })
    );

    // 优化文件系统监听 - 只监听关键Git文件以减少资源消耗
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        // 使用防抖来避免频繁刷新
        let refreshTimeout: NodeJS.Timeout | undefined;
        const debouncedRefresh = () => {
            if (refreshTimeout) {
                clearTimeout(refreshTimeout);
            }
            refreshTimeout = setTimeout(() => {
                refreshAllProviders();
            }, 300); // 300ms防抖
        };

        // 为每个工作区创建监听器
        workspaceFolders.forEach((folder) => {
            // 监听HEAD文件变化（分支切换、提交等）
            const headWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(folder, '.git/HEAD')
            );

            // 监听分支引用变化（创建/删除分支）
            const refsWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(folder, '.git/refs/heads/**')
            );

            headWatcher.onDidChange(debouncedRefresh);
            headWatcher.onDidCreate(debouncedRefresh);
            refsWatcher.onDidChange(debouncedRefresh);
            refsWatcher.onDidCreate(debouncedRefresh);
            refsWatcher.onDidDelete(debouncedRefresh);

            context.subscriptions.push(headWatcher, refsWatcher);
        });
    }

    // 自动检测冲突
    const config = vscode.workspace.getConfiguration('git-assistant');
    if (config.get('conflictHighlight')) {
        context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument((document) => {
                conflictProvider.checkConflicts(document);
            })
        );
    }

    // 欢迎消息
    vscode.window.showInformationMessage('Git Assistant 已就绪！使用 Ctrl+Alt+P 快速推送');
}

/**
 * 扩展停用函数
 */
export function deactivate() {
    Logger.info('Git Assistant 扩展已停用');
    Logger.dispose();
}

