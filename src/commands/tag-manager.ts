import * as vscode from 'vscode';
import { GitService } from '../services/git-service';
import { CommandHistory } from '../utils/command-history';
import { Logger } from '../utils/logger';

/**
 * 注册标签管理命令
 */
export function registerTagManager(
    context: vscode.ExtensionContext,
    gitService: GitService
) {
    // 创建标签
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.createTag', async () => {
            let tagName: string | undefined;
            try {
                tagName = await vscode.window.showInputBox({
                    prompt: '输入标签名称',
                    placeHolder: 'v1.0.0',
                    validateInput: (value) => {
                        if (!value) {
                            return '标签名称不能为空';
                        }
                        if (!/^[a-zA-Z0-9/._-]+$/.test(value)) {
                            return '标签名称只能包含字母、数字、下划线、横线、点和斜线';
                        }
                        return null;
                    }
                });

                if (!tagName) {
                    return;
                }

                // 询问是否添加注释
                const tagType = await vscode.window.showQuickPick(
                    [
                        { label: '$(tag) 带注释的标签', description: '推荐：包含版本说明', value: 'annotated' },
                        { label: '$(tag) 轻量级标签', description: '简单引用', value: 'lightweight' }
                    ],
                    { placeHolder: '选择标签类型' }
                );

                if (!tagType) {
                    return;
                }

                let message: string | undefined;
                if (tagType.value === 'annotated') {
                    message = await vscode.window.showInputBox({
                        prompt: '输入标签注释（可选）',
                        placeHolder: '版本 1.0.0 发布',
                    });
                    // 如果没有输入消息，使用默认消息
                    if (!message) {
                        message = `Tag ${tagName}`;
                    }
                }

                // 询问是否指向特定提交
                const commitChoice = await vscode.window.showQuickPick(
                    [
                        { label: '$(circle-filled) 当前提交', value: 'current' },
                        { label: '$(git-commit) 指定提交', value: 'specific' }
                    ],
                    { placeHolder: '选择标签指向的提交' }
                );

                if (!commitChoice) {
                    return;
                }

                let commitHash: string | undefined;
                if (commitChoice.value === 'specific') {
                    // 获取最近的提交列表
                    const log = await gitService.getLog(20);
                    const items = log.all.map(commit => ({
                        label: `$(git-commit) ${commit.hash.substring(0, 8)}`,
                        description: commit.message.split('\n')[0],
                        commit: commit.hash
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: '选择要打标签的提交'
                    });

                    if (!selected) {
                        return;
                    }

                    commitHash = selected.commit;
                }

                // 创建标签
                await gitService.createTag(tagName, message, commitHash);

                const tagInfo = message ? `标签 "${tagName}" (${message})` : `标签 "${tagName}"`;
                vscode.window.showInformationMessage(`✅ ${tagInfo} 创建成功`);
                Logger.info(`创建标签: ${tagName}`);
                CommandHistory.addCommand(
                    `git tag ${message ? `-a -m "${message}"` : ''} ${tagName}${commitHash ? ` ${commitHash}` : ''}`,
                    '创建标签',
                    true
                );

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                Logger.error('创建标签失败', error instanceof Error ? error : new Error(errorMessage));
                vscode.window.showErrorMessage(`创建标签失败: ${errorMessage}`);
                CommandHistory.addCommand(
                    `git tag ${tagName || ''}`,
                    '创建标签',
                    false,
                    errorMessage
                );
            }
        })
    );

    // 查看标签列表
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.listTags', async () => {
            try {
                const tags = await gitService.getTags();

                if (tags.length === 0) {
                    vscode.window.showInformationMessage('当前仓库没有标签');
                    return;
                }

                // 创建快速选择项显示标签信息
                const items = tags.map(tag => ({
                    label: `$(tag) ${tag.name}`,
                    description: tag.message || tag.commit.substring(0, 8),
                    detail: tag.date ? `创建时间: ${new Date(tag.date).toLocaleString('zh-CN')}` : `提交: ${tag.commit.substring(0, 8)}`,
                    tag: tag.name
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `找到 ${tags.length} 个标签，选择一个查看详情`,
                    canPickMany: false
                });

                if (!selected) {
                    return;
                }

                // 显示标签详情
                const tag = tags.find(t => t.name === selected.tag);
                if (tag) {
                    const details = [
                        `标签名称: ${tag.name}`,
                        `指向提交: ${tag.commit}`,
                        tag.message ? `注释: ${tag.message}` : '',
                        tag.date ? `创建时间: ${new Date(tag.date).toLocaleString('zh-CN')}` : ''
                    ].filter(Boolean).join('\n');

                    vscode.window.showInformationMessage(details, { modal: true });
                }

                CommandHistory.addCommand('git tag -l', '查看标签列表', true);

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                Logger.error('查看标签列表失败', error instanceof Error ? error : new Error(errorMessage));
                vscode.window.showErrorMessage(`查看标签列表失败: ${errorMessage}`);
                CommandHistory.addCommand('git tag -l', '查看标签列表', false, errorMessage);
            }
        })
    );

    // 删除标签
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.deleteTag', async () => {
            try {
                const tags = await gitService.getTags();

                if (tags.length === 0) {
                    vscode.window.showInformationMessage('当前仓库没有标签');
                    return;
                }

                // 创建快速选择项
                const items = tags.map(tag => ({
                    label: `$(tag) ${tag.name}`,
                    description: tag.message || tag.commit.substring(0, 8),
                    tag: tag.name
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: '选择要删除的标签'
                });

                if (!selected) {
                    return;
                }

                // 确认删除
                const confirmed = await vscode.window.showWarningMessage(
                    `确定要删除标签 "${selected.tag}" 吗？此操作无法撤销。`,
                    { modal: true },
                    '删除',
                    '取消'
                );

                if (confirmed !== '删除') {
                    return;
                }

                // 询问是否同时删除远程标签
                const deleteRemote = await vscode.window.showQuickPick(
                    [
                        { label: '$(check) 仅删除本地标签', value: 'local' },
                        { label: '$(cloud) 同时删除远程标签', value: 'both' }
                    ],
                    { placeHolder: '选择删除范围' }
                );

                if (!deleteRemote) {
                    return;
                }

                // 删除本地标签
                await gitService.deleteTag(selected.tag);
                Logger.info(`删除本地标签: ${selected.tag}`);
                CommandHistory.addCommand(`git tag -d ${selected.tag}`, '删除标签', true);

                // 如果需要，删除远程标签
                if (deleteRemote.value === 'both') {
                    try {
                        // 获取远程仓库名称
                        const remotes = await gitService.getRemotes();
                        const remote = remotes.length > 0 ? remotes[0].name : 'origin';

                        await gitService.deleteRemoteTag(selected.tag, remote);
                        Logger.info(`删除远程标签: ${selected.tag}`);
                        vscode.window.showInformationMessage(`✅ 标签 "${selected.tag}" 已从本地和远程删除`);
                    } catch (remoteError) {
                        Logger.warn(`删除远程标签失败: ${remoteError}`);
                        vscode.window.showWarningMessage(
                            `本地标签已删除，但删除远程标签失败: ${remoteError}`
                        );
                    }
                } else {
                    vscode.window.showInformationMessage(`✅ 本地标签 "${selected.tag}" 已删除`);
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                Logger.error('删除标签失败', error instanceof Error ? error : new Error(errorMessage));
                vscode.window.showErrorMessage(`删除标签失败: ${errorMessage}`);
                CommandHistory.addCommand('git tag -d', '删除标签', false, errorMessage);
            }
        })
    );

    // 推送标签到远程
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.pushTag', async () => {
            try {
                const tags = await gitService.getTags();

                if (tags.length === 0) {
                    vscode.window.showInformationMessage('当前仓库没有标签');
                    return;
                }

                // 获取远程仓库名称
                const remotes = await gitService.getRemotes();
                if (remotes.length === 0) {
                    vscode.window.showWarningMessage('当前仓库没有配置远程仓库');
                    return;
                }

                const remote = remotes.length > 0 ? remotes[0].name : 'origin';

                // 询问推送方式
                const pushType = await vscode.window.showQuickPick(
                    [
                        { label: '$(tag) 推送单个标签', value: 'single' },
                        { label: '$(tags) 推送所有标签', value: 'all' }
                    ],
                    { placeHolder: '选择推送方式' }
                );

                if (!pushType) {
                    return;
                }

                if (pushType.value === 'all') {
                    // 推送所有标签
                    const confirmed = await vscode.window.showWarningMessage(
                        `确定要推送所有标签到远程仓库 "${remote}" 吗？`,
                        { modal: true },
                        '推送',
                        '取消'
                    );

                    if (confirmed !== '推送') {
                        return;
                    }

                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: `正在推送所有标签到 ${remote}...`,
                            cancellable: false
                        },
                        async (progress) => {
                            progress.report({ increment: 30 });
                            await gitService.pushAllTags(remote);
                            progress.report({ increment: 70 });
                        }
                    );

                    vscode.window.showInformationMessage(`✅ 所有标签已推送到 ${remote}`);
                    Logger.info(`推送所有标签到 ${remote}`);
                    CommandHistory.addCommand(`git push --tags ${remote}`, '推送所有标签', true, undefined, remote);

                } else {
                    // 推送单个标签
                    const items = tags.map(tag => ({
                        label: `$(tag) ${tag.name}`,
                        description: tag.message || tag.commit.substring(0, 8),
                        tag: tag.name
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: '选择要推送的标签'
                    });

                    if (!selected) {
                        return;
                    }

                    // 检查远程标签是否已存在
                    const tagExists = await gitService.remoteTagExists(selected.tag, remote);
                    let force = false;

                    if (tagExists) {
                        const choice = await vscode.window.showWarningMessage(
                            `远程仓库 "${remote}" 已存在标签 "${selected.tag}"。是否要覆盖？`,
                            { modal: true },
                            '强制推送（覆盖）',
                            '取消'
                        );

                        if (!choice || choice === '取消') {
                            return;
                        }

                        if (choice === '强制推送（覆盖）') {
                            force = true;
                        }
                    }

                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: `正在推送标签 "${selected.tag}" 到 ${remote}...`,
                            cancellable: false
                        },
                        async (progress) => {
                            progress.report({ increment: 30 });
                            await gitService.pushTag(selected.tag, remote, force);
                            progress.report({ increment: 70 });
                        }
                    );

                    vscode.window.showInformationMessage(
                        `✅ 标签 "${selected.tag}" 已${force ? '强制' : ''}推送到 ${remote}`
                    );
                    Logger.info(`推送标签 ${selected.tag} 到 ${remote}${force ? ' (强制)' : ''}`);
                    CommandHistory.addCommand(
                        `git push ${remote} ${selected.tag}${force ? ' --force' : ''}`,
                        '推送标签',
                        true,
                        undefined,
                        remote
                    );
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                Logger.error('推送标签失败', error instanceof Error ? error : new Error(errorMessage));

                // 提供更友好的错误提示
                if (errorMessage.includes('already exists') || errorMessage.includes('已存在')) {
                    vscode.window.showErrorMessage(
                        `推送标签失败: 远程仓库已存在同名标签。请使用强制推送来覆盖。`
                    );
                } else {
                    vscode.window.showErrorMessage(`推送标签失败: ${errorMessage}`);
                }

                // 尝试获取远程仓库名称（如果可用）
                let remoteName: string | undefined;
                try {
                    const remotes = await gitService.getRemotes();
                    remoteName = remotes.length > 0 ? remotes[0].name : undefined;
                } catch {
                    // 忽略错误
                }
                CommandHistory.addCommand('git push --tags', '推送标签', false, errorMessage, remoteName);
            }
        })
    );
}

