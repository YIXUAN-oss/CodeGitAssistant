import * as vscode from 'vscode';

export interface CommandHistoryItem {
    id: string;
    command: string;
    commandName: string;
    timestamp: number;
    success: boolean;
    error?: string;
    remote?: string; // 远程仓库名称（用于推送、拉取、推送标签等操作）
}

/**
 * 命令历史管理器
 */
export class CommandHistory {
    private static readonly MAX_HISTORY = 50;
    private static readonly STORAGE_KEY = 'git-assistant.commandHistory';
    private static history: CommandHistoryItem[] = [];
    private static context: vscode.ExtensionContext | null = null;

    /**
     * 初始化命令历史（从存储中加载）
     */
    static initialize(context: vscode.ExtensionContext) {
        this.context = context;
        const stored = context.globalState.get<CommandHistoryItem[]>(this.STORAGE_KEY);
        if (stored) {
            this.history = stored;
        }
    }

    /**
     * 添加命令到历史记录
     * @param command Git命令字符串
     * @param commandName 命令显示名称
     * @param success 是否成功
     * @param error 错误信息（可选）
     * @param remote 远程仓库名称（可选，用于推送、拉取等操作）
     */
    static addCommand(command: string, commandName: string, success: boolean = true, error?: string, remote?: string) {
        const item: CommandHistoryItem = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            command,
            commandName,
            timestamp: Date.now(),
            success,
            error,
            remote
        };

        this.history.unshift(item);

        // 限制历史记录数量
        if (this.history.length > this.MAX_HISTORY) {
            this.history = this.history.slice(0, this.MAX_HISTORY);
        }

        // 保存到存储
        this.save();
    }

    /**
     * 获取命令历史
     */
    static getHistory(limit: number = 20): CommandHistoryItem[] {
        return this.history.slice(0, limit);
    }

    /**
     * 清空历史记录
     */
    static clear() {
        this.history = [];
        this.save();
    }

    /**
     * 保存到存储
     */
    private static async save() {
        if (this.context) {
            await this.context.globalState.update(this.STORAGE_KEY, this.history);
        }
    }

    /**
     * 获取所有可用的命令列表
     */
    static getAvailableCommands(): Array<{ id: string; name: string; description: string; icon: string; category: string; requires: string }> {
        return [
            // 🚀 开始使用 - 不需要仓库
            { id: 'git-assistant.initRepository', name: '初始化仓库', description: '在当前文件夹初始化Git仓库 (git init)', icon: '🆕', category: 'init', requires: 'none' },
            { id: 'git-assistant.quickClone', name: '克隆仓库', description: '克隆远程Git仓库 (git clone)', icon: '📦', category: 'init', requires: 'none' },

            // ⚙️ 配置仓库 - 需要仓库，但不需要提交
            { id: 'git-assistant.addRemote', name: '添加远程仓库', description: '添加远程仓库地址 (git remote add)', icon: '☁️', category: 'setup', requires: 'repository' },

            // 📝 更改操作 - 需要仓库
            { id: 'git-assistant.addFiles', name: '暂存更改', description: '将文件添加到暂存区 (git add)', icon: '➕', category: 'changes', requires: 'repository' },
            { id: 'git-assistant.unstageFiles', name: '取消暂存', description: '从暂存区移除文件 (git reset HEAD)', icon: '↩️', category: 'changes', requires: 'repository' },
            { id: 'git-assistant.discardChanges', name: '放弃更改', description: '放弃工作区中的更改 (git checkout)', icon: '🗑️', category: 'changes', requires: 'repository' },

            // 💾 提交操作 - 需要仓库
            { id: 'git-assistant.commitChanges', name: '提交更改', description: '提交已暂存的更改 (git commit)', icon: '💾', category: 'commit', requires: 'repository' },
            { id: 'git-assistant.commitAllChanges', name: '提交所有更改', description: '提交所有已跟踪更改 (git commit -a)', icon: '📦', category: 'commit', requires: 'repository' },
            { id: 'git-assistant.undoLastCommit', name: '撤销上次提交', description: '保留更改撤销最近提交 (git reset HEAD~1 --soft)', icon: '↩️', category: 'commit', requires: 'commits' },

            // 🔄 同步操作 - 需要提交
            { id: 'git-assistant.quickPush', name: '快速推送', description: '推送当前分支到远程仓库 (git push)', icon: '📤', category: 'sync', requires: 'commits' },
            { id: 'git-assistant.quickPull', name: '快速拉取', description: '从远程仓库拉取最新更改 (git pull)', icon: '📥', category: 'sync', requires: 'commits' },

            // 🌿 分支管理 - 需要提交
            { id: 'git-assistant.createBranch', name: '创建分支', description: '创建新的Git分支 (git branch)', icon: '🌿', category: 'branch', requires: 'commits' },
            { id: 'git-assistant.switchBranch', name: '切换分支', description: '切换到指定分支 (git checkout)', icon: '🔀', category: 'branch', requires: 'commits' },
            { id: 'git-assistant.mergeBranch', name: '合并分支', description: '合并指定分支到当前分支 (git merge)', icon: '🔗', category: 'branch', requires: 'commits' },
            { id: 'git-assistant.renameBranch', name: '重命名分支', description: '重命名本地分支 (git branch -m)', icon: '✏️', category: 'branch', requires: 'commits' },
            { id: 'git-assistant.deleteBranch', name: '删除分支', description: '删除本地分支 (git branch -d)', icon: '🗑️', category: 'branch', requires: 'commits' },

            // 🏷️ 标签管理 - 需要提交
            { id: 'git-assistant.createTag', name: '创建标签', description: '创建新的Git标签（版本标记） (git tag)', icon: '🏷️', category: 'tag', requires: 'commits' },
            { id: 'git-assistant.listTags', name: '查看标签列表', description: '查看所有Git标签 (git tag -l)', icon: '📋', category: 'tag', requires: 'commits' },
            { id: 'git-assistant.deleteTag', name: '删除标签', description: '删除本地或远程标签 (git tag -d)', icon: '🗑️', category: 'tag', requires: 'commits' },
            { id: 'git-assistant.pushTag', name: '推送标签', description: '推送标签到远程仓库 (git push --tags)', icon: '📤', category: 'tag', requires: 'commits' },

            // 📊 查看操作 - 需要仓库
            { id: 'git-assistant.refreshBranches', name: '刷新分支列表', description: '刷新Git分支列表 (git branch)', icon: '🔄', category: 'view', requires: 'repository' },

            // ⚠️ 冲突处理 - 需要冲突
            { id: 'git-assistant.resolveConflicts', name: '解决冲突', description: '解决Git合并冲突 (git merge --abort)', icon: '⚠️', category: 'conflict', requires: 'conflicts' },

            // 🛠️ 工具 - 始终可用
            { id: 'git-assistant.openDashboard', name: '打开控制面板', description: '打开Git Assistant控制面板', icon: '📋', category: 'tools', requires: 'none' }
        ];
    }

    /**
     * 获取命令分类信息
     */
    static getCommandCategories(): Array<{ id: string; name: string; description: string; icon: string }> {
        return [
            {
                id: 'init',
                name: '开始使用',
                description: '初始化仓库或克隆现有仓库',
                icon: '🚀'
            },
            {
                id: 'setup',
                name: '配置仓库',
                description: '配置远程仓库和首次提交',
                icon: '⚙️'
            },
            {
                id: 'changes',
                name: '更改操作',
                description: '管理工作区和暂存区',
                icon: '📝'
            },
            {
                id: 'commit',
                name: '提交操作',
                description: '提交更改或撤销最近一次提交',
                icon: '✅'
            },
            {
                id: 'sync',
                name: '同步操作',
                description: '推送和拉取代码',
                icon: '🔄'
            },
            {
                id: 'branch',
                name: '分支管理',
                description: '创建、切换、合并分支',
                icon: '🌿'
            },
            {
                id: 'tag',
                name: '标签管理',
                description: '创建、查看、删除和推送标签',
                icon: '🏷️'
            },
            {
                id: 'view',
                name: '查看操作',
                description: '查看历史和刷新数据',
                icon: '📊'
            },
            {
                id: 'conflict',
                name: '冲突处理',
                description: '解决合并冲突',
                icon: '⚠️'
            },
            {
                id: 'tools',
                name: '工具',
                description: '辅助工具',
                icon: '🛠️'
            }
        ];
    }
}

