/**
 * 远程仓库管理组件
 */
import { convertGitUrlToBrowserUrl } from '../utils/url.js';
import { escapeHtml } from '../utils/dom-utils.js';
// 类型定义已移至 web/types/git.ts
export class RemoteManagerComponent {
    constructor(containerId) {
        this.data = null;
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }
        this.container = container;
    }
    render(data) {
        this.data = data;
        this.container.innerHTML = this.getHtml();
        this.attachEventListeners();
    }
    getHtml() {
        var _a, _b, _c, _d, _e;
        if (!this.data) {
            return '<div class="empty-state"><p>☁️ 正在加载远程仓库信息...</p></div>';
        }
        const remotes = ((_a = this.data) === null || _a === void 0 ? void 0 : _a.remotes) || [];
        const trackingInfo = ((_c = (_b = this.data) === null || _b === void 0 ? void 0 : _b.status) === null || _c === void 0 ? void 0 : _c.tracking) || '';
        let trackingRemote = null;
        let trackingBranch = null;
        if (trackingInfo && trackingInfo.includes('/')) {
            const separatorIndex = trackingInfo.indexOf('/');
            trackingRemote = trackingInfo.slice(0, separatorIndex);
            trackingBranch = trackingInfo.slice(separatorIndex + 1);
        }
        else if (trackingInfo) {
            trackingRemote = trackingInfo;
        }
        const defaultRemoteName = trackingRemote || ((_e = (_d = remotes[0]) === null || _d === void 0 ? void 0 : _d.name) !== null && _e !== void 0 ? _e : null);
        const hasRemotes = remotes.length > 0;
        return `
            <div class="remote-manager">
                ${this.getHeaderHtml()}
                ${this.getSummaryHtml(trackingRemote, trackingBranch, defaultRemoteName)}
                ${!hasRemotes ? this.getEmptyStateHtml() : this.getRemoteListHtml(remotes, trackingRemote)}
            </div>
        `;
    }
    getHeaderHtml() {
        return `
            <div class="remote-header">
                <div class="remote-header-title">
                    <h2>远程仓库管理</h2>
                </div>
                <button class="add-remote-button" id="add-remote-btn">
                    <span class="button-icon">➕</span>
                    <span class="button-text">添加远程仓库</span>
                </button>
            </div>
        `;
    }
    getSummaryHtml(trackingRemote, trackingBranch, defaultRemoteName) {
        return `
            <div class="remote-summary">
                ${trackingRemote ? `
                    <div class="summary-item success">
                        <span class="summary-icon">🌿</span>
                        <span class="summary-text">当前分支上游：<strong>${escapeHtml(trackingRemote)}/${escapeHtml(trackingBranch || '')}</strong></span>
                    </div>
                ` : `
                    <div class="summary-item warning">
                        <span class="summary-icon">⚠️</span>
                        <span class="summary-text">当前分支尚未设置上游分支</span>
                    </div>
                `}
                ${defaultRemoteName ? `
                    <div class="summary-item info">
                        <span class="summary-icon">📤</span>
                        <span class="summary-text">默认推送远程：<strong>${escapeHtml(defaultRemoteName)}</strong></span>
                    </div>
                ` : ''}
            </div>
        `;
    }
    getEmptyStateHtml() {
        return `
            <div class="empty-state">
                <div class="empty-icon">☁️</div>
                <p>当前仓库还没有任何远程仓库</p>
                <p class="empty-hint">点击上方按钮添加远程仓库</p>
            </div>
        `;
    }
    getRemoteListHtml(remotes, trackingRemote) {
        return `
            <div class="remote-list">
                ${remotes.map(remote => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            const remoteUrl = ((_a = remote.refs) === null || _a === void 0 ? void 0 : _a.fetch) || ((_b = remote.refs) === null || _b === void 0 ? void 0 : _b.push) || '';
            const browserUrl = convertGitUrlToBrowserUrl(remoteUrl);
            const isTracking = remote.name === trackingRemote;
            return `
                        <div class="remote-card ${isTracking ? 'tracking' : ''}">
                            <div class="remote-card-header">
                                <div class="remote-title">
                                    <span class="remote-icon">☁️</span>
                                    <span class="remote-name">${escapeHtml(remote.name)}</span>
                                    ${isTracking ? '<span class="remote-badge">当前分支跟踪</span>' : ''}
                                </div>
                                <div class="remote-actions">
                                    <button class="remote-action-btn" 
                                            data-action="open" 
                                            data-remote-url="${browserUrl || ''}"
                                            title="${browserUrl ? '在浏览器中打开' : '无法转换为浏览器链接'}"
                                            ${!browserUrl ? 'disabled' : ''}>
                                        <span class="action-icon">🔗</span>
                                    </button>
                                    <button class="remote-action-btn" 
                                            data-action="edit" 
                                            data-remote-name="${escapeHtml(remote.name)}"
                                            title="编辑远程仓库">
                                        <span class="action-icon">✏️</span>
                                    </button>
                                    <button class="remote-action-btn danger" 
                                            data-action="delete" 
                                            data-remote-name="${escapeHtml(remote.name)}"
                                            title="删除远程仓库">
                                        <span class="action-icon">🗑️</span>
                                    </button>
                                </div>
                            </div>
                            <div class="remote-card-body">
                                <div class="remote-url-item">
                                    <span class="url-label">fetch:</span>
                                    <span class="url-text" title="${escapeHtml(((_c = remote.refs) === null || _c === void 0 ? void 0 : _c.fetch) || '—')}">${escapeHtml(((_d = remote.refs) === null || _d === void 0 ? void 0 : _d.fetch) || '—')}</span>
                                </div>
                                <div class="remote-url-item">
                                    <span class="url-label">push:</span>
                                    <span class="url-text" title="${escapeHtml(((_e = remote.refs) === null || _e === void 0 ? void 0 : _e.push) || ((_f = remote.refs) === null || _f === void 0 ? void 0 : _f.fetch) || '—')}">${escapeHtml(((_g = remote.refs) === null || _g === void 0 ? void 0 : _g.push) || ((_h = remote.refs) === null || _h === void 0 ? void 0 : _h.fetch) || '—')}</span>
                                </div>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }
    attachEventListeners() {
        // 添加远程仓库
        const addBtn = this.container.querySelector('#add-remote-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                if (window.vscode) {
                    window.vscode.postMessage({ command: 'addRemote' });
                }
            });
        }
        // 远程仓库操作
        this.container.querySelectorAll('.remote-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                const action = target.dataset.action;
                const remoteName = target.dataset.remoteName;
                const remoteUrl = target.dataset.remoteUrl;
                if (!window.vscode)
                    return;
                switch (action) {
                    case 'open':
                        if (remoteUrl) {
                            window.vscode.postMessage({ command: 'openRemoteUrl', url: remoteUrl });
                        }
                        break;
                    case 'edit':
                        if (remoteName) {
                            window.vscode.postMessage({ command: 'editRemote', remote: remoteName });
                        }
                        break;
                    case 'delete':
                        if (remoteName) {
                            window.vscode.postMessage({ command: 'deleteRemote', remote: remoteName });
                        }
                        break;
                }
            });
        });
    }
}
//# sourceMappingURL=remote-manager.js.map