/**
 * 从 vscode-git-graph-develop 迁移的上下文菜单组件
 */
import { SVG_ICONS, addListenerToClass, getCommitElems } from '../utils/vscode-git-utils.js';
const CLASS_CONTEXT_MENU_ACTIVE = 'contextMenuActive';
export var TargetType;
(function (TargetType) {
    TargetType["Commit"] = "commit";
    TargetType["CommitDetailsView"] = "cdv";
    TargetType["Ref"] = "ref";
    TargetType["Repo"] = "repo";
})(TargetType || (TargetType = {}));
// Helper function to find commit element by ID
function findCommitElemWithId(commitElems, index) {
    for (let i = 0; i < commitElems.length; i++) {
        if (commitElems[i].dataset.id === index.toString()) {
            return commitElems[i];
        }
    }
    return null;
}
/**
 * Implements the Git Graph View's context menus.
 */
export class ContextMenu {
    /**
     * Construct a new ContextMenu instance.
     */
    constructor() {
        this.elem = null;
        this.onClose = null;
        this.target = null;
        // 点击事件：关闭菜单（除非点击在菜单内部）
        document.addEventListener('click', (e) => {
            if (this.elem && !this.elem.contains(e.target)) {
                this.close();
            }
        });
        // 右键事件：如果点击在菜单外部，关闭菜单
        document.addEventListener('contextmenu', (e) => {
            if (this.elem && !this.elem.contains(e.target)) {
                this.close();
            }
        });
    }
    /**
     * Show a context menu in the Git Graph View.
     */
    show(actions, checked, target, event, frameElem, onClose = null, className = null) {
        let html = '', handlers = [], handlerId = 0;
        this.close();
        for (let i = 0; i < actions.length; i++) {
            let groupHtml = '';
            for (let j = 0; j < actions[i].length; j++) {
                if (actions[i][j].visible) {
                    groupHtml += '<li class="contextMenuItem" data-index="' + handlerId++ + '">' +
                        (checked ? '<span class="contextMenuItemCheck">' + (actions[i][j].checked ? SVG_ICONS.check : '') + '</span>' : '') +
                        actions[i][j].title + '</li>';
                    handlers.push(actions[i][j].onClick);
                }
            }
            if (groupHtml !== '') {
                if (html !== '')
                    html += '<li class="contextMenuDivider"></li>';
                html += groupHtml;
            }
        }
        if (handlers.length === 0)
            return; // No context menu actions are visible
        const menu = document.createElement('ul');
        menu.className = 'contextMenu' + (checked ? ' checked' : '') + (className !== null ? ' ' + className : '');
        menu.style.opacity = '0';
        menu.style.position = 'fixed'; // 使用 fixed 定位，相对于视口
        menu.style.zIndex = '10000'; // 确保在最上层
        // 确保背景色有fallback，即使CSS变量未定义也能显示
        menu.style.backgroundColor = 'var(--vscode-menu-background, var(--vscode-editor-background, #1e1e1e))';
        menu.style.color = 'var(--vscode-menu-foreground, var(--vscode-foreground, #cccccc))';
        menu.style.boxShadow = '0 1px 4px 1px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.3))';
        menu.style.borderRadius = '3px';
        menu.style.padding = '4px 0';
        menu.style.margin = '0';
        menu.style.listStyleType = 'none';
        menu.style.minWidth = '160px';
        menu.style.userSelect = 'none';
        menu.innerHTML = html;
        // 先添加到 body 以便测量尺寸（使用 fixed 定位）
        document.body.appendChild(menu);
        const menuBounds = menu.getBoundingClientRect();
        // 获取鼠标位置（使用 clientX/clientY，相对于视口）
        const mouseX = event.clientX || event.pageX || 0;
        const mouseY = event.clientY || event.pageY || 0;
        // 获取视口尺寸
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        // 计算菜单位置（尽量显示在鼠标位置附近）
        let left = mouseX;
        let top = mouseY;
        // 如果菜单超出右边界，调整到左侧
        if (left + menuBounds.width > viewportWidth) {
            left = Math.max(2, viewportWidth - menuBounds.width - 2);
        }
        // 如果菜单超出下边界，调整到上方
        if (top + menuBounds.height > viewportHeight) {
            top = Math.max(2, viewportHeight - menuBounds.height - 2);
        }
        // 确保不超出左边界和上边界
        left = Math.max(2, Math.min(left, viewportWidth - menuBounds.width - 2));
        top = Math.max(2, Math.min(top, viewportHeight - menuBounds.height - 2));
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        menu.style.opacity = '1';
        this.elem = menu;
        this.onClose = onClose;
        addListenerToClass('contextMenuItem', 'click', (e) => {
            // The user clicked on a context menu item => call the corresponding handler
            e.stopPropagation();
            this.close();
            const target = e.target.closest('.contextMenuItem');
            if (target && target.dataset.index) {
                handlers[parseInt(target.dataset.index)]();
            }
        });
        menu.addEventListener('click', (e) => {
            // The user clicked on the context menu (but not a specific item) => keep the context menu open to allow the user to reattempt clicking on a specific item
            e.stopPropagation();
        });
        this.target = target;
        // 不添加 contextMenuActive 类，避免显示边框高亮
        // if (this.target !== null && this.target.type !== TargetType.Repo) {
        //     alterClass(this.target.elem, CLASS_CONTEXT_MENU_ACTIVE, true);
        // }
    }
    /**
     * Close the context menu (if one is currently open in the Git Graph View).
     */
    close() {
        if (this.elem !== null) {
            this.elem.remove();
            this.elem = null;
        }
        // 不再需要清理 contextMenuActive 类，因为我们不再添加它
        // alterClassOfCollection(document.getElementsByClassName(CLASS_CONTEXT_MENU_ACTIVE) as HTMLCollectionOf<HTMLElement>, CLASS_CONTEXT_MENU_ACTIVE, false);
        if (this.onClose !== null) {
            this.onClose();
            this.onClose = null;
        }
        this.target = null;
    }
    /**
     * Refresh the context menu (if one is currently open in the Git Graph View). If the context menu has a dynamic source,
     * re-link it to the newly rendered HTML Element, or close it if the target is no longer visible in the Git Graph View.
     */
    refresh(commits) {
        if (!this.isOpen() || this.target === null || this.target.type === TargetType.Repo) {
            // Don't need to refresh if no context menu is open, or it is not dynamic
            return;
        }
        if (this.target.index < commits.length && commits[this.target.index].hash === this.target.hash) {
            // The commit still exists at the same index
            const commitElem = findCommitElemWithId(getCommitElems(), this.target.index);
            if (commitElem !== null) {
                if (typeof this.target.ref === 'undefined') {
                    // ContextMenu is only dependent on the commit itself
                    if (this.target.type !== TargetType.CommitDetailsView) {
                        this.target.elem = commitElem;
                        // 不添加 contextMenuActive 类
                        // alterClass(this.target.elem, CLASS_CONTEXT_MENU_ACTIVE, true);
                    }
                    return;
                }
                else {
                    // ContextMenu is dependent on the commit and ref
                    const elems = commitElem.querySelectorAll('[data-fullref]');
                    for (let i = 0; i < elems.length; i++) {
                        if (elems[i].dataset.fullref === this.target.ref) {
                            this.target.elem = this.target.type === TargetType.Ref ? elems[i] : commitElem;
                            // 不添加 contextMenuActive 类
                            // alterClass(this.target.elem, CLASS_CONTEXT_MENU_ACTIVE, true);
                            return;
                        }
                    }
                }
            }
        }
        this.close();
    }
    /**
     * Is a context menu currently open in the Git Graph View.
     */
    isOpen() {
        return this.elem !== null;
    }
    /**
     * Is the target of the context menu dynamic (i.e. is it tied to a Git object & HTML Element in the Git Graph View).
     */
    isTargetDynamicSource() {
        return this.isOpen() && this.target !== null;
    }
}
//# sourceMappingURL=context-menu.js.map