/**
 * 命令历史组件 - 显示已执行的快捷指令（分类显示）
 */

import { convertGitUrlToBrowserUrl } from '../utils/url.js';
import { createElement, escapeHtml, formatRelativeTime } from '../utils/dom-utils.js';
import { GitData, CommandHistoryItem, Command, Category, RepositoryState } from '../types/git.js';

// 类型定义已移至 web/types/git.ts

export class CommandHistoryComponent {
    private container: HTMLElement;
    private data: GitData | null = null;
    private expandedCategories: Set<string> = new Set();
    private isClearingHistory: boolean = false;
    private previousHistoryLength: number = 0;

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }
        this.container = container;
    }

    render(data: GitData | null) {
        this.data = data;
        if (!data) {
            this.container.innerHTML = '<div class="empty-state"><p>正在加载数据...</p></div>';
            return;
        }
        this.container.innerHTML = this.getHtml();
        this.attachEventListeners();
    }

    private getHtml(): string {
        const history = this.data?.commandHistory || [];
        const commands = this.data?.availableCommands || [];
        const categories = this.data?.categories || [];
        const repositoryState = this.getRepositoryState();

        return `
            <div class="command-history">
                ${this.getSectionHeader()}
                ${this.getRepositoryStatusHtml(repositoryState)}
                ${this.getCommandsByCategoryHtml(categories, commands, repositoryState)}
                ${this.getHistoryHtml(history)}
            </div>
        `;
    }

    private getSectionHeader(): string {
        return `
            <div class="section-header">
                <div>
                    <h2>快捷指令</h2>
                    <p class="section-description">
                        根据仓库状态分类显示可用命令和执行历史
                    </p>
                </div>
            </div>
        `;
    }

    private getRepositoryState(): RepositoryState {
        const data = this.data;
        if (!data) {
            return {
                isRepository: false,
                hasCommits: false,
                hasConflicts: false,
                hasRemote: false,
                hasUncommittedChanges: false,
                hasUnpushedCommits: false,
                currentBranch: null
            };
        }
        const isRepo = data.status !== undefined;
        const hasCommits = (data.log?.all?.length || 0) > 0;
        const hasConflicts = (data.status?.conflicted?.length || 0) > 0;
        const hasRemote = data?.remotes && data.remotes.length > 0;
        const hasUncommittedChanges = isRepo && data?.status && (
            (data.status.modified && data.status.modified.length > 0) ||
            (data.status.created && data.status.created.length > 0) ||
            (data.status.deleted && data.status.deleted.length > 0) ||
            (data.status.not_added && data.status.not_added.length > 0)
        );
        const hasUnpushedCommits = isRepo && data?.status && data.status.ahead > 0;
        const currentBranch = data?.currentBranch || data?.branches?.current || null;

        return {
            isRepository: isRepo || false,
            hasCommits: hasCommits || false,
            hasConflicts: hasConflicts || false,
            hasRemote: hasRemote || false,
            hasUncommittedChanges: hasUncommittedChanges || false,
            hasUnpushedCommits: hasUnpushedCommits || false,
            currentBranch: currentBranch || null
        };
    }

    private getRepositoryStatusHtml(state: RepositoryState): string {
        const data = this.data;
        const remotes = data?.remotes || [];

        return `
            <div class="repository-status ${state.isRepository ? 'active' : 'warning'}">
                <div class="status-header">
                    <strong>📌 当前状态：</strong>
                </div>
                <div class="status-content">
                    ${!state.isRepository ? `
                        <div>❌ 未初始化 Git 仓库</div>
                    ` : `
                        <div class="status-item">
                            <span>✅ 已初始化 Git 仓库</span>
                            ${state.currentBranch ? `<span>🌿 当前分支: <strong>${escapeHtml(state.currentBranch)}</strong></span>` : ''}
                        </div>
                        ${!state.hasCommits ? `
                            <div>⚠️ 已初始化，但还没有提交到本地仓库</div>
                        ` : `
                            <div>✅ 已提交到本地仓库</div>
                        `}
                        ${!state.hasRemote ? `
                            <div>⚠️ 未配置远程仓库</div>
                        ` : `
                            <div>
                                <div>✅ 已配置远程仓库</div>
                                ${remotes.length > 0 ? `
                                    <div class="remote-list">
                                        ${remotes.map((remote: any, index: number) => {
            const remoteUrl = remote.refs?.fetch || remote.refs?.push || '';
            const browserUrl = convertGitUrlToBrowserUrl(remoteUrl);
            const isOrigin = remote.name === 'origin';
            return `
                                                <div class="remote-item ${browserUrl ? 'clickable' : ''} ${isOrigin ? 'active' : ''}" 
                                                     data-remote-url="${browserUrl || ''}"
                                                     title="${browserUrl ? `点击在浏览器中打开: ${browserUrl}` : '无法转换为浏览器链接'}">
                                                    <div class="remote-item-content">
                                                        <span class="remote-icon">🔗</span>
                                                        <span class="remote-label">${escapeHtml(remote.name)}: </span>
                                                        <span class="remote-url-text">${escapeHtml(remoteUrl)}</span>
                                                    </div>
                                                    ${browserUrl ? '<button class="remote-open-btn">打开 →</button>' : ''}
                                                </div>
                                            `;
        }).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        `}
                        ${state.hasUncommittedChanges ? '<div>📝 有未提交的更改</div>' : ''}
                        ${state.hasUnpushedCommits ? '<div>📤 有未推送的提交</div>' : ''}
                        ${state.hasConflicts ? '<div class="error-text">⚠️ 存在合并冲突</div>' : ''}
                        ${state.isRepository && state.hasCommits && state.hasRemote &&
                !state.hasUncommittedChanges && !state.hasUnpushedCommits && !state.hasConflicts ? `
                            <div class="success-text">✨ 仓库状态正常</div>
                        ` : ''}
                    `}
                </div>
            </div>
        `;
    }

    private getCommandsByCategoryHtml(categories: Category[], commands: Command[], state: RepositoryState): string {
        return `
            <div class="commands-section">
                <h3>📋 可用命令</h3>
                ${categories.map(category => {
            const categoryCommands = commands.filter(cmd => cmd.category === category.id);
            const availableCommands = categoryCommands.filter(cmd => this.isCommandAvailable(cmd, state));

            if (availableCommands.length === 0) {
                return '';
            }

            const isExpanded = this.expandedCategories.has(category.id);

            return `
                        <div class="category-card">
                            <div class="category-header" data-category-id="${category.id}">
                                <div class="category-info">
                                    <span class="category-icon">${category.icon}</span>
                                    <div>
                                        <div class="category-name">${escapeHtml(category.name)}</div>
                                        <div class="category-desc">${escapeHtml(category.description)} (${availableCommands.length} 个可用)</div>
                                    </div>
                                </div>
                                <span class="expand-icon">${isExpanded ? '▼' : '▶'}</span>
                            </div>
                            ${isExpanded ? `
                                <div class="category-content">
                                    <div class="commands-grid">
                                        ${categoryCommands.map(cmd => {
                const isAvailable = this.isCommandAvailable(cmd, state);
                return `
                                                <div class="command-card ${isAvailable ? 'available' : 'unavailable'}" 
                                                     data-command-id="${isAvailable ? cmd.id : ''}"
                                                     title="${!isAvailable ? '当前状态不可用此命令' : cmd.description}">
                                                    <span class="command-icon">${cmd.icon}</span>
                                                    <div class="command-info">
                                                        <div class="command-name">
                                                            ${escapeHtml(cmd.name)}
                                                            ${!isAvailable ? '<span class="unavailable-badge">(不可用)</span>' : ''}
                                                        </div>
                                                        <div class="command-desc">${escapeHtml(cmd.description)}</div>
                                                    </div>
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

    private getHistoryHtml(history: CommandHistoryItem[]): string {
        return `
            <div class="history-section">
                <div class="history-header">
                    <h3>📜 执行历史</h3>
                    <button class="primary-button" id="clear-history-btn" ${this.isClearingHistory ? 'disabled' : ''}>
                        ${this.isClearingHistory ? '<span class="mini-spinner"></span> 清空中...' : '清空历史'}
                    </button>
                </div>
                ${history.length === 0 ? `
                    <div class="empty-state">
                        <p>📝 暂无执行历史</p>
                        <p class="empty-hint">点击上方的命令卡片来执行操作</p>
                    </div>
                ` : `
                    <div class="history-list">
                        ${history.map(item => `
                            <div class="history-item ${item.success ? 'success' : 'error'}">
                                <span class="history-icon">${item.success ? '✅' : '❌'}</span>
                                <div class="history-content">
                                    <div class="history-command ${item.success ? '' : 'error-text'}">
                                        ${escapeHtml(item.commandName)}
                                    </div>
                                    <div class="history-command-code">${escapeHtml(item.command)}</div>
                                    ${item.remote ? `
                                        <div class="history-remote">
                                            <span>☁️</span>
                                            <span>远程: ${escapeHtml(item.remote)}</span>
                                        </div>
                                    ` : ''}
                                    ${item.error ? `
                                        <div class="history-error">错误: ${escapeHtml(item.error)}</div>
                                    ` : ''}
                                </div>
                                <div class="history-time">${this.formatTime(item.timestamp)}</div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    }

    private attachEventListeners() {
        // 分类折叠/展开
        this.container.querySelectorAll('.category-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const categoryId = (e.currentTarget as HTMLElement).dataset.categoryId;
                if (categoryId) {
                    this.toggleCategory(categoryId);
                }
            });
        });

        // 命令执行
        this.container.querySelectorAll('.command-card.available').forEach(card => {
            card.addEventListener('click', (e) => {
                const commandId = (e.currentTarget as HTMLElement).dataset.commandId;
                if (commandId && window.vscode) {
                    window.vscode.postMessage({ command: 'executeCommand', commandId });
                }
            });
        });

        // 清空历史
        const clearBtn = this.container.querySelector('#clear-history-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (window.vscode && !this.isClearingHistory) {
                    this.isClearingHistory = true;
                    this.render(this.data);
                    window.vscode.postMessage({ command: 'clearHistory' });
                }
            });
        }

        // 远程仓库链接
        this.container.querySelectorAll('.remote-item.clickable').forEach(item => {
            item.addEventListener('click', (e) => {
                // 如果点击的是按钮，不阻止默认行为，让按钮处理
                if ((e.target as HTMLElement).closest('.remote-open-btn')) {
                    return;
                }
                const url = (e.currentTarget as HTMLElement).dataset.remoteUrl;
                if (url && window.vscode) {
                    window.vscode.postMessage({ command: 'openRemoteUrl', url });
                }
            });
        });

        // 远程仓库打开按钮
        this.container.querySelectorAll('.remote-open-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = (e.currentTarget as HTMLElement).closest('.remote-item');
                if (item) {
                    const url = item.getAttribute('data-remote-url');
                    if (url && window.vscode) {
                        window.vscode.postMessage({ command: 'openRemoteUrl', url });
                    }
                }
            });
        });

        // 检查历史是否已清空
        const history = this.data?.commandHistory || [];
        if (history.length === 0 && this.previousHistoryLength > 0 && this.isClearingHistory) {
            this.isClearingHistory = false;
        }
        this.previousHistoryLength = history.length;
    }

    private toggleCategory(categoryId: string) {
        if (this.expandedCategories.has(categoryId)) {
            this.expandedCategories.delete(categoryId);
        } else {
            this.expandedCategories.add(categoryId);
        }
        this.render(this.data);
    }

    private isCommandAvailable(command: Command, state: RepositoryState): boolean {
        const { requires } = command;
        const { isRepository, hasCommits, hasConflicts } = state;

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
    }

    private formatTime(timestamp: number): string {
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
    }
}

