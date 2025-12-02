import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../services/git-service';

/**
 * 冲突文件树项
 */
export class ConflictTreeItem extends vscode.TreeItem {
    constructor(
        public readonly filePath: string,
        private readonly workspaceRoot: string | undefined,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(filePath, collapsibleState);

        const fallbackRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const rootForResolution = this.workspaceRoot || fallbackRoot;
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : rootForResolution
                ? path.join(rootForResolution, filePath)
                : path.resolve(filePath);

        this.tooltip = `冲突文件: ${filePath}`;
        this.contextValue = 'conflictFile';
        this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));

        // 点击打开文件
        this.command = {
            command: 'vscode.open',
            title: '打开文件',
            arguments: [vscode.Uri.file(absolutePath)]
        };
    }
}

/**
 * 冲突检测数据提供者
 */
export class ConflictProvider implements vscode.TreeDataProvider<ConflictTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ConflictTreeItem | undefined | null | void> =
        new vscode.EventEmitter<ConflictTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ConflictTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private conflictDecorationType: vscode.TextEditorDecorationType;
    private fileConflictState: Map<string, boolean> = new Map();

    constructor(private gitService: GitService) {
        // 创建冲突装饰类型
        this.conflictDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.1)',
            borderRadius: '3px',
            isWholeLine: true,
            overviewRulerColor: 'red',
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });

        // 监听活动编辑器变化
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                this.checkConflicts(editor.document);
            }
        });

        // 监听文档保存与内容变化，实时更新冲突提示
        vscode.workspace.onDidSaveTextDocument(document => {
            this.checkConflicts(document);
        });

        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document === vscode.window.activeTextEditor?.document) {
                this.checkConflicts(event.document);
            }
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ConflictTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ConflictTreeItem): Promise<ConflictTreeItem[]> {
        if (element) {
            return [];
        }

        try {
            const conflicts = await this.gitService.getConflicts();

            if (conflicts.length === 0) {
                // 返回一个提示项
                const item = new vscode.TreeItem('✅ 没有冲突', vscode.TreeItemCollapsibleState.None);
                item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
                item.contextValue = 'noConflict';
                return [item as any];
            }

            const workspaceRoot = this.gitService.getWorkspaceRoot();
            return conflicts.map(file =>
                new ConflictTreeItem(file, workspaceRoot, vscode.TreeItemCollapsibleState.None)
            );
        } catch (error) {
            vscode.window.showErrorMessage(`检测冲突失败: ${error}`);
            return [];
        }
    }

    /**
     * 检查文档中的冲突标记
     */
    checkConflicts(document: vscode.TextDocument) {
        const config = vscode.workspace.getConfiguration('git-assistant');
        if (!config.get('conflictHighlight', true)) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
            return;
        }

        const text = document.getText();
        const conflictMarkers: vscode.Range[] = [];

        // 查找冲突标记
        const lines = text.split('\n');
        let inConflict = false;
        let conflictStart = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('<<<<<<<')) {
                inConflict = true;
                conflictStart = i;
            } else if (line.startsWith('>>>>>>>') && inConflict) {
                inConflict = false;
                const range = new vscode.Range(
                    new vscode.Position(conflictStart, 0),
                    new vscode.Position(i, lines[i].length)
                );
                conflictMarkers.push(range);
            }
        }

        // 应用装饰
        editor.setDecorations(this.conflictDecorationType, conflictMarkers);

        const filePath = document.uri.fsPath;
        const hasConflict = conflictMarkers.length > 0;
        this.fileConflictState.set(filePath, hasConflict);

        // 如果发现冲突，显示提示
        if (hasConflict) {
            vscode.window.showWarningMessage(
                `该文件包含 ${conflictMarkers.length} 处冲突`,
                '解决冲突'
            ).then(choice => {
                if (choice === '解决冲突') {
                    vscode.commands.executeCommand('git-assistant.resolveConflicts');
                }
            });
        }
    }

    /**
     * 清除装饰
     */
    clearDecorations() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.setDecorations(this.conflictDecorationType, []);
        }
    }
}

