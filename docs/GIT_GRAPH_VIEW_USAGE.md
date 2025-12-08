# Git Graph View 工具使用指南

本文档说明如何在 `GitGraphViewComponent` 中使用已完善的工具和组件。

## 已集成的工具组件

### 1. **TextFormatter** - 文本格式化工具

用于格式化提交消息，支持：
- Markdown 格式（**粗体**、*斜体*、`代码块`）
- Emoji 短代码（`:rocket:` → 🚀）
- 提交哈希链接（自动识别并链接）
- Issue 链接（`#123` → 链接到 Issue）
- URL 链接（自动识别并链接）

**使用示例：**

```typescript
// 在 GitGraphViewComponent 中
private formatCommitMessage(message: string): string {
    if (!this.textFormatter) {
        return escapeHtml(message || '');
    }
    
    // 更新提交列表以便识别提交哈希
    if (this.commitsRef.length > 0) {
        this.textFormatter = new TextFormatter(
            this.commitsRef,
            null, // repoIssueLinkingConfig
            {
                commits: true,      // 支持提交哈希链接
                emoji: true,        // 支持 emoji
                issueLinking: true, // 支持 Issue 链接
                markdown: true,     // 支持 Markdown
                multiline: true,    // 支持多行
                urls: true          // 支持 URL
            }
        );
    }
    
    return this.textFormatter.format(message);
}
```

**在 HTML 渲染中使用：**

```typescript
// 在表格单元格中
${this.formatCommitMessage(commitMessage)}

// 在详情面板中
<div>${this.formatCommitMessage(fullCommit?.message || '')}</div>
```

### 2. **Dialog** - 对话框组件

用于显示各种对话框：
- 确认对话框（`showConfirmation`）
- 输入对话框（`showRefInput`）
- 选择对话框（`showSelect`）
- 多选对话框（`showMultiSelect`）
- 复选框对话框（`showCheckbox`）
- 自定义表单对话框（`showForm`）

**使用示例：**

```typescript
// 显示确认对话框
this.dialog?.showConfirmation(
    '确定要检出此提交吗？',
    '检出',
    () => {
        // 执行操作
        performCheckout();
    },
    null // target
);

// 显示分支名称输入对话框
this.dialog?.showRefInput(
    '请输入新分支名称：',
    '', // 默认值
    '创建分支',
    (branchName: string) => {
        // 执行创建分支操作
        createBranch(branchName);
    },
    target // DialogTarget
);

// 显示选择对话框
this.dialog?.showSelect(
    '选择重置类型：',
    'soft', // 默认值
    [
        { name: 'Soft', value: 'soft' },
        { name: 'Mixed', value: 'mixed' },
        { name: 'Hard', value: 'hard' }
    ],
    '重置',
    (resetType: string) => {
        performReset(resetType);
    },
    target
);
```

### 3. **ContextMenu** - 右键菜单组件

用于显示上下文菜单。

**使用示例：**

```typescript
// 在 handleContextMenu 方法中
private handleContextMenu(e: MouseEvent, hash: string) {
    if (!this.contextMenu || !this.containerRef) return;

    const commitIndex = this.commitNodes.findIndex(c => c.hash === hash);
    const commitElems = getCommitElems();
    const commitElem = commitElems[commitIndex];
    
    if (!commitElem) return;

    // 定义菜单动作
    const actions: ContextMenuActions = [
        [
            {
                title: '查看提交详情',
                visible: true,
                onClick: () => this.handleCommitClick(hash)
            },
            {
                title: '复制提交哈希',
                visible: true,
                onClick: () => navigator.clipboard.writeText(hash)
            }
        ],
        [
            {
                title: '检出此提交',
                visible: true,
                onClick: () => this.showCheckoutDialog(hash)
            }
        ]
    ];

    // 创建目标对象
    const target: CommitOrRefTarget = {
        type: TargetType.Commit,
        elem: commitElem,
        hash: hash,
        index: commitIndex,
        ref: undefined
    } as CommitOrRefTarget & { index: number };

    // 显示菜单
    this.contextMenu.show(
        actions,
        false, // checked
        target,
        e,
        this.containerRef
    );
}
```

### 4. **FindWidget** - 查找组件

用于在提交列表中查找内容。

**初始化：**

```typescript
// 在构造函数中
this.findWidget = new FindWidget(this as any);
```

**需要实现的接口方法：**

```typescript
// FindWidget 需要 GitGraphView 接口
public getCommits(): ReadonlyArray<CommitInfo> {
    return this.commitsRef;
}

public getCommitId(hash: string): number {
    return this.commitNodes.findIndex(c => c.hash === hash);
}

public scrollToCommit(hash: string, animate: boolean): void {
    const commitIndex = this.commitNodes.findIndex(c => c.hash === hash);
    if (commitIndex === -1 || !this.containerRef) return;
    
    const targetY = commitIndex * ROW_HEIGHT;
    if (animate) {
        this.containerRef.scrollTo({ top: targetY, behavior: 'smooth' });
    } else {
        this.containerRef.scrollTop = targetY;
    }
}

// ... 其他接口方法
```

### 5. **SettingsWidget** - 设置组件

用于显示仓库设置面板。

**初始化：**

```typescript
// 在构造函数中
this.settingsWidget = new SettingsWidget(this as any);
```

**需要实现的接口方法：**

```typescript
// SettingsWidget 需要 GitGraphView 接口
public getBranches(): string[] {
    const branches = new Set<string>();
    this.commitNodes.forEach(node => {
        if (node.branches) {
            node.branches.forEach(branch => branches.add(branch));
        }
    });
    return Array.from(branches);
}

public refresh(reload: boolean): void {
    if (reload) {
        // 重新加载数据
    } else {
        // 只重新渲染
        this.render(this.data);
    }
}

// ... 其他接口方法
```

## 完整初始化示例

```typescript
export class GitGraphViewComponent {
    // ... 其他属性

    private textFormatter: TextFormatter | null = null;
    private dialog: Dialog | null = null;
    private contextMenu: ContextMenu | null = null;
    private findWidget: FindWidget | null = null;
    private settingsWidget: SettingsWidget | null = null;

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }
        this.container = container;

        // 初始化所有工具组件
        this.initializeTools();
    }

    private initializeTools() {
        // 1. 初始化 TextFormatter
        this.textFormatter = new TextFormatter(
            [],
            null,
            {
                commits: true,
                emoji: true,
                issueLinking: true,
                markdown: true,
                multiline: true,
                urls: true
            }
        );

        // 2. 初始化 Dialog
        this.dialog = new Dialog();

        // 3. 初始化 ContextMenu
        this.contextMenu = new ContextMenu();

        // 4. 初始化 FindWidget
        this.findWidget = new FindWidget(this as any);

        // 5. 初始化 SettingsWidget
        this.settingsWidget = new SettingsWidget(this as any);
    }
}
```

## 使用场景示例

### 场景 1：格式化提交消息

```typescript
// 在渲染提交消息时
const formattedMessage = this.formatCommitMessage(commit.message);

// 输出支持：
// - Markdown: **重要更新**
// - Emoji: :rocket: 新功能
// - 链接: 修复了 #123 问题
// - URL: 查看 https://example.com
```

### 场景 2：显示确认对话框

```typescript
// 用户点击"检出提交"时
this.dialog?.showConfirmation(
    `确定要检出提交 ${hash.substring(0, 8)} 吗？`,
    '检出',
    () => {
        // 执行检出
        checkoutCommit(hash);
    },
    null
);
```

### 场景 3：创建分支对话框

```typescript
// 用户点击"创建分支"时
this.dialog?.showRefInput(
    '请输入新分支名称：',
    '', // 默认值
    '创建分支',
    (branchName: string) => {
        createBranch(branchName, fromHash);
    },
    target
);
```

### 场景 4：右键菜单

```typescript
// 用户右键点击提交时
row.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    this.handleContextMenu(e, commit.hash);
});
```

## 注意事项

1. **类型安全**：某些组件需要使用 `as any` 进行类型转换，因为接口定义可能与实际实现不完全匹配。

2. **生命周期**：确保在组件销毁时清理资源（如事件监听器）。

3. **状态同步**：在使用 TextFormatter 时，需要及时更新提交列表以便正确识别提交哈希。

4. **错误处理**：在使用 Dialog 和 ContextMenu 时，需要检查组件是否已初始化。

5. **性能优化**：TextFormatter 的创建可能会比较耗时，建议缓存实例或按需创建。

