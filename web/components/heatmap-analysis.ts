/**
 * 热力图分析组件 - 展示文件修改频率和贡献者活跃度
 */

import { GitData } from '../types/git.js';
import { escapeHtml } from '../utils/dom-utils.js';

interface FileStat {
    path: string;
    count: number;
}

interface ContributorStat {
    email: string;
    commits: number;
    files: number;
}

/**
 * 检测是否为浅色主题
 */
const isLightTheme = (): boolean => {
    if (typeof window === 'undefined') return false;
    const body = document.body;
    const bgColor = window.getComputedStyle(body).backgroundColor;
    const rgb = bgColor.match(/\d+/g);
    if (!rgb || rgb.length < 3) return false;
    const brightness = (parseInt(rgb[0]) + parseInt(rgb[1]) + parseInt(rgb[2])) / 3;
    return brightness > 128;
};

/**
 * 获取主题相关的颜色
 */
const getThemeColors = () => {
    const light = isLightTheme();
    return {
        emptyText: light ? '#666' : '#888',
        axisText: light ? '#666' : '#ccc',
        titleText: light ? '#333' : '#fff',
        labelText: light ? '#333' : '#fff',
        gridLine: light ? '#e0e0e0' : '#333',
        stroke: light ? '#e0e0e0' : '#333'
    };
};

/**
 * 根据提交数量获取颜色
 */
const getColorForCommits = (commits: number, maxCommits: number): string => {
    const ratio = commits / maxCommits;
    if (ratio > 0.8) return '#4a90e2';
    if (ratio > 0.6) return '#5ba3f5';
    if (ratio > 0.4) return '#6cb6ff';
    if (ratio > 0.2) return '#7dc9ff';
    return '#8edaff';
};

/**
 * 颜色插值函数（模拟 d3.interpolateYlOrRd）
 */
const interpolateYlOrRd = (t: number): string => {
    // YlOrRd 颜色插值：黄色 -> 橙色 -> 红色
    if (t < 0.5) {
        // 黄色到橙色
        const localT = t * 2;
        const r = Math.round(255);
        const g = Math.round(255 - localT * 100);
        const b = Math.round(127 - localT * 127);
        return `rgb(${r}, ${g}, ${b})`;
    } else {
        // 橙色到红色
        const localT = (t - 0.5) * 2;
        const r = Math.round(255);
        const g = Math.round(155 - localT * 100);
        const b = Math.round(0);
        return `rgb(${r}, ${g}, ${b})`;
    }
};

export class HeatmapAnalysisComponent {
    private container: HTMLElement;
    private data: GitData | null = null;
    private activeTab: 'files' | 'contributors' = 'files';

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }
        this.container = container;
    }

    render(data: GitData | null) {
        this.data = data;
        this.container.innerHTML = this.getHtml();
        this.attachEventListeners();
        this.renderContent();
    }

    private getHtml(): string {
        return `
            <div class="heatmap-analysis">
                ${this.getHeaderHtml()}
                <div class="heatmap-tabs">
                    <button class="heatmap-tab-btn ${this.activeTab === 'files' ? 'active' : ''}" 
                            data-tab="files">
                        文件修改频率
                    </button>
                    <button class="heatmap-tab-btn ${this.activeTab === 'contributors' ? 'active' : ''}" 
                            data-tab="contributors">
                        贡献者活跃度
                    </button>
                </div>
                <div class="heatmap-content-container">
                    ${this.activeTab === 'files' ? '<svg id="file-heatmap" class="file-heatmap-svg"></svg>' : ''}
                    ${this.activeTab === 'contributors' ? '<div id="contributor-heatmap" class="contributor-heatmap"></div>' : ''}
                </div>
            </div>
        `;
    }

    private getHeaderHtml(): string {
        return `
            <div class="section-header">
                <div>
                    <h2>热力图</h2>
                    <p class="section-description">
                        分析文件修改频率和贡献者活跃度
                    </p>
                </div>
            </div>
        `;
    }

    private renderContent() {
        if (this.activeTab === 'files') {
            this.renderFileHeatmap();
        } else {
            this.renderContributorHeatmap();
        }
    }

    private renderFileHeatmap() {
        const svg = this.container.querySelector('#file-heatmap') as SVGElement;
        if (!svg) return;

        const fileStats = this.data?.fileStats;
        if (!fileStats || (Array.isArray(fileStats) ? fileStats.length === 0 : fileStats.size === 0)) {
            const theme = getThemeColors();
            const container = svg.parentElement;
            const width = container?.clientWidth ? Math.max(container.clientWidth - 60, 800) : 800;
            const height = 400;
            svg.setAttribute('width', String(width));
            svg.setAttribute('height', String(height));
            svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
            svg.innerHTML = `
                <text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="middle" fill="${theme.emptyText}" font-size="13px">
                    暂无文件修改数据
                </text>
            `;
            return;
        }

        this.drawFileHeatmap(svg, fileStats);
    }

    private drawFileHeatmap(svg: SVGElement, fileStats: Map<string, number> | FileStat[]) {
        // 清空 SVG
        svg.innerHTML = '';

        const container = svg.parentElement;
        const width = container?.clientWidth ? Math.max(container.clientWidth - 60, 800) : 800;
        const height = 400;
        const margin = { top: 20, right: 20, bottom: 60, left: 200 };
        const theme = getThemeColors();

        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

        // 转换数据
        const statsArray: FileStat[] = Array.isArray(fileStats)
            ? fileStats
            : Array.from(fileStats.entries()).map(([path, count]) => ({ path, count }));

        // 按修改次数排序，取前20个
        const topFiles = statsArray
            .sort((a, b) => b.count - a.count)
            .slice(0, 20);

        if (topFiles.length === 0) {
            svg.innerHTML = `
                <text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="middle" fill="${theme.emptyText}" font-size="13px">
                    暂无文件修改数据
                </text>
            `;
            return;
        }

        // 创建颜色比例尺
        const maxCount = Math.max(...topFiles.map(d => d.count), 1);

        // 创建比例尺 - 水平条形图布局
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;
        const rowHeight = chartHeight / topFiles.length;
        const maxBarWidth = chartWidth * 0.7; // 条形图最大宽度（70%的图表宽度）

        let html = '';

        // 绘制Y轴基线
        html += `
            <line x1="${margin.left}" 
                  y1="${margin.top}" 
                  x2="${margin.left}" 
                  y2="${height - margin.bottom}"
                  stroke="${theme.axisText}"
                  stroke-width="2">
            </line>
        `;

        // 绘制每个文件的行
        topFiles.forEach((file, index) => {
            const y = margin.top + index * rowHeight + rowHeight / 2;
            const barWidth = (file.count / maxCount) * maxBarWidth;
            const barX = margin.left;
            const barY = margin.top + index * rowHeight + rowHeight * 0.1;
            const barHeight = rowHeight * 0.8;
            const color = interpolateYlOrRd(file.count / maxCount);
            const textColor = file.count > maxCount / 2 ? theme.labelText : (isLightTheme() ? '#333' : '#fff');

            // 绘制水平条形
            html += `
                <rect class="file-rect" 
                      x="${barX}" 
                      y="${barY}" 
                      width="${barWidth}" 
                      height="${barHeight}"
                      fill="${color}"
                      stroke="${theme.stroke}"
                      stroke-width="1"
                      rx="2"
                      ry="2">
                    <title>${escapeHtml(file.path)}\n修改次数: ${file.count}</title>
                </rect>
            `;

            // 添加数值标签（在条形右侧）
            html += `
                <text class="file-label" 
                      x="${barX + barWidth + 10}" 
                      y="${y}" 
                      text-anchor="start"
                      dominant-baseline="middle"
                      fill="${textColor}"
                      font-size="12px"
                      font-weight="500">
                    ${file.count}
                </text>
            `;

            // 添加Y轴标签（文件路径，在条形左侧）
            html += `
                <text class="y-axis-label" 
                      x="${margin.left - 10}" 
                      y="${y}" 
                      text-anchor="end"
                      dominant-baseline="middle"
                      fill="${theme.axisText}"
                      font-size="11px">
                    ${escapeHtml(file.path)}
                </text>
            `;
        });

        // 添加标题
        html += `
            <text x="${width / 2}" 
                  y="15" 
                  text-anchor="middle"
                  font-size="14px"
                  font-weight="bold"
                  fill="${theme.titleText}">
                文件修改频率热力图（Top 20）
            </text>
        `;

        svg.innerHTML = html;
    }

    private renderContributorHeatmap() {
        const container = this.container.querySelector('#contributor-heatmap') as HTMLElement;
        if (!container) return;

        const contributorStats = this.data?.contributorStats;
        if (!contributorStats || (Array.isArray(contributorStats) ? contributorStats.length === 0 : contributorStats.size === 0)) {
            const theme = getThemeColors();
            container.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 400px;">
                    <p style="text-align: center; color: ${theme.emptyText}; margin: 0; font-size: 13px;">暂无贡献者数据</p>
                </div>
            `;
            return;
        }

        this.drawContributorHeatmap(container, contributorStats);
    }

    private drawContributorHeatmap(container: HTMLElement, contributorStats: Map<string, { commits: number; files: Set<string> | number }> | ContributorStat[]) {
        container.innerHTML = '';

        const theme = getThemeColors();

        // 转换数据
        const statsArray: ContributorStat[] = Array.isArray(contributorStats)
            ? contributorStats
            : Array.from(contributorStats.entries()).map(([email, stats]) => {
                let filesCount = 0;
                if (stats.files) {
                    if (stats.files instanceof Set) {
                        filesCount = stats.files.size;
                    } else if (typeof stats.files === 'number') {
                        filesCount = stats.files;
                    }
                }
                return {
                    email,
                    commits: stats.commits || 0,
                    files: filesCount
                };
            });

        if (statsArray.length === 0) {
            container.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 400px;">
                    <p style="text-align: center; color: ${theme.emptyText}; margin: 0; font-size: 13px;">暂无贡献者数据</p>
                </div>
            `;
            return;
        }

        // 按提交数排序
        const sortedContributors = statsArray
            .sort((a, b) => b.commits - a.commits)
            .slice(0, 15);

        const maxCommits = Math.max(...sortedContributors.map(c => c.commits), 1);

        // 创建热力图容器
        const heatmapContainer = document.createElement('div');
        heatmapContainer.className = 'contributor-heatmap-grid';

        sortedContributors.forEach(contributor => {
            const color1 = getColorForCommits(contributor.commits, maxCommits);
            const color2 = getColorForCommits(contributor.commits * 0.8, maxCommits);
            const card = document.createElement('div');
            card.className = 'contributor-card';
            card.style.background = `linear-gradient(135deg, ${color1}, ${color2})`;

            const name = document.createElement('div');
            name.className = 'contributor-name';
            name.textContent = contributor.email.split('@')[0] || contributor.email;

            const commits = document.createElement('div');
            commits.className = 'contributor-commits';
            commits.textContent = contributor.commits.toString();

            const commitsLabel = document.createElement('div');
            commitsLabel.className = 'contributor-commits-label';
            commitsLabel.textContent = '次提交';

            const files = document.createElement('div');
            files.className = 'contributor-files';
            files.textContent = `涉及 ${contributor.files} 个文件`;

            card.appendChild(name);
            card.appendChild(commits);
            card.appendChild(commitsLabel);
            card.appendChild(files);

            heatmapContainer.appendChild(card);
        });

        container.appendChild(heatmapContainer);
    }

    private attachEventListeners() {
        this.container.querySelectorAll('.heatmap-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = (e.currentTarget as HTMLElement).dataset.tab as 'files' | 'contributors';
                if (tab) {
                    this.activeTab = tab;
                    this.render(this.data);
                }
            });
        });
    }
}
