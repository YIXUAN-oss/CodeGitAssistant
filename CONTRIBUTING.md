# 贡献指南

感谢您考虑为 Git Assistant 做出贡献！

## 🤝 如何贡献

### 报告Bug

如果您发现了Bug，请通过以下方式报告：

1. 在 [GitHub Issues](https://github.com/YIXUAN-oss/CodeGitAssistant/issues) 创建新Issue
2. 使用清晰的标题描述问题
3. 提供详细的重现步骤
4. 附上错误信息和截图（如果可能）
5. 说明您的环境信息（VS Code版本、操作系统等）

### 提出功能建议

我们欢迎新功能建议！

1. 在 [GitHub Discussions](https://github.com/YIXUAN-oss/CodeGitAssistant/discussions) 发起讨论
2. 清楚地描述您期望的功能
3. 解释为什么这个功能对您和其他用户有用
4. 如果可能，提供使用场景示例

### 提交代码

#### 准备工作

1. Fork 本仓库
2. 克隆到本地：
   ```bash
   git clone https://github.com/YIXUAN-oss/CodeGitAssistant
   cd git-assistant
   ```

3. 安装依赖：
   ```bash
   npm install
   ```

4. 创建功能分支：
   ```bash
   git checkout -b feature/your-feature-name
   ```

#### 开发流程

1. **编写代码**
   - 遵循现有的代码风格
   - 添加必要的注释
   - 确保类型定义完整

2. **本地开发与编译**
   ```bash
   # 安装依赖后，推荐开启监听模式
   npm run watch          # 监听扩展 + Web 前端

   # 或单次完整编译（extension + web → dist + media）
   npm run compile
   ```

3. **运行测试**
   ```bash
   npm test
   ```

4. **代码检查**
   ```bash
   npm run lint
   ```

5. **本地功能验证**
   - 在 VS Code 中按 F5 启动调试（Extension Development Host）
   - 在新窗口中打开测试仓库，验证侧边栏视图与控制面板 10 个标签页
   - 确保没有破坏现有功能

#### 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<类型>(<范围>): <描述>

[可选的正文]

[可选的脚注]
```

类型包括：
- `feat`: 新功能
- `fix`: Bug修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具链相关

示例：
```
feat(branch): 添加分支对比功能

- 实现两个分支的文件差异对比
- 添加可视化展示界面
- 支持导出对比报告

Closes #123
```

#### 提交Pull Request

1. 推送到您的Fork：
   ```bash
   git push origin feature/your-feature-name
   ```

2. 在GitHub上创建Pull Request

3. PR标题应清晰描述更改内容

4. 在PR描述中：
   - 解释更改的动机
   - 描述实现方法
   - 列出主要更改
   - 关联相关Issue

5. 等待代码审查

## 📝 编码规范

### TypeScript风格

```typescript
// ✅ 好的示例
export class GitService {
    private git: SimpleGit | null = null;
    
    async getBranches(): Promise<BranchSummary> {
        const git = this.ensureGit();
        return await git.branch();
    }
}

// ❌ 避免
export class GitService {
    private git;
    
    getBranches() {
        return this.git.branch();
    }
}
```

### 命名约定

- **类名**: PascalCase - `GitService`, `BranchProvider`
- **接口**: PascalCase - `GitStatus`, `CommitInfo`
- **函数/方法**: camelCase - `getBranches`, `createBranch`
- **常量**: UPPER_SNAKE_CASE - `DEFAULT_REMOTE`, `MAX_COUNT`
- **私有成员**: 前缀下划线 - `_git`, `_onDidChange`

### 注释规范

```typescript
/**
 * 获取仓库的所有分支
 * @returns 返回包含所有分支信息的对象
 * @throws 如果Git未初始化则抛出错误
 */
async getBranches(): Promise<BranchSummary> {
    // 实现代码
}
```

### 文件组织

```text
src/
├── extension.ts        # 扩展入口
├── commands/           # 命令处理器
├── providers/          # TreeDataProvider（分支/历史/冲突）
├── services/           # Git 服务封装（simple-git）
├── webview/            # Webview 容器（dashboard-panel.ts 等）
├── utils/              # 工具函数（日志、通知、命令历史等）
└── types/              # 类型定义（git 相关类型）

web/                    # Webview 前端源码（运行在浏览器环境）
├── app.ts              # 主应用 / 标签切换
├── components/         # 10 个标签页组件（命令历史、Git 指令集、Git 视图表等）
├── styles/             # Webview 样式（复制到 media/styles）
├── utils/              # 主题、Git 图渲染等工具
└── types/              # Web 端 git 相关类型

media/                  # Webview 前端编译输出（由 web/ 生成的 .js/.css）
```

## 🧪 测试

### 编写测试

```typescript
import * as assert from 'assert';
import { GitService } from '../../services/git-service';

suite('GitService Test Suite', () => {
    test('应该正确获取分支列表', async () => {
        const service = new GitService();
        const branches = await service.getBranches();
        assert.ok(branches);
        assert.ok(branches.all.length > 0);
    });
});
```

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- --grep "GitService"
```

## 📚 文档

### 更新文档

如果您的更改影响用户使用：

1. 更新 `README.md`
2. 更新 `README_CN.md`
3. 在 `CHANGELOG.md` 中记录更改
4. 更新相关的代码注释

### 文档风格

- 使用清晰、简洁的语言
- 提供代码示例
- 添加截图说明（如适用）
- 保持中英文文档同步

## 🔍 代码审查

### 审查清单

提交前自查：

- [ ] 代码遵循项目编码规范
- [ ] 所有测试通过
- [ ] 没有ESLint警告
- [ ] 添加了必要的注释
- [ ] 更新了相关文档
- [ ] 提交信息符合规范
- [ ] 没有遗留的调试代码
- [ ] 没有无关的文件更改

### 响应反馈

- 及时回复审查意见
- 耐心解释设计决策
- 虚心接受建议
- 快速修复问题

## 📋 Issue标签说明

- `bug` - 确认的Bug
- `enhancement` - 功能增强
- `documentation` - 文档相关
- `good first issue` - 适合新贡献者
- `help wanted` - 需要帮助
- `question` - 疑问讨论
- `wontfix` - 不会修复
- `duplicate` - 重复Issue

## 💬 社区准则

- 尊重所有贡献者
- 保持友好和专业
- 接受建设性批评
- 关注整体利益
- 遵守行为准则

## 📞 获取帮助

如果您有任何疑问：

- 查看 [文档](https://github.com/YIXUAN-oss/CodeGitAssistant/wiki)
- 在 [Discussions](https://github.com/YIXUAN-oss/CodeGitAssistant/discussions) 提问
- 发送邮件至 support@gitassistant.com

## 🎉 致谢

感谢所有为本项目做出贡献的开发者！

您的贡献将被记录在 [贡献者列表](https://github.com/YIXUAN-oss/CodeGitAssistant/graphs/contributors) 中。

---

再次感谢您的贡献！🙌

