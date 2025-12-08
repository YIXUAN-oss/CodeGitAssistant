/**
 * 冲突编辑器组件
 */

import { escapeHtml } from '../utils/dom-utils.js';
import { GitData } from '../types/git.js';

export class ConflictEditorComponent {
    private container: HTMLElement;
    private data: GitData | null = null;
    private selectedFile: string | null = null;

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
            this.container.innerHTML = '<div class="empty-state"><p>⚠️ 正在检测冲突...</p></div>';
            return;
        }
        this.container.innerHTML = this.getHtml();
        this.attachEventListeners();
    }

    private getHtml(): string {
        if (!this.data?.conflicts) {
            return '<div class="empty-state"><p>⚠️ 正在检测冲突...</p></div>';
        }

        const conflicts = this.data.conflicts || [];

        if (conflicts.length === 0) {
            return `
                <div class="empty-state success">
                    <div class="success-icon">✅</div>
                    <h2>没有冲突</h2>
                    <p>当前工作区没有发现任何冲突文件</p>
                </div>
            `;
        }

        return `
            <div class="conflict-editor">
                ${this.getHeaderHtml(conflicts.length)}
                ${this.getConflictListHtml(conflicts)}
                ${this.getGuideHtml()}
            </div>
        `;
    }

    private getHeaderHtml(count: number): string {
        return `
            <div class="section-header">
                <div>
                    <h2>冲突解决</h2>
                </div>
                <div class="conflict-count">
                    发现 <span class="count">${count}</span> 个冲突文件
                </div>
            </div>
        `;
    }

    private getConflictListHtml(conflicts: string[]): string {
        return `
            <div class="conflict-list">
                ${conflicts.map(file => {
            const isSelected = file === this.selectedFile;
            return `
                        <div class="conflict-item ${isSelected ? 'selected' : ''}" 
                             data-file="${escapeHtml(file)}">
                            <div class="conflict-header">
                                <span class="conflict-icon">⚠️</span>
                                <span class="file-path">${escapeHtml(file)}</span>
                                <button class="open-button" 
                                        data-file="${escapeHtml(file)}">
                                    📝 打开文件
                                </button>
                            </div>
                            ${isSelected ? this.getConflictActionsHtml(file) : ''}
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }

    private getConflictActionsHtml(file: string): string {
        return `
            <div class="conflict-actions">
                <h4>选择解决方式：</h4>
                <div class="action-buttons">
                    <button class="action-button current" 
                            data-action="current" 
                            data-file="${escapeHtml(file)}">
                        <div class="button-icon">←</div>
                        <div class="button-label">接受当前更改</div>
                        <div class="button-desc">保留本地修改</div>
                    </button>
                    <button class="action-button incoming" 
                            data-action="incoming" 
                            data-file="${escapeHtml(file)}">
                        <div class="button-icon">→</div>
                        <div class="button-label">接受传入更改</div>
                        <div class="button-desc">使用远程修改</div>
                    </button>
                    <button class="action-button both" 
                            data-action="both" 
                            data-file="${escapeHtml(file)}">
                        <div class="button-icon">↕</div>
                        <div class="button-label">接受所有更改</div>
                        <div class="button-desc">保留两边修改</div>
                    </button>
                </div>
                <div class="manual-edit">
                    <p>💡 提示：你也可以点击"打开文件"手动编辑解决冲突</p>
                </div>
            </div>
        `;
    }

    private getGuideHtml(): string {
        return `
            <div class="conflict-guide">
                <h3>📖 冲突解决指南</h3>
                <ul>
                    <li>
                        <strong>接受当前更改</strong>：保留你本地的修改，放弃远程的修改
                    </li>
                    <li>
                        <strong>接受传入更改</strong>：使用远程的修改，放弃你本地的修改
                    </li>
                    <li>
                        <strong>接受所有更改</strong>：同时保留本地和远程的修改
                    </li>
                    <li>
                        <strong>手动编辑</strong>：打开文件手动编辑，适合需要精细控制的情况
                    </li>
                </ul>
            </div>
        `;
    }

    private attachEventListeners() {
        // 冲突文件选择
        this.container.querySelectorAll('.conflict-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).closest('.conflict-actions') ||
                    (e.target as HTMLElement).closest('.open-button')) {
                    return;
                }
                const file = (e.currentTarget as HTMLElement).dataset.file;
                if (file) {
                    this.selectedFile = this.selectedFile === file ? null : file;
                    this.render(this.data);
                }
            });
        });

        // 打开文件
        this.container.querySelectorAll('.open-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const file = (e.currentTarget as HTMLElement).dataset.file;
                if (file && window.vscode) {
                    window.vscode.postMessage({ command: 'openFile', file });
                }
            });
        });

        // 解决冲突
        this.container.querySelectorAll('.action-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const target = e.currentTarget as HTMLElement;
                const action = target.dataset.action as 'current' | 'incoming' | 'both';
                const file = target.dataset.file;

                if (file && action && window.vscode) {
                    window.vscode.postMessage({
                        command: 'resolveConflict',
                        file,
                        action
                    });
                }
            });
        });
    }
}

