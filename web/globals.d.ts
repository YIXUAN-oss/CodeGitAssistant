/**
 * 全局类型定义
 */

interface VSCodeAPI {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
}

declare global {
    interface Window {
        vscode?: VSCodeAPI;
    }
}

declare function acquireVsCodeApi(): VSCodeAPI;

export { };

