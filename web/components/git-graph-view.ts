/**
 * Git Graph 视图组件 - 表格形式的分支提交历史（基于官方 vscode-git-graph 实现）
 * 从 React 组件转换为原生 TypeScript 类组件
 */

import { escapeHtml } from '../utils/dom-utils.js';
import { GitData, CommitInfo, BranchGraphDag } from '../types/git.js';
import { GitGraphRenderer } from '../utils/git-graph-renderer.js';
import { TextFormatter } from '../utils/text-formatter.js';
import { Dialog } from './dialog.js';
import { ContextMenu, ContextMenuActions, TargetType, CommitOrRefTarget } from './context-menu.js';
import { FindWidget } from './find-widget.js';
import { SettingsWidget } from './settings-widget.js';
import { getCommitElems, formatLongDate, SVG_ICONS } from '../utils/vscode-git-utils.js';

/**
 * 提交行高度（像素）- 与官方插件一致
 */
const ROW_HEIGHT = 24;
const GRAPH_COLUMN_WIDTH = 80;
const GRID_X = 16; // 每个轨道的宽度（像素）
const GRID_Y = ROW_HEIGHT; // 每行的高度
const GRID_OFFSET_X = 8; // 图形左侧偏移
const GRID_OFFSET_Y = GRID_Y / 2; // 图形顶部偏移
const VISIBLE_BUFFER = 5;

/**
 * 分支颜色调色板（与官方 Git Graph 插件一致）
 */
const BRANCH_COLORS = [
    '#0085d9', // 饱和蓝
    '#d9008f', // 品红
    '#00d90a', // 祖母绿
    '#F39C12', // 橙黄
    '#9B59B6', // 紫罗兰
    '#E74C3C', // 番茄红
    '#1ABC9C', // 青绿
    '#34495E', // 石板蓝灰
    '#F1C40F', // 亮黄
    '#2ECC71', // 草绿
    '#FF9800', // 鲜橙
    '#2980B9', // 湖蓝
];

/**
 * 获取可用的颜色索引（基于分支结束位置的颜色回收机制）
 * 优化：参考 vscode-git-graph-develop 的实现，更高效且稳定
 * @param startAt 分支开始的索引位置
 * @param availableColors 可用颜色数组，存储每个颜色对应的分支结束位置
 * @returns 颜色索引
 */
function getAvailableColour(startAt: number, availableColors: number[]): number {
    // 查找可以回收的颜色（分支已经结束）
    for (let i = 0; i < availableColors.length; i++) {
        if (startAt > availableColors[i]) {
            // 该颜色对应的分支已经结束，可以回收使用
            return i;
        }
    }
    // 如果没有可回收的颜色，分配新颜色
    availableColors.push(0);
    return availableColors.length - 1;
}

/**
 * 格式化日期（类似官方插件）
 */
function formatDate(dateString: string): string {
    if (!dateString) {
        return '未知日期';
    }

    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return '无效日期';
        }

        const pad = (n: number) => n.toString().padStart(2, '0');
        const y = date.getFullYear();
        const m = pad(date.getMonth() + 1);
        const d = pad(date.getDate());
        const hh = pad(date.getHours());
        const mm = pad(date.getMinutes());
        const ss = pad(date.getSeconds());

        return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
    } catch (error) {
        return '无效日期';
    }
}

/**
 * 提交节点接口
 */
interface CommitNode {
    hash: string;
    message: string;
    date: string;
    author_name: string;
    author_email: string;
    branches?: string[];
    parents?: string[];
    isMerge?: boolean;
    // 图形布局信息（基于官方算法）
    x: number; // X坐标（轨道号）
    y: number; // Y坐标（索引）
    colorIndex: number; // 颜色索引
    branch?: Branch; // 所属分支
}

/**
 * 点接口（用于图形坐标）
 */
interface Point {
    readonly x: number;
    readonly y: number;
}

/**
 * 线条接口（用于分支线条）
 */
interface Line {
    readonly p1: Point;
    readonly p2: Point;
    readonly isCommitted: boolean;
    readonly lockedFirst: boolean; // TRUE => 线条锁定到 p1, FALSE => 线条锁定到 p2
}

/**
 * 不可用点接口（用于跟踪连接）
 */
interface UnavailablePoint {
    readonly connectsTo: Vertex | null;
    readonly onBranch: Branch;
}

/**
 * 分支类（类似官方实现）
 */
class Branch {
    private readonly colorIndex: number;
    private end: number = 0;
    private lines: Line[] = [];

    constructor(colorIndex: number) {
        this.colorIndex = colorIndex;
    }

    public addLine(p1: Point, p2: Point, isCommitted: boolean, lockedFirst: boolean = true) {
        this.lines.push({ p1, p2, isCommitted, lockedFirst });
    }

    public getColorIndex() {
        return this.colorIndex;
    }

    public getEnd() {
        return this.end;
    }

    public setEnd(end: number) {
        this.end = end;
    }

    public getLines() {
        return this.lines;
    }
}

/**
 * 顶点类（类似官方实现）
 */
class Vertex {
    public readonly id: number;
    private x: number = 0;
    private children: Vertex[] = [];
    private parents: Vertex[] = [];
    private nextParent: number = 0;
    private onBranch: Branch | null = null;
    private isCommitted: boolean = true;
    private isCurrent: boolean = false;
    private nextX: number = 0;
    private connections: UnavailablePoint[] = [];

    constructor(id: number) {
        this.id = id;
    }

    public addChild(vertex: Vertex) {
        this.children.push(vertex);
    }

    public getChildren(): ReadonlyArray<Vertex> {
        return this.children;
    }

    public addParent(vertex: Vertex) {
        this.parents.push(vertex);
    }

    public getParents(): ReadonlyArray<Vertex> {
        return this.parents;
    }

    public hasParents() {
        return this.parents.length > 0;
    }

    public getNextParent(): Vertex | null {
        if (this.nextParent < this.parents.length) return this.parents[this.nextParent];
        return null;
    }

    public registerParentProcessed() {
        this.nextParent++;
    }

    public isMerge() {
        return this.parents.length > 1;
    }

    public addToBranch(branch: Branch, x: number) {
        if (this.onBranch === null) {
            this.onBranch = branch;
            this.x = x;
        }
    }

    public isNotOnBranch() {
        return this.onBranch === null;
    }

    public isOnThisBranch(branch: Branch) {
        return this.onBranch === branch;
    }

    public getBranch() {
        return this.onBranch;
    }

    public getPoint(): Point {
        return { x: this.x, y: this.id };
    }

    public getNextPoint(): Point {
        return { x: this.nextX, y: this.id };
    }

    /**
     * 获取连接到指定顶点的点（如果存在）
     */
    public getPointConnectingTo(vertex: Vertex | null, onBranch: Branch): Point | null {
        for (let i = 0; i < this.connections.length; i++) {
            const conn = this.connections[i];
            if (conn && conn.connectsTo === vertex && conn.onBranch === onBranch) {
                return { x: i, y: this.id };
            }
        }
        return null;
    }

    /**
     * 注册不可用点（标记某个 X 坐标已被使用）
     */
    public registerUnavailablePoint(x: number, connectsToVertex: Vertex | null, onBranch: Branch) {
        if (x === this.nextX) {
            this.nextX = x + 1;
            if (this.connections.length <= x) {
                this.connections.length = x + 1;
            }
            this.connections[x] = { connectsTo: connectsToVertex, onBranch: onBranch };
        }
    }

    public setNextX(x: number) {
        if (x >= this.nextX) {
            this.nextX = x + 1;
        }
    }

    public getX() {
        return this.x;
    }

    public setNotCommitted() {
        this.isCommitted = false;
    }

    public getIsCommitted() {
        return this.isCommitted;
    }

    public setCurrent() {
        this.isCurrent = true;
    }

    public getIsCurrent() {
        return this.isCurrent;
    }
}

/**
 * Git Graph 表格视图组件（基于官方实现）
 */
export class GitGraphViewComponent {
    private container: HTMLElement;
    private data: GitData | null = null;

    // 状态管理（替代 React hooks）
    private scrollTop: number = 0;
    private containerHeight: number = 600;
    private headerHeight: number = ROW_HEIGHT;
    private selectedCommit: string | null = null;
    private expandedCommit: string | null = null;
    private detailHeight: number = 0;

    // DOM 引用
    private containerRef: HTMLElement | null = null;
    private headerRef: HTMLElement | null = null;
    private graphSvgRef: SVGElement | null = null;
    private detailCellRef: HTMLElement | null = null;
    private eventListenersAttached: boolean = false;
    private isRendering: boolean = false;

    // 数据缓存
    private commitsRef: CommitInfo[] = [];
    private dagRef: BranchGraphDag | null = null;
    private currentBranchRef: string | null = null;

    // 计算缓存
    private commitNodes: CommitNode[] = [];
    private graphBranches: Branch[] = [];
    private commitInfoMap: Map<string, CommitInfo> = new Map();
    private commitIndexMap: Map<string, number> = new Map();
    private mutedCommits: boolean[] = [];

    // 渲染优化
    private renderTimeoutRef: number | null = null;
    private renderFrameRef: number | null = null;
    private isRenderingRef: boolean = false;
    private lastRenderDataRef: {
        commitNodesLength: number;
        expandedCommit: string | null;
        detailHeight: number;
    } = { commitNodesLength: 0, expandedCommit: null, detailHeight: 0 };
    private prevVisibleRangeRef: { start: number; end: number } = { start: 0, end: 0 };

    // 定时器引用
    private scrollTimeoutRef: number | null = null;
    private detailHeightTimeoutRef: number | null = null;

    // ResizeObserver
    private containerResizeObserver: ResizeObserver | null = null;
    private headerResizeObserver: ResizeObserver | null = null;
    private detailResizeObserver: ResizeObserver | null = null;

    // GitGraphRenderer 实例
    private graphRenderer: GitGraphRenderer | null = null;

    // 工具组件实例
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

        // 初始化工具组件
        this.initializeTools();
    }

    /**
     * 初始化工具组件
     */
    private initializeTools() {
        // 初始化 TextFormatter（用于格式化提交消息）
        this.textFormatter = new TextFormatter(
            [], // commits - 会在 render 时更新
            null, // repoIssueLinkingConfig
            {
                commits: true,      // 支持提交哈希链接
                emoji: true,        // 支持 emoji 短代码
                issueLinking: true, // 支持 Issue 链接
                markdown: true,     // 支持 Markdown 格式
                multiline: true,    // 支持多行文本
                urls: true          // 支持 URL 链接
            }
        );

        // 初始化 Dialog（用于显示对话框）
        this.dialog = new Dialog();

        // 初始化 ContextMenu（用于右键菜单）
        this.contextMenu = new ContextMenu();

        // 初始化 FindWidget（用于查找功能）
        // 注意：FindWidget 需要一个实现了 GitGraphView 接口的对象
        // 我们需要创建一个适配器或者让 GitGraphViewComponent 实现该接口
        this.findWidget = new FindWidget(this as any);

        // 初始化 SettingsWidget（用于设置面板）
        // 同样需要适配器
        this.settingsWidget = new SettingsWidget(this as any);
    }

    render(data: GitData | null) {
        // 防止重复渲染
        if (this.isRendering) {
            return;
        }
        this.isRendering = true;

        try {
            this.data = data;

            // 更新数据引用
            const commitsChanged = data?.log?.all !== this.commitsRef;
            const dagChanged = data?.branchGraph?.dag !== this.dagRef;
            const branchChanged = (data?.branchGraph?.currentBranch || data?.branches?.current) !== this.currentBranchRef;

            if (commitsChanged) this.commitsRef = data?.log?.all || [];
            if (dagChanged) this.dagRef = data?.branchGraph?.dag || null;
            if (branchChanged) this.currentBranchRef = (data?.branchGraph?.currentBranch || data?.branches?.current || null);

            // 初始化或更新 GitGraphRenderer
            if (!this.graphRenderer) {
                this.graphRenderer = new GitGraphRenderer({
                    grid: {
                        x: GRID_X,
                        y: GRID_Y,
                        offsetX: GRID_OFFSET_X,
                        offsetY: GRID_OFFSET_Y,
                        expandY: 0
                    },
                    colours: BRANCH_COLORS,
                    style: 'rounded'
                });
            }

            // 构建图形数据（保留用于表格渲染）
            this.buildGraphData();

            // 渲染 HTML
            this.container.innerHTML = this.getHtml();

            // 获取 DOM 引用（在设置事件监听器之前）
            this.containerRef = this.container.querySelector('#commitTable') as HTMLElement;
            this.headerRef = this.container.querySelector('thead') as HTMLElement;
            this.graphSvgRef = this.container.querySelector('#commitGraph') as SVGElement;

            // 立即测量表头高度，避免首屏偏移
            if (this.headerRef) {
                const h = this.headerRef.getBoundingClientRect().height;
                if (h > 0) {
                    this.headerHeight = h;
                }
            }

            // 初始化容器高度（如果还没有设置）
            if (this.containerRef && this.containerHeight === 600) {
                this.containerHeight = this.containerRef.getBoundingClientRect().height || 600;
            }

            // 更新渲染器配置（现在 headerRef 已经可用）
            if (this.graphRenderer && this.headerRef) {
                // offsetY 只需要 ROW_HEIGHT / 2，因为 SVG 的 top 已经包含了 headerHeight
                this.graphRenderer.updateConfig({
                    grid: {
                        x: GRID_X,
                        y: ROW_HEIGHT,
                        offsetX: GRID_OFFSET_X,
                        offsetY: ROW_HEIGHT / 2,  // 修正：只设置行的一半高度
                        expandY: 0
                    }
                });
            }

            // 设置事件监听器（事件委托方式，绑定在 this.container 上，确保不会被替换）
            if (!this.eventListenersAttached) {
                this.attachEventListeners();
                this.eventListenersAttached = true;
            }

            // 设置滚动事件监听器（需要在每次 render 后重新绑定，因为 containerRef 会被重新创建）
            // 旧的 containerRef 已经被销毁，所以不会重复绑定
            if (this.containerRef) {
                this.containerRef.addEventListener('scroll', (e: Event) => {
                    const target = e.currentTarget as HTMLElement;
                    const newScrollTop = target.scrollTop;

                    // 更新 scrollTop 和 containerHeight（实时获取，因为可能变化）
                    this.scrollTop = newScrollTop;
                    if (target) {
                        const rect = target.getBoundingClientRect();
                        if (rect.height > 0) {
                            this.containerHeight = rect.height;
                        }
                    }

                    // 计算新的可见范围（使用最新的 containerHeight）
                    const newVisibleRange = this.getVisibleRangeForScroll(newScrollTop);
                    const oldVisibleRange = this.prevVisibleRangeRef;

                    // 如果可见范围变化较大，需要重新渲染
                    const rangeChanged =
                        Math.abs(newVisibleRange.start - oldVisibleRange.start) > VISIBLE_BUFFER ||
                        Math.abs(newVisibleRange.end - oldVisibleRange.end) > VISIBLE_BUFFER;

                    if (rangeChanged && !this.isRendering) {
                        // 使用 requestAnimationFrame 优化滚动性能
                        if (this.renderFrameRef !== null) {
                            cancelAnimationFrame(this.renderFrameRef);
                        }
                        this.renderFrameRef = requestAnimationFrame(() => {
                            this.renderFrameRef = null;
                            if (!this.isRendering && this.data) {
                                // 更新 prevVisibleRangeRef 以避免重复计算
                                this.prevVisibleRangeRef = newVisibleRange;
                                this.render(this.data);
                            }
                        });
                    } else if (!rangeChanged) {
                        // 即使范围没变化，也更新 prevVisibleRangeRef（因为 scrollTop 变了）
                        this.prevVisibleRangeRef = newVisibleRange;
                    }

                    if (this.scrollTimeoutRef !== null) {
                        clearTimeout(this.scrollTimeoutRef);
                    }
                    this.scrollTimeoutRef = window.setTimeout(() => {
                        this.scrollTimeoutRef = null;
                    }, 250);
                });
            }

            // 设置 ResizeObserver
            this.setupResizeObservers();

            // 如果详情行已展开，立即测量高度（在渲染后）
            if (this.expandedCommit) {
                setTimeout(() => {
                    const detailCell = this.container.querySelector(`[data-detail-cell="${this.expandedCommit}"]`) as HTMLElement;
                    if (detailCell && !this.detailCellRef) {
                        this.detailCellRef = detailCell;
                        this.measureDetailHeight();
                    }
                }, 0);
            }

            // 渲染图形（使用 GitGraphRenderer）
            // 使用 setTimeout 确保 DOM 完全渲染后再渲染 SVG
            setTimeout(() => {
                this.renderGraph();
            }, 0);
        } finally {
            this.isRendering = false;
        }
    }

    /**
     * 构建图形数据（基于官方算法）
     */
    private buildGraphData() {
        // 如果没有提交数据，直接返回
        if (!this.commitsRef || this.commitsRef.length === 0) {
            this.commitNodes = [];
            this.commitIndexMap.clear();
            this.graphBranches = [];
            return;
        }

        // 如果没有 dag 数据，构建基本的提交节点（不包含图形）
        if (!this.dagRef || !this.dagRef.nodes || this.dagRef.nodes.length === 0) {
            // 即使没有 dag，也构建基本的提交节点用于显示
            this.commitNodes = this.commitsRef.map((commit, index) => ({
                hash: commit.hash,
                message: commit.message || '',
                date: commit.date || '',
                author_name: commit.author_name || '',
                author_email: commit.author_email || '',
                branches: commit.branches || [],
                parents: commit.parents || [],
                isMerge: (commit.parents?.length || 0) > 1,
                x: 0, // 默认在第一个轨道
                y: index,
                colorIndex: 0,
                branch: undefined
            }));
            this.commitIndexMap.clear();
            this.commitNodes.forEach((node, idx) => this.commitIndexMap.set(node.hash, idx));
            this.graphBranches = [];
            // 构建提交信息映射
            this.commitInfoMap = new Map<string, CommitInfo>();
            this.commitsRef.forEach((c: CommitInfo) => this.commitInfoMap.set(c.hash, c));
            // 计算 muted 提交
            this.calculateMutedCommits();
            return;
        }

        const commits = this.commitsRef;
        const dag = this.dagRef;

        // 构建提交信息映射
        const commitMap = new Map<string, {
            hash: string;
            message: string;
            date: string;
            author_name: string;
            author_email: string;
            parents: string[];
            branches: string[];
        }>();
        commits.forEach(commit => {
            commitMap.set(commit.hash, {
                hash: commit.hash,
                message: commit.message || '',
                date: commit.date || '',
                author_name: commit.author_name || '',
                author_email: commit.author_email || '',
                parents: commit.parents || [],
                branches: commit.branches || []
            });
        });

        // 构建节点映射
        const nodeMap = new Map<string, {
            hash: string;
            branches?: string[];
            parents?: string[];
            timestamp?: number;
        }>();
        dag.nodes.forEach((node: {
            hash: string;
            branches?: string[];
            parents?: string[];
            timestamp?: number;
        }) => {
            // 兜底：如果 dag 未返回 parents，则使用 log 中的父提交，避免断线
            const fallbackParents = commitMap.get(node.hash)?.parents || [];
            const fallbackBranches = commitMap.get(node.hash)?.branches || [];
            nodeMap.set(node.hash, {
                hash: node.hash,
                branches: (node.branches && node.branches.length > 0) ? node.branches : fallbackBranches,
                parents: (node.parents && node.parents.length > 0) ? node.parents : fallbackParents,
                timestamp: node.timestamp || 0
            });
        });

        // 按时间排序（新的在上）
        const sortedHashes = Array.from(nodeMap.entries())
            .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
            .map(([hash]) => hash);

        // 构建顶点和分支（类似官方实现）
        const vertices: Vertex[] = sortedHashes.map((_, i) => new Vertex(i));
        const commitLookup: { [hash: string]: number } = {};
        sortedHashes.forEach((hash, i) => {
            commitLookup[hash] = i;
        });

        // 构建父子关系
        const nullVertex = new Vertex(-1);
        sortedHashes.forEach((hash, i) => {
            const node = nodeMap.get(hash)!;
            if (node.parents) {
                node.parents.forEach(parentHash => {
                    const parentIndex = commitLookup[parentHash];
                    if (typeof parentIndex === 'number') {
                        vertices[i].addParent(vertices[parentIndex]);
                        vertices[parentIndex].addChild(vertices[i]);
                    } else {
                        vertices[i].addParent(nullVertex);
                    }
                });
            }
        });

        // 标记当前提交
        const currentBranch = this.currentBranchRef;
        if (currentBranch) {
            const currentHash = sortedHashes.find(hash => {
                const node = nodeMap.get(hash);
                return node?.branches?.includes(currentBranch);
            });
            if (currentHash && commitLookup[currentHash] !== undefined) {
                vertices[commitLookup[currentHash]].setCurrent();
            }
        }

        // 确定路径和分配分支（类似官方的 determinePath）
        const branches: Branch[] = [];
        const availableColors: number[] = [];

        const determinePath = (startAt: number) => {
            let i = startAt;
            let vertex = vertices[i];
            let parentVertex = vertex.getNextParent();
            let lastPoint = vertex.isNotOnBranch() ? vertex.getNextPoint() : vertex.getPoint();

            if (parentVertex !== null && parentVertex.id !== -1 && vertex.isMerge() && !vertex.isNotOnBranch() && !parentVertex.isNotOnBranch()) {
                // 合并分支
                const parentBranch = parentVertex.getBranch()!;
                let foundPointToParent = false;
                for (i = startAt + 1; i < vertices.length; i++) {
                    const curVertex = vertices[i];
                    let curPoint: Point;
                    const existingPoint = curVertex.getPointConnectingTo(parentVertex, parentBranch);
                    if (existingPoint !== null) {
                        curPoint = existingPoint;
                        foundPointToParent = true;
                    } else if (curVertex === parentVertex) {
                        curPoint = curVertex.getPoint();
                        foundPointToParent = true;
                    } else {
                        curPoint = curVertex.getNextPoint();
                    }
                    const lockedFirst = !foundPointToParent && curVertex !== parentVertex ? lastPoint.x < curPoint.x : true;
                    parentBranch.addLine(lastPoint, curPoint, vertex.getIsCommitted(), lockedFirst);
                    curVertex.registerUnavailablePoint(curPoint.x, parentVertex, parentBranch);
                    lastPoint = curPoint;

                    if (foundPointToParent) {
                        vertex.registerParentProcessed();
                        break;
                    }
                }
            } else {
                // 普通分支
                const branchColorIndex = getAvailableColour(startAt, availableColors);
                const branch = new Branch(branchColorIndex);
                vertex.addToBranch(branch, lastPoint.x);
                vertex.registerUnavailablePoint(lastPoint.x, vertex, branch);
                for (i = startAt + 1; i < vertices.length; i++) {
                    const curVertex = vertices[i];
                    const curPoint = parentVertex === curVertex && !parentVertex.isNotOnBranch()
                        ? curVertex.getPoint()
                        : curVertex.getNextPoint();
                    const lockedFirst = lastPoint.x < curPoint.x;
                    branch.addLine(lastPoint, curPoint, vertex.getIsCommitted(), lockedFirst);
                    curVertex.registerUnavailablePoint(curPoint.x, parentVertex, branch);
                    lastPoint = curPoint;

                    if (parentVertex === curVertex) {
                        vertex.registerParentProcessed();
                        const parentVertexOnBranch = !parentVertex.isNotOnBranch();
                        parentVertex.addToBranch(branch, curPoint.x);
                        vertex = parentVertex;
                        parentVertex = vertex.getNextParent();
                        if (parentVertex === null || parentVertexOnBranch) {
                            break;
                        }
                    }
                }
                if (i === vertices.length && parentVertex !== null && parentVertex.id === -1) {
                    vertex.registerParentProcessed();
                }
                branch.setEnd(i);
                branches.push(branch);
                availableColors[branch.getColorIndex()] = i;
            }
        };

        // 处理所有顶点
        let i = 0;
        while (i < vertices.length) {
            if (vertices[i].getNextParent() !== null || vertices[i].isNotOnBranch()) {
                determinePath(i);
            } else {
                i++;
            }
        }

        // 确保所有顶点都被分配到分支
        for (i = 0; i < vertices.length; i++) {
            if (vertices[i].isNotOnBranch()) {
                const vertex = vertices[i];
                const branchColorIndex = getAvailableColour(i, availableColors);
                const branch = new Branch(branchColorIndex);
                const point = vertex.getNextPoint();
                vertex.addToBranch(branch, point.x);
                vertex.registerUnavailablePoint(point.x, vertex, branch);
                branch.setEnd(i + 1);
                branches.push(branch);
                availableColors[branch.getColorIndex()] = i;
            }
        }

        // 构建提交节点数组
        this.commitNodes = sortedHashes.map((hash, index) => {
            const vertex = vertices[index];
            const node = nodeMap.get(hash)!;

            let commitInfo = commitMap.get(hash);
            if (!commitInfo) {
                // 首先尝试从 commits 中查找
                let commitFromLog = commits.find(c => c.hash === hash);
                // 如果找不到，尝试从 this.commitsRef 中查找（可能包含更多数据）
                if (!commitFromLog && this.commitsRef) {
                    commitFromLog = this.commitsRef.find(c => c.hash === hash);
                }

                if (commitFromLog) {
                    commitInfo = {
                        hash: commitFromLog.hash,
                        message: commitFromLog.message || '',
                        date: commitFromLog.date || '',
                        author_name: commitFromLog.author_name || '',
                        author_email: commitFromLog.author_email || '',
                        parents: commitFromLog.parents || [],
                        branches: commitFromLog.branches || []
                    };
                    commitMap.set(hash, commitInfo);
                } else {
                    // 如果找不到完整的提交信息，至少使用 timestamp 来格式化日期
                    // 参考 vscode-git-graph-develop 的做法，使用 timestamp 而不是空字符串
                    const timestamp = node.timestamp || 0;
                    const dateStr = timestamp > 0
                        ? new Date(timestamp).toISOString()
                        : '';

                    commitInfo = {
                        hash,
                        message: '(无提交信息)',
                        date: dateStr,
                        author_name: '',
                        author_email: '',
                        parents: node.parents || [],
                        branches: node.branches || []
                    };
                }
            }

            return {
                hash,
                message: commitInfo.message,
                date: commitInfo.date,
                author_name: commitInfo.author_name,
                author_email: commitInfo.author_email,
                parents: (node.parents && node.parents.length > 0)
                    ? node.parents
                    : (commitInfo.parents || []),
                branches: (node.branches && node.branches.length > 0)
                    ? node.branches
                    : (commitInfo.branches || []),
                isMerge: vertex.isMerge(),
                x: vertex.getX(),
                y: index,
                colorIndex: vertex.getBranch()?.getColorIndex() || 0,
                branch: vertex.getBranch() || undefined
            };
        });

        this.commitIndexMap.clear();
        this.commitNodes.forEach((node, idx) => this.commitIndexMap.set(node.hash, idx));

        this.graphBranches = branches;

        // 构建提交信息映射
        this.commitInfoMap = new Map<string, CommitInfo>();
        if (this.commitsRef) {
            this.commitsRef.forEach((c: CommitInfo) => this.commitInfoMap.set(c.hash, c));
        }

        // 计算 muted 提交
        this.calculateMutedCommits();
    }

    private getCommitIndex(hash: string): number {
        return this.commitIndexMap.get(hash) ?? -1;
    }

    /**
     * 计算哪些提交应该显示为浅色（muted）
     */
    private calculateMutedCommits() {
        this.mutedCommits = new Array(this.commitNodes.length).fill(false);

        if (this.commitNodes.length === 0) return;

        const currentHash = this.currentBranchRef;
        const currentCommitIndex = currentHash
            ? this.commitNodes.findIndex(c => {
                const node = this.dagRef?.nodes?.find((n: { hash: string; branches?: string[] }) => n.hash === c.hash);
                return node?.branches?.includes(currentHash);
            })
            : -1;

        // 1. 淡化合并提交（默认启用）
        const muteMergeCommits = true;
        if (muteMergeCommits) {
            this.commitNodes.forEach((commit, index) => {
                if (commit.isMerge) {
                    this.mutedCommits[index] = true;
                }
            });
        }

        // 2. 淡化非 HEAD 祖先的提交（可选，默认关闭）
        const muteCommitsNotAncestorsOfHead = false;
        if (muteCommitsNotAncestorsOfHead && currentCommitIndex >= 0) {
            const commitIndexMap = new Map<string, number>();
            this.commitNodes.forEach((commit, index) => {
                commitIndexMap.set(commit.hash, index);
            });

            const ancestor: boolean[] = new Array(this.commitNodes.length).fill(false);
            const markAncestors = (commitIndex: number) => {
                if (commitIndex < 0 || commitIndex >= this.commitNodes.length || ancestor[commitIndex]) {
                    return;
                }
                ancestor[commitIndex] = true;

                const commit = this.commitNodes[commitIndex];
                if (commit.parents) {
                    commit.parents.forEach(parentHash => {
                        const parentIndex = commitIndexMap.get(parentHash);
                        if (parentIndex !== undefined) {
                            markAncestors(parentIndex);
                        }
                    });
                }
            };

            markAncestors(currentCommitIndex);

            this.commitNodes.forEach((commit, index) => {
                if (!ancestor[index]) {
                    this.mutedCommits[index] = true;
                }
            });
        }
    }

    /**
     * 获取可见范围（虚拟滚动）- 基于给定的 scrollTop
     * 用于在滚动事件中计算新的可见范围，不需要更新状态
     */
    private getVisibleRangeForScroll(_scrollTop: number): { start: number; end: number } {
        // 直接返回全部范围，关闭虚拟滚动以避免行缺失
        return { start: 0, end: this.commitNodes.length };
    }

    /**
     * 获取可见范围（虚拟滚动）
     * 注意：即使使用虚拟滚动，我们也需要确保所有提交的数据都正确构建
     * 只是不在 DOM 中渲染所有行，但数据应该完整
     */
    private getVisibleRange(): { start: number; end: number } {
        const range = this.getVisibleRangeForScroll(this.scrollTop);
        this.prevVisibleRangeRef = range;
        return range;
    }

    /**
     * 获取 HTML
     */
    private getHtml(): string {
        // 如果数据为 null，说明正在加载
        if (!this.data) {
            return `
            <div class="git-graph-view">
                <div class="section-header">
                    <h2>Git Graph 视图</h2>
                    <p class="section-description">表格形式的分支提交历史</p>
                </div>
                <div class="empty-state">
                    <p>📊 正在加载提交历史...</p>
                </div>
            </div>
            `;
        }

        // 如果没有提交数据，显示空状态
        if (this.commitNodes.length === 0) {
            const hasLogButEmpty = this.data?.log?.all !== undefined && (this.data.log.all?.length === 0 || !this.data.log.all);
            return `
            <div class="git-graph-view">
                <div class="section-header">
                    <h2>Git Graph 视图</h2>
                    <p class="section-description">表格形式的分支提交历史</p>
                </div>
                <div class="empty-state">
                    <p>${hasLogButEmpty ? '📭 当前仓库没有提交记录' : '📊 正在加载提交历史...'}</p>
                </div>
            </div>
            `;
        }

        const visibleCommits = this.commitNodes;
        const expandedIndex = this.expandedCommit ? this.getCommitIndex(this.expandedCommit) : -1;
        const extraHeight = expandedIndex >= 0 ? Math.max(this.detailHeight, ROW_HEIGHT) : 0;
        const totalHeight = this.commitNodes.length * ROW_HEIGHT + extraHeight;
        const currentBranchName = this.currentBranchRef;
        // 当前检出提交（支持分离 HEAD）
        let commitHead: string | null = null;
        if (this.data?.log?.all && this.data.log.all.length > 0) {
            // 先依据 HEAD 标记，避免旧的 currentBranch 数据覆盖
            const headCommit = this.data.log.all.find(c =>
                (c.refs && (c.refs.includes('HEAD') || /HEAD\s*->/.test(c.refs))) ||
                (c.branches && c.branches.includes('HEAD'))
            );
            if (headCommit) {
                commitHead = headCommit.hash;
            }

            // 若未找到 HEAD，再根据 currentBranch 选取最新提交
            if (!commitHead && this.currentBranchRef) {
                const currentBranchCommits = this.data.log.all.filter(c =>
                    c.branches && c.branches.includes(this.currentBranchRef!)
                );
                if (currentBranchCommits.length > 0) {
                    commitHead = currentBranchCommits[0].hash;
                }
            }
        }

        return `
            <div class="git-graph-view" style="height: 100%; display: flex; flex-direction: column; font-size: 14px;">
                <div
                    id="commitTable"
                    class="autoLayout"
                    style="position: relative; flex: 1; overflow: auto; background: var(--vscode-editor-background);"
                >
                    <svg
                        id="commitGraph"
                        style="position: absolute; left: 0; top: ${this.headerHeight}px; width: ${GRAPH_COLUMN_WIDTH}px; height: ${totalHeight}px; pointer-events: none; z-index: 2; will-change: contents; transform: translateZ(0); backface-visibility: hidden; opacity: 1; visibility: visible;"
                    ></svg>
                    <table style="width: 100%; border-collapse: collapse; position: relative; z-index: 3;">
                        <thead style="position: sticky; top: 0; z-index: 20; background: var(--vscode-sideBar-background); isolation: isolate;">
                            <tr>
                                <th id="tableHeaderGraphCol">Graph</th>
                                <th>Description</th>
                                <th class="dateCol">Date</th>
                                <th class="authorCol">Author</th>
                                <th>Commit</th>
                                </tr>
                            </thead>
                            <tbody>
                            ${visibleCommits.map((commit: CommitNode) => {
            const isCurrent = commit.hash === (commitHead || currentBranchName);
            const fullCommit = this.commitInfoMap.get(commit.hash);
            const commitMessage = (fullCommit?.message || commit.message || '').trim();
            const displayMessage = commitMessage || '(无提交信息)';
            const parents = commit.parents || [];
            const commitIndex = this.getCommitIndex(commit.hash);
            const isMuted = commitIndex >= 0 && this.mutedCommits[commitIndex];
            const isExpanded = this.expandedCommit === commit.hash;

            return `
                                    <tr
                                        class="commit${isCurrent ? ' current' : ''}${this.selectedCommit === commit.hash ? ' selected' : ''}${isMuted ? ' mute' : ''}${isExpanded ? ' commit-details-open' : ''}"
                                            data-commit-hash="${escapeHtml(commit.hash)}"
                                        style="height: ${ROW_HEIGHT}px;"
                                    >
                                        <td
                                            class="graphCol"
                                            style="width: ${GRAPH_COLUMN_WIDTH}px; padding: 0; margin: 0; position: relative; background: transparent; z-index: 1;"
                                        ></td>
                                        <td class="text">
                                            ${this.renderDescription(commit, fullCommit, isCurrent, displayMessage)}
                                        </td>
                                        <td class="dateCol text" title="${escapeHtml(commit.date)}">
                                            ${escapeHtml(formatDate(commit.date))}
                                        </td>
                                        <td class="authorCol text" title="${escapeHtml(commit.author_name)} &lt;${escapeHtml(commit.author_email)}&gt;">
                                            ${escapeHtml(commit.author_name || '(未知作者)')}
                                        </td>
                                        <td class="text" title="${escapeHtml(commit.hash)}">
                                            ${escapeHtml(commit.hash.substring(0, 8))}
                                        </td>
                                        </tr>
                                    ${isExpanded ? `
                                        <tr class="commit-details" id="cdv" data-commit-hash="${escapeHtml(commit.hash)}" style="height: ${Math.max(this.detailHeight || 200, 200)}px;">
                                            <td
                                                class="graphCol"
                                                style="width: ${GRAPH_COLUMN_WIDTH}px; padding: 0; margin: 0; border-top: 1px solid var(--vscode-panel-border); background: transparent; z-index: 1; height: ${Math.max(this.detailHeight || 200, 200)}px;"
                                            >
                                                <div class="cdvHeightResize"></div>
                                            </td>
                                            <td
                                                colSpan="4"
                                                style="padding: 0; background: var(--vscode-editor-background); border-top: 1px solid var(--vscode-panel-border); position: relative; height: ${Math.max(this.detailHeight || 200, 200)}px;"
                                                data-detail-cell="${escapeHtml(commit.hash)}"
                                            >
                                                <div id="cdvContent" style="position: absolute; left: 0; right: 32px;">
                                                    <div id="cdvSummary" style="position: absolute; top: 0; bottom: 0; left: 0; width: 50%; padding: 10px; box-sizing: border-box; border-right: 1px solid rgba(128, 128, 128, 0.2); overflow-x: hidden; overflow-y: auto; text-overflow: ellipsis; -webkit-user-select: text; user-select: text;">
                                                        ${this.renderCommitDetailsSummary(commit, fullCommit, parents)}
                                                    </div>
                                                    <div id="cdvFiles" style="position: absolute; top: 0; bottom: 0; left: 50%; right: 0; padding: 4px 8px 8px 0; box-sizing: border-box; overflow-x: hidden; overflow-y: auto; -webkit-user-select: none; user-select: none;">
                                                        ${this.renderCommitDetailsFiles(commit, fullCommit)}
                                                    </div>
                                                    <div id="cdvDivider" style="position: absolute; left: 50%; width: 6px; cursor: col-resize; top: 0; bottom: 0;"></div>
                                                </div>
                                                <div id="cdvControls" style="position: absolute; right: 0; width: 32px;">
                                                    <div id="cdvClose" class="cdvControlBtn" title="Close" style="position: relative; margin: 4px; width: 24px; height: 24px; cursor: pointer;">
                                                        ${SVG_ICONS.close}
                                                    </div>
                                                </div>
                                                <div class="cdvHeightResize" style="position: absolute; bottom: 0; left: 0; right: 0; height: 4px; cursor: ns-resize; z-index: 10;"></div>
                                            </td>
                                        </tr>
                                    ` : ''}
                                    `;
        }).join('')}
                            </tbody>
                        </table>
                </div>
            </div>
        `;
    }

    /**
     * 渲染提交详情摘要（与 vscode-git-graph-develop 保持一致）
     */
    private renderCommitDetailsSummary(commit: CommitNode, fullCommit: CommitInfo | undefined, parents: string[]): string {
        if (!this.textFormatter) {
            return '';
        }

        // 更新 TextFormatter 以包含最新的提交列表
        if (this.commitsRef.length > 0) {
            this.textFormatter = new TextFormatter(
                this.commitsRef,
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
        }

        // 格式化父提交（可点击链接）
        const formattedParents = parents.length > 0
            ? parents.map((parent) => {
                const escapedParent = escapeHtml(parent);
                const parentIndex = this.getCommitIndex(parent);
                if (parentIndex >= 0) {
                    // 父提交在当前列表中，创建可点击链接
                    return `<span class="internalUrl" data-type="commit" data-value="${escapedParent}" tabindex="-1">${escapedParent}</span>`;
                }
                return escapedParent;
            }).join(', ')
            : 'None';

        // 格式化作者和邮箱
        const authorName = escapeHtml(fullCommit?.author_name || commit.author_name || '');
        const authorEmail = fullCommit?.author_email || commit.author_email || '';
        const authorEmailHtml = authorEmail
            ? ` &lt;<a class="externalUrl" href="mailto:${escapeHtml(authorEmail)}" tabindex="-1">${escapeHtml(authorEmail)}</a>&gt;`
            : '';

        // 格式化日期
        const commitDate = fullCommit?.date || commit.date || '';
        const formattedDate = commitDate ? formatLongDate(commitDate) : '';

        // 获取提交消息体（body）
        const commitBody = fullCommit?.body || fullCommit?.message || commit.message || '';
        const formattedBody = this.textFormatter.format(commitBody);

        // 构建 HTML（与 vscode-git-graph-develop 格式一致）
        return `
            <span class="cdvSummaryTop">
                <span class="cdvSummaryTopRow">
                    <span class="cdvSummaryKeyValues">
                        <b>Commit: </b>${escapeHtml(commit.hash)}<br>
                        <b>Parents: </b>${formattedParents}<br>
                        <b>Author: </b>${authorName}${authorEmailHtml}<br>
                        <b>Date: </b>${formattedDate}
                    </span>
                </span>
            </span>
            <br><br>
            <span class="messageContent">${formattedBody}</span>
        `;
    }

    /**
     * 渲染 Description 列（参考 vscode-git-graph-develop 的布局）
     */
    private renderDescription(commit: CommitNode, fullCommit: CommitInfo | undefined, isCurrent: boolean, displayMessage: string): string {
        const refInfo = this.getRefInfo(commit, fullCommit);
        const branchLabels = refInfo.branches.slice(0, 6).map(branch => this.renderBranchLabel(branch, commit.colorIndex, commit.hash)).join('');
        const tagLabels = refInfo.tags.slice(0, 6).map(tag => this.renderTagLabel(tag, commit.colorIndex)).join('');
        const currentLabel = isCurrent ? this.renderCurrentRef(commit.colorIndex) : '';

        return `
            <span class="description description-container">
                ${currentLabel}
                <span class="description-refs">
                    ${branchLabels}${tagLabels}
                </span>
                <span
                    class="description-text"
                    style="font-weight: ${isCurrent ? 'bold' : 'normal'};"
                    title="${escapeHtml(displayMessage)}"
                >
                    ${this.formatCommitMessage(displayMessage.split('\n')[0])}
                </span>
            </span>
        `;
    }

    /**
     * 提取引用信息（分支 / tag / HEAD）
     */
    private getRefInfo(commit: CommitNode, fullCommit?: CommitInfo) {
        const branches = new Set<string>();
        const tags = new Set<string>();
        let head: string | null = null;

        (commit.branches || []).forEach(b => branches.add(b));

        // 补充：如果分支信息表明该提交是分支头，也加入分支名称
        const branchDetails = this.data?.branches?.branches;
        if (branchDetails) {
            Object.values(branchDetails).forEach(detail => {
                if (detail.commit === commit.hash) {
                    branches.add(detail.name);
                    if (detail.current) {
                        head = detail.name;
                    }
                }
            });
        }

        const refStr = fullCommit?.refs || '';
        if (refStr) {
            refStr.split(',')
                .map(r => r.trim())
                .filter(Boolean)
                .forEach(ref => {
                    if (ref.startsWith('tag:')) {
                        tags.add(ref.replace(/^tag:\s*/, ''));
                    } else if (ref.startsWith('HEAD ->')) {
                        head = ref.replace(/^HEAD\s*->\s*/, '');
                    } else if (ref === 'HEAD') {
                        head = 'HEAD';
                    } else {
                        branches.add(ref);
                    }
                });
        }

        return {
            branches: Array.from(branches),
            tags: Array.from(tags),
            head
        };
    }

    /**
     * 渲染提交详情文件列表（暂时简化，后续可以添加完整的文件树）
     */
    private renderCommitDetailsFiles(_commit: CommitNode, _fullCommit: CommitInfo | undefined): string {
        // 暂时返回空内容，后续可以添加文件树视图
        return '<div style="padding: 8px; color: var(--vscode-descriptionForeground);">文件列表功能待实现</div>';
    }

    /**
     * 渲染分支标签
     */
    private renderBranchLabel(branch: string, colorIndex: number, commitHash: string): string {
        const isRemote = branch.startsWith('remotes/');
        const isBranchCurrent = branch === this.currentBranchRef || (isRemote && branch.endsWith(`/${this.currentBranchRef}`));
        const remoteTrimmed = isRemote ? branch.replace(/^remotes\//, '') : branch;
        const [remoteName, ...rest] = remoteTrimmed.split('/');
        const displayName = isRemote ? rest.join('/') || remoteTrimmed : branch;
        const branchColor = BRANCH_COLORS[colorIndex % BRANCH_COLORS.length];

        return `
            <span
                class="gitRef${isBranchCurrent ? ' active' : ''}${isRemote ? ' remote' : ' head'}"
                data-name="${escapeHtml(branch)}"
                data-commit-hash="${escapeHtml(commitHash)}"
                style="border-color: ${isBranchCurrent ? branchColor : 'undefined'}; color: ${isBranchCurrent ? branchColor : 'undefined'};"
            >
                <span class="gitRefIcon" aria-hidden="true" style="background-color: ${branchColor};">
                    ${SVG_ICONS.branch}
                </span>
                <span class="gitRefName">${escapeHtml(displayName)}</span>
                ${isRemote && remoteName ? `
                    <span class="gitRefHeadRemote" data-remote="${escapeHtml(remoteName)}" data-fullref="${escapeHtml(branch)}">
                        ${escapeHtml(remoteName)}
                    </span>
                ` : ''}
            </span>
        `;
    }

    /**
     * 渲染 HEAD 引用标签
     */
    private renderHeadLabel(target: string | null, colorIndex: number): string {
        const branchColor = BRANCH_COLORS[colorIndex % BRANCH_COLORS.length];
        const display = target && target !== 'HEAD' ? `HEAD → ${escapeHtml(target)}` : 'HEAD';
        return `
            <span class="gitRef headRef" style="border-color: ${branchColor}; color: ${branchColor};">
                <span class="gitRefIcon" aria-hidden="true" style="background-color: ${branchColor};">
                    ${SVG_ICONS.branch}
                </span>
                <span class="gitRefName">${display}</span>
            </span>
        `;
    }

    /**
     * 渲染“当前检出”标签（空心对勾样式）
     */
    private renderCurrentRef(colorIndex: number): string {
        const colour = BRANCH_COLORS[colorIndex % BRANCH_COLORS.length];
        return `
            <span class="currentRefDot" title="This commit is currently checked out" style="color: ${colour};"></span>
        `;
    }

    /**
     * 渲染 Tag 标签
     */
    private renderTagLabel(tag: string, colorIndex: number): string {
        const branchColor = BRANCH_COLORS[colorIndex % BRANCH_COLORS.length];
        return `
            <span class="gitRef tag" data-name="${escapeHtml(tag)}" style="border-color: ${branchColor}; color: ${branchColor};">
                <span class="gitRefIcon" aria-hidden="true" style="background-color: ${branchColor};">
                    ${SVG_ICONS.tag}
                </span>
                <span class="gitRefName">${escapeHtml(tag)}</span>
            </span>
        `;
    }

    /**
     * 设置 ResizeObserver
     */
    private setupResizeObservers() {
        // 容器大小变化
        if (this.containerRef) {
            // 先断开旧的观察器，避免重复绑定
            if (this.containerResizeObserver) {
                this.containerResizeObserver.disconnect();
            }

            this.containerResizeObserver = new ResizeObserver(entries => {
                for (const entry of entries) {
                    const oldHeight = this.containerHeight;
                    this.containerHeight = entry.contentRect.height;

                    // 如果容器高度变化较大，需要重新渲染以更新虚拟滚动范围
                    if (Math.abs(oldHeight - this.containerHeight) > 10 && this.data) {
                        // 延迟渲染，避免频繁触发
                        if (this.renderTimeoutRef !== null) {
                            clearTimeout(this.renderTimeoutRef);
                        }
                        this.renderTimeoutRef = window.setTimeout(() => {
                            this.renderTimeoutRef = null;
                            if (this.data && !this.isRendering) {
                                this.render(this.data);
                            }
                        }, 100);
                    } else {
                        // 小幅变化只更新图形
                        this.renderGraph();
                    }
                }
            });
            this.containerResizeObserver.observe(this.containerRef);
        }

        // 表头高度变化
        if (this.headerRef) {
            this.headerResizeObserver = new ResizeObserver(() => {
                if (this.headerRef) {
                    this.headerHeight = this.headerRef.getBoundingClientRect().height || ROW_HEIGHT;
                    this.renderGraph();
                }
            });
            this.headerResizeObserver.observe(this.headerRef);
        }

        // 详情单元格高度变化
        if (this.expandedCommit) {
            // 先断开旧的观察器
            if (this.detailResizeObserver) {
                this.detailResizeObserver.disconnect();
                this.detailResizeObserver = null;
            }

            const detailCell = this.container.querySelector(`[data-detail-cell="${this.expandedCommit}"]`) as HTMLElement;
            if (detailCell) {
                this.detailCellRef = detailCell;

                // 立即测量一次高度（在下一帧，确保DOM已完全渲染）
                setTimeout(() => {
                    this.measureDetailHeight();
                }, 0);

                this.detailResizeObserver = new ResizeObserver(() => {
                    this.measureDetailHeight();
                });
                this.detailResizeObserver.observe(detailCell);
            }
        } else {
            // 如果没有展开的详情，清理引用和观察器
            if (this.detailResizeObserver) {
                this.detailResizeObserver.disconnect();
                this.detailResizeObserver = null;
            }
            this.detailCellRef = null;
        }
    }

    /**
     * 测量详情高度
     */
    private measureDetailHeight() {
        if (!this.detailCellRef) {
            this.detailHeight = 0;
            return;
        }

        if (this.detailHeightTimeoutRef !== null) {
            clearTimeout(this.detailHeightTimeoutRef);
        }

        this.detailHeightTimeoutRef = window.setTimeout(() => {
            const h = this.detailCellRef?.getBoundingClientRect().height || 0;
            if (h > 0 && Math.abs(this.detailHeight - h) > 1) {
                const oldHeight = this.detailHeight;
                this.detailHeight = h;
                // 如果高度从0变为有值，或者变化较大，需要重新渲染整个视图
                if (oldHeight === 0 || Math.abs(oldHeight - h) > 50) {
                    this.render(this.data);
                } else {
                    // 小幅度变化只需要更新图形
                    this.renderGraph();
                }
            }
            this.detailHeightTimeoutRef = null;
        }, 50);
    }

    /**
     * 附加事件监听器（绑定在 this.container 上，使用事件委托）
     */
    private attachEventListeners() {
        if (!this.container) return;

        // 滚动处理（需要在每次 render 后重新绑定，因为 containerRef 会被重新创建）
        // 注意：这里不能使用事件委托，因为滚动事件不会冒泡到 container

        // 使用事件委托处理提交行点击（绑定在 this.container 上，避免重新渲染后事件丢失）
        this.container.addEventListener('click', (e: Event) => {
            const target = e.target as HTMLElement;

            // 检查是否是关闭按钮
            const closeBtn = target.closest('#cdvClose');
            if (closeBtn) {
                e.stopPropagation();
                const cdvRow = closeBtn.closest('tr.commit-details');
                if (cdvRow) {
                    const hash = (cdvRow as HTMLElement).dataset.commitHash;
                    if (hash) {
                        this.handleCommitClick(hash); // 切换展开状态
                    }
                }
                return;
            }

            // 检查是否是内部链接（父提交链接）
            const internalLink = target.closest('.internalUrl[data-type="commit"]');
            if (internalLink) {
                e.preventDefault();
                e.stopPropagation();
                const hash = (internalLink as HTMLElement).dataset.value;
                if (hash) {
                    // 滚动到该提交并展开
                    this.scrollToCommit(hash, true);
                    setTimeout(() => {
                        this.handleCommitClick(hash);
                    }, 300);
                }
                return;
            }

            // 检查是否是详情行内容
            const detailContent = target.closest('#cdvContent, #cdvSummary, #cdvFiles, #cdvControls, .cdvHeightResize');
            if (detailContent) {
                // 点击详情内容时不触发展开/收起（除非是关闭按钮，已在上面处理）
                return;
            }

            // 检查是否是提交行（排除详情行）
            const commitRow = target.closest('tr.commit');
            if (commitRow && !commitRow.classList.contains('commit-details')) {
                const hash = (commitRow as HTMLElement).dataset.commitHash;
                if (hash) {
                    this.handleCommitClick(hash);
                }
            }
        });

        // 双击事件委托
        this.container.addEventListener('dblclick', (e: Event) => {
            const target = e.target as HTMLElement;

            // 分支标签双击
            const ref = target.closest('.gitRef');
            if (ref) {
                e.stopPropagation();
                const branchName = (ref as HTMLElement).dataset.name;
                const commitHash = (ref as HTMLElement).dataset.commitHash;
                if (branchName && commitHash) {
                    this.handleBranchLabelDoubleClick(branchName, commitHash);
                }
                return;
            }

            // 提交行双击
            const commitRow = target.closest('tr.commit');
            if (commitRow && !commitRow.classList.contains('commit-details')) {
                const hash = (commitRow as HTMLElement).dataset.commitHash;
                if (hash) {
                    this.handleCommitDoubleClick(hash);
                }
            }
        });

        // 右键菜单事件委托
        this.container.addEventListener('contextmenu', (e: Event) => {
            const mouseEvent = e as MouseEvent;
            const target = mouseEvent.target as HTMLElement;

            // 分支标签右键菜单
            const ref = target.closest('.gitRef');
            if (ref) {
                mouseEvent.preventDefault();
                mouseEvent.stopPropagation();
                const branchName = (ref as HTMLElement).dataset.name;
                const commitHash = (ref as HTMLElement).dataset.commitHash;
                if (branchName && commitHash) {
                    this.handleBranchLabelContextMenu(mouseEvent, branchName, commitHash);
                }
                return;
            }

            // 提交行右键菜单
            const commitRow = target.closest('tr.commit');
            if (commitRow && !commitRow.classList.contains('commit-details')) {
                mouseEvent.preventDefault();
                mouseEvent.stopPropagation();
                // 先关闭可能已打开的菜单
                if (this.contextMenu) {
                    this.contextMenu.close();
                }
                const hash = (commitRow as HTMLElement).dataset.commitHash;
                if (hash) {
                    // 延迟一点显示菜单，确保 preventDefault 生效
                    setTimeout(() => {
                        this.handleContextMenu(mouseEvent, hash);
                    }, 0);
                }
                return;
            }

            // 如果点击在详情行上，也处理
            const detailRow = target.closest('tr.commit-details');
            if (detailRow) {
                mouseEvent.preventDefault();
                mouseEvent.stopPropagation();
                if (this.contextMenu) {
                    this.contextMenu.close();
                }
                return;
            }
        });
    }

    /**
     * 处理提交点击
     */
    private handleCommitClick(hash: string) {
        const wasExpanded = this.expandedCommit === hash;
        this.selectedCommit = hash;

        if (wasExpanded) {
            // 收起详情
            this.expandedCommit = null;
            this.detailHeight = 0;
            this.detailCellRef = null;
            setTimeout(() => {
                this.selectedCommit = null;
                this.render(this.data);
            }, 0);
        } else {
            // 展开新的详情（如果是切换到另一个提交，先清理旧的状态）
            if (this.expandedCommit) {
                this.detailHeight = 0;
                this.detailCellRef = null;
            }
            this.expandedCommit = hash;
            this.render(this.data);
        }
    }

    /**
     * 处理提交双击
     */
    private handleCommitDoubleClick(hash: string) {
        this.handleCommitClick(hash);
    }

    /**
     * 处理右键菜单（使用 ContextMenu 组件）
     */
    private handleContextMenu(e: MouseEvent, hash: string) {
        if (!this.contextMenu || !this.containerRef) {
            console.warn('ContextMenu not initialized or containerRef not available');
            return;
        }

        const commitIndex = this.getCommitIndex(hash);
        if (commitIndex === -1) {
            console.warn(`Commit not found: ${hash}`);
            return;
        }

        // 构建上下文菜单动作
        const actions: ContextMenuActions = [
            [
                {
                    title: '查看提交详情',
                    visible: true,
                    onClick: () => {
                        this.handleCommitClick(hash);
                    }
                },
                {
                    title: '复制提交哈希',
                    visible: true,
                    onClick: () => {
                        navigator.clipboard.writeText(hash);
                    }
                }
            ],
            [
                {
                    title: '检出此提交',
                    visible: true,
                    onClick: () => {
                        this.showCheckoutDialog(hash);
                    }
                },
                {
                    title: '创建新分支',
                    visible: true,
                    onClick: () => {
                        this.showCreateBranchDialog(hash);
                    }
                }
            ],
            [
                {
                    title: '重置到此处',
                    visible: true,
                    onClick: () => {
                        this.showResetDialog(hash);
                    }
                }
            ]
        ];

        // 直接从 containerRef 查找对应的行元素
        const commitElem = this.containerRef.querySelector(`tr.commit[data-commit-hash="${hash}"]`) as HTMLElement;
        if (!commitElem) {
            // 尝试使用 getCommitElems
            const commitElems = getCommitElems();
            const elem = commitElems[commitIndex];
            if (!elem) {
                console.warn(`Commit element not found for hash: ${hash}, index: ${commitIndex}`);
                return;
            }
            // 使用找到的元素创建目标并显示菜单
            const target = this.createContextMenuTarget(elem, hash, commitIndex);
            if (target) {
                this.showContextMenu(actions, target, e);
            }
            return;
        }

        // 创建目标对象并显示菜单
        const target: CommitOrRefTarget = {
            type: TargetType.Commit,
            elem: commitElem,
            hash: hash,
            index: commitIndex,
            ref: undefined
        } as CommitOrRefTarget & { index: number };

        // 显示上下文菜单
        this.contextMenu.show(
            actions,
            false, // checked
            target,
            e,
            this.containerRef
        );
    }

    /**
     * 创建上下文菜单目标对象（辅助方法）
     */
    private createContextMenuTarget(elem: HTMLElement, hash: string, index: number): CommitOrRefTarget | null {
        try {
            return {
                type: TargetType.Commit,
                elem: elem,
                hash: hash,
                index: index,
                ref: undefined
            } as CommitOrRefTarget & { index: number };
        } catch (error) {
            console.error('Failed to create context menu target:', error);
            return null;
        }
    }

    /**
     * 显示上下文菜单（辅助方法）
     */
    private showContextMenu(actions: ContextMenuActions, target: CommitOrRefTarget, e: MouseEvent): void {
        if (!this.contextMenu || !this.containerRef) return;

        try {
            this.contextMenu.show(
                actions,
                false,
                target,
                e,
                this.containerRef
            );
        } catch (error) {
            console.error('Failed to show context menu:', error);
        }
    }

    /**
     * 处理分支标签双击
     */
    private handleBranchLabelDoubleClick(branchName: string, commitHash: string) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vscode = (window as any).vscode;
        if (vscode) {
            vscode.postMessage({
                command: 'checkoutBranch',
                branchName: branchName,
                commitHash: commitHash
            });
        }
    }

    /**
     * 使用 TextFormatter 格式化提交消息（支持 Markdown、emoji、链接等）
     */
    private formatCommitMessage(message: string): string {
        if (!this.textFormatter || !message) {
            return escapeHtml(message || '');
        }

        // 更新 commits 以便 TextFormatter 能够识别提交哈希
        if (this.commitsRef.length > 0) {
            // 重新创建 TextFormatter 以包含最新的提交列表
            this.textFormatter = new TextFormatter(
                this.commitsRef,
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
        }

        return this.textFormatter.format(message);
    }

    /**
     * 显示检出对话框
     */
    private showCheckoutDialog(hash: string) {
        if (!this.dialog) return;

        this.dialog.showConfirmation(
            `确定要检出提交 ${hash.substring(0, 8)} 吗？这将创建一个分离的 HEAD 状态。`,
            '检出',
            () => {
                // 执行检出操作
                const vscode = (window as any).vscode;
                if (vscode) {
                    vscode.postMessage({
                        command: 'checkoutCommit',
                        commitHash: hash
                    });
                }
            },
            null
        );
    }

    /**
     * 显示创建分支对话框
     */
    private showCreateBranchDialog(fromHash: string) {
        if (!this.dialog) return;

        this.dialog.showRefInput(
            '请输入新分支名称：',
            '',
            '创建分支',
            (branchName: string) => {
                // 执行创建分支操作
                const vscode = (window as any).vscode;
                if (vscode) {
                    vscode.postMessage({
                        command: 'createBranch',
                        branchName: branchName,
                        fromHash: fromHash
                    });
                }
            },
            {
                type: TargetType.Commit,
                elem: this.containerRef?.querySelector(`[data-commit-hash="${fromHash}"]`) as HTMLElement,
                hash: fromHash,
                index: this.getCommitIndex(fromHash),
                ref: undefined
            } as CommitOrRefTarget & { index: number }
        );
    }

    /**
     * 显示重置对话框
     */
    private showResetDialog(hash: string) {
        if (!this.dialog) return;

        this.dialog.showSelect(
            `选择重置类型（重置到 ${hash.substring(0, 8)}）：`,
            'soft',
            [
                { name: 'Soft - 保留工作目录和暂存区', value: 'soft' },
                { name: 'Mixed - 保留工作目录，清空暂存区', value: 'mixed' },
                { name: 'Hard - 清空工作目录和暂存区', value: 'hard' }
            ],
            '重置',
            (resetType: string) => {
                // 执行重置操作
                const vscode = (window as any).vscode;
                if (vscode) {
                    vscode.postMessage({
                        command: 'resetCommit',
                        commitHash: hash,
                        resetType: resetType
                    });
                }
            },
            {
                type: TargetType.Commit,
                elem: this.containerRef?.querySelector(`[data-commit-hash="${hash}"]`) as HTMLElement,
                hash: hash,
                index: this.getCommitIndex(hash),
                ref: undefined
            } as CommitOrRefTarget & { index: number }
        );
    }

    /**
     * 实现 FindWidget 和 SettingsWidget 所需的接口方法
     */

    // FindWidget 接口实现
    public getColumnVisibility(): any {
        // 返回列可见性配置
        return {
            graph: true,
            date: true,
            author: true,
            description: true,
            commit: true
        };
    }

    public getCommits(): ReadonlyArray<CommitInfo> {
        return this.commitsRef;
    }

    public getCommitId(hash: string): number {
        return this.getCommitIndex(hash);
    }

    public isCdvOpen(hash: string, _compareWithHash: string | null): boolean {
        return this.expandedCommit === hash;
    }

    public loadCommitDetails(elem: HTMLElement): void {
        const hash = elem.getAttribute('data-commit-hash');
        if (hash) {
            this.handleCommitClick(hash);
        }
    }

    public scrollToCommit(hash: string, animate: boolean): void {
        const commitIndex = this.getCommitIndex(hash);
        if (commitIndex === -1 || !this.containerRef) return;

        const targetY = commitIndex * ROW_HEIGHT;
        if (animate) {
            this.containerRef.scrollTo({
                top: targetY,
                behavior: 'smooth'
            });
        } else {
            this.containerRef.scrollTop = targetY;
        }
    }

    public saveState(): void {
        // 保存状态到 workspaceState
        const vscode = (window as any).vscode;
        if (vscode) {
            vscode.postMessage({
                command: 'saveState',
                state: {
                    scrollTop: this.scrollTop,
                    expandedCommit: this.expandedCommit,
                    selectedCommit: this.selectedCommit
                }
            });
        }
    }

    // SettingsWidget 接口实现
    public getRepoState(_repo: string): Record<string, unknown> {
        // 返回仓库状态
        return {};
    }

    public getRepoConfig(): Record<string, unknown> {
        // 返回仓库配置
        return {};
    }

    public isConfigLoading(): boolean {
        return false;
    }

    public getBranchOptions(): Array<{ name: string; value: string }> {
        // 返回分支选项
        const branches = new Set<string>();
        this.commitNodes.forEach(node => {
            if (node.branches) {
                node.branches.forEach(branch => branches.add(branch));
            }
        });
        return Array.from(branches).map(branch => ({
            name: branch,
            value: branch
        }));
    }

    public getBranches(): string[] {
        const branches = new Set<string>();
        this.commitNodes.forEach(node => {
            if (node.branches) {
                node.branches.forEach(branch => branches.add(branch));
            }
        });
        return Array.from(branches);
    }

    public saveRepoStateValue(repo: string, key: string, value: unknown): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vscode = (window as any).vscode;
        if (vscode && vscode.postMessage) {
            vscode.postMessage({
                command: 'saveRepoStateValue',
                repo: repo,
                key: key,
                value: value
            });
        }
    }

    public renderRepoDropdownOptions(): void {
        // 渲染仓库下拉选项
    }

    public refresh(reload: boolean): void {
        if (reload) {
            // 重新加载数据
            const vscode = (window as any).vscode;
            if (vscode) {
                vscode.postMessage({
                    command: 'refresh'
                });
            }
        } else {
            // 只重新渲染
            this.render(this.data);
        }
    }

    public requestLoadConfig(): void {
        const vscode = (window as any).vscode;
        if (vscode) {
            vscode.postMessage({
                command: 'requestLoadConfig'
            });
        }
    }

    /**
     * 处理分支标签右键
     */
    private handleBranchLabelContextMenu(e: MouseEvent, branchName: string, commitHash: string) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vscode = (window as any).vscode;
        if (vscode) {
            vscode.postMessage({
                command: 'showBranchContextMenu',
                branchName: branchName,
                commitHash: commitHash,
                x: e.clientX,
                y: e.clientY
            });
        }
    }

    /**
     * 渲染图形（使用 GitGraphRenderer，基于 vscode-git-graph-develop 实现）
     */
    private renderGraph() {
        if (!this.graphSvgRef || !this.graphRenderer) return;

        const svg = this.graphSvgRef;

        // 检查数据是否有变化
        const currentData = {
            commitNodesLength: this.commitNodes.length,
            expandedCommit: this.expandedCommit,
            detailHeight: this.detailHeight
        };
        const lastData = this.lastRenderDataRef;

        const dataChanged =
            currentData.commitNodesLength !== lastData.commitNodesLength ||
            currentData.expandedCommit !== lastData.expandedCommit ||
            Math.abs(currentData.detailHeight - lastData.detailHeight) > 1;

        // 如果 SVG 元素不存在内容（刚创建），必须渲染
        const svgIsEmpty = !svg.innerHTML || svg.innerHTML.trim() === '';

        if (!dataChanged && lastData.commitNodesLength > 0 && !svgIsEmpty) {
            return;
        }

        if (this.commitNodes.length === 0) {
            svg.innerHTML = '';
            this.lastRenderDataRef = { commitNodesLength: 0, expandedCommit: null, detailHeight: 0 };
            return;
        }

        // 更新渲染器配置（基于当前表头高度）
        const expandedIndex = this.expandedCommit
            ? this.getCommitIndex(this.expandedCommit)
            : -1;
        const expandedGapForConfig = expandedIndex >= 0 ? Math.max(this.detailHeight || 200, ROW_HEIGHT) : 0;

        // offsetY 只需要 ROW_HEIGHT / 2，因为 SVG 的 top 已经包含了 headerHeight
        // 这样第一个提交点会在第一行的中间位置
        this.graphRenderer.updateConfig({
            grid: {
                x: GRID_X,
                y: ROW_HEIGHT,
                offsetX: GRID_OFFSET_X,
                offsetY: ROW_HEIGHT / 2,  // 修正：只设置行的一半高度，让提交点在行中间
                expandY: expandedGapForConfig
            }
        });

        // 将 CommitNode[] 转换为 CommitInfo[]（保持与原始 commitsRef 的顺序一致）
        // 使用原始的 commitsRef 确保数据完整，如果找不到则从 commitNodes 创建
        const commits: CommitInfo[] = this.commitNodes.map(node => {
            // 优先从原始的 commitsRef 中查找
            const commitInfo = this.commitsRef.find(c => c.hash === node.hash);
            if (commitInfo) {
                // 确保 parents 字段存在
                return {
                    ...commitInfo,
                    parents: commitInfo.parents || node.parents || []
                };
            }
            // 如果找不到，从 node 创建
            return {
                hash: node.hash,
                message: node.message,
                date: node.date,
                author_name: node.author_name,
                author_email: node.author_email,
                body: '',
                parents: node.parents || []
            };
        });

        // 获取当前分支的 HEAD commit hash
        // 需要找到当前分支指向的 commit hash
        let commitHead: string | null = null;
        if (this.data?.log?.all && this.data.log.all.length > 0) {
            if (this.currentBranchRef) {
                // 优先使用当前分支指向的提交
                const currentBranchCommits = this.data.log.all.filter(c =>
                    c.branches && c.branches.includes(this.currentBranchRef!)
                );
                if (currentBranchCommits.length > 0) {
                    commitHead = currentBranchCommits[0].hash;
                }
            }

            // 如果未找到，退回到包含 HEAD/HEAD -> 的提交
            if (!commitHead) {
                const headCommit = this.data.log.all.find(c =>
                    (c.refs && (c.refs.includes('HEAD') || /HEAD\s*->/.test(c.refs))) ||
                    (c.branches && c.branches.includes('HEAD'))
                );
                if (headCommit) {
                    commitHead = headCommit.hash;
                }
            }

            // 兜底：分离 HEAD 且没有 refs 时，使用最新提交
            if (!commitHead && this.data.log.latest?.hash) {
                commitHead = this.data.log.latest.hash;
            }
        }

        // 加载提交到渲染器
        this.graphRenderer.loadCommits(commits, commitHead);

        // 渲染 SVG
        this.graphRenderer.render(svg, expandedIndex);

        // 添加交互事件到提交节点
        const circles = svg.querySelectorAll('circle[data-commit-hash]');
        circles.forEach(circle => {
            const hash = circle.getAttribute('data-commit-hash');
            if (hash) {
                // 鼠标悬停效果
                circle.addEventListener('mouseenter', () => {
                    const currentR = circle.getAttribute('r');
                    if (currentR) {
                        const r = parseFloat(currentR);
                        circle.setAttribute('r', (r + 2).toString());
                    }
                });
                circle.addEventListener('mouseleave', () => {
                    const hashAttr = circle.getAttribute('data-commit-hash');
                    if (hashAttr) {
                        const commit = this.commitNodes.find(c => c.hash === hashAttr);
                        if (commit) {
                            const r = commit.isMerge ? '5' : '4';
                            circle.setAttribute('r', r);
                        }
                    }
                });

                // 点击选择提交
                circle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleCommitClick(hash);
                });
            }
        });

        // 更新 SVG 尺寸和 viewBox
        const contentWidth = this.graphRenderer.getContentWidth();
        const height = this.graphRenderer.getHeight(expandedIndex);
        const width = Math.max(contentWidth, GRAPH_COLUMN_WIDTH);

        // 计算实际需要的总高度（包含详情行）
        const expandedGap = expandedIndex >= 0 ? Math.max(this.detailHeight || 200, ROW_HEIGHT) : 0;
        const actualTotalHeight = this.commitNodes.length * ROW_HEIGHT + expandedGap;

        svg.setAttribute('width', width.toString());
        svg.setAttribute('height', Math.max(height, actualTotalHeight).toString());
        svg.setAttribute('viewBox', `0 0 ${width} ${Math.max(height, actualTotalHeight)}`);
        svg.setAttribute('preserveAspectRatio', 'none');

        // 确保 SVG 可见并设置正确的样式
        svg.style.display = 'block';
        svg.style.visibility = 'visible';
        svg.style.opacity = '1';
        svg.style.position = 'absolute';
        svg.style.left = '0';
        svg.style.top = `${this.headerHeight}px`;
        svg.style.width = `${GRAPH_COLUMN_WIDTH}px`;
        svg.style.height = `${Math.max(height, actualTotalHeight)}px`;
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '2';

        // 更新缓存
        this.lastRenderDataRef = currentData;
    }

    /**
     * 清理资源
     */
    public destroy() {
        if (this.containerResizeObserver) {
            this.containerResizeObserver.disconnect();
        }
        if (this.headerResizeObserver) {
            this.headerResizeObserver.disconnect();
        }
        if (this.detailResizeObserver) {
            this.detailResizeObserver.disconnect();
        }
        if (this.scrollTimeoutRef !== null) {
            clearTimeout(this.scrollTimeoutRef);
        }
        if (this.renderTimeoutRef !== null) {
            clearTimeout(this.renderTimeoutRef);
        }
        if (this.renderFrameRef !== null) {
            cancelAnimationFrame(this.renderFrameRef);
        }
        if (this.detailHeightTimeoutRef !== null) {
            clearTimeout(this.detailHeightTimeoutRef);
        }
    }
}
