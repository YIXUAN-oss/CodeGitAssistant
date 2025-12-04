import * as assert from 'assert';
import { parseConflictMarkers, resolveConflict } from '../../utils/git-utils';

suite('Git Utils Conflict Tests', () => {
    test('parseConflictMarkers - 解析冲突标记', () => {
        const content = `<<<<<<< HEAD
当前更改
=======
传入更改
>>>>>>> branch
`;

        const result = parseConflictMarkers(content);
        assert.strictEqual(result.hasConflict, true);
        assert.strictEqual(result.conflicts.length, 1);
        assert.strictEqual(result.conflicts[0].current.trim(), '当前更改');
        assert.strictEqual(result.conflicts[0].incoming.trim(), '传入更改');
    });

    test('parseConflictMarkers - 无冲突内容', () => {
        const content = '正常内容\n没有冲突';
        const result = parseConflictMarkers(content);
        assert.strictEqual(result.hasConflict, false);
        assert.strictEqual(result.conflicts.length, 0);
    });

    test('parseConflictMarkers - 多个冲突', () => {
        const content = `<<<<<<< HEAD
第一个冲突 - 当前
=======
第一个冲突 - 传入
>>>>>>> branch1
正常内容
<<<<<<< HEAD
第二个冲突 - 当前
=======
第二个冲突 - 传入
>>>>>>> branch2
`;

        const result = parseConflictMarkers(content);
        assert.strictEqual(result.hasConflict, true);
        assert.strictEqual(result.conflicts.length, 2);
    });

    test('resolveConflict - 选择当前版本', () => {
        const content = `<<<<<<< HEAD
当前更改
=======
传入更改
>>>>>>> branch
`;

        const result = resolveConflict(content, 'current');
        assert.ok(result.includes('当前更改'));
        assert.ok(!result.includes('传入更改'));
        assert.ok(!result.includes('<<<<<<<'));
    });

    test('resolveConflict - 选择传入版本', () => {
        const content = `<<<<<<< HEAD
当前更改
=======
传入更改
>>>>>>> branch
`;

        const result = resolveConflict(content, 'incoming');
        assert.ok(result.includes('传入更改'));
        assert.ok(!result.includes('当前更改'));
        assert.ok(!result.includes('<<<<<<<'));
    });

    test('resolveConflict - 选择两者', () => {
        const content = `<<<<<<< HEAD
当前更改
=======
传入更改
>>>>>>> branch
`;

        const result = resolveConflict(content, 'both');
        assert.ok(result.includes('当前更改'));
        assert.ok(result.includes('传入更改'));
        assert.ok(!result.includes('<<<<<<<'));
    });
});

