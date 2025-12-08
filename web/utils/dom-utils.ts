/**
 * DOM 工具函数
 */

/**
 * 创建元素
 */
export function createElement(
    tag: string,
    className?: string,
    textContent?: string,
    attributes?: Record<string, string>
): HTMLElement {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    if (textContent) {
        element.textContent = textContent;
    }
    if (attributes) {
        Object.keys(attributes).forEach(key => {
            element.setAttribute(key, attributes[key]);
        });
    }
    return element;
}

/**
 * 创建按钮
 */
export function createButton(
    text: string,
    className?: string,
    onClick?: () => void
): HTMLButtonElement {
    const button = createElement('button', className, text) as HTMLButtonElement;
    if (onClick) {
        button.addEventListener('click', onClick);
    }
    return button;
}

/**
 * 清空元素内容
 */
export function clearElement(element: HTMLElement): void {
    element.innerHTML = '';
}

/**
 * 转义 HTML
 */
export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 格式化日期
 */
export function formatDate(date: Date | string | number): string {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * 格式化相对时间
 */
export function formatRelativeTime(date: Date | string | number): string {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days} 天前`;
    } else if (hours > 0) {
        return `${hours} 小时前`;
    } else if (minutes > 0) {
        return `${minutes} 分钟前`;
    } else {
        return '刚刚';
    }
}

