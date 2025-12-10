/**
 * 时间线视图组件 - 提交时间线
 */
/**
 * 检测是否为浅色主题
 */
const isLightTheme = () => {
    if (typeof window === 'undefined')
        return false;
    const body = document.body;
    const bgColor = window.getComputedStyle(body).backgroundColor;
    const rgb = bgColor.match(/\d+/g);
    if (!rgb || rgb.length < 3)
        return false;
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
        gridLine: light ? '#e0e0e0' : '#333',
        emptyCell: light ? '#f5f5f5' : '#2d2d2d',
        labelText: light ? '#333' : '#fff',
        inactiveText: light ? '#999' : '#888',
        barColor: '#0e639c'
    };
};
export class TimelineViewComponent {
    constructor(containerId) {
        this.data = null;
        this.selectedYear = new Date().getFullYear();
        this.selectedMonth = new Date().getMonth() + 1;
        this.timelineArrayCache = null;
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }
        this.container = container;
    }
    render(data) {
        this.data = data;
        this.buildTimelineCaches();
        this.container.innerHTML = this.getHtml();
        this.attachEventListeners();
        // 等待DOM渲染完成后渲染图表和日历
        setTimeout(() => {
            this.renderChart();
            this.renderCalendar();
        }, 0);
    }
    getHtml() {
        var _a;
        const timeline = (_a = this.data) === null || _a === void 0 ? void 0 : _a.timeline;
        if (!timeline) {
            return `
                <div class="timeline-view">
                    <div class="empty-state">
                        <div class="empty-icon">📅</div>
                        <p>暂无时间线数据</p>
                    </div>
                </div>
            `;
        }
        return `
            <div class="timeline-view">
                ${this.getTitleHeader()}
                ${this.getHeaderHtml()}
                ${this.getChartHtml()}
                ${this.getCalendarHtml()}
            </div>
        `;
    }
    buildTimelineCaches() {
        var _a;
        const timeline = (_a = this.data) === null || _a === void 0 ? void 0 : _a.timeline;
        if (!timeline) {
            this.timelineArrayCache = null;
            return;
        }
        const timelineArray = Array.isArray(timeline)
            ? timeline
            : Array.from(timeline.entries()).map(([date, count]) => ({ date, count }));
        this.timelineArrayCache = timelineArray;
    }
    getTitleHeader() {
        return `
            <div class="section-header">
                <div>
                    <h2>时间线</h2>
                    <p class="section-description">
                        查看提交历史的时间分布和日历视图
                    </p>
                </div>
            </div>
        `;
    }
    getHeaderHtml() {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = currentYear - 5; i <= currentYear + 1; i++) {
            years.push(i);
        }
        const months = [
            { value: 1, label: '1月' },
            { value: 2, label: '2月' },
            { value: 3, label: '3月' },
            { value: 4, label: '4月' },
            { value: 5, label: '5月' },
            { value: 6, label: '6月' },
            { value: 7, label: '7月' },
            { value: 8, label: '8月' },
            { value: 9, label: '9月' },
            { value: 10, label: '10月' },
            { value: 11, label: '11月' },
            { value: 12, label: '12月' }
        ];
        return `
            <div class="timeline-header">
                <div class="timeline-controls">
                    <div class="control-group">
                        <label>选择年份:</label>
                        <select class="timeline-select" id="year-select">
                            ${years.map(year => `
                                <option value="${year}" ${year === this.selectedYear ? 'selected' : ''}>
                                    ${year}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="control-group">
                        <label>选择月份:</label>
                        <select class="timeline-select" id="month-select">
                            ${months.map(month => `
                                <option value="${month.value}" ${month.value === this.selectedMonth ? 'selected' : ''}>
                                    ${month.label}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
            </div>
        `;
    }
    getChartHtml() {
        return `
            <div class="timeline-chart-container">
                <div class="chart-title">每日提交统计</div>
                <svg class="chart-svg" id="timeline-chart"></svg>
            </div>
        `;
    }
    getCalendarHtml() {
        return `
            <div class="timeline-calendar-container">
                <div class="calendar-wrapper" id="timeline-calendar">
                </div>
            </div>
        `;
    }
    renderChart() {
        var _a;
        if (!this.timelineArrayCache || this.timelineArrayCache.length === 0) {
            const svg = this.container.querySelector('#timeline-chart');
            if (svg) {
                const theme = getThemeColors();
                svg.innerHTML = `
                    <text x="50%" y="50%" text-anchor="middle" fill="${theme.emptyText}">
                        暂无时间线数据
                    </text>
                `;
            }
            return;
        }
        const svg = this.container.querySelector('#timeline-chart');
        if (!svg)
            return;
        const container = (_a = svg.parentElement) === null || _a === void 0 ? void 0 : _a.parentElement;
        const width = (container === null || container === void 0 ? void 0 : container.clientWidth) ? Math.max(container.clientWidth - 60, 800) : 1000;
        const height = 300;
        const margin = { top: 20, right: 20, bottom: 50, left: 60 };
        const theme = getThemeColors();
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        // 使用缓存的数据
        const timelineArray = this.timelineArrayCache;
        if (!timelineArray || timelineArray.length === 0) {
            svg.innerHTML = `
                <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="${theme.emptyText}">
                    暂无时间线数据
                </text>
            `;
            return;
        }
        // 过滤出选中月份的数据
        const monthData = timelineArray.filter(d => {
            try {
                // 尝试多种日期格式
                let date;
                if (d.date.includes('T')) {
                    date = new Date(d.date);
                }
                else if (d.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    date = new Date(d.date + 'T00:00:00');
                }
                else {
                    date = new Date(d.date);
                }
                if (isNaN(date.getTime()))
                    return false;
                return date.getFullYear() === this.selectedYear && date.getMonth() + 1 === this.selectedMonth;
            }
            catch (_a) {
                return false;
            }
        });
        // 获取该月的所有日期（包括没有提交的日期）
        const daysInMonth = new Date(this.selectedYear, this.selectedMonth, 0).getDate();
        const allDays = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            // 尝试多种匹配方式
            const existingData = monthData.find(d => {
                const dDate = d.date.split('T')[0]; // 移除时间部分
                return dDate === dateKey || dDate.startsWith(dateKey);
            });
            allDays.push(existingData || { date: dateKey, count: 0 });
        }
        if (allDays.length === 0) {
            svg.innerHTML = `
                <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="${theme.emptyText}">
                    暂无 ${this.selectedYear}年${this.selectedMonth}月 的数据
                </text>
            `;
            return;
        }
        // 创建比例尺
        const maxCount = Math.max(...allDays.map(d => d.count), 1);
        const barWidth = (width - margin.left - margin.right) / allDays.length - 2;
        const yScale = (count) => {
            return height - margin.bottom - (count / maxCount) * (height - margin.top - margin.bottom);
        };
        // 添加渐变定义
        let html = `
            <defs>
                <linearGradient id="barGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#4da6ff;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#0e639c;stop-opacity:1" />
                </linearGradient>
                <linearGradient id="barGradientHover" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#66b3ff;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#2d7acc;stop-opacity:1" />
                </linearGradient>
            </defs>
        `;
        // 绘制柱状图
        allDays.forEach((day, index) => {
            const x = margin.left + index * (barWidth + 2);
            const barHeight = day.count > 0 ? (day.count / maxCount) * (height - margin.top - margin.bottom) : 0;
            const y = yScale(day.count);
            if (day.count > 0 && barHeight > 0) {
                html += `
                    <rect class="chart-bar" 
                          x="${x}" 
                          y="${y}" 
                          width="${barWidth}" 
                          height="${barHeight}"
                          fill="url(#barGradient)"
                          rx="2"
                          ry="2"
                          data-count="${day.count}"
                          data-day="${day.date.split('-')[2]}">
                        <title>${day.date}\n${day.count} 次提交</title>
                    </rect>
                `;
            }
            // 添加数值标签（只在有提交的日期显示）
            if (day.count > 0) {
                html += `
                    <text class="bar-label" 
                          x="${x + barWidth / 2}" 
                          y="${y - 5}" 
                          text-anchor="middle"
                          fill="${theme.labelText}"
                          font-size="10px"
                          font-weight="bold">
                        ${day.count}
                    </text>
                `;
            }
            // 添加日期标签
            html += `
                <text class="bar-day" 
                      x="${x + barWidth / 2}" 
                      y="${height - margin.bottom + 15}" 
                      text-anchor="middle"
                      fill="${theme.axisText}"
                      font-size="10px">
                    ${day.date.split('-')[2]}日
                </text>
            `;
            // 添加柱体之间的虚线分割（除了最后一个）
            if (index < allDays.length - 1) {
                const dividerX = x + barWidth + 1;
                html += `
                    <line class="bar-divider" 
                          x1="${dividerX}" 
                          y1="${margin.top}" 
                          x2="${dividerX}" 
                          y2="${height - margin.bottom}"
                          stroke="${theme.gridLine}"
                          stroke-width="1"
                          stroke-dasharray="2,2"
                          opacity="0.5">
                    </line>
                `;
            }
        });
        // 添加Y轴刻度和网格线
        const yTicks = Math.min(maxCount, 10);
        const tickStep = Math.ceil(maxCount / yTicks);
        const maxTickValue = tickStep * yTicks;
        for (let i = 0; i <= yTicks; i++) {
            const value = i * tickStep;
            const y = yScale(value);
            // 网格线
            if (y >= margin.top && y <= height - margin.bottom) {
                html += `
                    <line class="grid-line" 
                          x1="${margin.left}" 
                          y1="${y}" 
                          x2="${width - margin.right}" 
                          y2="${y}"
                          stroke="${theme.gridLine}"
                          stroke-dasharray="3,3"
                          opacity="0.3">
                    </line>
                `;
            }
            // Y轴刻度标签
            html += `
                <text class="y-tick" 
                      x="${margin.left - 10}" 
                      y="${y + 4}" 
                      text-anchor="end"
                      fill="${theme.axisText}"
                      font-size="10px">
                    ${value}
                </text>
            `;
        }
        // X轴基线
        html += `
            <line class="axis-line" 
                  x1="${margin.left}" 
                  y1="${height - margin.bottom}" 
                  x2="${width - margin.right}" 
                  y2="${height - margin.bottom}"
                  stroke="${theme.gridLine}"
                  stroke-width="1.5"
                  opacity="0.8">
            </line>
        `;
        // X轴标题
        html += `
            <text x="${width / 2}" 
                  y="${height - 10}" 
                  text-anchor="middle"
                  fill="${theme.emptyText}"
                  font-size="12px">
                日期
            </text>
        `;
        // Y轴标题
        html += `
            <text transform="rotate(-90)" 
                  x="${-height / 2}" 
                  y="20" 
                  text-anchor="middle"
                  fill="${theme.emptyText}"
                  font-size="12px">
                提交次数
            </text>
        `;
        // 图表标题
        html += `
            <text x="${width / 2}" 
                  y="15" 
                  text-anchor="middle"
                  font-size="14px"
                  font-weight="bold"
                  fill="${theme.titleText}">
                ${this.selectedYear}年${this.selectedMonth}月 每日提交统计
            </text>
        `;
        svg.innerHTML = html;
    }
    renderCalendar() {
        const calendarContainer = this.container.querySelector('#timeline-calendar');
        if (!calendarContainer)
            return;
        const theme = getThemeColors();
        const light = isLightTheme();
        // 转换数据
        const timelineMap = new Map();
        const cache = this.timelineArrayCache;
        if (cache && cache.length > 0) {
            cache.forEach(d => timelineMap.set(d.date, d.count));
        }
        // 创建日历容器
        calendarContainer.innerHTML = '';
        calendarContainer.style.display = 'grid';
        calendarContainer.style.gridTemplateColumns = 'repeat(7, 1fr)';
        calendarContainer.style.gap = '3px';
        calendarContainer.style.padding = '12px';
        calendarContainer.style.background = 'var(--vscode-sideBar-background)';
        calendarContainer.style.borderRadius = '8px';
        calendarContainer.style.maxWidth = '600px';
        calendarContainer.style.margin = '0 auto';
        // 星期标题
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        weekdays.forEach(day => {
            const dayHeader = document.createElement('div');
            dayHeader.style.textAlign = 'center';
            dayHeader.style.fontWeight = 'bold';
            dayHeader.style.padding = '5px';
            dayHeader.style.fontSize = '11px';
            dayHeader.style.color = theme.inactiveText;
            dayHeader.textContent = day;
            calendarContainer.appendChild(dayHeader);
        });
        // 获取月份的第一天和最后一天
        const firstDay = new Date(this.selectedYear, this.selectedMonth - 1, 1);
        const lastDay = new Date(this.selectedYear, this.selectedMonth, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());
        // 计算最大提交数用于颜色强度
        const maxCount = Math.max(...Array.from(timelineMap.values()), 1);
        const getColor = (count) => {
            if (count === 0)
                return theme.emptyCell;
            const intensity = Math.min(count / maxCount, 1);
            const opacity = light ? 0.2 + intensity * 0.6 : 0.3 + intensity * 0.7;
            return `rgba(14, 99, 156, ${opacity})`;
        };
        // 生成42天的网格（6周）
        for (let i = 0; i < 42; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
            const count = timelineMap.get(dateKey) || 0;
            const isCurrentMonth = currentDate.getMonth() + 1 === this.selectedMonth;
            const dayCell = document.createElement('div');
            dayCell.style.aspectRatio = '1';
            dayCell.style.display = 'flex';
            dayCell.style.flexDirection = 'column';
            dayCell.style.alignItems = 'center';
            dayCell.style.justifyContent = 'center';
            dayCell.style.background = getColor(count);
            dayCell.style.borderRadius = '3px';
            dayCell.style.cursor = 'pointer';
            dayCell.style.opacity = isCurrentMonth ? '1' : '0.4';
            dayCell.style.transition = 'transform 0.2s';
            dayCell.style.border = count > 0 ? '1px solid rgba(14, 99, 156, 0.8)' : 'none';
            dayCell.title = `${dateKey}\n${count} 次提交`;
            dayCell.addEventListener('mouseenter', () => {
                dayCell.style.transform = 'scale(1.1)';
            });
            dayCell.addEventListener('mouseleave', () => {
                dayCell.style.transform = 'scale(1)';
            });
            const dayNumber = document.createElement('div');
            dayNumber.style.fontSize = '10px';
            dayNumber.style.color = count > 0
                ? '#fff'
                : theme.inactiveText;
            dayNumber.style.fontWeight = count > 0 ? 'bold' : 'normal';
            dayNumber.textContent = currentDate.getDate().toString();
            if (count > 0) {
                const countBadge = document.createElement('div');
                countBadge.style.fontSize = '9px';
                countBadge.style.color = '#fff';
                countBadge.style.marginTop = '1px';
                countBadge.textContent = count.toString();
                dayCell.appendChild(dayNumber);
                dayCell.appendChild(countBadge);
            }
            else {
                dayCell.appendChild(dayNumber);
            }
            calendarContainer.appendChild(dayCell);
        }
    }
    attachEventListeners() {
        const yearSelect = this.container.querySelector('#year-select');
        const monthSelect = this.container.querySelector('#month-select');
        if (yearSelect) {
            yearSelect.addEventListener('change', () => {
                this.selectedYear = parseInt(yearSelect.value);
                this.renderChart();
                this.renderCalendar();
            });
        }
        if (monthSelect) {
            monthSelect.addEventListener('change', () => {
                this.selectedMonth = parseInt(monthSelect.value);
                this.renderChart();
                this.renderCalendar();
            });
        }
    }
}
//# sourceMappingURL=timeline-view.js.map