/**
 * 主应用类 - 替代 React App 组件
 */
import { CommandHistoryComponent } from './components/command-history.js';
import { GitCommandReferenceComponent } from './components/git-command-reference.js';
import { RemoteManagerComponent } from './components/remote-manager.js';
import { BranchTreeComponent } from './components/branch-tree.js';
import { TagManagerComponent } from './components/tag-manager.js';
import { ConflictEditorComponent } from './components/conflict-editor.js';
import { CommitGraphComponent } from './components/commit-graph.js';
import { TimelineViewComponent } from './components/timeline-view.js';
import { HeatmapAnalysisComponent } from './components/heatmap-analysis.js';
import { GitGraphViewComponent } from './components/git-graph-view.js';
// VSCodeAPI 类型定义已移至 web/globals.d.ts
export class App {
    constructor() {
        var _a;
        this.gitData = null;
        this.activeTab = 'commands';
        this.isLoading = true;
        this.rootElement = null;
        // 从持久化状态中恢复上次的标签页
        const savedState = (_a = window.vscode) === null || _a === void 0 ? void 0 : _a.getState();
        if (savedState === null || savedState === void 0 ? void 0 : savedState.activeTab) {
            this.activeTab = savedState.activeTab;
        }
    }
    init() {
        this.rootElement = document.getElementById('root');
        if (!this.rootElement) {
            console.error('Root element not found');
            return;
        }
        this.setupMessageListener();
        this.render();
        this.requestData();
    }
    setupMessageListener() {
        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.type === 'gitData') {
                this.gitData = message.data;
                this.isLoading = false;
                this.render();
            }
            else if (message.type === 'gitDataUpdate') {
                // 合并更新数据到现有数据
                if (!this.gitData) {
                    this.gitData = message.data;
                }
                else {
                    this.gitData = Object.assign(Object.assign({}, this.gitData), message.data);
                }
                this.render();
            }
        });
    }
    requestData() {
        if (window.vscode) {
            window.vscode.postMessage({ command: 'getData' });
        }
    }
    render() {
        if (!this.rootElement)
            return;
        this.rootElement.innerHTML = this.getHtml();
        this.attachEventListeners();
    }
    getHtml() {
        if (this.isLoading) {
            return this.getLoadingHtml();
        }
        return `
            <div class="app-container">
                ${this.getHeaderHtml()}
                <main class="app-main">
                    ${this.getContentHtml()}
                </main>
            </div>
        `;
    }
    getLoadingHtml() {
        return `
            <div class="app-container">
                <div class="loading-container">
                    <div class="loading-spinner">
                        <div class="spinner"></div>
                    </div>
                    <p class="loading-text">正在加载数据...</p>
                </div>
            </div>
        `;
    }
    getHeaderHtml() {
        const tabs = [
            { id: 'commands', label: '📋 快捷指令' },
            { id: 'command-ref', label: '📚 Git 指令集' },
            { id: 'git-graph', label: '📋 Git 视图表' },
            { id: 'remotes', label: '☁️ 远程仓库' },
            { id: 'branches', label: '🌿 分支管理' },
            { id: 'tags', label: '🏷️ 标签管理' },
            { id: 'conflicts', label: '⚠️ 冲突解决' },
            { id: 'graph', label: '📊 提交图' },
            { id: 'timeline', label: '📅 时间线' },
            { id: 'heatmap', label: '🔥 热力图' }
        ];
        return `
            <header class="app-header">
                <div class="header-top">
                    <h1>Git Assistant 可视化面板</h1>
                    <button class="refresh-button" id="refresh-btn" title="刷新面板信息">
                        <span class="refresh-icon">🔄</span>
                    </button>
                </div>
                <div class="tab-buttons">
                    ${tabs.map(tab => `
                        <button
                            class="tab-btn ${this.activeTab === tab.id ? 'active' : ''}"
                            data-tab="${tab.id}"
                        >
                            ${tab.label}
                        </button>
                    `).join('')}
                </div>
            </header>
        `;
    }
    getContentHtml() {
        // 根据当前标签页渲染对应内容
        // 这里先返回一个占位符，后续会逐步迁移各个组件
        switch (this.activeTab) {
            case 'commands':
                return this.renderCommandHistory();
            case 'command-ref':
                return '<div id="git-command-reference-container"></div>';
            case 'remotes':
                return '<div id="remote-manager-container"></div>';
            case 'branches':
                return '<div id="branch-tree-container"></div>';
            case 'tags':
                return '<div id="tag-manager-container"></div>';
            case 'git-graph':
                return '<div id="git-graph-view-container"></div>';
            case 'conflicts':
                return '<div id="conflict-editor-container"></div>';
            case 'graph':
                return '<div id="commit-graph-container"></div>';
            case 'timeline':
                return '<div id="timeline-view-container"></div>';
            case 'heatmap':
                return '<div id="heatmap-analysis-container"></div>';
            default:
                return '<div class="empty-state">未知标签页</div>';
        }
    }
    renderCommandHistory() {
        return '<div id="command-history-container"></div>';
    }
    attachEventListeners() {
        // 标签切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target;
                const tabId = target.dataset.tab;
                if (tabId) {
                    this.activeTab = tabId;
                    // 保存状态
                    if (window.vscode) {
                        const currentState = window.vscode.getState() || {};
                        window.vscode.setState(Object.assign(Object.assign({}, currentState), { activeTab: tabId }));
                    }
                    this.render();
                }
            });
        });
        // 刷新按钮
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.isLoading = true;
                this.render();
                this.requestData();
            });
        }
        // 初始化组件
        this.initComponents();
    }
    initComponents() {
        // 命令历史组件
        if (this.activeTab === 'commands') {
            const container = document.getElementById('command-history-container');
            if (container) {
                const component = new CommandHistoryComponent('command-history-container');
                component.render(this.gitData);
            }
        }
        // Git 指令集组件
        if (this.activeTab === 'command-ref') {
            const container = document.getElementById('git-command-reference-container');
            if (container) {
                const component = new GitCommandReferenceComponent('git-command-reference-container');
                component.render();
            }
        }
        // 远程仓库管理组件
        if (this.activeTab === 'remotes') {
            const container = document.getElementById('remote-manager-container');
            if (container) {
                const component = new RemoteManagerComponent('remote-manager-container');
                component.render(this.gitData);
            }
        }
        // 分支管理组件
        if (this.activeTab === 'branches') {
            const container = document.getElementById('branch-tree-container');
            if (container) {
                const component = new BranchTreeComponent('branch-tree-container');
                component.render(this.gitData);
            }
        }
        // 标签管理组件
        if (this.activeTab === 'tags') {
            const container = document.getElementById('tag-manager-container');
            if (container) {
                const component = new TagManagerComponent('tag-manager-container');
                component.render(this.gitData);
            }
        }
        // 冲突解决组件
        if (this.activeTab === 'conflicts') {
            const container = document.getElementById('conflict-editor-container');
            if (container) {
                const component = new ConflictEditorComponent('conflict-editor-container');
                component.render(this.gitData);
            }
        }
        // 提交图组件
        if (this.activeTab === 'graph') {
            const container = document.getElementById('commit-graph-container');
            if (container) {
                const component = new CommitGraphComponent('commit-graph-container');
                component.render(this.gitData);
            }
        }
        // GitGraph 组件
        if (this.activeTab === 'git-graph') {
            const container = document.getElementById('git-graph-view-container');
            if (container) {
                const component = new GitGraphViewComponent('git-graph-view-container');
                component.render(this.gitData);
            }
        }
        // 时间线视图组件
        if (this.activeTab === 'timeline') {
            const container = document.getElementById('timeline-view-container');
            if (container) {
                const component = new TimelineViewComponent('timeline-view-container');
                component.render(this.gitData);
            }
        }
        // 热力图分析组件
        if (this.activeTab === 'heatmap') {
            const container = document.getElementById('heatmap-analysis-container');
            if (container) {
                const component = new HeatmapAnalysisComponent('heatmap-analysis-container');
                component.render(this.gitData);
            }
        }
    }
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}
//# sourceMappingURL=app.js.map