# 项目迁移状态

## ✅ 已完成的工作

### 1. 目录结构重组
- ✅ 创建 `web/` 目录（WebView 前端源码）
- ✅ 创建 `media/` 目录（编译输出）
- ✅ 创建 `web/components/`、`web/utils/`、`web/styles/` 子目录

### 2. 配置文件
- ✅ 创建 `tsconfig.web.json`（WebView 前端 TypeScript 配置，ES5 目标）
- ✅ 更新 `package.json`：
  - 移除 webpack、React 相关依赖
  - 更新构建脚本（使用 tsc 替代 webpack）
  - 添加 `compile-web`、`copy-web-assets` 脚本
- ✅ 创建 `scripts/copy-web-assets.js`（复制 CSS 等资源文件）

### 3. 核心文件迁移
- ✅ `web/index.ts` - 入口文件
- ✅ `web/app.ts` - 主应用类（替代 React App）
- ✅ `web/utils/theme.ts` - 主题工具函数
- ✅ `web/utils/url.ts` - URL 工具函数
- ✅ `web/utils/dom-utils.ts` - DOM 工具函数
- ✅ `web/styles/main.css` - 主样式文件

### 4. 后端更新
- ✅ 更新 `src/webview/dashboard-panel.ts`：
  - 修改脚本路径为 `media/index.js`
  - 修改资源路径为 `media/`
  - 添加 CSS 文件引用
  - 使用 ES6 模块加载（`type="module"`）

### 5. 基础功能实现
- ✅ 应用初始化
- ✅ 消息监听（gitData、gitDataUpdate）
- ✅ 标签页切换
- ✅ 状态持久化
- ✅ 命令历史基础渲染

## 🚧 待完成的工作

### 组件迁移（需要将 React 组件转换为原生 DOM）

1. **命令历史组件** (`web/components/command-history.ts`)
   - 当前：基础渲染已实现
   - 待完善：分类显示、命令执行、状态管理

2. **Git 指令集组件** (`web/components/git-command-reference.ts`)
   - 待创建：参考 `src/webview/components/GitCommandReference.tsx`

3. **远程仓库管理** (`web/components/remote-manager.ts`)
   - 待创建：参考 `src/webview/components/RemoteManager.tsx`

4. **分支管理** (`web/components/branch-tree.ts`)
   - 待创建：参考 `src/webview/components/BranchTree.tsx`

5. **标签管理** (`web/components/tag-manager.ts`)
   - 待创建：参考 `src/webview/components/TagManager.tsx`

6. **分支视图** (`web/components/branch-graph.ts`)
   - 待创建：参考 `src/webview/components/BranchGraph.tsx`
   - 使用 D3.js 渲染

7. **GitGraph** (`web/components/git-graph-view.ts`)
   - 待创建：参考 `src/webview/components/GitGraphView.tsx`

8. **冲突解决** (`web/components/conflict-editor.ts`)
   - 待创建：参考 `src/webview/components/ConflictEditor.tsx`

9. **提交图** (`web/components/commit-graph.ts`)
   - 待创建：参考 `src/webview/components/CommitGraph.tsx`
   - 使用 D3.js 渲染

10. **时间线视图** (`web/components/timeline-view.ts`)
    - 待创建：参考 `src/webview/components/TimelineView.tsx`
    - 使用 D3.js 渲染

11. **热力图分析** (`web/components/heatmap-analysis.ts`)
    - 待创建：参考 `src/webview/components/HeatmapAnalysis.tsx`
    - 使用 D3.js 渲染

## 📝 迁移指南

### 组件迁移步骤

1. **阅读 React 组件源码**
   - 理解组件的功能和数据结构
   - 识别状态管理和事件处理

2. **创建原生 DOM 组件类**
   ```typescript
   export class ComponentName {
       private container: HTMLElement;
       private data: any;
       
       constructor(containerId: string) {
           this.container = document.getElementById(containerId);
       }
       
       render(data: any) {
           // 使用 DOM API 或字符串模板渲染
       }
   }
   ```

3. **在 `web/app.ts` 中集成**
   - 在 `getContentHtml()` 中返回容器 HTML
   - 在 `attachEventListeners()` 中初始化组件

4. **处理事件**
   - 使用 `addEventListener` 替代 React 事件
   - 通过 `window.vscode.postMessage()` 与后端通信

### 样式处理

- CSS 文件放在 `web/styles/` 目录
- 构建时自动复制到 `media/styles/`
- 在 HTML 中通过 `<link>` 标签引用

### D3.js 使用

- D3.js 已保留在依赖中
- 可以直接使用 `import * as d3 from 'd3'`
- 注意 ES5 兼容性（D3 v7 支持 ES5）

## 🔧 构建命令

```bash
# 编译扩展后端
npm run compile

# 仅编译 WebView 前端
npm run compile-web

# 复制 Web 资源文件
npm run copy-web-assets

# 完整构建
npm run package

# 监听模式（开发）
npm run watch
```

## 📦 输出结构

```
media/
├── index.js          # 入口文件
├── app.js            # 主应用类
├── utils/            # 工具函数
│   ├── theme.js
│   ├── url.js
│   └── dom-utils.js
├── components/       # 组件（待迁移）
└── styles/           # 样式文件
    └── main.css
```

## ⚠️ 注意事项

1. **模块系统**：使用 ES6 模块，HTML 中使用 `type="module"` 加载
2. **浏览器兼容性**：目标 ES5，但使用 ES6 模块（现代浏览器支持）
3. **状态管理**：使用类属性替代 React state
4. **事件处理**：使用原生 DOM 事件替代 React 事件系统
5. **CSS 变量**：继续使用 VS Code CSS 变量，自动适配主题

## 🎯 下一步

1. 优先迁移核心功能组件（命令历史、分支管理、远程仓库）
2. 然后迁移可视化组件（图表、时间线、热力图）
3. 测试所有功能确保正常工作
4. 优化性能和用户体验

