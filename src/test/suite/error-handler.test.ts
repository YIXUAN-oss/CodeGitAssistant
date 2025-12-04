import * as assert from 'assert';
import * as vscode from 'vscode';
import { ErrorHandler } from '../../utils/error-handler';

suite('Error Handler Tests', () => {
    test('getErrorMessage - 从 Error 对象获取消息', () => {
        const error = new Error('Test error');
        const message = ErrorHandler.getErrorMessage(error, '测试操作');
        assert.ok(message.includes('测试操作失败'));
        assert.ok(message.includes('Test error'));
    });

    test('getErrorMessage - 从字符串获取消息', () => {
        const error = 'String error';
        const message = ErrorHandler.getErrorMessage(error, '测试操作');
        assert.ok(message.includes('测试操作失败'));
        assert.ok(message.includes('String error'));
    });

    test('handleSilent - 静默处理错误', () => {
        // 这个测试主要验证不会抛出异常
        const error = new Error('Test error');
        assert.doesNotThrow(() => {
            ErrorHandler.handleSilent(error, '测试操作');
        });
    });

    test('handleGitError - 处理 Git 特定错误', () => {
        // 这个测试主要验证不会抛出异常
        const error = new Error('not a git repository');
        assert.doesNotThrow(() => {
            ErrorHandler.handleGitError(error, '测试操作');
        });
    });
});

