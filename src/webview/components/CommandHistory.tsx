import React, { useState, useEffect, useRef } from 'react';
import { convertGitUrlToBrowserUrl } from '../utils/url';

interface CommandHistoryItem {
    id: string;
    command: string;
    commandName: string;
    timestamp: number;
    success: boolean;
    error?: string;
    remote?: string; // 远程仓库名称
}

interface Command {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    requires: string;
}

interface Category {
    id: string;
    name: string;
    description: string;
    icon: string;
}

/**
 * 命令历史组件 - 显示已执行的快捷指令（分类显示）
 */
export const CommandHistory: React.FC<{ data: any }> = ({ data }) => {
    const [history, setHistory] = useState<CommandHistoryItem[]>([]);
    const [availableCommands, setAvailableCommands] = useState<Command[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [isClearingHistory, setIsClearingHistory] = useState<boolean>(false);
    const previousHistoryLengthRef = useRef<number>(0);
    const [repositoryState, setRepositoryState] = useState<{
        isRepository: boolean;
        hasCommits: boolean;
        hasConflicts: boolean;
        hasRemote: boolean;
        hasUncommittedChanges: boolean;
        hasUnpushedCommits: boolean;
        currentBranch: string | null;
    }>({
        isRepository: false,
        hasCommits: false,
        hasConflicts: false,
        hasRemote: false,
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
        currentBranch: null
    });

    useEffect(() => {
        if (data?.commandHistory) {
            const currentHistoryLength = data.commandHistory.length;
            const previousHistoryLength = previousHistoryLengthRef.current;
            setHistory(data.commandHistory);

            // 如果历史已清空（从有到无）且正在清空，则停止加载状态
            if (currentHistoryLength === 0 && previousHistoryLength > 0 && isClearingHistory) {
                setIsClearingHistory(false);
            }

            // 更新历史长度引用
            previousHistoryLengthRef.current = currentHistoryLength;
        }
        if (data?.availableCommands) {
            setAvailableCommands(data.availableCommands);
        }
        if (data?.categories) {
            setCategories(data.categories);
        }

        // 判断仓库状态
        const isRepo = data?.status !== undefined;
        const hasCommits = data?.log?.all?.length > 0;
        const hasConflicts = data?.status?.conflicted?.length > 0;
        const hasRemote = data?.remotes && data.remotes.length > 0;
        const hasUncommittedChanges = isRepo && data?.status && (
            (data.status.modified && data.status.modified.length > 0) ||
            (data.status.created && data.status.created.length > 0) ||
            (data.status.deleted && data.status.deleted.length > 0) ||
            (data.status.not_added && data.status.not_added.length > 0)
        );
        const hasUnpushedCommits = isRepo && data?.status && data.status.ahead > 0;
        const currentBranch = data?.currentBranch || data?.branches?.current || null;

        setRepositoryState({
            isRepository: isRepo,
            hasCommits,
            hasConflicts,
            hasRemote,
            hasUncommittedChanges,
            hasUnpushedCommits,
            currentBranch
        });
    }, [data, isClearingHistory]);

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes}分钟前`;
        if (hours < 24) return `${hours}小时前`;
        if (days < 7) return `${days}天前`;
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const executeCommand = (commandId: string) => {
        vscode.postMessage({ command: 'executeCommand', commandId });
    };

    const handleClearHistory = () => {
        setIsClearingHistory(true);
        vscode.postMessage({ command: 'clearHistory' });
    };

    const toggleCategory = (categoryId: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(categoryId)) {
            newExpanded.delete(categoryId);
        } else {
            newExpanded.add(categoryId);
        }
        setExpandedCategories(newExpanded);
    };


    // 判断命令是否可用
    const isCommandAvailable = (command: Command): boolean => {
        const { requires } = command;
        const { isRepository, hasCommits, hasConflicts } = repositoryState;

        switch (requires) {
            case 'none':
                return true;
            case 'repository':
                return isRepository;
            case 'commits':
                return isRepository && hasCommits;
            case 'conflicts':
                return isRepository && hasConflicts;
            default:
                return true;
        }
    };

    // 获取分类的命令
    const getCommandsByCategory = (categoryId: string): Command[] => {
        return availableCommands.filter(cmd => cmd.category === categoryId);
    };

    // 判断分类是否应该显示
    const shouldShowCategory = (categoryId: string): boolean => {
        const commands = getCommandsByCategory(categoryId);
        // 如果分类中有任何可用命令，就显示该分类
        return commands.some(cmd => isCommandAvailable(cmd));
    };

    // 获取分类的可用命令数量
    const getAvailableCommandCount = (categoryId: string): number => {
        return getCommandsByCategory(categoryId).filter(cmd => isCommandAvailable(cmd)).length;
    };

    return (
        <div className="command-history">
            <div className="section-header">
                <h2>快捷指令</h2>
                <p className="section-description">
                    根据仓库状态分类显示可用命令和执行历史
                </p>
            </div>

            {/* 仓库状态提示 */}
            <div style={{
                padding: '12px 16px',
                marginBottom: '20px',
                background: repositoryState.isRepository
                    ? 'var(--vscode-textBlockQuote-background)'
                    : 'var(--vscode-inputValidation-warningBackground)',
                border: `1px solid ${repositoryState.isRepository ? 'var(--vscode-textLink-foreground)' : 'var(--vscode-inputValidation-warningBorder)'}`,
                borderRadius: '6px',
                fontSize: '13px'
            }}>
                <div style={{ marginBottom: '8px' }}>
                    <strong>📌 当前状态：</strong>
                </div>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    fontSize: '12px',
                    color: 'var(--vscode-descriptionForeground)'
                }}>
                    {!repositoryState.isRepository ? (
                        <div>❌ 未初始化 Git 仓库</div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                                <span>✅ 已初始化 Git 仓库</span>
                                {repositoryState.currentBranch && (
                                    <span>🌿 当前分支: <strong>{repositoryState.currentBranch}</strong></span>
                                )}
                            </div>

                            {!repositoryState.hasCommits ? (
                                <div>⚠️ 已初始化，但还没有提交到本地仓库</div>
                            ) : (
                                <div>✅ 已提交到本地仓库</div>
                            )}

                            {!repositoryState.hasRemote ? (
                                <div>⚠️ 未配置远程仓库</div>
                            ) : (
                                <div>
                                    <div>✅ 已配置远程仓库</div>
                                    {data?.remotes && data.remotes.length > 0 && (
                                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {data.remotes.map((remote: any) => {
                                                const remoteUrl = remote.refs?.fetch || remote.refs?.push || '';
                                                const browserUrl = convertGitUrlToBrowserUrl(remoteUrl);
                                                return (
                                                    <div
                                                        key={remote.name}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            padding: '6px 10px',
                                                            background: 'var(--vscode-list-hoverBackground)',
                                                            borderRadius: '4px',
                                                            cursor: browserUrl ? 'pointer' : 'default'
                                                        }}
                                                        onClick={() => {
                                                            if (browserUrl) {
                                                                vscode.postMessage({
                                                                    command: 'openRemoteUrl',
                                                                    url: browserUrl
                                                                });
                                                            }
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (browserUrl) {
                                                                (e.currentTarget as any).style.background = 'var(--vscode-list-activeSelectionBackground)';
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (browserUrl) {
                                                                (e.currentTarget as any).style.background = 'var(--vscode-list-hoverBackground)';
                                                            }
                                                        }}
                                                        title={browserUrl ? `点击在浏览器中打开: ${browserUrl}` : '无法转换为浏览器链接'}
                                                    >
                                                        <span style={{ fontSize: '14px' }}>🔗</span>
                                                        <span style={{ flex: 1, fontSize: '12px' }}>
                                                            <strong>{remote.name}</strong>: {remoteUrl}
                                                        </span>
                                                        {browserUrl && (
                                                            <span style={{
                                                                fontSize: '10px',
                                                                color: 'var(--vscode-textLink-foreground)',
                                                                textDecoration: 'underline'
                                                            }}>
                                                                打开 →
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {repositoryState.hasUncommittedChanges && (
                                <div>📝 有未提交的更改</div>
                            )}

                            {repositoryState.hasUnpushedCommits && (
                                <div>📤 有未推送的提交</div>
                            )}

                            {repositoryState.hasConflicts && (
                                <div style={{ color: 'var(--vscode-errorForeground)' }}>⚠️ 存在合并冲突</div>
                            )}

                            {repositoryState.isRepository &&
                                repositoryState.hasCommits &&
                                repositoryState.hasRemote &&
                                !repositoryState.hasUncommittedChanges &&
                                !repositoryState.hasUnpushedCommits &&
                                !repositoryState.hasConflicts && (
                                    <div style={{ color: 'var(--vscode-textLink-foreground)' }}>✨ 仓库状态正常</div>
                                )}
                        </>
                    )}
                </div>
            </div>


            {/* 分类命令列表 */}
            <div style={{ marginBottom: '30px' }}>
                <h3 style={{ marginBottom: '15px', fontSize: '16px', color: 'var(--vscode-textLink-foreground)' }}>
                    📋 可用命令
                </h3>

                {categories.map((category) => {
                    if (!shouldShowCategory(category.id)) {
                        return null;
                    }

                    const commands = getCommandsByCategory(category.id);
                    const availableCommandsInCategory = commands.filter(cmd => isCommandAvailable(cmd));
                    const isExpanded = expandedCategories.has(category.id);

                    if (availableCommandsInCategory.length === 0) {
                        return null;
                    }

                    return (
                        <div
                            key={category.id}
                            style={{
                                marginBottom: '15px',
                                border: '1px solid var(--vscode-panel-border)',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                background: 'var(--vscode-sideBar-background)'
                            }}
                        >
                            {/* 分类标题（可点击折叠） */}
                            <div
                                onClick={() => toggleCategory(category.id)}
                                style={{
                                    padding: '12px 16px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: 'var(--vscode-list-hoverBackground)',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as any).style.background = 'var(--vscode-list-activeSelectionBackground)';
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as any).style.background = 'var(--vscode-list-hoverBackground)';
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '18px' }}>{category.icon}</span>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                                            {category.name}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
                                            {category.description} ({availableCommandsInCategory.length} 个可用)
                                        </div>
                                    </div>
                                </div>
                                <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
                                    {isExpanded ? '▼' : '▶'}
                                </span>
                            </div>

                            {/* 分类内容（可折叠） */}
                            {isExpanded && (
                                <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {/* 命令网格 */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                        gap: '12px'
                                    }}>
                                        {commands.map((cmd) => {
                                            const isAvailable = isCommandAvailable(cmd);
                                            return (
                                                <div
                                                    key={cmd.id}
                                                    onClick={() => isAvailable && executeCommand(cmd.id)}
                                                    style={{
                                                        padding: '12px 16px',
                                                        background: isAvailable
                                                            ? 'var(--vscode-button-secondaryBackground)'
                                                            : 'var(--vscode-list-inactiveSelectionBackground)',
                                                        border: `1px solid ${isAvailable ? 'var(--vscode-panel-border)' : 'var(--vscode-panel-border)'}`,
                                                        borderRadius: '6px',
                                                        cursor: isAvailable ? 'pointer' : 'not-allowed',
                                                        transition: 'all 0.2s',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '10px',
                                                        opacity: isAvailable ? 1 : 0.6
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (isAvailable) {
                                                            (e.currentTarget as any).style.background = 'var(--vscode-button-secondaryHoverBackground)';
                                                            (e.currentTarget as any).style.borderColor = 'var(--vscode-focusBorder)';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (isAvailable) {
                                                            (e.currentTarget as any).style.background = 'var(--vscode-button-secondaryBackground)';
                                                            (e.currentTarget as any).style.borderColor = 'var(--vscode-panel-border)';
                                                        }
                                                    }}
                                                    title={!isAvailable ? '当前状态不可用此命令' : cmd.description}
                                                >
                                                    <span style={{ fontSize: '20px' }}>{cmd.icon}</span>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                                                            {cmd.name}
                                                            {!isAvailable && <span style={{ fontSize: '10px', marginLeft: '5px', color: 'var(--vscode-descriptionForeground)' }}>(不可用)</span>}
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
                                                            {cmd.description.split(' (')[0]}
                                                            {cmd.description.includes('(') && (
                                                                <span style={{
                                                                    color: 'var(--vscode-textLink-foreground)',
                                                                    fontFamily: 'monospace',
                                                                    fontSize: '10px',
                                                                    marginLeft: '4px'
                                                                }}>
                                                                    {cmd.description.match(/\(([^)]+)\)/)?.[1]}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 执行历史 */}
            <div>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '15px'
                }}>
                    <h3 style={{ fontSize: '16px', color: 'var(--vscode-textLink-foreground)', margin: 0 }}>
                        📜 执行历史
                    </h3>
                    <button
                        onClick={handleClearHistory}
                        disabled={isClearingHistory}
                        style={{
                            padding: '6px 12px',
                            background: isClearingHistory
                                ? 'var(--vscode-button-secondaryBackground)'
                                : 'var(--vscode-button-secondaryBackground)',
                            color: 'var(--vscode-button-secondaryForeground)',
                            border: '1px solid var(--vscode-panel-border)',
                            borderRadius: '4px',
                            cursor: isClearingHistory ? 'wait' : 'pointer',
                            fontSize: '12px',
                            opacity: isClearingHistory ? 0.6 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        {isClearingHistory ? (
                            <>
                                <span style={{
                                    display: 'inline-block',
                                    width: '12px',
                                    height: '12px',
                                    border: '2px solid var(--vscode-button-secondaryForeground)',
                                    borderTopColor: 'transparent',
                                    borderRadius: '50%',
                                    animation: 'spin 0.8s linear infinite'
                                }}></span>
                                清空中...
                            </>
                        ) : (
                            '清空历史'
                        )}
                    </button>
                </div>

                {history.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '40px',
                        color: 'var(--vscode-descriptionForeground)'
                    }}>
                        <p>📝 暂无执行历史</p>
                        <p style={{ fontSize: '12px', marginTop: '10px' }}>
                            点击上方的命令卡片来执行操作
                        </p>
                    </div>
                ) : (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        maxHeight: '400px',
                        overflowY: 'auto'
                    }}>
                        {history.map((item) => (
                            <div
                                key={item.id}
                                style={{
                                    padding: '12px 16px',
                                    background: item.success
                                        ? 'var(--vscode-list-hoverBackground)'
                                        : 'var(--vscode-inputValidation-errorBackground)',
                                    border: `1px solid ${item.success ? 'var(--vscode-panel-border)' : 'var(--vscode-inputValidation-errorBorder)'}`,
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}
                            >
                                <span style={{ fontSize: '18px' }}>
                                    {item.success ? '✅' : '❌'}
                                </span>
                                <div style={{ flex: 1 }}>
                                    <div style={{
                                        fontWeight: 'bold',
                                        fontSize: '14px',
                                        marginBottom: '4px',
                                        color: item.success ? 'var(--vscode-foreground)' : 'var(--vscode-errorForeground)'
                                    }}>
                                        {item.commandName}
                                    </div>
                                    <div style={{
                                        fontSize: '11px',
                                        color: 'var(--vscode-descriptionForeground)',
                                        fontFamily: 'monospace',
                                        marginBottom: (item.error || item.remote) ? '4px' : '0'
                                    }}>
                                        {item.command}
                                    </div>
                                    {item.remote && (
                                        <div style={{
                                            fontSize: '11px',
                                            color: 'var(--vscode-textLink-foreground)',
                                            marginTop: '4px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            <span>☁️</span>
                                            <span>远程: {item.remote}</span>
                                        </div>
                                    )}
                                    {item.error && (
                                        <div style={{
                                            fontSize: '11px',
                                            color: 'var(--vscode-errorForeground)',
                                            marginTop: '4px'
                                        }}>
                                            错误: {item.error}
                                        </div>
                                    )}
                                </div>
                                <div style={{
                                    fontSize: '11px',
                                    color: 'var(--vscode-descriptionForeground)',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {formatTime(item.timestamp)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
