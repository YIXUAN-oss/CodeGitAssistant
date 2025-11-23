import * as vscode from 'vscode';
import { GitService } from '../services/git-service';
import { CommandHistory } from '../utils/command-history';

/**
 * Git Assistant 控制面板
 */
export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

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
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
                ]
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, gitService);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, private gitService: GitService) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // 设置HTML内容
        this._update();

        // 监听面板关闭事件
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // 处理来自webview的消息
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                try {
                    switch (message.command) {
                        case 'getData':
                            await this._sendGitData();
                            break;
                        case 'refresh':
                            await this._update();
                            break;
                        case 'executeCommand':
                            await this._executeCommand(message.commandId);
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
                            await this._handleSwitchBranch(message.branch);
                            break;
                        case 'mergeBranch':
                            await this._handleMergeBranch(message.branch);
                            break;
                        case 'deleteBranch':
                            await this._handleDeleteBranch(message.branch);
                            break;
                        case 'initRepository':
                            await this._executeCommand('git-assistant.initRepository');
                            break;
                        case 'addRemote':
                            await this._executeCommand('git-assistant.addRemote');
                            break;
                        case 'initialCommit':
                            await this._executeCommand('git-assistant.initialCommit');
                            break;
                        case 'resolveConflict':
                            await this._resolveConflict(message.file, message.action);
                            break;
                        case 'openFile':
                            await this._openFile(message.file);
                            break;
                        case 'copyToClipboard':
                            await this._copyToClipboard(message.text);
                            break;
                        default:
                            console.warn(`Unknown command: ${message.command}`);
                            break;
                    }
                } catch (error) {
                    console.error('Error handling message:', error);
                    vscode.window.showErrorMessage(`处理消息时出错: ${error instanceof Error ? error.message : String(error)}`);
                }
            },
            null,
            this._disposables
        );
    }

    private async _executeCommand(commandId: string) {
        try {
            const commandName = CommandHistory.getAvailableCommands().find(c => c.id === commandId)?.name || commandId;
            CommandHistory.addCommand(commandId, commandName, true);

            await vscode.commands.executeCommand(commandId);
            await this._sendGitData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const commandName = CommandHistory.getAvailableCommands().find(c => c.id === commandId)?.name || commandId;
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

            const confirm = await vscode.window.showWarningMessage(
                `确定要将 "${branchName}" 合并到 "${currentBranch}" 吗？`,
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
                    title: `正在合并分支 ${branchName}...`,
                    cancellable: false
                },
                async () => {
                    await this.gitService.merge(branchName);
                }
            );

            vscode.window.showInformationMessage(
                `✅ 分支 "${branchName}" 已成功合并到 "${currentBranch}"`
            );
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
     * 处理删除分支
     */
    private async _handleDeleteBranch(branchName: string) {
        try {
            console.log(`收到删除分支请求: ${branchName}`);

            if (!branchName) {
                vscode.window.showErrorMessage('分支名称不能为空');
                return;
            }

            // 检查是否是当前分支
            const branches = await this.gitService.getBranches();
            if (branchName === branches.current) {
                vscode.window.showWarningMessage('不能删除当前分支，请先切换到其他分支');
                return;
            }

            // 检查分支是否存在
            if (!branches.all.includes(branchName)) {
                vscode.window.showWarningMessage(`分支 "${branchName}" 不存在`);
                return;
            }

            // 显示确认对话框
            const confirm = await vscode.window.showWarningMessage(
                `确定要删除分支 "${branchName}" 吗？`,
                { modal: true },
                '删除',
                '取消'
            );

            if (confirm !== '删除') {
                console.log('用户取消了删除操作');
                return;
            }

            console.log(`开始删除分支: ${branchName}`);
            await this.gitService.deleteBranch(branchName);
            vscode.window.showInformationMessage(`✅ 分支 "${branchName}" 已删除`);

            // 刷新数据以更新UI
            console.log('刷新Git数据...');
            await this._sendGitData();
            console.log('删除分支完成');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('删除分支失败:', errorMessage);
            vscode.window.showErrorMessage(`删除分支失败: ${errorMessage}`);
            await this._sendGitData();
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
     * 刷新控制面板数据（公共方法）
     */
    public static refresh() {
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._sendGitData();
        }
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private async _update() {
        const webview = this._panel.webview;

        try {
            // 检查是否是Git仓库
            const isRepo = await this.gitService.isRepository();

            if (!isRepo) {
                // 显示初始化界面
                this._panel.webview.html = this._getInitHtml();
                return;
            }

            // 使用React应用
            this._panel.webview.html = this._getReactHtml(webview);

            // 发送初始数据
            await this._sendGitData();
        } catch (error) {
            this._panel.webview.html = this._getErrorHtml(String(error));
        }
    }

    private async _sendGitData() {
        try {
            const isRepo = await this.gitService.isRepository();
            if (!isRepo) {
                return;
            }

            // 获取基础Git数据（使用 try-catch 包装每个可能失败的操作）
            let status: any = null;
            let branches: any = null;
            let log: any = { all: [], total: 0, latest: null };
            let remotes: any[] = [];
            let currentBranch: string | null = null;
            let conflicts: string[] = [];

            try {
                status = await this.gitService.getStatus();
            } catch (error) {
                console.warn('获取状态失败:', error);
            }

            try {
                branches = await this.gitService.getBranches();
            } catch (error) {
                console.warn('获取分支失败:', error);
                branches = { all: [], current: null, branches: {} };
            }

            try {
                log = await this.gitService.getLog(100);
            } catch (error) {
                console.warn('获取提交历史失败（可能没有提交）:', error);
                // 如果没有提交，使用空数据
                log = { all: [], total: 0, latest: null };
            }

            try {
                remotes = await this.gitService.getRemotes();
            } catch (error) {
                console.warn('获取远程仓库失败:', error);
            }

            try {
                currentBranch = await this.gitService.getCurrentBranch();
            } catch (error) {
                console.warn('获取当前分支失败:', error);
                if (branches && branches.current) {
                    currentBranch = branches.current;
                }
            }

            try {
                conflicts = await this.gitService.getConflicts();
            } catch (error) {
                console.warn('获取冲突信息失败:', error);
            }

            // 获取新的统计数据（这些可能在没有提交时失败）
            let fileStatsArray: any[] = [];
            let contributorStatsArray: any[] = [];
            let branchGraph: any = { branches: [], merges: [] };
            let timeline: any[] = [];

            try {
                const fileStats = await this.gitService.getFileStats(365);
                fileStatsArray = Array.from(fileStats.entries()).map((entry: [string, number]) => ({
                    path: entry[0],
                    count: entry[1]
                }));
            } catch (error) {
                console.warn('获取文件统计失败:', error);
            }

            try {
                const contributorStats = await this.gitService.getContributorStats(365);
                contributorStatsArray = Array.from(contributorStats.entries()).map((entry: [string, { commits: number; files: Set<string> }]) => ({
                    email: entry[0],
                    commits: entry[1].commits,
                    files: entry[1].files.size
                }));
            } catch (error) {
                console.warn('获取贡献者统计失败:', error);
            }

            try {
                branchGraph = await this.gitService.getBranchGraph();
            } catch (error) {
                console.warn('获取分支图失败:', error);
                if (branches) {
                    branchGraph = {
                        branches: branches.all || [],
                        merges: [],
                        currentBranch: currentBranch || branches.current
                    };
                }
            }

            try {
                const timelineMap = await this.gitService.getCommitTimeline(365);
                timeline = Array.from(timelineMap.entries()).map((entry: [string, number]) => ({
                    date: entry[0],
                    count: entry[1]
                }));
            } catch (error) {
                console.warn('获取时间线失败:', error);
            }

            // 确保有基本数据
            if (!status) {
                status = {
                    modified: [],
                    created: [],
                    deleted: [],
                    conflicted: [],
                    not_added: [],
                    ahead: 0,
                    behind: 0
                };
            }

            if (!branches) {
                branches = { all: [], current: null, branches: {} };
            }

            // 发送数据到webview（即使部分数据缺失也要发送，避免一直加载）
            this._panel.webview.postMessage({
                type: 'gitData',
                data: {
                    status,
                    branches,
                    log,
                    remotes,
                    currentBranch,
                    conflicts,
                    fileStats: fileStatsArray,
                    contributorStats: contributorStatsArray,
                    branchGraph: {
                        branches: branchGraph.branches || [],
                        merges: branchGraph.merges || [],
                        currentBranch: currentBranch || branchGraph.currentBranch
                    },
                    timeline,
                    commandHistory: CommandHistory.getHistory(20),
                    availableCommands: CommandHistory.getAvailableCommands(),
                    categories: CommandHistory.getCommandCategories()
                }
            });
        } catch (error) {
            console.error('Error sending git data:', error);
            // 即使出错也要发送一个空数据，避免一直加载
            this._panel.webview.postMessage({
                type: 'gitData',
                data: {
                    status: { modified: [], created: [], deleted: [], conflicted: [], not_added: [], ahead: 0, behind: 0 },
                    branches: { all: [], current: null, branches: {} },
                    log: { all: [], total: 0, latest: null },
                    remotes: [],
                    currentBranch: null,
                    conflicts: [],
                    fileStats: [],
                    contributorStats: [],
                    branchGraph: { branches: [], merges: [], currentBranch: null },
                    timeline: [],
                    commandHistory: CommandHistory.getHistory(20),
                    availableCommands: CommandHistory.getAvailableCommands(),
                    categories: CommandHistory.getCommandCategories()
                }
            });
        }
    }

    private _getReactHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'webview.js')
        );

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Assistant 可视化面板</title>
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
    </style>
</head>
<body>
    <div id="root"></div>
    <script>
        const vscode = acquireVsCodeApi();
        window.vscode = vscode;
    </script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }

    private _getHtmlForWebview(webview: vscode.Webview, data: any) {
        const { status, branches, log } = data;

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
                <button onclick="initialCommit()">📝 初始提交</button>
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
                ? data.remotes.map((remote: any) => `
                    <div class="status-item">
                        <span class="status-icon" style="color: #569cd6;">☁️</span>
                        <span><strong>${remote.name}</strong>: ${remote.refs.fetch}</span>
                    </div>
                `).join('')
                : '<div class="status-item">⚠️ 尚未添加远程仓库</div>'
            }
            <div class="button-group" style="margin-top: 15px;">
                <button onclick="addRemote()">➕ 添加远程仓库</button>
                ${!data.remotes || data.remotes.length === 0
                ? '<button onclick="initialCommit()">🚀 初始提交并推送</button>'
                : ''
            }
            </div>
        </div>

        <!-- 统计信息 -->
        <div class="section">
            <div class="section-title">仓库状态</div>
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-value">${status.modified.length}</div>
                    <div class="stat-label">已修改</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${status.created.length}</div>
                    <div class="stat-label">新创建</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${status.deleted.length}</div>
                    <div class="stat-label">已删除</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${branches.all.length}</div>
                    <div class="stat-label">分支总数</div>
                </div>
            </div>
        </div>

        <!-- 当前状态 -->
        <div class="section">
            <div class="section-title">工作区状态</div>
            ${status.modified.length === 0 && status.created.length === 0 && status.deleted.length === 0
                ? '<div class="status-item">✅ 工作区是干净的</div>'
                : ''}
            ${status.modified.map((file: string) => `
                <div class="status-item">
                    <span class="status-icon modified">M</span>
                    <span>${file}</span>
                </div>
            `).join('')}
            ${status.created.map((file: string) => `
                <div class="status-item">
                    <span class="status-icon created">A</span>
                    <span>${file}</span>
                </div>
            `).join('')}
            ${status.deleted.map((file: string) => `
                <div class="status-item">
                    <span class="status-icon deleted">D</span>
                    <span>${file}</span>
                </div>
            `).join('')}
        </div>

        <!-- 分支列表 -->
        <div class="section">
            <div class="section-title">分支列表 (当前: ${branches.current})</div>
            ${branches.all.slice(0, 10).map((branch: string) => `
                <div class="branch-item ${branch === branches.current ? 'current' : ''}">
                    ${branch === branches.current ? '✓' : '○'} ${branch}
                </div>
            `).join('')}
        </div>

        <!-- 提交历史 -->
        <div class="section">
            <div class="section-title">最近提交</div>
            ${log.all.map((commit: any) => `
                <div class="commit-item">
                    <div class="commit-hash">${commit.hash.substring(0, 8)}</div>
                    <div class="commit-message">${commit.message.split('\n')[0]}</div>
                    <div class="commit-author">${commit.author_name} · ${new Date(commit.date).toLocaleString('zh-CN')}</div>
                </div>
            `).join('')}
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

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

        function initialCommit() {
            vscode.postMessage({ command: 'initialCommit' });
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
            <button onclick="initRepository()">🚀 开始初始化</button>
            <button class="secondary" onclick="refresh()">🔄 刷新</button>
        </div>

        <div class="quick-start">
            <div class="quick-start-title">💡 快速开始：</div>
            <p>点击"开始初始化"后，我们将引导您完成：</p>
            <ul style="margin-top: 10px; padding-left: 20px;">
                <li>初始化Git仓库（<code>git init</code>）</li>
                <li>重命名分支为 main（<code>git branch -m main</code>）</li>
                <li>添加远程仓库（<code>git remote add origin</code>）</li>
                <li>添加文件到暂存区（<code>git add .</code>）</li>
                <li>创建初始提交（<code>git commit</code>）</li>
                <li>推送到远程仓库（<code>git push -u origin main</code>）</li>
            </ul>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function initRepository() {
            vscode.postMessage({ command: 'initRepository' });
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

