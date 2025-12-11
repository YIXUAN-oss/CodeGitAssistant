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
        var _a;
        this.data = null;
        this.selectedYear = new Date().getFullYear();
        this.selectedMonth = new Date().getMonth() + 1;
        this.timelineArrayCache = null;
        this.hasInteractiveLayout = false;
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }
        this.container = container;
        // 从 webview 状态中恢复时间线选择的年份与月份
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vscode = window.vscode;
            const state = ((_a = vscode === null || vscode === void 0 ? void 0 : vscode.getState) === null || _a === void 0 ? void 0 : _a.call(vscode)) || {};
            const timelineState = state.timelineView || {};
            if (typeof timelineState.selectedYear === 'number') {
                this.selectedYear = timelineState.selectedYear;
            }
            if (typeof timelineState.selectedMonth === 'number') {
                this.selectedMonth = timelineState.selectedMonth;
            }
        }
        catch (_b) {
            // 忽略在非 webview 环境中访问 vscode API 的错误
        }
    }
    remount(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }
        this.container = container;
        this.hasInteractiveLayout = false;
        const nextData = typeof data !== 'undefined' ? data : this.data;
        this.render(nextData);
    }
    render(data) {
        var _a;
        this.data = data;
        const hasTimeline = !!((_a = this.data) === null || _a === void 0 ? void 0 : _a.timeline);
        // 没有时间线数据时，直接渲染空状态并重置布局标记
        if (!hasTimeline) {
            this.timelineArrayCache = null;
            this.container.innerHTML = this.getHtml();
            this.hasInteractiveLayout = false;
            return;
        }
        // 有时间线数据
        this.buildTimelineCaches();
        // 首次渲染或从空状态切换到有数据时，构建完整布局并绑定事件
        if (!this.hasInteractiveLayout) {
            this.container.innerHTML = this.getHtml();
            this.attachEventListeners();
            // 等待DOM渲染完成后渲染图表和日历
            setTimeout(() => {
                this.renderChart();
                this.renderCalendar();
            }, 0);
            this.hasInteractiveLayout = true;
            return;
        }
        // 已经有布局时，仅更新图表和日历，避免整块 DOM 重建引起闪烁
        this.renderChart();
        this.renderCalendar();
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
                        <div id="timeline-year-dropdown" class="dropdown loaded">
                            <div class="dropdownCurrentValue" data-value="${this.selectedYear}">
                                ${this.selectedYear}年
                            </div>
                            <div class="dropdownMenu">
                                ${years.map(year => `
                                    <div class="dropdownOption ${year === this.selectedYear ? 'selected' : ''}" data-value="${year}">
                                        ${year}年
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="control-group">
                        <label>选择月份:</label>
                        <div id="timeline-month-dropdown" class="dropdown loaded">
                            <div class="dropdownCurrentValue" data-value="${this.selectedMonth}">
                                ${this.selectedMonth}月
                            </div>
                            <div class="dropdownMenu">
                                ${months.map(month => `
                                    <div class="dropdownOption ${month.value === this.selectedMonth ? 'selected' : ''}" data-value="${month.value}">
                                        ${month.label}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    getChartHtml() {
        return `
            <div class="timeline-chart-container">
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
                this.persistState();
                this.renderChart();
                this.renderCalendar();
            });
        }
        if (monthSelect) {
            monthSelect.addEventListener('change', () => {
                this.selectedMonth = parseInt(monthSelect.value);
                this.persistState();
                this.renderChart();
                this.renderCalendar();
            });
        }
        // 自定义年份下拉
        const yearDropdown = this.container.querySelector('#timeline-year-dropdown');
        if (yearDropdown && !yearDropdown._timelineBound) {
            yearDropdown._timelineBound = true;
            const currentValueElem = yearDropdown.querySelector('.dropdownCurrentValue');
            const menuElem = yearDropdown.querySelector('.dropdownMenu');
            if (currentValueElem) {
                currentValueElem.addEventListener('click', (event) => {
                    event.stopPropagation();
                    yearDropdown.classList.toggle('dropdownOpen');
                });
            }
            if (menuElem) {
                menuElem.addEventListener('click', (event) => {
                    const target = event.target;
                    if (!target)
                        return;
                    const optionElem = target.closest('.dropdownOption');
                    if (!optionElem)
                        return;
                    const value = optionElem.getAttribute('data-value');
                    if (!value)
                        return;
                    const year = parseInt(value, 10);
                    if (isNaN(year))
                        return;
                    this.selectedYear = year;
                    if (currentValueElem) {
                        currentValueElem.setAttribute('data-value', String(year));
                        currentValueElem.textContent = `${year}年`;
                    }
                    const options = menuElem.querySelectorAll('.dropdownOption');
                    options.forEach(opt => {
                        if (opt.getAttribute('data-value') === value) {
                            opt.classList.add('selected');
                        }
                        else {
                            opt.classList.remove('selected');
                        }
                    });
                    this.persistState();
                    this.renderChart();
                    this.renderCalendar();
                    yearDropdown.classList.remove('dropdownOpen');
                });
            }
            window.addEventListener('click', (event) => {
                const target = event.target;
                if (!target)
                    return;
                if (!yearDropdown.contains(target)) {
                    yearDropdown.classList.remove('dropdownOpen');
                }
            });
        }
        // 自定义月份下拉
        const monthDropdown = this.container.querySelector('#timeline-month-dropdown');
        if (monthDropdown && !monthDropdown._timelineBound) {
            monthDropdown._timelineBound = true;
            const currentValueElem = monthDropdown.querySelector('.dropdownCurrentValue');
            const menuElem = monthDropdown.querySelector('.dropdownMenu');
            if (currentValueElem) {
                currentValueElem.addEventListener('click', (event) => {
                    event.stopPropagation();
                    monthDropdown.classList.toggle('dropdownOpen');
                });
            }
            if (menuElem) {
                menuElem.addEventListener('click', (event) => {
                    const target = event.target;
                    if (!target)
                        return;
                    const optionElem = target.closest('.dropdownOption');
                    if (!optionElem)
                        return;
                    const value = optionElem.getAttribute('data-value');
                    if (!value)
                        return;
                    const month = parseInt(value, 10);
                    if (isNaN(month))
                        return;
                    this.selectedMonth = month;
                    if (currentValueElem) {
                        currentValueElem.setAttribute('data-value', String(month));
                        currentValueElem.textContent = `${month}月`;
                    }
                    const options = menuElem.querySelectorAll('.dropdownOption');
                    options.forEach(opt => {
                        if (opt.getAttribute('data-value') === value) {
                            opt.classList.add('selected');
                        }
                        else {
                            opt.classList.remove('selected');
                        }
                    });
                    this.persistState();
                    this.renderChart();
                    this.renderCalendar();
                    monthDropdown.classList.remove('dropdownOpen');
                });
            }
            window.addEventListener('click', (event) => {
                const target = event.target;
                if (!target)
                    return;
                if (!monthDropdown.contains(target)) {
                    monthDropdown.classList.remove('dropdownOpen');
                }
            });
        }
    }
    persistState() {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vscode = window.vscode;
            if (!vscode || typeof vscode.getState !== 'function' || typeof vscode.setState !== 'function') {
                return;
            }
            const currentState = vscode.getState() || {};
            vscode.setState(Object.assign(Object.assign({}, currentState), { timelineView: Object.assign(Object.assign({}, (currentState.timelineView || {})), { selectedYear: this.selectedYear, selectedMonth: this.selectedMonth }) }));
        }
        catch (_a) {
            // 静默忽略持久化状态时的异常
        }
    }
}
//# sourceMappingURL=timeline-view.js.map