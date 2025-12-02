import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../services/git-service';
import { ConflictProvider } from '../providers/conflict-provider';

/**
 * 注册冲突解决命令
 */
export function registerConflictResolver(
    context: vscode.ExtensionContext,
    gitService: GitService,
    conflictProvider: ConflictProvider
) {
    // 解决冲突
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.resolveConflicts', async () => {
            try {
                // 获取冲突文件列表
                const conflicts = await gitService.getConflicts();

                if (conflicts.length === 0) {
                    vscode.window.showInformationMessage('当前没有冲突文件');
                    return;
                }

                // 显示冲突文件列表
                const items = conflicts.map(file => ({
                    label: `$(warning) ${file}`,
                    description: '存在冲突',
                    file: file
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `发现 ${conflicts.length} 个冲突文件，选择要解决的文件`
                });

                if (!selected) {
                    return;
                }

                // 打开冲突文件
                const document = await vscode.workspace.openTextDocument(
                    resolveConflictFileUri(selected.file, gitService.getWorkspaceRoot())
                );
                await vscode.window.showTextDocument(document);

                // 提供冲突解决选项
                const choice = await vscode.window.showQuickPick(
                    [
                        // 如需开启逐块解决模式，可恢复下一行配置，并处理 interactive 分支
                        // { label: '$(symbol-event) 逐个解决每个冲突（精细控制）', action: 'interactive' as const },
                        { label: '$(check) 接受当前更改（全部冲突块）', action: 'current' as const },
                        { label: '$(check) 接受传入更改（全部冲突块）', action: 'incoming' as const },
                        { label: '$(check) 接受所有更改（合并保留）', action: 'both' as const },
                        { label: '$(edit) 手动编辑', action: 'manual' as const }
                    ],
                    { placeHolder: '选择冲突解决方式' }
                );

                if (!choice) {
                    return;
                }

                if (choice.action === 'manual') {
                    vscode.window.showInformationMessage(
                        '请手动编辑并保存文件，完成后记得执行 git add 将其标记为已解决'
                    );
                    await promptStageReminder(document.uri.fsPath, gitService, conflictProvider, { autoResolved: false });
                    return;
                }

                // 自动解决冲突
                await resolveConflictAuto(document, choice.action);
                await document.save();

                await promptStageReminder(document.uri.fsPath, gitService, conflictProvider, { autoResolved: true });

            } catch (error) {
                vscode.window.showErrorMessage(`解决冲突失败: ${error}`);
            }
        })
    );

    // 标记冲突已解决
    context.subscriptions.push(
        vscode.commands.registerCommand('git-assistant.markResolved', async (file?: string) => {
            try {
                if (!file) {
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        vscode.window.showErrorMessage('请先打开冲突文件');
                        return;
                    }
                    file = editor.document.uri.fsPath;
                }

                await gitService.add(file);
                vscode.window.showInformationMessage(`✅ 文件 "${file}" 已标记为已解决`);
                conflictProvider.refresh();

            } catch (error) {
                vscode.window.showErrorMessage(`标记失败: ${error}`);
            }
        })
    );
}

/**
 * 自动解决冲突
 */
async function resolveConflictAuto(
    document: vscode.TextDocument,
    action: string
): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const text = document.getText();

    // 匹配冲突标记（兼容不同分支名和 CRLF/LF）
    // 形如：
    // <<<<<<< HEAD
    // ...当前更改...
    // =======
    // ...传入更改...
    // >>>>>>> main
    const conflictPattern = /<<<<<<<[^\n]*\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>>[^\n]*/g;

    let match;
    const replacements: { range: vscode.Range; text: string }[] = [];

    while ((match = conflictPattern.exec(text)) !== null) {
        const fullMatch = match[0];
        const currentChanges = match[1];
        const incomingChanges = match[2];

        let resolvedText = '';
        switch (action) {
            case 'current':
                resolvedText = currentChanges;
                break;
            case 'incoming':
                resolvedText = incomingChanges;
                break;
            case 'both':
                resolvedText = currentChanges + '\n' + incomingChanges;
                break;
        }

        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + fullMatch.length);
        replacements.push({
            range: new vscode.Range(startPos, endPos),
            text: resolvedText
        });
    }

    // 如果没有匹配到任何冲突块，给出提示，避免用户以为已经自动合并
    if (replacements.length === 0) {
        vscode.window.showWarningMessage(
            '未检测到标准 Git 冲突标记，自动合并未生效，请确认文件中仍包含 <<<<<<< / ======= / >>>>>>> 标记。'
        );
        return;
    }

    // 应用所有替换
    for (const replacement of replacements) {
        edit.replace(document.uri, replacement.range, replacement.text);
    }

    await vscode.workspace.applyEdit(edit);
}

/**
 * 交互式逐个解决文件中的冲突块
 */
async function resolveConflictsInteractive(document: vscode.TextDocument): Promise<boolean> {
    const text = document.getText();

    const conflictPattern = /<<<<<<<[^\n]*\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>>[^\n]*/g;

    type ConflictBlock = {
        index: number;
        start: number;
        end: number;
        current: string;
        incoming: string;
    };

    const blocks: ConflictBlock[] = [];
    let match: RegExpExecArray | null;

    while ((match = conflictPattern.exec(text)) !== null) {
        const fullMatch = match[0];
        const currentChanges = match[1];
        const incomingChanges = match[2];

        blocks.push({
            index: blocks.length,
            start: match.index,
            end: match.index + fullMatch.length,
            current: currentChanges,
            incoming: incomingChanges
        });
    }

    if (blocks.length === 0) {
        vscode.window.showWarningMessage(
            '未检测到标准 Git 冲突标记，无法进入逐个解决模式。'
        );
        return false;
    }

    const edit = new vscode.WorkspaceEdit();
    const replacements: { range: vscode.Range; text: string }[] = [];

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const currentPreview = block.current.trim().split(/\r?\n/)[0] || '(空行)';
        const incomingPreview = block.incoming.trim().split(/\r?\n/)[0] || '(空行)';

        const choice = await vscode.window.showQuickPick(
            [
                {
                    label: `$(check) 接受当前更改（第 ${i + 1}/${blocks.length} 个）`,
                    description: currentPreview,
                    action: 'current' as const
                },
                {
                    label: `$(check) 接受传入更改（第 ${i + 1}/${blocks.length} 个）`,
                    description: incomingPreview,
                    action: 'incoming' as const
                },
                {
                    label: `$(check) 接受所有更改（合并保留）`,
                    description: `${currentPreview}  |  ${incomingPreview}`,
                    action: 'both' as const
                },
                {
                    label: '$(debug-pause) 跳过当前冲突（稍后手动处理）',
                    action: 'skip' as const
                },
                {
                    label: '$(close) 取消后续所有自动处理',
                    action: 'cancel' as const
                }
            ],
            {
                placeHolder: `正在解决冲突（${i + 1}/${blocks.length}）：请选择处理方式`
            }
        );

        if (!choice || choice.action === 'cancel') {
            break;
        }

        if (choice.action === 'skip') {
            continue;
        }

        let resolvedText = '';
        switch (choice.action) {
            case 'current':
                resolvedText = block.current;
                break;
            case 'incoming':
                resolvedText = block.incoming;
                break;
            case 'both':
                resolvedText = `${block.current}\n${block.incoming}`;
                break;
        }

        const startPos = document.positionAt(block.start);
        const endPos = document.positionAt(block.end);
        replacements.push({
            range: new vscode.Range(startPos, endPos),
            text: resolvedText
        });
    }

    if (replacements.length === 0) {
        return false;
    }

    // 从后往前应用替换，避免位置偏移
    for (let i = replacements.length - 1; i >= 0; i--) {
        const replacement = replacements[i];
        edit.replace(document.uri, replacement.range, replacement.text);
    }

    await vscode.workspace.applyEdit(edit);
    await document.save();

    vscode.window.showInformationMessage(`✅ 已自动处理 ${replacements.length} 处冲突，其余请手动检查。`);

    return true;
}

/**
 * 解析冲突文件路径，返回对应的 VS Code URI
 */
function resolveConflictFileUri(file: string, workspaceRoot?: string): vscode.Uri {
    if (path.isAbsolute(file)) {
        return vscode.Uri.file(file);
    }

    const fallbackRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const base = workspaceRoot || fallbackRoot;
    if (base) {
        return vscode.Uri.file(path.join(base, file));
    }

    // 最后兜底，使用 path.resolve 以当前进程目录为基准
    return vscode.Uri.file(path.resolve(file));
}

/**
 * 提示用户将已解决的文件再次添加到暂存区，并提供快捷操作
 */
async function promptStageReminder(
    filePath: string,
    gitService: GitService,
    conflictProvider: ConflictProvider,
    options: { autoResolved: boolean }
): Promise<void> {
    const message = options.autoResolved
        ? '✅ 冲突已解决，是否立即将该文件添加到暂存区？'
        : '完成手动合并后，请添加文件到暂存区以标记已解决。是否现在添加？';

    const choice = await vscode.window.showInformationMessage(
        message,
        { modal: false },
        '暂存该文件',
        '稍后'
    );

    if (choice === '暂存该文件') {
        try {
            await gitService.add(filePath);
            vscode.window.showInformationMessage('已将文件添加到暂存区');
            conflictProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`暂存文件失败: ${error}`);
        }
    } else {
        vscode.window.showInformationMessage('记得稍后运行 git add 标记该文件已解决');
    }
}

