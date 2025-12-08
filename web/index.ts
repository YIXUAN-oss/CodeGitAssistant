import { App } from './app.js';

// 初始化 VS Code API
declare function acquireVsCodeApi(): any;

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    // 初始化 VS Code API（只在未初始化时调用）
    if (typeof acquireVsCodeApi !== 'undefined' && !(window as any).vscode) {
        (window as any).vscode = acquireVsCodeApi();
    }

    const app = new App();
    app.init();
});

