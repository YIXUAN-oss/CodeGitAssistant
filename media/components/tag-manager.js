/**
 * 标签管理组件
 */
import { escapeHtml } from '../utils/dom-utils.js';
export class TagManagerComponent {
    constructor(containerId) {
        this.data = null;
        this.selectedTag = null;
        this.isCreatingTag = false;
        this.createRequestTimestamp = null;
        this.creationResult = null;
        this.creationTimeout = null;
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }
        this.container = container;
    }
    render(data) {
        this.data = data;
        this.checkCreationStatus();
        this.container.innerHTML = this.getHtml();
        this.attachEventListeners();
    }
    checkCreationStatus() {
        var _a;
        if (!this.isCreatingTag || !this.createRequestTimestamp || !((_a = this.data) === null || _a === void 0 ? void 0 : _a.commandHistory)) {
            return;
        }
        const matchedEntry = this.data.commandHistory.find((item) => item.command === 'git-assistant.createTag' &&
            item.timestamp >= this.createRequestTimestamp);
        if (matchedEntry) {
            this.isCreatingTag = false;
            this.createRequestTimestamp = null;
            this.creationResult = matchedEntry.success ? 'success' : 'error';
            if (this.creationTimeout) {
                clearTimeout(this.creationTimeout);
            }
            this.creationTimeout = window.setTimeout(() => {
                this.creationResult = null;
                if (this.data) {
                    this.render(this.data);
                }
            }, 2500);
        }
    }
    getHtml() {
        var _a;
        if (!((_a = this.data) === null || _a === void 0 ? void 0 : _a.tags)) {
            return '<div class="empty-state"><p>🏷️ 正在加载标签信息...</p></div>';
        }
        const localTags = this.data.tags || [];
        const remoteTags = this.data.remoteTags || [];
        const hasLocalTags = localTags.length > 0;
        const hasRemoteTags = remoteTags.length > 0;
        const hasTags = hasLocalTags || hasRemoteTags;
        return `
            <div class="tag-manager">
                ${this.getHeaderHtml(hasTags)}
                ${this.getCreationStatusHtml()}
                ${this.getLocalTagsHtml(localTags, hasLocalTags)}
                ${this.getRemoteTagsHtml(remoteTags, hasRemoteTags)}
            </div>
        `;
    }
    getHeaderHtml(hasTags) {
        return `
            <div class="tag-header">
                <div class="tag-header-title">
                    <h2>标签管理</h2>
                </div>
                <div class="tag-header-actions">
                    <button class="create-tag-button ${this.isCreatingTag ? 'loading' : ''}" 
                            id="create-tag-btn"
                            ${this.isCreatingTag ? 'disabled' : ''}>
                        <span class="button-icon">${this.isCreatingTag ? '⏳' : '➕'}</span>
                        <span class="button-text">${this.isCreatingTag ? '正在创建...' : '创建新标签'}</span>
                    </button>
                    ${hasTags ? `
                        <button class="push-all-tags-button" 
                                id="push-all-tags-btn"
                                title="推送所有标签到远程">
                            <span class="button-icon">📤</span>
                            <span class="button-text">推送所有标签</span>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }
    getCreationStatusHtml() {
        if (!this.isCreatingTag && !this.creationResult) {
            return '';
        }
        const status = this.creationResult || 'loading';
        let message = '';
        if (this.isCreatingTag) {
            message = '正在创建/刷新标签数据...';
        }
        else if (this.creationResult === 'success') {
            message = '新标签已创建并同步';
        }
        else if (this.creationResult === 'error') {
            message = '创建标签失败，请检查命令反馈';
        }
        return `
            <div class="tag-status ${status}">
                ${status === 'loading' ? '<span class="status-spinner"></span>' : ''}
                ${status === 'success' ? '<span class="status-icon">✅</span>' : ''}
                ${status === 'error' ? '<span class="status-icon">⚠️</span>' : ''}
                <span class="status-message">${message}</span>
            </div>
        `;
    }
    getLocalTagsHtml(tags, hasTags) {
        return `
            <div class="tag-section">
                <div class="tag-section-header">
                    <h3>📁 本地标签 (${tags.length})</h3>
                </div>
                <div class="tag-list">
                    ${hasTags ? tags.map(tag => {
            const isSelected = tag.name === this.selectedTag;
            return `
                            <div class="tag-card ${isSelected ? 'selected' : ''}" 
                                 data-tag-name="${escapeHtml(tag.name)}">
                                <div class="tag-card-content">
                                    <div class="tag-info">
                                        <span class="tag-icon">🏷️</span>
                                        <div class="tag-details">
                                            <span class="tag-name">${escapeHtml(tag.name)}</span>
                                            <div class="tag-meta">
                                                <span class="tag-commit">提交: <code>${escapeHtml(tag.commit.substring(0, 8))}</code></span>
                                                <span class="tag-name-inline">Tag ${escapeHtml(tag.name)}</span>
                                                ${tag.date ? `
                                                    <span class="tag-date">${new Date(tag.date).toLocaleString('zh-CN')}</span>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="tag-actions">
                                        <button class="tag-action-btn" 
                                                data-action="push" 
                                                data-tag="${escapeHtml(tag.name)}"
                                                title="推送到远程">
                                            <span class="action-icon">📤</span>
                                        </button>
                                        <button class="tag-action-btn danger" 
                                                data-action="delete" 
                                                data-tag="${escapeHtml(tag.name)}"
                                                title="删除标签">
                                            <span class="action-icon">🗑️</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('') : `
                        <div class="empty-state compact">
                            <div class="empty-icon">🏷️</div>
                            <p>暂无本地标签</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }
    getRemoteTagsHtml(tags, hasTags) {
        return `
            <div class="tag-section">
                <div class="tag-section-header">
                    <h3>☁️ 远程标签 (${tags.length})</h3>
                </div>
                <div class="tag-list">
                    ${hasTags ? tags.map(tag => {
            const isSelected = tag.name === this.selectedTag;
            return `
                            <div class="tag-card remote-tag ${isSelected ? 'selected' : ''}" 
                                 data-tag-name="${escapeHtml(tag.name)}">
                                <div class="tag-card-content">
                                    <div class="tag-info">
                                        <span class="tag-icon">☁️</span>
                                        <div class="tag-details">
                                            <span class="tag-name">${escapeHtml(tag.name)}</span>
                                            <div class="tag-meta">
                                                <span class="tag-commit">提交: <code>${escapeHtml(tag.commit.substring(0, 8))}</code></span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('') : `
                        <div class="empty-state compact">
                            <p>暂无远程标签</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }
    attachEventListeners() {
        // 创建标签
        const createBtn = this.container.querySelector('#create-tag-btn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.handleCreateTag();
            });
        }
        // 推送所有标签
        const pushAllBtn = this.container.querySelector('#push-all-tags-btn');
        if (pushAllBtn) {
            pushAllBtn.addEventListener('click', () => {
                if (window.vscode) {
                    window.vscode.postMessage({ command: 'pushAllTags' });
                }
            });
        }
        // 标签操作
        this.container.querySelectorAll('.tag-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const target = e.currentTarget;
                const action = target.dataset.action;
                const tagName = target.dataset.tag;
                if (!tagName || !window.vscode)
                    return;
                switch (action) {
                    case 'push':
                        window.vscode.postMessage({ command: 'pushTag', tagName });
                        break;
                    case 'delete':
                        window.vscode.postMessage({ command: 'deleteTag', tagName });
                        break;
                }
            });
        });
        // 标签选择
        this.container.querySelectorAll('.tag-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.tag-actions')) {
                    return;
                }
                const tagName = e.currentTarget.dataset.tagName;
                if (tagName && this.data) {
                    this.selectedTag = tagName;
                    this.render(this.data);
                }
            });
        });
    }
    handleCreateTag() {
        if (!this.data)
            return;
        this.isCreatingTag = true;
        this.createRequestTimestamp = Date.now();
        this.creationResult = null;
        this.render(this.data);
        if (window.vscode) {
            window.vscode.postMessage({ command: 'createTag' });
        }
    }
}
//# sourceMappingURL=tag-manager.js.map