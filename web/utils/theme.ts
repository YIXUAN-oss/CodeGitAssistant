/**
 * 主题工具函数 - 检测 VS Code 主题并返回适配的颜色
 */

/**
 * 检测是否为浅色主题
 */
export function isLightTheme(): boolean {
    if (typeof window === 'undefined') return false;
    const body = document.body;
    const bgColor = window.getComputedStyle(body).backgroundColor;
    // 解析 RGB 值
    const rgb = bgColor.match(/\d+/g);
    if (!rgb || rgb.length < 3) return false;
    // 计算亮度 (0-255)
    const brightness = (parseInt(rgb[0]) + parseInt(rgb[1]) + parseInt(rgb[2])) / 3;
    return brightness > 128;
}

/**
 * 获取主题相关的颜色配置
 */
export function getThemeColors() {
    const light = isLightTheme();

    return {
        // 文本颜色
        text: {
            primary: light ? '#333333' : '#ffffff',
            secondary: light ? '#666666' : '#cccccc',
            tertiary: light ? '#999999' : '#888888',
            link: light ? '#0066cc' : '#569cd6',
            error: light ? '#d32f2f' : '#f48771',
            warning: light ? '#f57c00' : '#dcdcaa',
            success: light ? '#388e3c' : '#89d185',
        },
        // 背景颜色
        background: {
            primary: light ? '#ffffff' : '#1e1e1e',
            secondary: light ? '#f5f5f5' : '#252526',
            tertiary: light ? '#e0e0e0' : '#2d2d2d',
            hover: light ? '#e8e8e8' : '#2a2d2e',
            active: light ? '#d0d0d0' : '#37373d',
        },
        // 边框颜色
        border: {
            primary: light ? '#cccccc' : '#3e3e42',
            secondary: light ? '#e0e0e0' : '#454545',
            focus: light ? '#0066cc' : '#007acc',
        },
        // 工具提示
        tooltip: {
            background: light ? 'rgba(0, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.8)',
            text: '#ffffff',
            border: light ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)',
        },
        // 图表颜色
        chart: {
            primary: light ? '#0066cc' : '#569cd6',
            secondary: light ? '#4caf50' : '#89d185',
            tertiary: light ? '#ff9800' : '#dcdcaa',
            accent: light ? '#9c27b0' : '#c586c0',
            grid: light ? '#e0e0e0' : '#333333',
            axis: light ? '#666666' : '#cccccc',
        },
        // 提交图谱颜色
        commitGraph: {
            node: light ? '#0066cc' : '#569cd6',
            nodeHighlight: light ? '#0052a3' : '#7db3d3',
            line: light ? '#0066cc' : '#569cd6',
            hash: light ? '#0052a3' : '#85c1e9',
            message: light ? '#000000' : '#ffffff',
            meta: light ? '#666666' : '#a8a8a8',
        },
    };
}

/**
 * 获取 VS Code CSS 变量值
 */
export function getVSCodeColor(variable: string, fallback: string = '#000000'): string {
    if (typeof window === 'undefined') return fallback;
    const style = getComputedStyle(document.body);
    return style.getPropertyValue(variable).trim() || fallback;
}

