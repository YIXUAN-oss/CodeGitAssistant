/**
 * 分支树组件
 */
import { escapeHtml } from '../utils/dom-utils.js';
var BranchTreeComponent = /** @class */ (function () {
    function BranchTreeComponent(containerId) {
        this.data = null;
        this.selectedBranch = null;
        this.isCreatingBranch = false;
        this.createRequestTimestamp = null;
        this.creationResult = null;
        this.isSwitchingBranch = false;
        this.switchingBranchName = null;
        this.switchResult = null;
        this.isMergingBranch = false;
        this.mergingBranchName = null;
        this.mergeResult = null;
        this.previousCurrentBranch = null;
        this.previousLogCount = 0;
        this.switchTimeout = null;
        this.mergeTimeout = null;
        this.creationTimeout = null;
        var container = document.getElementById(containerId);
        if (!container) {
            throw new Error("Container ".concat(containerId, " not found"));
        }
        this.container = container;
    }
    BranchTreeComponent.prototype.render = function (data) {
        this.data = data;
        this.checkOperationStatus();
        this.container.innerHTML = this.getHtml();
        this.attachEventListeners();
    };
    BranchTreeComponent.prototype.checkOperationStatus = function () {
        var _this = this;
        var _a, _b, _c;
        if (!this.data)
            return;
        var currentBranch = (_a = this.data.branches) === null || _a === void 0 ? void 0 : _a.current;
        var currentLogCount = ((_c = (_b = this.data.log) === null || _b === void 0 ? void 0 : _b.all) === null || _c === void 0 ? void 0 : _c.length) || 0;
        var commandHistory = this.data.commandHistory || [];
        // 检查创建分支状态
        if (this.isCreatingBranch && this.createRequestTimestamp) {
            var matchedEntry = commandHistory.find(function (item) {
                return item.command === 'git-assistant.createBranch' &&
                    item.timestamp >= _this.createRequestTimestamp;
            });
            if (matchedEntry) {
                this.isCreatingBranch = false;
                this.createRequestTimestamp = null;
                this.creationResult = matchedEntry.success ? 'success' : 'error';
                if (this.creationTimeout) {
                    clearTimeout(this.creationTimeout);
                }
                this.creationTimeout = window.setTimeout(function () {
                    _this.creationResult = null;
                    if (_this.data) {
                        _this.render(_this.data);
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
                window.setTimeout(function () {
                    _this.switchResult = null;
                    if (_this.data) {
                        _this.render(_this.data);
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
                window.setTimeout(function () {
                    _this.mergeResult = null;
                    if (_this.data) {
                        _this.render(_this.data);
                    }
                }, 2500);
            }
        }
        this.previousCurrentBranch = currentBranch || null;
        this.previousLogCount = currentLogCount;
    };
    BranchTreeComponent.prototype.getHtml = function () {
        var _a, _b;
        if (!((_a = this.data) === null || _a === void 0 ? void 0 : _a.branches)) {
            return '<div class="empty-state"><p>🌿 正在加载分支信息...</p></div>';
        }
        var localBranches = this.data.branches.all.filter(function (b) { return !b.startsWith('remotes/'); });
        var remoteBranches = this.data.branches.all.filter(function (b) { return b.startsWith('remotes/'); });
        var currentBranch = ((_b = this.data.branches) === null || _b === void 0 ? void 0 : _b.current) || null;
        return "\n            <div class=\"branch-tree\">\n                ".concat(this.getHeaderHtml(), "\n                ").concat(this.getStatusHtml(), "\n                ").concat(this.getLocalBranchesHtml(localBranches, currentBranch), "\n                ").concat(this.getRemoteBranchesHtml(remoteBranches), "\n            </div>\n        ");
    };
    BranchTreeComponent.prototype.getHeaderHtml = function () {
        return "\n            <div class=\"branch-header\">\n                <div class=\"branch-header-title\">\n                    <h2>\u5206\u652F\u7BA1\u7406</h2>\n                </div>\n                <button class=\"create-branch-button ".concat(this.isCreatingBranch ? 'loading' : '', "\" \n                        id=\"create-branch-btn\"\n                        ").concat(this.isCreatingBranch ? 'disabled' : '', ">\n                    <span class=\"button-icon\">").concat(this.isCreatingBranch ? '⏳' : '➕', "</span>\n                    <span class=\"button-text\">").concat(this.isCreatingBranch ? '正在创建...' : '创建新分支', "</span>\n                </button>\n            </div>\n        ");
    };
    BranchTreeComponent.prototype.getStatusHtml = function () {
        var hasStatus = this.isCreatingBranch || this.creationResult ||
            this.isSwitchingBranch || this.switchResult ||
            this.isMergingBranch || this.mergeResult;
        if (!hasStatus)
            return '';
        var status = this.creationResult || this.switchResult || this.mergeResult || 'loading';
        var message = this.getStatusMessage();
        return "\n            <div class=\"branch-status ".concat(status, "\">\n                ").concat(status === 'loading' ? '<span class="status-spinner"></span>' : '', "\n                ").concat(status === 'success' ? '<span class="status-icon">✅</span>' : '', "\n                ").concat(status === 'error' ? '<span class="status-icon">⚠️</span>' : '', "\n                <span class=\"status-message\">").concat(message, "</span>\n            </div>\n        ");
    };
    BranchTreeComponent.prototype.getStatusMessage = function () {
        if (this.isCreatingBranch)
            return '正在创建/刷新分支数据...';
        if (this.creationResult === 'success')
            return '新分支已创建并同步';
        if (this.creationResult === 'error')
            return '创建分支失败，请检查命令反馈';
        if (this.isSwitchingBranch)
            return "\u6B63\u5728\u5207\u6362\u5230\u5206\u652F \"".concat(this.switchingBranchName, "\"...");
        if (this.switchResult === 'success')
            return "\u5DF2\u6210\u529F\u5207\u6362\u5230\u5206\u652F \"".concat(this.switchingBranchName, "\"");
        if (this.switchResult === 'error')
            return '切换分支失败';
        if (this.isMergingBranch)
            return "\u6B63\u5728\u5408\u5E76\u5206\u652F \"".concat(this.mergingBranchName, "\"...");
        if (this.mergeResult === 'success')
            return "\u5DF2\u6210\u529F\u5408\u5E76\u5206\u652F \"".concat(this.mergingBranchName, "\"");
        if (this.mergeResult === 'error')
            return '合并分支失败';
        return '';
    };
    BranchTreeComponent.prototype.getLocalBranchesHtml = function (branches, currentBranch) {
        var _this = this;
        return "\n            <div class=\"branch-section\">\n                <div class=\"branch-section-header\">\n                    <h3>\uD83C\uDF3F \u672C\u5730\u5206\u652F (".concat(branches.length, ")</h3>\n                </div>\n                <div class=\"branch-list\">\n                    ").concat(branches.length > 0 ? branches.map(function (branch) {
            var isCurrent = branch === currentBranch;
            var isSelected = branch === _this.selectedBranch;
            return "\n                            <div class=\"branch-card ".concat(isCurrent ? 'current' : '', " ").concat(isSelected ? 'selected' : '', "\" \n                                 data-branch-name=\"").concat(escapeHtml(branch), "\">\n                                <div class=\"branch-card-content\">\n                                    <div class=\"branch-info\">\n                                        <span class=\"branch-icon\">").concat(isCurrent ? '✓' : '○', "</span>\n                                        <span class=\"branch-name\">").concat(escapeHtml(branch), "</span>\n                                        ").concat(isCurrent ? '<span class="branch-badge">当前</span>' : '', "\n                                    </div>\n                                    <div class=\"branch-actions\">\n                                        ").concat(!isCurrent ? "\n                                            <button class=\"branch-action-btn\" \n                                                    data-action=\"switch\" \n                                                    data-branch=\"".concat(escapeHtml(branch), "\"\n                                                    title=\"\u5207\u6362\u5230\u6B64\u5206\u652F\">\n                                                <span class=\"action-icon\">\uD83D\uDD00</span>\n                                            </button>\n                                            <button class=\"branch-action-btn\" \n                                                    data-action=\"merge\" \n                                                    data-branch=\"").concat(escapeHtml(branch), "\"\n                                                    title=\"\u5408\u5E76\u5230\u5F53\u524D\u5206\u652F\">\n                                                <span class=\"action-icon\">\uD83D\uDD17</span>\n                                            </button>\n                                        ") : '', "\n                                        <button class=\"branch-action-btn\" \n                                                data-action=\"rename\" \n                                                data-branch=\"").concat(escapeHtml(branch), "\"\n                                                title=\"\u91CD\u547D\u540D\u5206\u652F\">\n                                            <span class=\"action-icon\">\u270F\uFE0F</span>\n                                        </button>\n                                        ").concat(!isCurrent ? "\n                                            <button class=\"branch-action-btn danger\" \n                                                    data-action=\"delete\" \n                                                    data-branch=\"".concat(escapeHtml(branch), "\"\n                                                    title=\"\u5220\u9664\u5206\u652F\">\n                                                <span class=\"action-icon\">\uD83D\uDDD1\uFE0F</span>\n                                            </button>\n                                        ") : '', "\n                                    </div>\n                                </div>\n                            </div>\n                        ");
        }).join('') : "\n                        <div class=\"empty-state compact\">\n                            <p>\u6682\u65E0\u672C\u5730\u5206\u652F</p>\n                        </div>\n                    ", "\n                </div>\n            </div>\n        ");
    };
    BranchTreeComponent.prototype.getRemoteBranchesHtml = function (branches) {
        return "\n            <div class=\"branch-section\">\n                <div class=\"branch-section-header\">\n                    <h3>\u2601\uFE0F \u8FDC\u7A0B\u5206\u652F (".concat(branches.length, ")</h3>\n                </div>\n                <div class=\"branch-list\">\n                    ").concat(branches.length > 0 ? branches.map(function (branch) {
            var displayName = branch.replace('remotes/', '');
            return "\n                            <div class=\"branch-card remote-branch\">\n                                <div class=\"branch-card-content\">\n                                    <div class=\"branch-info\">\n                                        <span class=\"branch-icon\">\u2601\uFE0F</span>\n                                        <span class=\"branch-name\">".concat(escapeHtml(displayName), "</span>\n                                    </div>\n                                </div>\n                            </div>\n                        ");
        }).join('') : "\n                        <div class=\"empty-state compact\">\n                            <p>\u6682\u65E0\u8FDC\u7A0B\u5206\u652F</p>\n                        </div>\n                    ", "\n                </div>\n            </div>\n        ");
    };
    BranchTreeComponent.prototype.attachEventListeners = function () {
        var _this = this;
        // 创建分支
        var createBtn = this.container.querySelector('#create-branch-btn');
        if (createBtn) {
            createBtn.addEventListener('click', function () {
                _this.handleCreateBranch();
            });
        }
        // 分支操作
        this.container.querySelectorAll('.branch-action-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var target = e.currentTarget;
                var action = target.dataset.action;
                var branchName = target.dataset.branch;
                if (!branchName || !window.vscode)
                    return;
                switch (action) {
                    case 'switch':
                        _this.handleSwitchBranch(branchName);
                        break;
                    case 'merge':
                        _this.handleMergeBranch(branchName);
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
        this.container.querySelectorAll('.branch-item').forEach(function (item) {
            item.addEventListener('click', function (e) {
                if (e.target.closest('.branch-actions')) {
                    return;
                }
                var branchName = e.currentTarget.dataset.branchName;
                if (branchName && _this.data) {
                    _this.selectedBranch = branchName;
                    _this.render(_this.data);
                }
            });
        });
    };
    BranchTreeComponent.prototype.handleCreateBranch = function () {
        if (!this.data)
            return;
        this.isCreatingBranch = true;
        this.createRequestTimestamp = Date.now();
        this.creationResult = null;
        this.render(this.data);
        if (window.vscode) {
            window.vscode.postMessage({ command: 'createBranch' });
        }
    };
    BranchTreeComponent.prototype.handleSwitchBranch = function (branchName) {
        var _this = this;
        var _a;
        if (!this.data)
            return;
        this.isSwitchingBranch = true;
        this.switchingBranchName = branchName;
        this.switchResult = null;
        this.previousCurrentBranch = ((_a = this.data.branches) === null || _a === void 0 ? void 0 : _a.current) || null;
        this.render(this.data);
        if (this.switchTimeout) {
            clearTimeout(this.switchTimeout);
        }
        this.switchTimeout = window.setTimeout(function () {
            if (_this.isSwitchingBranch && _this.data) {
                _this.isSwitchingBranch = false;
                _this.switchingBranchName = null;
                _this.render(_this.data);
            }
        }, 5000);
        if (window.vscode) {
            window.vscode.postMessage({ command: 'switchBranch', branch: branchName });
        }
    };
    BranchTreeComponent.prototype.handleMergeBranch = function (branchName) {
        var _this = this;
        var _a, _b;
        if (!this.data)
            return;
        this.isMergingBranch = true;
        this.mergingBranchName = branchName;
        this.mergeResult = null;
        this.previousLogCount = ((_b = (_a = this.data.log) === null || _a === void 0 ? void 0 : _a.all) === null || _b === void 0 ? void 0 : _b.length) || 0;
        this.render(this.data);
        if (this.mergeTimeout) {
            clearTimeout(this.mergeTimeout);
        }
        this.mergeTimeout = window.setTimeout(function () {
            if (_this.isMergingBranch && _this.data) {
                _this.isMergingBranch = false;
                _this.mergingBranchName = null;
                _this.render(_this.data);
            }
        }, 5000);
        if (window.vscode) {
            window.vscode.postMessage({ command: 'mergeBranch', branch: branchName });
        }
    };
    return BranchTreeComponent;
}());
export { BranchTreeComponent };
//# sourceMappingURL=branch-manager.js.map