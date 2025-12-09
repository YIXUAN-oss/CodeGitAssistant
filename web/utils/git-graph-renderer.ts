/**
 * Git Graph 渲染器 - 基于 vscode-git-graph-develop 的核心图形渲染逻辑
 * 优化版本，确保图形正确显示
 */

import { CommitInfo, BranchGraphData } from '../types/git.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const NULL_VERTEX_ID = -1;

interface Point {
    readonly x: number;
    readonly y: number;
}

interface Line {
    readonly p1: Point;
    readonly p2: Point;
    readonly isCommitted: boolean;
    readonly lockedFirst: boolean; // TRUE => The line is locked to p1, FALSE => The line is locked to p2
}

interface Pixel {
    x: number;
    y: number;
}

interface PlacedLine {
    readonly p1: Pixel;
    readonly p2: Pixel;
    readonly isCommitted: boolean;
    readonly lockedFirst: boolean;
}

interface UnavailablePoint {
    readonly connectsTo: VertexOrNull;
    readonly onBranch: Branch;
}

type VertexOrNull = Vertex | null;

interface GraphConfig {
    grid: {
        x: number;
        y: number;
        offsetX: number;
        offsetY: number;
        expandY: number;
    };
    colours: string[];
    style: 'angular' | 'rounded';
}

/**
 * Branch 类 - 表示一个分支
 */
class Branch {
    private readonly colour: number;
    private end: number = 0;
    private lines: Line[] = [];
    private numUncommitted: number = 0;

    constructor(colour: number) {
        this.colour = colour;
    }

    public addLine(p1: Point, p2: Point, isCommitted: boolean, lockedFirst: boolean) {
        this.lines.push({ p1: p1, p2: p2, isCommitted: isCommitted, lockedFirst: lockedFirst });
        if (isCommitted) {
            if (p2.x === 0 && p2.y < this.numUncommitted) {
                this.numUncommitted = p2.y;
            }
        } else {
            this.numUncommitted++;
        }
    }

    public getColour(): number {
        return this.colour;
    }

    public getEnd(): number {
        return this.end;
    }

    public setEnd(end: number) {
        this.end = end;
    }

    /**
     * 绘制分支线
     */
    public draw(svg: SVGElement, config: GraphConfig, expandAt: number) {
        const colour = config.colours[this.colour % config.colours.length];
        const d = config.grid.y * (config.style === 'angular' ? 0.38 : 0.8);
        const lines: PlacedLine[] = [];
        let curPath = '';

        // 转换分支线为像素坐标，考虑展开的提交
        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i];
            const x1 = line.p1.x * config.grid.x + config.grid.offsetX;
            let y1 = line.p1.y * config.grid.y + config.grid.offsetY;
            const x2 = line.p2.x * config.grid.x + config.grid.offsetX;
            let y2 = line.p2.y * config.grid.y + config.grid.offsetY;

            // 如果提交被展开，需要拉伸图形
            if (expandAt > -1) {
                if (line.p1.y > expandAt) {
                    // 如果线在展开之后开始，整条线向下移动
                    y1 += config.grid.expandY;
                    y2 += config.grid.expandY;
                } else if (line.p2.y > expandAt) {
                    // 如果线跨越展开
                    if (x1 === x2) {
                        // 线是垂直的，延伸端点越过展开
                        y2 += config.grid.expandY;
                    } else if (line.lockedFirst) {
                        // 如果线锁定到第一个点，转换保持在正常位置
                        lines.push({
                            p1: { x: x1, y: y1 },
                            p2: { x: x2, y: y2 },
                            isCommitted: i >= this.numUncommitted,
                            lockedFirst: line.lockedFirst
                        });
                        lines.push({
                            p1: { x: x2, y: y1 + config.grid.y },
                            p2: { x: x2, y: y2 + config.grid.expandY },
                            isCommitted: i >= this.numUncommitted,
                            lockedFirst: line.lockedFirst
                        });
                        continue;
                    } else {
                        // 如果线锁定到第二个点，转换移动到展开之后
                        lines.push({
                            p1: { x: x1, y: y1 },
                            p2: { x: x1, y: y2 - config.grid.y + config.grid.expandY },
                            isCommitted: i >= this.numUncommitted,
                            lockedFirst: line.lockedFirst
                        });
                        y1 += config.grid.expandY;
                        y2 += config.grid.expandY;
                    }
                }
            }
            lines.push({
                p1: { x: x1, y: y1 },
                p2: { x: x2, y: y2 },
                isCommitted: i >= this.numUncommitted,
                lockedFirst: line.lockedFirst
            });
        }

        // 简化连续的直线，移除中间点
        let i = 0;
        while (i < lines.length - 1) {
            const line = lines[i];
            const nextLine = lines[i + 1];
            if (
                line.p1.x === line.p2.x &&
                line.p2.x === nextLine.p1.x &&
                nextLine.p1.x === nextLine.p2.x &&
                line.p2.y === nextLine.p1.y &&
                line.isCommitted === nextLine.isCommitted
            ) {
                line.p2.y = nextLine.p2.y;
                lines.splice(i + 1, 1);
            } else {
                i++;
            }
        }

        // 遍历所有线，生成并添加 SVG 路径到 DOM
        for (i = 0; i < lines.length; i++) {
            const line = lines[i];
            const x1 = line.p1.x;
            const y1 = line.p1.y;
            const x2 = line.p2.x;
            const y2 = line.p2.y;

            // 如果新点属于不同的路径，渲染当前路径并重置
            if (curPath !== '' && i > 0 && line.isCommitted !== lines[i - 1].isCommitted) {
                Branch.drawPath(svg, curPath, lines[i - 1].isCommitted, colour);
                curPath = '';
            }

            // 如果路径未开始或新点属于不同路径，移动到 p1
            if (curPath === '' || (i > 0 && (x1 !== lines[i - 1].p2.x || y1 !== lines[i - 1].p2.y))) {
                curPath += 'M' + x1.toFixed(0) + ',' + y1.toFixed(1);
            }

            if (x1 === x2) {
                // 如果路径是垂直的，绘制直线
                curPath += 'L' + x2.toFixed(0) + ',' + y2.toFixed(1);
            } else {
                // 如果路径水平移动，绘制适当的转换
                if (config.style === 'angular') {
                    curPath += 'L' + (line.lockedFirst
                        ? (x2.toFixed(0) + ',' + (y2 - d).toFixed(1))
                        : (x1.toFixed(0) + ',' + (y1 + d).toFixed(1))) +
                        'L' + x2.toFixed(0) + ',' + y2.toFixed(1);
                } else {
                    curPath += 'C' + x1.toFixed(0) + ',' + (y1 + d).toFixed(1) + ' ' +
                        x2.toFixed(0) + ',' + (y2 - d).toFixed(1) + ' ' +
                        x2.toFixed(0) + ',' + y2.toFixed(1);
                }
            }
        }

        if (curPath !== '') {
            Branch.drawPath(svg, curPath, lines[lines.length - 1].isCommitted, colour);
        }
    }

    private static drawPath(svg: SVGElement, path: string, isCommitted: boolean, colour: string) {
        const shadow = svg.appendChild(document.createElementNS(SVG_NAMESPACE, 'path'));
        const line = svg.appendChild(document.createElementNS(SVG_NAMESPACE, 'path'));

        shadow.setAttribute('class', 'shadow');
        shadow.setAttribute('d', path);

        line.setAttribute('class', 'line');
        line.setAttribute('d', path);
        line.setAttribute('stroke', isCommitted ? colour : '#808080');
        // stroke-width 和 fill 通过 CSS 设置，不在这里设置
        // 未提交的更改使用虚线样式（通过 CSS 或条件设置）
        if (!isCommitted) {
            line.setAttribute('stroke-dasharray', '2px');
        }
    }
}

/**
 * Vertex 类 - 表示一个提交顶点
 */
class Vertex {
    public readonly id: number;
    public readonly isStash: boolean;

    private x: number = 0;
    private children: Vertex[] = [];
    private parents: Vertex[] = [];
    private nextParent: number = 0;
    private onBranch: Branch | null = null;
    private isCommitted: boolean = true;
    private isCurrent: boolean = false;
    private nextX: number = 0;
    private connections: UnavailablePoint[] = [];

    constructor(id: number, isStash: boolean = false) {
        this.id = id;
        this.isStash = isStash;
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
        if (this.nextParent < this.parents.length) {
            return this.parents[this.nextParent];
        }
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

    public getPointConnectingTo(vertex: VertexOrNull, onBranch: Branch): Point | null {
        for (let i = 0; i < this.connections.length; i++) {
            if (this.connections[i] &&
                this.connections[i].connectsTo === vertex &&
                this.connections[i].onBranch === onBranch) {
                return { x: i, y: this.id };
            }
        }
        return null;
    }

    public registerUnavailablePoint(x: number, connectsToVertex: VertexOrNull, onBranch: Branch) {
        // 只有当 x 正好是 nextX 时才注册（确保点的连续性）
        // 这与官方实现保持一致
        if (x === this.nextX) {
            this.nextX = x + 1;
            // 确保 connections 数组足够大（与官方实现保持一致）
            if (this.connections.length <= x) {
                // 扩展数组到所需大小
                while (this.connections.length <= x) {
                    this.connections.push({ connectsTo: null, onBranch: onBranch });
                }
            }
            this.connections[x] = { connectsTo: connectsToVertex, onBranch: onBranch };
        }
    }

    public getColour() {
        return this.onBranch !== null ? this.onBranch.getColour() : 0;
    }

    public getIsCommitted() {
        return this.isCommitted;
    }

    public setNotCommitted() {
        this.isCommitted = false;
    }

    public setCurrent() {
        this.isCurrent = true;
    }

    /**
     * 绘制顶点
     */
    public draw(svg: SVGElement, config: GraphConfig, expandOffset: boolean, commits: CommitInfo[]) {
        if (this.onBranch === null) return;

        const colour = this.isCommitted
            ? config.colours[this.onBranch.getColour() % config.colours.length]
            : '#808080';
        const cx = (this.x * config.grid.x + config.grid.offsetX).toString();
        const cy = (this.id * config.grid.y + config.grid.offsetY + (expandOffset ? config.grid.expandY : 0)).toString();

        const circle = document.createElementNS(SVG_NAMESPACE, 'circle');
        circle.dataset.id = this.id.toString();
        circle.setAttribute('data-commit-index', this.id.toString());
        if (this.id < commits.length) {
            circle.setAttribute('data-commit-hash', commits[this.id].hash);
        }
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        // 合并节点稍大一点，便于辨识
        const baseRadius = this.isMerge() ? 5 : 4;
        circle.setAttribute('r', baseRadius.toString());
        if (this.isCurrent) {
            circle.setAttribute('class', 'current');
            circle.setAttribute('stroke', colour);
            // stroke-width 和 fill 通过 CSS 设置
        } else {
            circle.setAttribute('fill', colour);
        }

        svg.appendChild(circle);

        if (this.isStash && !this.isCurrent) {
            circle.setAttribute('r', '4.5');
            circle.setAttribute('class', 'stashOuter');
            const innerCircle = document.createElementNS(SVG_NAMESPACE, 'circle');
            innerCircle.setAttribute('cx', cx);
            innerCircle.setAttribute('cy', cy);
            innerCircle.setAttribute('r', '2');
            innerCircle.setAttribute('class', 'stashInner');
            svg.appendChild(innerCircle);
        }
    }
}

const DEFAULT_COLOURS = [
    '#0085d9', '#d9008f', '#00d90a', '#d98500', '#a300d9',
    '#ff0000', '#00d9cc', '#e138e8', '#85d900', '#dc5b23',
    '#6f24d6', '#ffcc00'
];

const DEFAULT_CONFIG: GraphConfig = {
    grid: {
        x: 16,
        y: 24,  // 默认行高，实际会根据表格行高动态调整
        offsetX: 8,
        offsetY: 12,  // 默认偏移，实际会根据表头高度动态调整
        expandY: 0
    },
    colours: DEFAULT_COLOURS,
    style: 'rounded'
};

/**
 * Git Graph 渲染器主类
 */
export class GitGraphRenderer {
    private config: GraphConfig;
    private vertices: Vertex[] = [];
    private branches: Branch[] = [];
    private availableColours: number[] = [];
    private commits: CommitInfo[] = [];
    private commitLookup: { [hash: string]: number } = {};
    private commitHead: string | null = null;
    private onlyFollowFirstParent: boolean = false;
    private expandedCommitIndex: number = -1;

    constructor(config?: Partial<GraphConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 更新图形配置（用于动态调整行高和偏移）
     */
    updateConfig(updates: Partial<GraphConfig>) {
        if (updates.grid) {
            this.config.grid = { ...this.config.grid, ...updates.grid };
        }
        if (updates.colours) {
            this.config.colours = updates.colours;
        }
        if (updates.style) {
            this.config.style = updates.style;
        }
    }

    /**
     * 加载提交数据并构建图形
     */
    loadCommits(commits: CommitInfo[], commitHead: string | null, _branchGraph?: BranchGraphData) {
        this.commits = commits;
        this.commitHead = commitHead;
        this.vertices = [];
        this.branches = [];
        this.availableColours = [];
        this.commitLookup = {}; // 清空旧索引，防止上一次渲染的映射污染本次

        if (commits.length === 0) return;

        // 构建提交查找表
        commits.forEach((commit, index) => {
            this.commitLookup[commit.hash] = index;
        });

        // 创建 null vertex
        const nullVertex = new Vertex(NULL_VERTEX_ID, false);

        // 创建顶点
        for (let i = 0; i < commits.length; i++) {
            this.vertices.push(new Vertex(i, false)); // 暂时不支持 stash
        }

        // 建立父子关系（与官方实现保持一致）
        for (let i = 0; i < commits.length; i++) {
            const commit = commits[i];
            // 确保 parents 是数组（官方实现中 parents 总是数组，即使为空）
            const parents = commit.parents || [];
            for (let j = 0; j < parents.length; j++) {
                const parentHash = parents[j];
                if (typeof this.commitLookup[parentHash] === 'number') {
                    // 父提交在当前顶点列表中
                    this.vertices[i].addParent(this.vertices[this.commitLookup[parentHash]]);
                    this.vertices[this.commitLookup[parentHash]].addChild(this.vertices[i]);
                } else if (!this.onlyFollowFirstParent || j === 0) {
                    // 父提交不在顶点列表中，且不是被 onlyFollowFirstParent 隐藏的
                    this.vertices[i].addParent(nullVertex);
                }
            }
        }

        // 标记当前提交
        if (commitHead !== null && typeof this.commitLookup[commitHead] === 'number') {
            this.vertices[this.commitLookup[commitHead]].setCurrent();
        }

        // 确定路径 - 从前往后处理
        let i = 0;
        let iterations = 0;
        const maxIterations = this.vertices.length * 10; // 防止无限循环
        while (i < this.vertices.length && iterations < maxIterations) {
            iterations++;
            if (this.vertices[i].getNextParent() !== null || this.vertices[i].isNotOnBranch()) {
                const oldI = i;
                this.determinePath(i);
                // 确保 i 有进展，防止无限循环
                if (i === oldI) {
                    i++;
                }
            } else {
                i++;
            }
        }
        if (iterations >= maxIterations) {
            console.warn('Git Graph: determinePath 可能陷入无限循环，已停止');
        }
    }

    /**
     * 确定路径 - 核心算法（基于 vscode-git-graph-develop）
     */
    private determinePath(startAt: number) {
        if (startAt < 0 || startAt >= this.vertices.length) {
            console.warn(`Git Graph: determinePath called with invalid startAt: ${startAt}`);
            return;
        }

        let i = startAt;
        let vertex = this.vertices[i];
        let parentVertex = vertex.getNextParent();
        let lastPoint = vertex.isNotOnBranch() ? vertex.getNextPoint() : vertex.getPoint();
        let curVertex: Vertex;
        let curPoint: Point;

        if (
            parentVertex !== null &&
            parentVertex.id !== NULL_VERTEX_ID &&
            vertex.isMerge() &&
            !vertex.isNotOnBranch() &&
            !parentVertex.isNotOnBranch()
        ) {
            // 分支是两个已在分支上的顶点之间的合并
            let foundPointToParent = false;
            const parentBranch = parentVertex.getBranch()!;

            for (i = startAt + 1; i < this.vertices.length; i++) {
                curVertex = this.vertices[i];
                const connectingPoint = curVertex.getPointConnectingTo(parentVertex, parentBranch);
                if (connectingPoint !== null) {
                    foundPointToParent = true; // 找到父节点
                    curPoint = connectingPoint;
                } else {
                    curPoint = curVertex.getNextPoint(); // 找不到父节点，选择下一个可用点
                }

                parentBranch.addLine(
                    lastPoint,
                    curPoint,
                    vertex.getIsCommitted(),
                    !foundPointToParent && curVertex !== parentVertex ? lastPoint.x < curPoint.x : true
                );
                curVertex.registerUnavailablePoint(curPoint.x, parentVertex, parentBranch);
                lastPoint = curPoint;

                if (foundPointToParent) {
                    vertex.registerParentProcessed();
                    break;
                }
            }
        } else {
            // 正常分支
            const branch = new Branch(this.getAvailableColour(startAt));
            vertex.addToBranch(branch, lastPoint.x);
            vertex.registerUnavailablePoint(lastPoint.x, vertex, branch);

            for (i = startAt + 1; i < this.vertices.length; i++) {
                curVertex = this.vertices[i];
                curPoint = parentVertex === curVertex && !parentVertex.isNotOnBranch()
                    ? curVertex.getPoint()
                    : curVertex.getNextPoint();

                branch.addLine(lastPoint, curPoint, vertex.getIsCommitted(), lastPoint.x < curPoint.x);
                curVertex.registerUnavailablePoint(curPoint.x, parentVertex, branch);
                lastPoint = curPoint;

                if (parentVertex === curVertex) {
                    // 到达了 <vertex> 的父节点，继续构建分支
                    vertex.registerParentProcessed();
                    const parentVertexOnBranch = !parentVertex.isNotOnBranch();
                    parentVertex.addToBranch(branch, curPoint.x);
                    vertex = parentVertex;
                    parentVertex = vertex.getNextParent();
                    if (parentVertex === null || parentVertexOnBranch) {
                        // 没有更多父顶点，或父顶点已在分支上
                        break;
                    }
                }
            }

            if (i === this.vertices.length && parentVertex !== null && parentVertex.id === NULL_VERTEX_ID) {
                // 顶点是图中的最后一个，无法再形成到父节点的分支
                vertex.registerParentProcessed();
            }

            branch.setEnd(i);
            this.branches.push(branch);
            this.availableColours[branch.getColour()] = i;
        }
    }

    /**
     * 获取可用颜色
     */
    private getAvailableColour(startAt: number): number {
        for (let i = 0; i < this.availableColours.length; i++) {
            if (startAt > this.availableColours[i]) {
                return i;
            }
        }
        this.availableColours.push(0);
        return this.availableColours.length - 1;
    }

    /**
     * 渲染图形到 SVG
     */
    render(svg: SVGElement, expandedCommitIndex: number = -1) {
        this.expandedCommitIndex = expandedCommitIndex;

        // 清空 SVG
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }

        if (this.vertices.length === 0) {
            return;
        }

        const group = document.createElementNS(SVG_NAMESPACE, 'g');

        // 先绘制分支线（在提交点下方）
        for (const branch of this.branches) {
            branch.draw(group, this.config, this.expandedCommitIndex);
        }

        // 再绘制提交点（在分支线上方，确保可见）
        for (let i = 0; i < this.vertices.length; i++) {
            this.vertices[i].draw(
                group,
                this.config,
                expandedCommitIndex > -1 && i > expandedCommitIndex,
                this.commits
            );
        }

        svg.appendChild(group);

        // 设置 SVG 尺寸和 viewBox
        const width = this.getContentWidth();
        const height = this.getHeight(expandedCommitIndex);
        svg.setAttribute('width', width.toString());
        svg.setAttribute('height', height.toString());
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('preserveAspectRatio', 'none');
    }

    /**
     * 获取内容宽度
     */
    getContentWidth(): number {
        let x = 0;
        for (let i = 0; i < this.vertices.length; i++) {
            const p = this.vertices[i].getNextPoint();
            if (p.x > x) {
                x = p.x;
            }
        }
        return 2 * this.config.grid.offsetX + (x > 0 ? (x - 1) * this.config.grid.x : 0);
    }

    /**
     * 获取高度
     */
    getHeight(expandedCommitIndex: number): number {
        return (
            this.vertices.length * this.config.grid.y +
            this.config.grid.offsetY -
            this.config.grid.y / 2 +
            (expandedCommitIndex > -1 ? this.config.grid.expandY : 0)
        );
    }

    /**
     * 获取顶点颜色
     */
    getVertexColours(): number[] {
        const colours: number[] = [];
        for (let i = 0; i < this.vertices.length; i++) {
            colours[i] = this.vertices[i].getColour() % this.config.colours.length;
        }
        return colours;
    }

    /**
     * 获取提交索引对应的颜色
     */
    getVertexColour(index: number): number {
        if (index >= 0 && index < this.vertices.length) {
            return this.vertices[index].getColour() % this.config.colours.length;
        }
        return 0;
    }
}
