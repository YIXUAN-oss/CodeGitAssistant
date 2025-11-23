import React, { useState } from 'react';

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

/**
 * Git指令集组件 - 分类显示常用Git命令
 */
export const GitCommandReference: React.FC = () => {
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['init', 'basic']));
    const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState<string>('');

    const categories: CommandCategory[] = [
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
                { id: 'tag-annotated', command: 'git tag -a <name> -m "message"', description: '创建带注释的标签', example: 'git tag -a v1.0.0 -m "版本 1.0.0"' },
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

    const toggleCategory = (categoryId: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(categoryId)) {
            newExpanded.delete(categoryId);
        } else {
            newExpanded.add(categoryId);
        }
        setExpandedCategories(newExpanded);
    };

    const handleCopyCommand = async (command: string) => {
        try {
            // 发送复制命令到扩展
            vscode.postMessage({
                command: 'copyToClipboard',
                text: command
            });

            // 显示复制成功反馈
            setCopiedCommand(command);
            setTimeout(() => {
                setCopiedCommand(null);
            }, 2000);
        } catch (error) {
            console.error('复制失败:', error);
        }
    };

    // 过滤命令
    const filteredCategories = categories.map(category => {
        if (!searchTerm.trim()) {
            return category;
        }

        const searchLower = searchTerm.toLowerCase();
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

    return (
        <div className="git-command-reference" style={{
            padding: '20px',
            height: '100%',
            overflowY: 'auto'
        }}>
            <div className="section-header" style={{
                marginBottom: '24px'
            }}>
                <h2 style={{
                    fontSize: '24px',
                    fontWeight: 'bold',
                    marginBottom: '8px',
                    color: 'var(--vscode-foreground)'
                }}>
                    📚 Git 指令集
                </h2>
                <p style={{
                    fontSize: '14px',
                    color: 'var(--vscode-descriptionForeground)',
                    margin: 0
                }}>
                    常用 Git 命令参考，点击复制图标可复制命令到剪贴板
                </p>
            </div>

            {/* 搜索框 */}
            <div style={{
                marginBottom: '20px'
            }}>
                <input
                    type="text"
                    id="command-search"
                    placeholder="🔍 搜索命令..."
                    style={{
                        width: '100%',
                        padding: '10px 16px',
                        fontSize: '14px',
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border)',
                        borderRadius: '6px',
                        outline: 'none'
                    }}
                    value={searchTerm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const value = e.target.value;
                        setSearchTerm(value);
                        // 如果搜索，自动展开匹配的分类
                        if (value.trim()) {
                            const newExpanded = new Set<string>();
                            filteredCategories.forEach(cat => {
                                newExpanded.add(cat.id);
                            });
                            setExpandedCategories(newExpanded);
                        }
                    }}
                />
            </div>

            {/* 分类列表 */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
            }}>
                {filteredCategories.length === 0 && searchTerm && (
                    <div style={{
                        padding: '40px',
                        textAlign: 'center',
                        color: 'var(--vscode-descriptionForeground)'
                    }}>
                        <p>🔍 未找到匹配的命令</p>
                        <p style={{ fontSize: '12px', marginTop: '8px' }}>
                            尝试使用其他关键词搜索
                        </p>
                    </div>
                )}
                {filteredCategories.map((category) => {
                    const isExpanded = expandedCategories.has(category.id);

                    return (
                        <div
                            key={category.id}
                            style={{
                                border: '1px solid var(--vscode-panel-border)',
                                borderRadius: '8px',
                                background: 'var(--vscode-sideBar-background)',
                                overflow: 'hidden'
                            }}
                        >
                            {/* 分类标题 */}
                            <div
                                onClick={() => toggleCategory(category.id)}
                                style={{
                                    padding: '14px 18px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: 'var(--vscode-list-hoverBackground)',
                                    transition: 'background 0.2s',
                                    userSelect: 'none'
                                }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as any).style.background = 'var(--vscode-list-activeSelectionBackground)';
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as any).style.background = 'var(--vscode-list-hoverBackground)';
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ fontSize: '20px' }}>{category.icon}</span>
                                    <div>
                                        <div style={{
                                            fontWeight: 'bold',
                                            fontSize: '15px',
                                            color: 'var(--vscode-foreground)'
                                        }}>
                                            {category.name}
                                        </div>
                                        <div style={{
                                            fontSize: '12px',
                                            color: 'var(--vscode-descriptionForeground)',
                                            marginTop: '2px'
                                        }}>
                                            {category.description} ({category.commands.length} 个命令)
                                        </div>
                                    </div>
                                </div>
                                <span style={{
                                    fontSize: '14px',
                                    color: 'var(--vscode-descriptionForeground)'
                                }}>
                                    {isExpanded ? '▼' : '▶'}
                                </span>
                            </div>

                            {/* 命令列表 */}
                            {isExpanded && (
                                <div style={{
                                    padding: '12px',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))',
                                    gap: '10px'
                                }}>
                                    {category.commands.map((cmd) => {
                                        const isCopied = copiedCommand === cmd.command;

                                        return (
                                            <div
                                                key={cmd.id}
                                                style={{
                                                    padding: '12px 14px',
                                                    background: 'var(--vscode-textCodeBlock-background)',
                                                    border: '1px solid var(--vscode-panel-border)',
                                                    borderRadius: '6px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '8px',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    (e.currentTarget as any).style.borderColor = 'var(--vscode-focusBorder)';
                                                    (e.currentTarget as any).style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    (e.currentTarget as any).style.borderColor = 'var(--vscode-panel-border)';
                                                    (e.currentTarget as any).style.boxShadow = 'none';
                                                }}
                                            >
                                                {/* 命令和复制按钮 */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '10px'
                                                }}>
                                                    <code style={{
                                                        flex: 1,
                                                        fontSize: '13px',
                                                        fontFamily: 'var(--vscode-editor-font-family)',
                                                        color: 'var(--vscode-textLink-foreground)',
                                                        background: 'transparent',
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        wordBreak: 'break-all'
                                                    }}>
                                                        {cmd.command}
                                                    </code>
                                                    <button
                                                        onClick={() => handleCopyCommand(cmd.command)}
                                                        style={{
                                                            padding: '6px 10px',
                                                            background: isCopied
                                                                ? 'var(--vscode-button-secondaryBackground)'
                                                                : 'var(--vscode-button-background)',
                                                            color: isCopied
                                                                ? 'var(--vscode-button-secondaryForeground)'
                                                                : 'var(--vscode-button-foreground)',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            fontSize: '12px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            transition: 'all 0.2s',
                                                            flexShrink: 0
                                                        }}
                                                        title={isCopied ? '已复制！' : '复制命令'}
                                                        onMouseEnter={(e) => {
                                                            if (!isCopied) {
                                                                (e.currentTarget as any).style.background = 'var(--vscode-button-hoverBackground)';
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (!isCopied) {
                                                                (e.currentTarget as any).style.background = 'var(--vscode-button-background)';
                                                            }
                                                        }}
                                                    >
                                                        {isCopied ? '✓ 已复制' : '📋 复制'}
                                                    </button>
                                                </div>

                                                {/* 命令描述 */}
                                                <div style={{
                                                    fontSize: '12px',
                                                    color: 'var(--vscode-descriptionForeground)',
                                                    lineHeight: '1.5'
                                                }}>
                                                    {cmd.description}
                                                </div>

                                                {/* 命令示例 */}
                                                {cmd.example && (
                                                    <div style={{
                                                        fontSize: '11px',
                                                        color: 'var(--vscode-textLink-foreground)',
                                                        fontStyle: 'italic',
                                                        paddingLeft: '8px',
                                                        borderLeft: '2px solid var(--vscode-textLink-foreground)'
                                                    }}>
                                                        示例: <code style={{
                                                            fontSize: '11px',
                                                            background: 'var(--vscode-textCodeBlock-background)',
                                                            padding: '2px 4px',
                                                            borderRadius: '3px'
                                                        }}>{cmd.example}</code>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

declare const vscode: any;

