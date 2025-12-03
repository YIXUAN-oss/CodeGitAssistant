import React, { useEffect, useRef } from 'react';
import { getThemeColors } from '../utils/theme';

/**
 * 辅助函数：截断文本以适应宽度
 */
const truncateText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
    const metrics = ctx.measureText(text);
    if (metrics.width <= maxWidth) {
        return text;
    }

    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
    }
    return truncated;
};

const COMMIT_ROW_HEIGHT = 75;
const COMMIT_TOP_MARGIN = 25;
const COMMIT_BOTTOM_MARGIN = 80;

/**
 * 提交历史图谱组件
 */
export const CommitGraph: React.FC<{ data: any }> = ({ data }) => {
    const canvasRef = useRef<any>(null);

    useEffect(() => {
        if (!canvasRef.current || !data?.log) {
            return;
        }

        const canvas = canvasRef.current;
        const commits = data?.log?.all ?? [];
        const ctx = canvas.getContext('2d', {
            alpha: false, // 禁用透明度以提高性能
            desynchronized: false
        });
        if (!ctx) {
            return;
        }

        // 获取设备像素比，用于高DPI显示
        const dpr = window.devicePixelRatio || 1;
        const container = canvas.parentElement || document.body;
        const rect = container.getBoundingClientRect();
        const displayWidth = rect.width;
        const baseHeight = rect.height || 600;

        const dynamicHeight = commits.length > 0
            ? Math.max(baseHeight, COMMIT_TOP_MARGIN + commits.length * COMMIT_ROW_HEIGHT + COMMIT_BOTTOM_MARGIN)
            : baseHeight;

        // 设置画布实际大小（考虑DPI）
        canvas.width = displayWidth * dpr;
        canvas.height = dynamicHeight * dpr;

        // 设置画布显示大小
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = dynamicHeight + 'px';

        // 缩放上下文以匹配DPI
        ctx.scale(dpr, dpr);

        // 启用文本平滑
        ctx.textBaseline = 'middle';
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // 获取主题颜色
        const themeColors = getThemeColors();

        // 获取背景色（在VS Code Webview中需显式使用window.getComputedStyle）
        const computedStyle = typeof window !== 'undefined' && window.getComputedStyle
            ? window.getComputedStyle(canvas.parentElement || document.body)
            : { backgroundColor: themeColors.background.primary } as CSSStyleDeclaration;
        const backgroundColor = computedStyle.backgroundColor || themeColors.background.primary;

        // 绘制提交图谱
        drawCommitGraph(ctx, commits, displayWidth, dynamicHeight, backgroundColor, themeColors);
    }, [data]);

    const drawCommitGraph = (
        ctx: any,
        commits: any[],
        width: number,
        height: number,
        backgroundColor: string,
        themeColors: ReturnType<typeof getThemeColors>
    ) => {
        // 清空画布，使用背景色填充
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

        if (!commits || commits.length === 0) {
            return;
        }

        // 根据提交数量动态调整高度
        const commitHeight = COMMIT_ROW_HEIGHT;
        const commitRadius = 6;
        const leftMargin = 60;
        const topMargin = COMMIT_TOP_MARGIN;
        const textX = leftMargin + 25;
        const maxWidth = width - textX - 20;

        // 设置字体，使用系统字体栈以提高清晰度
        // 使用更大的字号以提高清晰度
        const hashFont = 'bold 13px "Consolas", "Monaco", "Courier New", "Menlo", monospace';
        const messageFont = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif';
        const metaFont = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif';

        commits.forEach((commit, index) => {
            const y = topMargin + index * commitHeight;
            const x = leftMargin;

            // 绘制连接线 - 使用更粗的线以提高可见性
            if (index > 0) {
                ctx.strokeStyle = themeColors.commitGraph.line;
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x, y - commitHeight + commitRadius);
                ctx.lineTo(x, y - commitRadius);
                ctx.stroke();
            }

            // 绘制提交节点 - 添加边框以提高可见性
            ctx.fillStyle = themeColors.commitGraph.node;
            ctx.beginPath();
            ctx.arc(x, y, commitRadius, 0, 2 * Math.PI);
            ctx.fill();

            // 添加节点外圈高光
            ctx.strokeStyle = themeColors.commitGraph.nodeHighlight;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(x, y, commitRadius + 1, 0, 2 * Math.PI);
            ctx.stroke();

            // 绘制提交哈希 - 使用更清晰的颜色和字体
            ctx.fillStyle = themeColors.commitGraph.hash;
            ctx.font = hashFont;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const hashText = commit.hash.substring(0, 8);
            ctx.fillText(hashText, textX, y - 20);

            // 绘制提交消息 - 使用更清晰的字体和颜色
            ctx.fillStyle = themeColors.commitGraph.message;
            ctx.font = messageFont;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const message = commit.message.split('\n')[0];

            // 文本换行处理，支持中英文混合，保留空格
            const words = message.split(/(\s+)/);
            let line = '';
            let lineY = y + 5;
            const lineHeight = 19;
            const maxLines = 2;
            let lineCount = 0;

            for (let i = 0; i < words.length && lineCount < maxLines; i++) {
                // 保留空格，不要跳过空白字符
                const testLine = line + words[i];
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && line.trim()) {
                    // 只有当 line 不为空时才换行
                    ctx.fillText(line, textX, lineY);
                    line = words[i];
                    lineY += lineHeight;
                    lineCount++;
                } else {
                    line = testLine;
                }
            }
            if (line && lineCount < maxLines) {
                ctx.fillText(line, textX, lineY);
            } else if (lineCount >= maxLines && line) {
                // 如果超过最大行数，截断并添加省略号
                const truncated = truncateText(ctx, line, maxWidth - 20) + '...';
                ctx.fillText(truncated, textX, lineY);
            }

            // 绘制作者和日期信息 - 使用更清晰的颜色
            ctx.fillStyle = themeColors.commitGraph.meta;
            ctx.font = metaFont;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const dateStr = new Date(commit.date).toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const metaText = `${commit.author_name} · ${dateStr}`;
            ctx.fillText(metaText, textX, lineY + lineHeight + 5);
        });
    };

    return (
        <div className="commit-graph">
            <div className="section-header">
                <h2>提交历史图谱</h2>
                <p className="section-description">
                    可视化显示提交历史和分支关系
                </p>
            </div>
            <div
                className="graph-container"
                style={{
                    height: '600px',
                    maxHeight: '600px',
                    overflowY: 'auto',
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: '4px'
                }}
            >
                <canvas
                    ref={canvasRef}
                    style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block',
                        imageRendering: 'crisp-edges'
                    }}
                />
            </div>
            {!data?.log && (
                <div className="empty-state">
                    <p>📊 正在加载提交历史...</p>
                </div>
            )}
        </div>
    );
};

