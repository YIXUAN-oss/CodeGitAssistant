import React from 'react';

interface RemoteInfo {
    name: string;
    refs?: {
        fetch?: string;
        push?: string;
    };
}

/**
 * 远程仓库管理组件
 */
export const RemoteManager: React.FC<{ data: any }> = ({ data }) => {
    const remotes: RemoteInfo[] = data?.remotes || [];

    const handleAddRemote = () => {
        vscode.postMessage({ command: 'addRemote' });
    };

    const handleEditRemote = (remoteName: string) => {
        vscode.postMessage({ command: 'editRemote', remote: remoteName });
    };

    const handleDeleteRemote = (remoteName: string) => {
        vscode.postMessage({ command: 'deleteRemote', remote: remoteName });
    };

    if (!data) {
        return (
            <div className="empty-state">
                <p>☁️ 正在加载远程仓库信息...</p>
            </div>
        );
    }

    const hasRemotes = remotes.length > 0;

    return (
        <div className="remote-manager">
            <div className="section-header">
                <h2>远程仓库管理</h2>
                <button className="primary-button" onClick={handleAddRemote}>
                    ➕ 添加远程仓库
                </button>
            </div>

            {!hasRemotes ? (
                <div className="empty-state">
                    <div className="empty-icon">☁️</div>
                    <p>当前仓库还没有任何远程仓库</p>
                    <p className="empty-hint">点击上方按钮添加远程仓库</p>
                </div>
            ) : (
                <div className="remote-list">
                    {remotes.map((remote) => (
                        <div key={remote.name} className="remote-item">
                            <div className="remote-info">
                                <div className="remote-title">
                                    <span className="remote-icon">☁️</span>
                                    <span className="remote-name">{remote.name}</span>
                                </div>
                                <div className="remote-meta">
                                    <div className="remote-url">
                                        <span>fetch:</span>
                                        <span className="url-text">{remote.refs?.fetch || '—'}</span>
                                    </div>
                                    <div className="remote-url">
                                        <span>push:</span>
                                        <span className="url-text">{remote.refs?.push || remote.refs?.fetch || '—'}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="remote-actions">
                                <button
                                    onClick={() => handleEditRemote(remote.name)}
                                    title="编辑远程仓库"
                                >
                                    ✏️
                                </button>
                                <button
                                    className="danger-button"
                                    onClick={() => handleDeleteRemote(remote.name)}
                                    title="删除远程仓库"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


