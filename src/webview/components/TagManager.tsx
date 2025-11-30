import React, { useState, useEffect } from 'react';

/**
 * 标签管理组件
 */
export const TagManager: React.FC<{ data: any }> = ({ data }) => {
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [isCreatingTag, setIsCreatingTag] = useState<boolean>(false);
    const [createRequestTimestamp, setCreateRequestTimestamp] = useState<number | null>(null);
    const [creationResult, setCreationResult] = useState<'success' | 'error' | null>(null);

    const handleTagClick = (tagName: string) => {
        setSelectedTag(tagName);
    };

    const handleCreateTag = () => {
        setIsCreatingTag(true);
        setCreateRequestTimestamp(Date.now());
        setCreationResult(null);
        vscode.postMessage({ command: 'createTag' });
    };

    const handleDeleteTag = (tagName: string) => {
        vscode.postMessage({
            command: 'deleteTag',
            tagName: tagName
        });
    };

    const handlePushTag = (tagName: string) => {
        vscode.postMessage({
            command: 'pushTag',
            tagName: tagName
        });
    };

    const handlePushAllTags = () => {
        vscode.postMessage({ command: 'pushAllTags' });
    };

    useEffect(() => {
        if (!isCreatingTag || !createRequestTimestamp || !data?.commandHistory) {
            return;
        }

        const matchedEntry = data.commandHistory.find(
            (item: any) =>
                item.command === 'git-assistant.createTag' &&
                item.timestamp >= createRequestTimestamp
        );

        if (matchedEntry) {
            setIsCreatingTag(false);
            setCreateRequestTimestamp(null);
            setCreationResult(matchedEntry.success ? 'success' : 'error');
        }
    }, [data?.commandHistory, isCreatingTag, createRequestTimestamp]);

    useEffect(() => {
        if (!creationResult) {
            return;
        }
        const timer = setTimeout(() => setCreationResult(null), 2500);
        return () => clearTimeout(timer);
    }, [creationResult]);

    if (!data?.tags) {
        return (
            <div className="empty-state">
                <p>🏷️ 正在加载标签信息...</p>
            </div>
        );
    }

    const localTags = data.tags || [];
    const remoteTags = data.remoteTags || [];
    const hasLocalTags = localTags.length > 0;
    const hasRemoteTags = remoteTags.length > 0;
    const hasTags = hasLocalTags || hasRemoteTags;

    return (
        <div className="tag-manager">
            <div className="section-header">
                <h2>标签管理</h2>
                <div className="header-actions">
                    <button
                        className={`primary-button ${isCreatingTag ? 'loading' : ''}`}
                        onClick={handleCreateTag}
                        disabled={isCreatingTag}
                    >
                        {isCreatingTag ? '⏳ 正在创建...' : '➕ 创建新标签'}
                    </button>
                    {hasTags && (
                        <button
                            className="secondary-button"
                            onClick={handlePushAllTags}
                            title="推送所有标签到远程"
                        >
                            📤 推送所有标签
                        </button>
                    )}
                </div>
            </div>

            {(isCreatingTag || creationResult) && (
                <div
                    className={`tag-creation-status ${creationResult ? creationResult : 'loading'}`}
                >
                    {isCreatingTag && (
                        <>
                            <span className="mini-spinner" />
                            <span>正在创建/刷新标签数据...</span>
                        </>
                    )}
                    {!isCreatingTag && creationResult === 'success' && (
                        <>
                            <span className="status-icon">✅</span>
                            <span>新标签已创建并同步</span>
                        </>
                    )}
                    {!isCreatingTag && creationResult === 'error' && (
                        <>
                            <span className="status-icon">⚠️</span>
                            <span>创建标签失败，请检查命令反馈</span>
                        </>
                    )}
                </div>
            )}

            <div className="tag-section">
                <h3>📁 本地标签 ({localTags.length})</h3>
                <div className="tag-list">
                    {hasLocalTags ? (
                        localTags.map((tag: any) => (
                            <div
                                key={tag.name}
                                className={`tag-item ${tag.name === selectedTag ? 'selected' : ''}`}
                                onClick={() => handleTagClick(tag.name)}
                            >
                                <div className="tag-info">
                                    <span className="tag-icon">🏷️</span>
                                    <div className="tag-details">
                                        <span className="tag-name">{tag.name}</span>
                                        <div className="tag-meta">
                                            <span className="tag-commit">
                                                提交: {tag.commit.substring(0, 8)}
                                            </span>
                                            {tag.message && (
                                                <span className="tag-message" title={tag.message}>
                                                    {tag.message.length > 50
                                                        ? `${tag.message.substring(0, 50)}...`
                                                        : tag.message}
                                                </span>
                                            )}
                                            {tag.date && (
                                                <span className="tag-date">
                                                    {new Date(tag.date).toLocaleString('zh-CN')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="tag-actions">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handlePushTag(tag.name);
                                        }}
                                        title="推送到远程"
                                    >
                                        📤
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteTag(tag.name);
                                        }}
                                        title="删除标签"
                                        className="danger-button"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="empty-state" style={{ padding: '20px', textAlign: 'center' }}>
                            <p style={{ color: '#888' }}>暂无本地标签</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="tag-section">
                <h3>☁️ 远程标签 ({remoteTags.length})</h3>
                <div className="tag-list">
                    {hasRemoteTags ? (
                        remoteTags.map((tag: any) => (
                            <div
                                key={tag.name}
                                className="tag-item"
                                onClick={() => handleTagClick(tag.name)}
                            >
                                <div className="tag-info">
                                    <span className="tag-icon">☁️</span>
                                    <div className="tag-details">
                                        <span className="tag-name">{tag.name}</span>
                                        <div className="tag-meta">
                                            <span className="tag-commit">
                                                提交: {tag.commit.substring(0, 8)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="empty-state" style={{ padding: '20px', textAlign: 'center' }}>
                            <p style={{ color: '#888' }}>暂无远程标签</p>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

