/**
 * Git指令集组件 - 分类显示常用Git命令
 */

import { escapeHtml } from '../utils/dom-utils.js';
import { GitData } from '../types/git.js';

interface GitCommand {
    id: string;
    command: string;
    description: string;
    example?: string;
}

interface CommandCategory {
    id: string;
    name: string;
    icon: string;
    description: string;
    commands: GitCommand[];
}

export class GitCommandReferenceComponent {
    private container: HTMLElement;
    private expandedCategories: Set<string> = new Set(['init', 'basic']);
    private copiedCommand: string | null = null;
    private searchTerm: string = '';

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }
        this.container = container;
    }

    render(data?: GitData | null) {
        // 这个组件不依赖数据，但为了保持接口一致性接受参数
        this.container.innerHTML = this.getHtml();
        this.attachEventListeners();
    }

    private getHtml(): string {
        const categories = this.getCategories();
        const filteredCategories = this.filterCategories(categories);

        return `
            <style>
                @media (max-width: 800px) {
                    .commands-grid-responsive {
                        grid-template-columns: 1fr !important;
                    }
                }
            </style>
            <div style="padding: 20px; height: 100%; overflow-y: auto;">
                ${this.getHeaderHtml()}
                ${this.getSearchHtml()}
                ${this.getCategoriesHtml(filteredCategories)}
            </div>
        `;
    }

    private getHeaderHtml(): string {
        return `
            <div class="section-header">
                <div>
                    <h2>Git 指令集</h2>
                    <p class="section-description">
                        常用 Git 命令参考，点击复制图标可复制命令到剪贴板
                    </p>
                </div>
            </div>
        `;
    }

    private getSearchHtml(): string {
        return `
            <div style="margin-bottom: 20px;">
                <input
                    type="text"
                    id="command-search"
                    placeholder="🔍 搜索命令..."
                    value="${escapeHtml(this.searchTerm)}"
                    style="width: 100%; padding: 10px 16px; font-size: 14px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 6px; outline: none; box-sizing: border-box;"
                />
            </div>
        `;
    }

    private getCategoriesHtml(categories: CommandCategory[]): string {
        if (categories.length === 0 && this.searchTerm.trim()) {
            return `
                <div style="padding: 40px; text-align: center; color: var(--vscode-descriptionForeground);">
                    <p>🔍 未找到匹配的命令</p>
                    <p style="font-size: 12px; margin-top: 8px;">尝试使用其他关键词搜索</p>
                </div>
            `;
        }

        return `
            <div style="display: flex; flex-direction: column; gap: 12px;">
                ${categories.map(category => {
            const isExpanded = this.expandedCategories.has(category.id);
            return `
                        <div style="border: 1px solid var(--vscode-panel-border); border-radius: 8px; background: var(--vscode-sideBar-background); overflow: hidden;">
                            <div class="category-header" data-category-id="${category.id}" 
                                 style="padding: 14px 18px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: var(--vscode-list-hoverBackground); transition: background 0.2s; user-select: none;">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <span style="font-size: 20px;">${category.icon}</span>
                                    <div>
                                        <div style="font-weight: 600; font-size: 15px; color: var(--vscode-foreground); margin-bottom: 2px;">
                                            ${escapeHtml(category.name)}
                                        </div>
                                        <div style="font-size: 12px; color: var(--vscode-descriptionForeground); line-height: 1.4;">
                                            ${escapeHtml(category.description)} (${category.commands.length}个命令)
                                        </div>
                                    </div>
                                </div>
                                <span style="font-size: 14px; color: var(--vscode-descriptionForeground);">
                                    ${isExpanded ? '▼' : '▶'}
                                </span>
                            </div>
                            ${isExpanded ? `
                                <div style="padding: 18px; display: flex; flex-direction: column; gap: 12px; background: var(--vscode-editor-background);">
                                    <div class="commands-grid-responsive" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                                        ${category.commands.map(cmd => {
                const isCopied = this.copiedCommand === cmd.command;
                return `
                                                <div class="command-item" 
                                                     style="padding: 14px 16px; background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; display: flex; flex-direction: column; gap: 10px; min-height: 80px; transition: all 0.2s;">
                                                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
                                                        <code style="flex: 1; font-size: 13px; font-family: var(--vscode-editor-font-family); color: var(--vscode-textLink-foreground); background: transparent; padding: 0; border-radius: 0; word-break: break-all; line-height: 1.4; font-weight: 500;">
                                                            ${escapeHtml(cmd.command)}
                                                        </code>
                                                        <button class="copy-button" 
                                                                data-command="${escapeHtml(cmd.command)}"
                                                                title="${isCopied ? '已复制！' : '复制命令'}"
                                                                style="padding: 6px 12px; background: ${isCopied ? '#28a745' : '#007acc'}; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 4px; transition: all 0.2s; flex-shrink: 0; white-space: nowrap;">
                                                            ${isCopied ? '✓ 已复制' : '复制'}
                                                        </button>
                                                    </div>
                                                    <div style="font-size: 13px; color: var(--vscode-descriptionForeground); line-height: 1.5; margin-top: 4px;">
                                                        ${escapeHtml(cmd.description)}
                                                    </div>
                                                    ${cmd.example ? `
                                                        <div style="font-size: 12px; color: var(--vscode-textLink-foreground); font-style: normal; padding-top: 6px; margin-top: 6px; border-top: 1px solid var(--vscode-panel-border);">
                                                            示例: <code style="font-size: 12px; font-family: var(--vscode-editor-font-family); background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; color: #d7ba7d; font-style: italic;">${escapeHtml(cmd.example)}</code>
                                                        </div>
                                                    ` : ''}
                                                </div>
                                            `;
            }).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }

    private attachEventListeners() {
        // 搜索
        const searchInput = this.container.querySelector('#command-search') as HTMLInputElement;
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const value = (e.target as HTMLInputElement).value;
                this.searchTerm = value;
                // 如果搜索，自动展开匹配的分类
                if (value.trim()) {
                    const categories = this.getCategories();
                    const filtered = this.filterCategories(categories);
                    filtered.forEach(cat => {
                        this.expandedCategories.add(cat.id);
                    });
                }
                this.render();
            });

            // 搜索框聚焦样式
            searchInput.addEventListener('focus', (e) => {
                (e.target as HTMLElement).style.borderColor = 'var(--vscode-focusBorder)';
            });
            searchInput.addEventListener('blur', (e) => {
                (e.target as HTMLElement).style.borderColor = 'var(--vscode-input-border)';
            });
        }

        // 分类折叠/展开
        this.container.querySelectorAll('.category-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const categoryId = (e.currentTarget as HTMLElement).dataset.categoryId;
                if (categoryId) {
                    this.toggleCategory(categoryId);
                }
            });

            // 悬停效果
            header.addEventListener('mouseenter', (e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--vscode-list-activeSelectionBackground)';
            });
            header.addEventListener('mouseleave', (e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--vscode-list-hoverBackground)';
            });
        });

        // 命令项悬停效果
        this.container.querySelectorAll('.command-item').forEach(item => {
            item.addEventListener('mouseenter', (e) => {
                const target = e.currentTarget as HTMLElement;
                target.style.borderColor = 'var(--vscode-focusBorder)';
                target.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
            });
            item.addEventListener('mouseleave', (e) => {
                const target = e.currentTarget as HTMLElement;
                target.style.borderColor = 'var(--vscode-panel-border)';
                target.style.boxShadow = 'none';
            });
        });

        // 复制命令
        this.container.querySelectorAll('.copy-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const command = (e.currentTarget as HTMLElement).dataset.command;
                if (command && window.vscode) {
                    window.vscode.postMessage({
                        command: 'copyToClipboard',
                        text: command
                    });
                    this.copiedCommand = command;
                    this.render();
                    setTimeout(() => {
                        this.copiedCommand = null;
                        this.render();
                    }, 2000);
                }
            });

            // 复制按钮悬停效果
            btn.addEventListener('mouseenter', (e) => {
                const target = e.currentTarget as HTMLElement;
                const isCopied = target.style.background === 'rgb(40, 167, 69)' || target.style.background === '#28a745';
                if (!isCopied) {
                    target.style.background = '#005a9e';
                }
            });
            btn.addEventListener('mouseleave', (e) => {
                const target = e.currentTarget as HTMLElement;
                const isCopied = target.style.background === 'rgb(40, 167, 69)' || target.style.background === '#28a745';
                if (!isCopied) {
                    target.style.background = '#007acc';
                }
            });
        });
    }

    private toggleCategory(categoryId: string) {
        if (this.expandedCategories.has(categoryId)) {
            this.expandedCategories.delete(categoryId);
        } else {
            this.expandedCategories.add(categoryId);
        }
        this.render();
    }

    private filterCategories(categories: CommandCategory[]): CommandCategory[] {
        if (!this.searchTerm.trim()) {
            return categories;
        }

        const searchLower = this.searchTerm.toLowerCase();
        return categories.map(category => {
            const filteredCommands = category.commands.filter(cmd =>
                cmd.command.toLowerCase().includes(searchLower) ||
                cmd.description.toLowerCase().includes(searchLower) ||
                (cmd.example && cmd.example.toLowerCase().includes(searchLower))
            );

            if (filteredCommands.length === 0) {
                return null;
            }

            return {
                ...category,
                commands: filteredCommands
            };
        }).filter((cat): cat is CommandCategory => cat !== null);
    }

    private getCategories(): CommandCategory[] {
        return [
            {
                id: 'init',
                name: '初始化与克隆',
                icon: '🚀',
                description: '仓库初始化、克隆等操作',
                commands: [
                    { id: 'init', command: 'git init', description: '初始化当前目录为Git仓库' },
                    { id: 'clone', command: 'git clone <url>', description: '克隆远程仓库', example: 'git clone https://github.com/user/repo.git' },
                    { id: 'clone-branch', command: 'git clone -b <branch> <url>', description: '克隆指定分支', example: 'git clone -b develop https://github.com/user/repo.git' },
                    { id: 'clone-depth', command: 'git clone --depth 1 <url>', description: '浅克隆（只克隆最新提交）', example: 'git clone --depth 1 https://github.com/user/repo.git' }
                ]
            },
            {
                id: 'basic',
                name: '基础操作',
                icon: '📝',
                description: '添加、提交、状态查看等基本操作',
                commands: [
                    { id: 'status', command: 'git status', description: '查看工作区状态' },
                    { id: 'add', command: 'git add <file>', description: '添加文件到暂存区', example: 'git add index.html' },
                    { id: 'add-all', command: 'git add .', description: '添加所有文件到暂存区' },
                    { id: 'commit', command: 'git commit -m "message"', description: '提交更改', example: 'git commit -m "feat: 添加新功能"' },
                    { id: 'commit-amend', command: 'git commit --amend', description: '修改最后一次提交' },
                    { id: 'commit-amend-message', command: 'git commit --amend -m "new message"', description: '修改最后一次提交信息' },
                    { id: 'log', command: 'git log', description: '查看提交历史' },
                    { id: 'log-oneline', command: 'git log --oneline', description: '单行显示提交历史' },
                    { id: 'log-graph', command: 'git log --graph --oneline --all', description: '图形化显示所有分支历史' },
                    { id: 'diff', command: 'git diff', description: '查看工作区与暂存区的差异' },
                    { id: 'diff-staged', command: 'git diff --staged', description: '查看暂存区与上次提交的差异' }
                ]
            },
            {
                id: 'branch',
                name: '分支管理',
                icon: '🌿',
                description: '分支的创建、切换、合并等操作',
                commands: [
                    { id: 'branch-list', command: 'git branch', description: '查看本地分支列表' },
                    { id: 'branch-remote', command: 'git branch -r', description: '查看远程分支列表' },
                    { id: 'branch-all', command: 'git branch -a', description: '查看所有分支（本地+远程）' },
                    { id: 'branch-create', command: 'git branch <name>', description: '创建新分支', example: 'git branch feature/new-feature' },
                    { id: 'checkout', command: 'git checkout <branch>', description: '切换到指定分支', example: 'git checkout main' },
                    { id: 'checkout-create', command: 'git checkout -b <name>', description: '创建并切换到新分支', example: 'git checkout -b feature/new' },
                    { id: 'merge', command: 'git merge <branch>', description: '合并指定分支到当前分支', example: 'git merge develop' },
                    { id: 'merge-no-ff', command: 'git merge --no-ff <branch>', description: '合并分支（保留分支历史）', example: 'git merge --no-ff feature/new' },
                    { id: 'branch-delete', command: 'git branch -d <name>', description: '删除分支（安全删除）', example: 'git branch -d feature/old' },
                    { id: 'branch-delete-force', command: 'git branch -D <name>', description: '强制删除分支', example: 'git branch -D feature/old' },
                    { id: 'branch-rename', command: 'git branch -m <old> <new>', description: '重命名分支', example: 'git branch -m old-name new-name' }
                ]
            },
            {
                id: 'remote',
                name: '远程仓库',
                icon: '☁️',
                description: '远程仓库的配置和管理',
                commands: [
                    { id: 'remote-list', command: 'git remote', description: '查看远程仓库列表' },
                    { id: 'remote-v', command: 'git remote -v', description: '查看远程仓库详细信息' },
                    { id: 'remote-add', command: 'git remote add <name> <url>', description: '添加远程仓库', example: 'git remote add origin https://github.com/user/repo.git' },
                    { id: 'remote-remove', command: 'git remote remove <name>', description: '删除远程仓库', example: 'git remote remove origin' },
                    { id: 'remote-rename', command: 'git remote rename <old> <new>', description: '重命名远程仓库', example: 'git remote rename origin upstream' },
                    { id: 'fetch', command: 'git fetch', description: '获取远程仓库更新（不合并）' },
                    { id: 'fetch-remote', command: 'git fetch <remote>', description: '从指定远程获取更新', example: 'git fetch origin' },
                    { id: 'pull', command: 'git pull', description: '拉取并合并远程更改' },
                    { id: 'pull-rebase', command: 'git pull --rebase', description: '使用rebase方式拉取' },
                    { id: 'push', command: 'git push', description: '推送到远程仓库' },
                    { id: 'push-upstream', command: 'git push -u origin <branch>', description: '推送并设置上游分支', example: 'git push -u origin main' },
                    { id: 'push-force', command: 'git push --force', description: '强制推送（危险操作）', example: 'git push --force' }
                ]
            },
            {
                id: 'tag',
                name: '标签管理',
                icon: '🏷️',
                description: '标签的创建、删除和推送',
                commands: [
                    { id: 'tag-list', command: 'git tag', description: '查看所有标签' },
                    { id: 'tag-create', command: 'git tag <name>', description: '创建轻量级标签', example: 'git tag v1.0.0' },
                    { id: 'tag-annotated', command: 'git tag -a <name> -m "message"', description: '创建带注释的标签', example: 'git tag -a v1.0.1 -m "版本 1.0.0"' },
                    { id: 'tag-push', command: 'git push origin <tag>', description: '推送单个标签', example: 'git push origin v1.0.0' },
                    { id: 'tag-push-all', command: 'git push --tags', description: '推送所有标签到远程' },
                    { id: 'tag-delete', command: 'git tag -d <name>', description: '删除本地标签', example: 'git tag -d v1.0.0' },
                    { id: 'tag-delete-remote', command: 'git push origin --delete <tag>', description: '删除远程标签', example: 'git push origin --delete v1.0.0' },
                    { id: 'tag-show', command: 'git show <tag>', description: '查看标签详细信息', example: 'git show v1.0.0' }
                ]
            },
            {
                id: 'stash',
                name: '暂存管理',
                icon: '📦',
                description: '暂存区的保存和恢复',
                commands: [
                    { id: 'stash', command: 'git stash', description: '暂存当前更改' },
                    { id: 'stash-save', command: 'git stash save "message"', description: '暂存更改并添加说明', example: 'git stash save "临时保存"' },
                    { id: 'stash-list', command: 'git stash list', description: '查看暂存列表' },
                    { id: 'stash-pop', command: 'git stash pop', description: '恢复最近的暂存' },
                    { id: 'stash-apply', command: 'git stash apply', description: '应用暂存（不删除）' },
                    { id: 'stash-drop', command: 'git stash drop', description: '删除最近的暂存' },
                    { id: 'stash-clear', command: 'git stash clear', description: '清空所有暂存' },
                    { id: 'stash-show', command: 'git stash show', description: '查看暂存内容' }
                ]
            },
            {
                id: 'reset',
                name: '撤销操作',
                icon: '↩️',
                description: '撤销、重置等操作',
                commands: [
                    { id: 'reset-soft', command: 'git reset --soft HEAD~1', description: '软重置（保留更改到暂存区）' },
                    { id: 'reset-mixed', command: 'git reset HEAD~1', description: '混合重置（保留更改到工作区）' },
                    { id: 'reset-hard', command: 'git reset --hard HEAD~1', description: '硬重置（丢弃所有更改，危险）' },
                    { id: 'reset-file', command: 'git reset HEAD <file>', description: '取消暂存文件', example: 'git reset HEAD index.html' },
                    { id: 'checkout-file', command: 'git checkout -- <file>', description: '撤销工作区文件更改', example: 'git checkout -- index.html' },
                    { id: 'restore-staged', command: 'git restore --staged <file>', description: '取消暂存文件（Git 2.23+）', example: 'git restore --staged index.html' },
                    { id: 'restore', command: 'git restore <file>', description: '恢复工作区文件（Git 2.23+）', example: 'git restore index.html' }
                ]
            },
            {
                id: 'rebase',
                name: '变基操作',
                icon: '🔄',
                description: '变基相关操作',
                commands: [
                    { id: 'rebase', command: 'git rebase <branch>', description: '变基到指定分支', example: 'git rebase main' },
                    { id: 'rebase-interactive', command: 'git rebase -i HEAD~n', description: '交互式变基', example: 'git rebase -i HEAD~3' },
                    { id: 'rebase-continue', command: 'git rebase --continue', description: '继续变基' },
                    { id: 'rebase-abort', command: 'git rebase --abort', description: '中止变基' },
                    { id: 'rebase-skip', command: 'git rebase --skip', description: '跳过当前提交' }
                ]
            },
            {
                id: 'cherry-pick',
                name: '精选提交',
                icon: '🍒',
                description: '从其他分支选择提交',
                commands: [
                    { id: 'cherry-pick', command: 'git cherry-pick <commit>', description: '应用指定提交', example: 'git cherry-pick abc1234' },
                    { id: 'cherry-pick-range', command: 'git cherry-pick <start>..<end>', description: '应用提交范围', example: 'git cherry-pick abc1234..def5678' },
                    { id: 'cherry-pick-continue', command: 'git cherry-pick --continue', description: '继续精选' },
                    { id: 'cherry-pick-abort', command: 'git cherry-pick --abort', description: '中止精选' }
                ]
            },
            {
                id: 'config',
                name: '配置管理',
                icon: '⚙️',
                description: 'Git配置相关',
                commands: [
                    { id: 'config-list', command: 'git config --list', description: '查看所有配置' },
                    { id: 'config-get', command: 'git config <key>', description: '查看指定配置', example: 'git config user.name' },
                    { id: 'config-set', command: 'git config <key> <value>', description: '设置配置', example: 'git config user.name "Your Name"' },
                    { id: 'config-global', command: 'git config --global <key> <value>', description: '设置全局配置', example: 'git config --global user.email "email@example.com"' },
                    { id: 'config-unset', command: 'git config --unset <key>', description: '删除配置', example: 'git config --unset user.name' }
                ]
            },
            {
                id: 'advanced',
                name: '高级操作',
                icon: '🔧',
                description: '高级功能和技巧',
                commands: [
                    { id: 'clean', command: 'git clean -n', description: '预览要清理的文件' },
                    { id: 'clean-force', command: 'git clean -f', description: '清理未跟踪的文件' },
                    { id: 'clean-directory', command: 'git clean -fd', description: '清理未跟踪的文件和目录' },
                    { id: 'reflog', command: 'git reflog', description: '查看引用日志' },
                    { id: 'gc', command: 'git gc', description: '清理不必要的文件并优化仓库' },
                    { id: 'submodule-add', command: 'git submodule add <url>', description: '添加子模块', example: 'git submodule add https://github.com/user/repo.git' },
                    { id: 'submodule-update', command: 'git submodule update --init --recursive', description: '更新子模块' },
                    { id: 'worktree-add', command: 'git worktree add <path> <branch>', description: '添加工作树', example: 'git worktree add ../repo-test test-branch' },
                    { id: 'worktree-list', command: 'git worktree list', description: '查看工作树列表' }
                ]
            }
        ];
    }
}

