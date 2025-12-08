/**
 * 分支树组件
 */

import { escapeHtml } from '../utils/dom-utils.js';
import { GitData } from '../types/git.js';

export class BranchTreeComponent {
    private container: HTMLElement;
    private data: GitData | null = null;
    private selectedBranch: string | null = null;
    private isCreatingBranch: boolean = false;
    private createRequestTimestamp: number | null = null;
    private creationResult: 'success' | 'error' | null = null;
    private isSwitchingBranch: boolean = false;
    private switchingBranchName: string | null = null;
    private switchResult: 'success' | 'error' | null = null;
    private isMergingBranch: boolean = false;
    private mergingBranchName: string | null = null;
    private mergeResult: 'success' | 'error' | null = null;
    private previousCurrentBranch: string | null = null;
    private previousLogCount: number = 0;
    private switchTimeout: number | null = null;
    private mergeTimeout: number | null = null;
    private creationTimeout: number | null = null;

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }
        this.container = container;
    }

    render(data: GitData | null) {
        this.data = data;
        this.checkOperationStatus();
        this.container.innerHTML = this.getHtml();
        this.attachEventListeners();
    }

    private checkOperationStatus() {
        if (!this.data) return;

        const currentBranch = this.data.branches?.current;
        const currentLogCount = this.data.log?.all?.length || 0;
        const commandHistory = this.data.commandHistory || [];

        // 检查创建分支状态
        if (this.isCreatingBranch && this.createRequestTimestamp) {
            const matchedEntry = commandHistory.find((item: any) =>
                item.command === 'git-assistant.createBranch' &&
                item.timestamp >= this.createRequestTimestamp!
            );

            if (matchedEntry) {
                this.isCreatingBranch = false;
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

        // 检查切换分支状态
        if (this.isSwitchingBranch && this.switchingBranchName) {
            if (currentBranch === this.switchingBranchName && currentBranch !== this.previousCurrentBranch) {
                this.isSwitchingBranch = false;
                this.switchResult = 'success';
                this.switchingBranchName = null;
                this.previousCurrentBranch = currentBranch;
                if (this.switchTimeout) {
                    clearTimeout(this.switchTimeout);
                    this.switchTimeout = null;
                }
                window.setTimeout(() => {
                    this.switchResult = null;
                    if (this.data) {
                        this.render(this.data);
                    }
                }, 2500);
            }
        }

        // 检查合并分支状态
        if (this.isMergingBranch && this.mergingBranchName) {
            if (currentLogCount > this.previousLogCount) {
                this.isMergingBranch = false;
                this.mergeResult = 'success';
                this.mergingBranchName = null;
                this.previousLogCount = currentLogCount;
                if (this.mergeTimeout) {
                    clearTimeout(this.mergeTimeout);
                    this.mergeTimeout = null;
                }
                window.setTimeout(() => {
                    this.mergeResult = null;
                    if (this.data) {
                        this.render(this.data);
                    }
                }, 2500);
            }
        }

        this.previousCurrentBranch = currentBranch || null;
        this.previousLogCount = currentLogCount;
    }

    private getHtml(): string {
        if (!this.data?.branches) {
            return '<div class="empty-state"><p>🌿 正在加载分支信息...</p></div>';
        }

        const localBranches = this.data.branches.all.filter((b: string) => !b.startsWith('remotes/'));
        const remoteBranches = this.data.branches.all.filter((b: string) => b.startsWith('remotes/'));
        const currentBranch = this.data.branches?.current || null;

        return `
            <div class="branch-tree">
                ${this.getHeaderHtml()}
                ${this.getStatusHtml()}
                ${this.getLocalBranchesHtml(localBranches, currentBranch)}
                ${this.getRemoteBranchesHtml(remoteBranches)}
            </div>
        `;
    }

    private getHeaderHtml(): string {
        return `
            <div class="branch-header">
                <div class="branch-header-title">
                    <h2>分支管理</h2>
                </div>
                <button class="create-branch-button ${this.isCreatingBranch ? 'loading' : ''}" 
                        id="create-branch-btn"
                        ${this.isCreatingBranch ? 'disabled' : ''}>
                    <span class="button-icon">${this.isCreatingBranch ? '⏳' : '➕'}</span>
                    <span class="button-text">${this.isCreatingBranch ? '正在创建...' : '创建新分支'}</span>
                </button>
            </div>
        `;
    }

    private getStatusHtml(): string {
        const hasStatus = this.isCreatingBranch || this.creationResult ||
            this.isSwitchingBranch || this.switchResult ||
            this.isMergingBranch || this.mergeResult;

        if (!hasStatus) return '';

        const status = this.creationResult || this.switchResult || this.mergeResult || 'loading';
        const message = this.getStatusMessage();

        return `
            <div class="branch-status ${status}">
                ${status === 'loading' ? '<span class="status-spinner"></span>' : ''}
                ${status === 'success' ? '<span class="status-icon">✅</span>' : ''}
                ${status === 'error' ? '<span class="status-icon">⚠️</span>' : ''}
                <span class="status-message">${message}</span>
            </div>
        `;
    }

    private getStatusMessage(): string {
        if (this.isCreatingBranch) return '正在创建/刷新分支数据...';
        if (this.creationResult === 'success') return '新分支已创建并同步';
        if (this.creationResult === 'error') return '创建分支失败，请检查命令反馈';
        if (this.isSwitchingBranch) return `正在切换到分支 "${this.switchingBranchName}"...`;
        if (this.switchResult === 'success') return `已成功切换到分支 "${this.switchingBranchName}"`;
        if (this.switchResult === 'error') return '切换分支失败';
        if (this.isMergingBranch) return `正在合并分支 "${this.mergingBranchName}"...`;
        if (this.mergeResult === 'success') return `已成功合并分支 "${this.mergingBranchName}"`;
        if (this.mergeResult === 'error') return '合并分支失败';
        return '';
    }

    private getLocalBranchesHtml(branches: string[], currentBranch: string | null): string {
        return `
            <div class="branch-section">
                <div class="branch-section-header">
                    <h3>📁 本地分支 (${branches.length})</h3>
                </div>
                <div class="branch-list">
                    ${branches.length > 0 ? branches.map(branch => {
            const isCurrent = branch === currentBranch;
            const isSelected = branch === this.selectedBranch;
            return `
                            <div class="branch-card ${isCurrent ? 'current' : ''} ${isSelected ? 'selected' : ''}" 
                                 data-branch-name="${escapeHtml(branch)}">
                                <div class="branch-card-content">
                                    <div class="branch-info">
                                        <span class="branch-icon">${isCurrent ? '✓' : '○'}</span>
                                        <span class="branch-name">${escapeHtml(branch)}</span>
                                        ${isCurrent ? '<span class="branch-badge">当前</span>' : ''}
                                    </div>
                                    <div class="branch-actions">
                                        ${!isCurrent ? `
                                            <button class="branch-action-btn" 
                                                    data-action="switch" 
                                                    data-branch="${escapeHtml(branch)}"
                                                    title="切换到此分支">
                                                <span class="action-icon">🔀</span>
                                            </button>
                                            <button class="branch-action-btn" 
                                                    data-action="merge" 
                                                    data-branch="${escapeHtml(branch)}"
                                                    title="合并到当前分支">
                                                <span class="action-icon">🔗</span>
                                            </button>
                                        ` : ''}
                                        <button class="branch-action-btn" 
                                                data-action="rename" 
                                                data-branch="${escapeHtml(branch)}"
                                                title="重命名分支">
                                            <span class="action-icon">✏️</span>
                                        </button>
                                        ${!isCurrent ? `
                                            <button class="branch-action-btn danger" 
                                                    data-action="delete" 
                                                    data-branch="${escapeHtml(branch)}"
                                                    title="删除分支">
                                                <span class="action-icon">🗑️</span>
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('') : `
                        <div class="empty-state compact">
                            <p>暂无本地分支</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    private getRemoteBranchesHtml(branches: string[]): string {
        return `
            <div class="branch-section">
                <div class="branch-section-header">
                    <h3>☁️ 远程分支 (${branches.length})</h3>
                </div>
                <div class="branch-list">
                    ${branches.length > 0 ? branches.map(branch => {
            const displayName = branch.replace('remotes/', '');
            return `
                            <div class="branch-card remote-branch">
                                <div class="branch-card-content">
                                    <div class="branch-info">
                                        <span class="branch-icon">☁️</span>
                                        <span class="branch-name">${escapeHtml(displayName)}</span>
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('') : `
                        <div class="empty-state compact">
                            <p>暂无远程分支</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    private attachEventListeners() {
        // 创建分支
        const createBtn = this.container.querySelector('#create-branch-btn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.handleCreateBranch();
            });
        }

        // 分支操作
        this.container.querySelectorAll('.branch-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const target = e.currentTarget as HTMLElement;
                const action = target.dataset.action;
                const branchName = target.dataset.branch;

                if (!branchName || !window.vscode) return;

                switch (action) {
                    case 'switch':
                        this.handleSwitchBranch(branchName);
                        break;
                    case 'merge':
                        this.handleMergeBranch(branchName);
                        break;
                    case 'rename':
                        window.vscode.postMessage({ command: 'renameBranch', branch: branchName });
                        break;
                    case 'delete':
                        window.vscode.postMessage({ command: 'deleteBranch', branch: branchName });
                        break;
                }
            });
        });

        // 分支选择
        this.container.querySelectorAll('.branch-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).closest('.branch-actions')) {
                    return;
                }
                const branchName = (e.currentTarget as HTMLElement).dataset.branchName;
                if (branchName && this.data) {
                    this.selectedBranch = branchName;
                    this.render(this.data);
                }
            });
        });
    }

    private handleCreateBranch() {
        if (!this.data) return;
        this.isCreatingBranch = true;
        this.createRequestTimestamp = Date.now();
        this.creationResult = null;
        this.render(this.data);

        if (window.vscode) {
            window.vscode.postMessage({ command: 'createBranch' });
        }
    }

    private handleSwitchBranch(branchName: string) {
        if (!this.data) return;
        this.isSwitchingBranch = true;
        this.switchingBranchName = branchName;
        this.switchResult = null;
        this.previousCurrentBranch = this.data.branches?.current || null;
        this.render(this.data);

        if (this.switchTimeout) {
            clearTimeout(this.switchTimeout);
        }
        this.switchTimeout = window.setTimeout(() => {
            if (this.isSwitchingBranch && this.data) {
                this.isSwitchingBranch = false;
                this.switchingBranchName = null;
                this.render(this.data);
            }
        }, 5000);

        if (window.vscode) {
            window.vscode.postMessage({ command: 'switchBranch', branch: branchName });
        }
    }

    private handleMergeBranch(branchName: string) {
        if (!this.data) return;
        this.isMergingBranch = true;
        this.mergingBranchName = branchName;
        this.mergeResult = null;
        this.previousLogCount = this.data.log?.all?.length || 0;
        this.render(this.data);

        if (this.mergeTimeout) {
            clearTimeout(this.mergeTimeout);
        }
        this.mergeTimeout = window.setTimeout(() => {
            if (this.isMergingBranch && this.data) {
                this.isMergingBranch = false;
                this.mergingBranchName = null;
                this.render(this.data);
            }
        }, 5000);

        if (window.vscode) {
            window.vscode.postMessage({ command: 'mergeBranch', branch: branchName });
        }
    }
}

