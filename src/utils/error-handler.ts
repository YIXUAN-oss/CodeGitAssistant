import * as vscode from 'vscode';
import { Logger } from './logger';

/**
 * 统一错误处理工具类
 * 
 * 提供统一的错误处理接口，确保所有错误都通过一致的方式处理：
 * - 记录到日志系统
 * - 显示用户友好的错误消息
 * - 支持静默处理（仅记录日志）
 * - 针对 Git 操作提供特定的错误处理
 * 
 * @class ErrorHandler
 * @example
 * ```typescript
 * try {
 *     await gitService.push('origin');
 * } catch (error) {
 *     ErrorHandler.handleGitError(error, '推送');
 * }
 * ```
 */
export class ErrorHandler {
    /**
     * 处理错误并显示用户友好的错误消息
     * 
     * 将错误记录到日志系统，并根据需要显示给用户。
     * 
     * @param error - 错误对象（可以是 Error 实例或任意值）
     * @param context - 操作上下文描述（用于错误消息，如"推送"、"拉取"等）
     * @param showToUser - 是否向用户显示错误消息（默认 true）
     * 
     * @example
     * ```typescript
     * try {
     *     await someOperation();
     * } catch (error) {
     *     ErrorHandler.handle(error, '执行操作', true);
     * }
     * ```
     */
    static handle(error: unknown, context: string, showToUser: boolean = true): void {
        const message = error instanceof Error ? error.message : String(error);
        const errorObj = error instanceof Error ? error : undefined;

        // 记录到日志
        Logger.error(`${context}失败`, errorObj);

        // 显示用户友好的错误消息
        if (showToUser) {
            vscode.window.showErrorMessage(`${context}失败: ${message}`);
        }
    }

    /**
     * 静默处理错误（只记录日志，不显示给用户）
     * 
     * 适用于非关键错误，不希望打扰用户但仍需要记录的情况。
     * 
     * @param error - 错误对象（可以是 Error 实例或任意值）
     * @param context - 操作上下文描述（用于日志记录）
     * 
     * @example
     * ```typescript
     * try {
     *     await optionalOperation();
     * } catch (error) {
     *     ErrorHandler.handleSilent(error, '可选操作');
     * }
     * ```
     */
    static handleSilent(error: unknown, context: string): void {
        const errorObj = error instanceof Error ? error : undefined;
        Logger.warn(`${context}失败`, errorObj);
    }

    /**
     * 处理错误并返回错误消息字符串
     * 
     * 记录错误到日志，但不显示给用户，而是返回格式化的错误消息字符串。
     * 适用于需要自定义错误处理逻辑的场景。
     * 
     * @param error - 错误对象（可以是 Error 实例或任意值）
     * @param context - 操作上下文描述（用于错误消息）
     * @returns 格式化的错误消息字符串
     * 
     * @example
     * ```typescript
     * try {
     *     await someOperation();
     * } catch (error) {
     *     const message = ErrorHandler.getErrorMessage(error, '执行操作');
     *     // 自定义处理逻辑
     *     customErrorHandler(message);
     * }
     * ```
     */
    static getErrorMessage(error: unknown, context: string): string {
        const message = error instanceof Error ? error.message : String(error);
        Logger.error(`${context}失败`, error instanceof Error ? error : undefined);
        return `${context}失败: ${message}`;
    }

    /**
     * 处理 Git 特定错误
     * 
     * 针对 Git 操作提供更友好的错误提示，能够识别常见的 Git 错误类型
     * 并提供相应的解决建议。
     * 
     * @param error - 错误对象（可以是 Error 实例或任意值）
     * @param operation - Git 操作名称（如"推送"、"拉取"、"合并"等）
     * 
     * @example
     * ```typescript
     * try {
     *     await gitService.push('origin');
     * } catch (error) {
     *     ErrorHandler.handleGitError(error, '推送');
     * }
     * ```
     */
    static handleGitError(error: unknown, operation: string): void {
        const message = error instanceof Error ? error.message : String(error);
        const errorObj = error instanceof Error ? error : undefined;

        Logger.error(`Git操作失败: ${operation}`, errorObj);

        // 提供更友好的错误提示
        let userMessage = `${operation}失败`;

        if (message.includes('not a git repository')) {
            userMessage = '当前文件夹不是Git仓库，请先初始化仓库';
        } else if (message.includes('CONFLICT') || message.includes('conflict')) {
            userMessage = `合并冲突！请使用 "Git Assistant: 解决冲突" 命令处理`;
        } else if (message.includes('permission denied') || message.includes('Permission denied')) {
            userMessage = '权限不足，请检查文件权限或远程仓库访问权限';
        } else if (message.includes('network') || message.includes('timeout')) {
            userMessage = '网络连接失败，请检查网络连接或远程仓库地址';
        } else if (message.includes('authentication') || message.includes('credential')) {
            userMessage = '认证失败，请检查Git凭证配置';
        } else {
            userMessage = `${operation}失败: ${message}`;
        }

        vscode.window.showErrorMessage(userMessage);
    }
}

