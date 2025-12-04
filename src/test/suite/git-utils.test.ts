import * as assert from 'assert';
import {
    formatBranchName,
    isRemoteBranch,
    getBranchShortName,
    formatCommitHash,
    formatRelativeDate,
    formatFileSize,
    validateBranchName,
    truncateCommitMessage,
    extractRepoName,
    isValidGitUrl
} from '../../utils/git-utils';

suite('Git Utils Tests', () => {
    test('formatBranchName - 移除 refs/heads/ 前缀', () => {
        assert.strictEqual(formatBranchName('refs/heads/main'), 'main');
        assert.strictEqual(formatBranchName('refs/heads/feature/test'), 'feature/test');
        assert.strictEqual(formatBranchName('main'), 'main');
    });

    test('formatBranchName - 移除 remotes/ 前缀', () => {
        assert.strictEqual(formatBranchName('remotes/origin/main'), 'origin/main');
        assert.strictEqual(formatBranchName('remotes/origin/feature/test'), 'origin/feature/test');
    });

    test('isRemoteBranch - 检测远程分支', () => {
        assert.strictEqual(isRemoteBranch('remotes/origin/main'), true);
        assert.strictEqual(isRemoteBranch('origin/main'), true);
        assert.strictEqual(isRemoteBranch('main'), false);
        assert.strictEqual(isRemoteBranch('refs/heads/main'), false);
    });

    test('getBranchShortName - 获取分支简称', () => {
        assert.strictEqual(getBranchShortName('remotes/origin/main'), 'main');
        assert.strictEqual(getBranchShortName('origin/feature/test'), 'feature/test');
        assert.strictEqual(getBranchShortName('main'), 'main');
    });

    test('formatCommitHash - 格式化提交哈希', () => {
        const hash = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0';
        assert.strictEqual(formatCommitHash(hash, 8), 'a1b2c3d4');
        assert.strictEqual(formatCommitHash(hash, 7), 'a1b2c3d');
        assert.strictEqual(formatCommitHash(hash), 'a1b2c3d4');
    });

    test('formatRelativeDate - 格式化相对时间', () => {
        const now = new Date();
        const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        assert.ok(formatRelativeDate(oneMinuteAgo.toISOString()).includes('分钟前'));
        assert.ok(formatRelativeDate(oneHourAgo.toISOString()).includes('小时前'));
        assert.ok(formatRelativeDate(oneDayAgo.toISOString()).includes('天前'));
    });

    test('formatFileSize - 格式化文件大小', () => {
        assert.strictEqual(formatFileSize(0), '0 B');
        assert.strictEqual(formatFileSize(1024), '1 KB');
        assert.strictEqual(formatFileSize(1024 * 1024), '1 MB');
        assert.strictEqual(formatFileSize(1024 * 1024 * 1024), '1 GB');
    });

    test('validateBranchName - 验证分支名称', () => {
        // 有效分支名
        assert.strictEqual(validateBranchName('main').valid, true);
        assert.strictEqual(validateBranchName('feature/test').valid, true);
        assert.strictEqual(validateBranchName('bugfix-123').valid, true);

        // 无效分支名
        assert.strictEqual(validateBranchName('').valid, false);
        assert.strictEqual(validateBranchName('branch with spaces').valid, false);
        assert.strictEqual(validateBranchName('branch..test').valid, false);
        assert.strictEqual(validateBranchName('.hidden').valid, false);
        assert.strictEqual(validateBranchName('branch.lock').valid, false);
    });

    test('truncateCommitMessage - 截断提交消息', () => {
        const shortMessage = 'Short message';
        const longMessage = 'A'.repeat(100);

        assert.strictEqual(truncateCommitMessage(shortMessage, 50), shortMessage);
        assert.strictEqual(truncateCommitMessage(longMessage, 50).length, 50);
        assert.ok(truncateCommitMessage(longMessage, 50).endsWith('...'));
    });

    test('extractRepoName - 提取仓库名称', () => {
        assert.strictEqual(extractRepoName('https://github.com/user/repo.git'), 'repo');
        assert.strictEqual(extractRepoName('https://github.com/user/repo'), 'repo');
        assert.strictEqual(extractRepoName('git@github.com:user/repo.git'), 'repo');
    });

    test('isValidGitUrl - 验证 Git URL', () => {
        assert.strictEqual(isValidGitUrl('https://github.com/user/repo.git'), true);
        assert.strictEqual(isValidGitUrl('http://github.com/user/repo.git'), true);
        assert.strictEqual(isValidGitUrl('git@github.com:user/repo.git'), true);
        assert.strictEqual(isValidGitUrl('ssh://git@github.com/user/repo.git'), true);
        assert.strictEqual(isValidGitUrl('invalid-url'), false);
        assert.strictEqual(isValidGitUrl(''), false);
    });
});

