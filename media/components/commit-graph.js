/**
 * 提交历史图谱组件 - 使用 Canvas 绘制
 */
import { getThemeColors } from '../utils/theme.js';
const COMMIT_ROW_HEIGHT = 75;
const COMMIT_TOP_MARGIN = 25;
const COMMIT_BOTTOM_MARGIN = 80;
/**
 * 辅助函数：截断文本以适应宽度
 */
function truncateText(ctx, text, maxWidth) {
    const metrics = ctx.measureText(text);
    if (metrics.width <= maxWidth) {
        return text;
    }
    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
    }
    return truncated;
}
export class CommitGraphComponent {
    constructor(containerId) {
        this.canvas = null;
        this.data = null;
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }
        this.container = container;
    }
    render(data) {
        this.data = data;
        // 添加头部
        const headerHtml = this.getHeaderHtml();
        const existingHeader = this.container.querySelector('.section-header');
        if (!existingHeader) {
            this.container.insertAdjacentHTML('afterbegin', headerHtml);
        }
        // 创建或获取canvas
        let canvasContainer = this.container.querySelector('.graph-container');
        if (!canvasContainer) {
            canvasContainer = document.createElement('div');
            canvasContainer.className = 'graph-container';
            this.container.appendChild(canvasContainer);
        }
        // 创建canvas
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            canvasContainer.appendChild(this.canvas);
        }
        if (!(data === null || data === void 0 ? void 0 : data.log)) {
            return;
        }
        const commits = data.log.all || [];
        if (commits.length === 0) {
            return;
        }
        this.drawCommitGraph(commits);
    }
    getHeaderHtml() {
        return `
            <div class="section-header">
                <div>
                    <h2>提交图</h2>
                    <p class="section-description">
                        可视化展示提交历史图谱
                    </p>
                </div>
            </div>
        `;
    }
    drawCommitGraph(commits) {
        if (!this.canvas) {
            return;
        }
        const ctx = this.canvas.getContext('2d', {
            alpha: false,
            desynchronized: false
        });
        if (!ctx) {
            return;
        }
        if (!this.canvas) {
            return;
        }
        // 获取设备像素比
        const dpr = window.devicePixelRatio || 1;
        const canvasContainer = this.container.querySelector('.graph-container');
        if (!canvasContainer) {
            return;
        }
        const rect = canvasContainer.getBoundingClientRect();
        const displayWidth = rect.width;
        const baseHeight = rect.height || 600;
        const dynamicHeight = commits.length > 0
            ? Math.max(baseHeight, COMMIT_TOP_MARGIN + commits.length * COMMIT_ROW_HEIGHT + COMMIT_BOTTOM_MARGIN)
            : baseHeight;
        // 设置画布实际大小
        this.canvas.width = displayWidth * dpr;
        this.canvas.height = dynamicHeight * dpr;
        // 设置画布显示大小
        this.canvas.style.width = displayWidth + 'px';
        this.canvas.style.height = dynamicHeight + 'px';
        // 缩放上下文
        ctx.scale(dpr, dpr);
        // 启用文本平滑
        ctx.textBaseline = 'middle';
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // 获取主题颜色
        const themeColors = getThemeColors();
        // 获取背景色
        const computedStyle = window.getComputedStyle(canvasContainer);
        const backgroundColor = computedStyle.backgroundColor || themeColors.background.primary;
        // 清空画布
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, displayWidth, dynamicHeight);
        // 绘制提交
        commits.forEach((commit, index) => {
            const y = COMMIT_TOP_MARGIN + index * COMMIT_ROW_HEIGHT;
            this.drawCommit(ctx, commit, y, displayWidth, themeColors);
        });
    }
    drawCommit(ctx, commit, y, width, themeColors) {
        const commitHeight = COMMIT_ROW_HEIGHT;
        const commitRadius = 6;
        const leftMargin = 60;
        const textX = leftMargin + 25;
        const maxWidth = width - textX - 20;
        // 设置字体
        const hashFont = 'bold 13px "Consolas", "Monaco", "Courier New", "Menlo", monospace';
        const messageFont = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif';
        const metaFont = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif';
        const x = leftMargin;
        // 绘制连接线
        if (y > COMMIT_TOP_MARGIN) {
            ctx.strokeStyle = themeColors.commitGraph.line;
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x, y - commitHeight + commitRadius);
            ctx.lineTo(x, y - commitRadius);
            ctx.stroke();
        }
        // 绘制提交节点
        ctx.fillStyle = themeColors.commitGraph.node;
        ctx.beginPath();
        ctx.arc(x, y, commitRadius, 0, 2 * Math.PI);
        ctx.fill();
        // 添加节点外圈
        ctx.strokeStyle = themeColors.commitGraph.nodeHighlight;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, commitRadius + 1, 0, 2 * Math.PI);
        ctx.stroke();
        // 绘制提交哈希
        ctx.fillStyle = themeColors.commitGraph.hash;
        ctx.font = hashFont;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const hashText = commit.hash.substring(0, 8);
        ctx.fillText(hashText, textX, y - 20);
        // 绘制提交消息
        ctx.fillStyle = themeColors.commitGraph.message;
        ctx.font = messageFont;
        const message = commit.message.split('\n')[0];
        // 文本换行处理
        const words = message.split(/(\s+)/);
        let line = '';
        let lineY = y + 5;
        const lineHeight = 19;
        const maxLines = 2;
        let lineCount = 0;
        for (let i = 0; i < words.length && lineCount < maxLines; i++) {
            const testLine = line + words[i];
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && line.trim()) {
                ctx.fillText(line, textX, lineY);
                line = words[i];
                lineY += lineHeight;
                lineCount++;
            }
            else {
                line = testLine;
            }
        }
        if (line && lineCount < maxLines) {
            ctx.fillText(line, textX, lineY);
        }
        else if (lineCount >= maxLines && line) {
            const truncated = truncateText(ctx, line, maxWidth - 20) + '...';
            ctx.fillText(truncated, textX, lineY);
        }
        // 绘制作者和日期
        ctx.fillStyle = themeColors.commitGraph.meta;
        ctx.font = metaFont;
        const dateStr = new Date(commit.date).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        const metaText = `${commit.author_name} · ${dateStr}`;
        ctx.fillText(metaText, textX, lineY + lineHeight + 5);
    }
}
//# sourceMappingURL=commit-graph.js.map