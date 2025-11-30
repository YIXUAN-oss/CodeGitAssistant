import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

/**
 * 格式化相对时间的辅助函数
 */
const getRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
        return '刚刚';
    } else if (diffMins < 60) {
        return `${diffMins}分钟前`;
    } else if (diffHours < 24) {
        return `${diffHours}小时前`;
    } else if (diffDays < 7) {
        return `${diffDays}天前`;
    } else {
        return date.toLocaleDateString('zh-CN');
    }
};

/**
 * Git 分支图组件 - 使用 D3.js 可视化 Git 分支的 DAG 结构
 */
export const BranchGraph: React.FC<{ data: any }> = ({ data }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [selectedNode, setSelectedNode] = useState<any>(null);
    const [showDetails, setShowDetails] = useState<boolean>(false);
    const [zoomLevel, setZoomLevel] = useState<number>(100); // 缩放百分比
    const selectedNodeRef = useRef<any>(null);
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !data?.branchGraph?.dag) {
            return;
        }

        const dag = data.branchGraph.dag;
        if (!dag.nodes || dag.nodes.length === 0) {
            return;
        }

        // 清空之前的图形
        d3.select(svgRef.current).selectAll('*').remove();

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = Math.max(600, dag.nodes.length * 30);

        // 设置 SVG 尺寸
        const svg = d3.select(svgRef.current)
            .attr('width', width)
            .attr('height', height);

        // 创建主组
        const g = svg.append('g');
        gRef.current = g;

        // 节点可见性更新函数（LOD - Level of Detail）
        const updateNodeVisibility = (scale: number) => {
            const labels = g.selectAll('.node-label');
            const circles = g.selectAll('.node circle');
            const links = g.selectAll('.links line');

            if (scale < 0.5) {
                // 缩小视图：只显示节点，隐藏标签，缩小节点
                labels.style('opacity', 0);
                circles.attr('r', (d: any) => (d.isMerge ? 4 : 3));
                links.attr('stroke-width', Math.max(1, 1.5 * scale));
            } else if (scale < 1.0) {
                // 中等视图：显示节点和哈希，隐藏消息
                labels.style('opacity', 1);
                labels.selectAll('text').each(function (d: any, i: number) {
                    // 只显示哈希（第一个text元素），隐藏消息（第二个text元素）
                    if (i === 0) {
                        d3.select(this).style('opacity', 1);
                    } else {
                        d3.select(this).style('opacity', 0);
                    }
                });
                circles.attr('r', (d: any) => (d.isMerge ? 6 : 5));
                links.attr('stroke-width', Math.max(1.5, 2 * scale));
            } else {
                // 放大视图：显示所有信息
                labels.style('opacity', 1);
                labels.selectAll('text').style('opacity', 1);
                circles.attr('r', (d: any) => (d.isMerge ? 8 : 6));
                links.attr('stroke-width', 2);
            }
        };

        // 创建缩放和平移行为
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.05, 5]) // 扩大缩放范围
            .on('zoom', (event) => {
                const currentScale = event.transform.k;
                g.attr('transform', event.transform);
                // 根据缩放级别调整节点和标签显示
                updateNodeVisibility(currentScale);
                // 更新缩放百分比（转换为百分比，保留1位小数）
                setZoomLevel(Math.round(currentScale * 100 * 10) / 10);
            });

        svg.call(zoom);
        zoomRef.current = zoom;

        // 构建提交信息映射（从 log 数据中获取）
        const commitInfoMap = new Map<string, any>();
        if (data?.log?.all) {
            data.log.all.forEach((commit: any) => {
                commitInfoMap.set(commit.hash, {
                    message: commit.message,
                    author_name: commit.author_name,
                    author_email: commit.author_email,
                    date: commit.date,
                    body: commit.body
                });
            });
        }

        // 构建节点映射，合并提交信息
        const nodeMap = new Map<string, any>();
        dag.nodes.forEach((node: any) => {
            const commitInfo = commitInfoMap.get(node.hash) || {};
            nodeMap.set(node.hash, {
                ...node,
                ...commitInfo,
                // 获取提交消息的第一行
                shortMessage: commitInfo.message ? commitInfo.message.split('\n')[0].substring(0, 50) : '',
                // 格式化日期
                formattedDate: commitInfo.date ? new Date(commitInfo.date).toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : '',
                // 相对时间
                relativeTime: commitInfo.date ? getRelativeTime(commitInfo.date) : '',
                x: 0,
                y: 0,
                fixed: false
            });
        });

        // 反转链接方向：从 child -> parent (符合 git log 的显示方式)
        // 注意：dag.links 中是 source: parent, target: child
        // 我们需要反转成从 child (较新) 指向 parent (较旧)
        const reversedLinks = dag.links
            .filter((link: any) => nodeMap.has(link.source) && nodeMap.has(link.target))
            .map((link: any) => ({
                source: nodeMap.get(link.target), // child (较新的提交)
                target: nodeMap.get(link.source)  // parent (较旧的提交)
            }));

        const nodes = Array.from(nodeMap.values());

        // 如果没有节点，直接返回
        if (nodes.length === 0) {
            return;
        }

        // ========== 实现分层布局算法（类似 git log --graph）==========
        // 1. 按时间戳排序（新的在上，旧的在下）
        nodes.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

        // 2. 构建子节点映射（用于查找每个节点的子节点）
        const childrenMap = new Map<string, any[]>();
        nodes.forEach((node: any) => {
            if (!childrenMap.has(node.hash)) {
                childrenMap.set(node.hash, []);
            }
            // 从 parents 关系构建子节点映射
            if (node.parents && node.parents.length > 0) {
                node.parents.forEach((parentHash: string) => {
                    if (!childrenMap.has(parentHash)) {
                        childrenMap.set(parentHash, []);
                    }
                    childrenMap.get(parentHash)!.push(node);
                });
            }
        });

        // 3. 分配层级（Y坐标）- 使用拓扑排序确保子节点在父节点之上
        const nodeLevelMap = new Map<string, number>();
        const levelNodes = new Map<number, any[]>();

        // 第一步：初始化所有节点的层级为基于时间戳的索引
        nodes.forEach((node: any, index: number) => {
            nodeLevelMap.set(node.hash, index);
        });

        // 第二步：调整层级，确保子节点（较新的提交）始终在父节点（较旧的提交）之上
        // 需要多轮迭代来稳定层级分配
        let changed = true;
        let iterations = 0;
        const maxIterations = nodes.length; // 防止无限循环

        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;

            nodes.forEach((node: any) => {
                if (node.parents && node.parents.length > 0) {
                    // 获取所有父节点的层级
                    const parentLevels = node.parents
                        .map((p: string) => nodeLevelMap.get(p))
                        .filter((l: number | undefined) => l !== undefined) as number[];

                    if (parentLevels.length > 0) {
                        const maxParentLevel = Math.max(...parentLevels);
                        const currentLevel = nodeLevelMap.get(node.hash) || 0;

                        // 子节点必须比所有父节点都靠上（level 更小）
                        if (currentLevel >= maxParentLevel) {
                            // 调整子节点到父节点之上
                            nodeLevelMap.set(node.hash, maxParentLevel - 1);
                            changed = true;
                        }
                    }
                }
            });
        }

        // 第三步：规范化层级，使其从 0 开始连续
        const levelSet = new Set(Array.from(nodeLevelMap.values()));
        const sortedLevels = Array.from(levelSet).sort((a, b) => a - b);
        const levelMapping = new Map<number, number>();
        sortedLevels.forEach((oldLevel, index) => {
            levelMapping.set(oldLevel, index);
        });

        // 应用映射并重建 levelNodes
        levelNodes.clear();
        let maxLevel = 0;
        nodeLevelMap.forEach((oldLevel, hash) => {
            const newLevel = levelMapping.get(oldLevel) || 0;
            nodeLevelMap.set(hash, newLevel);

            const node = nodes.find((n: any) => n.hash === hash);
            if (node) {
                if (!levelNodes.has(newLevel)) {
                    levelNodes.set(newLevel, []);
                }
                levelNodes.get(newLevel)!.push(node);
                maxLevel = Math.max(maxLevel, newLevel);
            }
        });

        // 5. 分配 X 坐标（轨道/列）- 改进的轨道分配算法
        // 首先，为每个分支构建提交链（从分支 HEAD 到根提交）
        const branchCommitChains = new Map<string, Set<string>>(); // 分支名 -> 该分支的所有提交哈希集合

        // 收集所有分支的提交链
        nodes.forEach((node: any) => {
            if (node.branches && node.branches.length > 0) {
                node.branches.forEach((branchName: string) => {
                    if (!branchCommitChains.has(branchName)) {
                        branchCommitChains.set(branchName, new Set());
                    }
                    branchCommitChains.get(branchName)!.add(node.hash);
                });
            }
        });

        // 为每个分支的提交链添加所有祖先提交
        branchCommitChains.forEach((commitSet, branchName) => {
            const toProcess = Array.from(commitSet);
            const processed = new Set<string>();

            while (toProcess.length > 0) {
                const hash = toProcess.pop()!;
                if (processed.has(hash)) continue;
                processed.add(hash);

                const node = nodes.find((n: any) => n.hash === hash);
                if (node && node.parents) {
                    node.parents.forEach((parentHash: string) => {
                        commitSet.add(parentHash);
                        if (!processed.has(parentHash)) {
                            toProcess.push(parentHash);
                        }
                    });
                }
            }
        });

        const nodeColumnMap = new Map<string, number>(); // 提交哈希 -> 轨道号
        const branchLaneMap = new Map<string, number>(); // 分支名 -> 当前轨道号
        let nextLaneId = 0;

        // 确保 main/master 在轨道 0
        const mainBranchName = nodes.find((n: any) =>
            n.branches && (n.branches.includes('main') || n.branches.includes('master'))
        )?.branches?.find((b: string) => b === 'main' || b === 'master') || 'main';
        branchLaneMap.set(mainBranchName, 0);
        nextLaneId = 1;

        // 按层级从新到旧（从上到下）分配轨道
        for (let level = 0; level <= maxLevel; level++) {
            const levelCommits = levelNodes.get(level) || [];
            // 在同一层级内，按时间戳排序（新的在前）
            levelCommits.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

            levelCommits.forEach((node: any) => {
                let lane = -1;

                if (node.parents.length === 0) {
                    // 情况1: 根提交（初始提交）
                    lane = 0;
                } else if (node.parents.length === 1) {
                    // 情况2: 普通提交
                    const parentLane = nodeColumnMap.get(node.parents[0]);
                    if (parentLane !== undefined) {
                        lane = parentLane;
                    } else {
                        lane = 0;
                    }

                    // 检查是否是分叉点（多个子节点从同一个父节点分出）
                    const siblings = childrenMap.get(node.parents[0]) || [];
                    if (siblings.length > 1) {
                        // 这是分叉点，需要为不同分支分配不同轨道
                        const sortedSiblings = siblings
                            .slice()
                            .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
                        const siblingIndex = sortedSiblings.findIndex((s: any) => s.hash === node.hash);

                        // 第一个子节点继承父轨道（通常是主分支）
                        // 其他子节点（新分支）需要分配新轨道
                        if (siblingIndex > 0) {
                            // 查找这个节点属于哪些分支（包括通过提交链推断的）
                            const nodeBranches = new Set<string>();
                            branchCommitChains.forEach((commitSet, branchName) => {
                                if (commitSet.has(node.hash)) {
                                    nodeBranches.add(branchName);
                                }
                            });

                            // 如果节点属于新分支（分支还没有分配轨道），分配新轨道
                            const hasNewBranch = Array.from(nodeBranches).some((b: string) => !branchLaneMap.has(b));
                            if (hasNewBranch) {
                                // 为新分支分配新轨道
                                const usedLanes = new Set(Array.from(nodeColumnMap.values()));
                                let newLane = nextLaneId;
                                while (usedLanes.has(newLane)) {
                                    newLane++;
                                }
                                lane = newLane;
                                nextLaneId = Math.max(nextLaneId, newLane + 1);

                                // 为新分支记录轨道
                                nodeBranches.forEach((branchName: string) => {
                                    if (!branchLaneMap.has(branchName)) {
                                        branchLaneMap.set(branchName, lane);
                                    }
                                });
                            } else {
                                // 如果分支已存在，使用分支的轨道
                                for (const branchName of nodeBranches) {
                                    if (branchLaneMap.has(branchName)) {
                                        lane = branchLaneMap.get(branchName)!;
                                        break;
                                    }
                                }
                            }
                        }
                    } else {
                        // 不是分叉点，但需要检查节点所属的分支
                        const nodeBranches = new Set<string>();
                        branchCommitChains.forEach((commitSet, branchName) => {
                            if (commitSet.has(node.hash)) {
                                nodeBranches.add(branchName);
                            }
                        });

                        // 如果节点属于已存在的分支，使用该分支的轨道
                        for (const branchName of nodeBranches) {
                            if (branchLaneMap.has(branchName)) {
                                lane = branchLaneMap.get(branchName)!;
                                break;
                            }
                        }
                    }
                } else {
                    // 情况3: 合并提交（多个父节点）
                    // 主干（第一个父节点）使用其轨道，合并提交也使用该轨道
                    const firstParentLane = nodeColumnMap.get(node.parents[0]);
                    if (firstParentLane !== undefined) {
                        lane = firstParentLane;
                    } else {
                        lane = 0; // 默认使用主轨道
                    }
                }

                // 处理分支引用：更新分支到轨道的映射
                if (node.branches && node.branches.length > 0) {
                    // 如果节点有分支引用，优先使用分支的现有轨道
                    for (const branchName of node.branches) {
                        if (branchLaneMap.has(branchName)) {
                            const existingLane = branchLaneMap.get(branchName);
                            if (existingLane !== undefined) {
                                lane = existingLane;
                                break;
                            }
                        }
                    }

                    // 更新所有相关分支的轨道映射
                    node.branches.forEach((branchName: string) => {
                        branchLaneMap.set(branchName, lane);
                    });
                }

                // 如果还没有分配轨道，使用默认值
                if (lane === -1) {
                    lane = 0;
                }

                nodeColumnMap.set(node.hash, lane);
            });
        }

        // 6. 计算布局参数
        const padding = 50;
        const nodeSpacing = 60;  // Y 方向间距（进一步减小以缩短连接线）
        const columnSpacing = 140; // X 方向间距（进一步减小以缩短连接线，但仍保持分叉可见）
        const startY = padding;
        const startX = padding;

        // 调试：输出轨道分配信息
        console.log('=== 分支图轨道分配调试信息 ===');
        console.log(`总提交数: ${nodes.length}, 最大层级: ${maxLevel}`);
        console.log(`所有分支: ${Array.from(branchLaneMap.keys()).join(', ')}`);
        console.log('分支到轨道的映射:', Array.from(branchLaneMap.entries()));
        console.log('轨道分配结果 (按层级):');
        for (let level = 0; level <= maxLevel; level++) {
            const levelCommits = levelNodes.get(level) || [];
            if (levelCommits.length > 0) {
                console.log(`\n层级 ${level}:`);
                levelCommits.forEach((node: any) => {
                    const lane = nodeColumnMap.get(node.hash) || 0;
                    const branches = node.branches?.join(', ') || '无';
                    const msg = node.shortMessage?.substring(0, 40) || '无消息';
                    const parents = node.parents?.length || 0;
                    const children = childrenMap.get(node.hash)?.length || 0;
                    const isMerge = node.isMerge ? ' [合并]' : '';
                    console.log(`  轨道${lane}: ${node.hash.substring(0, 7)} [${branches}] 父节点:${parents} 子节点:${children}${isMerge} - ${msg}`);
                });
            }
        }
        console.log('=== 调试信息结束 ===\n');

        // 7. 设置节点位置
        nodes.forEach((node: any) => {
            const level = nodeLevelMap.get(node.hash) || 0;
            const lane = nodeColumnMap.get(node.hash) || 0;

            node.x = startX + lane * columnSpacing;
            node.y = startY + level * nodeSpacing;
            node.level = level;
            node.column = lane; // 保持 column 属性名以兼容现有代码
        });

        // 8. 更新图形高度以容纳所有层级（支持更大的画布和滚动）
        const calculatedHeight = Math.max(
            height,
            startY + (maxLevel + 1) * nodeSpacing + padding,
            container.clientHeight * 2 // 至少是容器高度的2倍，支持滚动
        );
        svg.attr('height', calculatedHeight);

        // 9. 立即计算并应用初始缩放和居中（在节点渲染前）
        // 这样可以避免从左上角跳到中间位置的视觉跳跃
        try {
            // 计算图形的边界框，考虑标签宽度（包括提交信息，最长约40字符）
            // 提交信息在10px字体下，40字符大约需要250-300像素宽度
            const labelWidth = 300; // 增加标签宽度估算，确保提交信息可见
            const labelHeight = 30; // 标签高度
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            nodes.forEach((d: any) => {
                const r = d.isMerge ? 8 : 6;
                minX = Math.min(minX, d.x - r - labelWidth);
                maxX = Math.max(maxX, d.x + r + labelWidth);
                minY = Math.min(minY, d.y - r - labelHeight);
                maxY = Math.max(maxY, d.y + r + labelHeight);
            });

            if (minX !== Infinity && minY !== Infinity) {
                const graphCenterX = (minX + maxX) / 2;
                const graphCenterY = (minY + maxY) / 2;

                // 初始缩放设置为100%（scale = 1.0）
                const scale = 1.0;

                // 计算平移量，使图形居中并向下移动，确保正确显示
                // X方向居中
                const translateX = width / 2 - scale * graphCenterX;
                // Y方向：向下移动，让图形在可视区域中下部显示，确保提交信息可见
                // 考虑图例在上方，图形应该向下移动，使用较大的偏移量
                const visibleHeight = container.clientHeight;
                const translateY = visibleHeight * 0.6 - scale * graphCenterY; // 使用 0.6 让图形向下移动

                // 立即应用初始变换（在节点渲染前）
                svg.call(
                    zoom.transform as any,
                    d3.zoomIdentity.translate(translateX, translateY).scale(scale)
                );
                // 更新初始缩放百分比为100%
                setZoomLevel(100);
            }
        } catch (e) {
            console.warn('Failed to initialize graph view:', e);
        }

        // 创建箭头标记（向下，因为新提交在上，旧提交在下）
        const defs = svg.append('defs');
        const arrowMarker = defs.append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 5)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#569cd6');

        // 绘制链接（从子节点指向父节点，向下）
        const link = g.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(reversedLinks)
            .enter()
            .append('line')
            .attr('stroke', '#569cd6')
            .attr('stroke-width', 2)
            .attr('stroke-opacity', 0.6)
            .attr('marker-end', 'url(#arrowhead)')
            .attr('x1', (d: any) => d.source.x)
            .attr('y1', (d: any) => d.source.y)
            .attr('x2', (d: any) => d.target.x)
            .attr('y2', (d: any) => d.target.y);

        // 绘制节点（使用已计算的位置）
        const node = g.append('g')
            .attr('class', 'nodes')
            .selectAll('g')
            .data(nodes)
            .enter()
            .append('g')
            .attr('class', 'node')
            .attr('transform', (d: any) => `translate(${d.x},${d.y})`)
            .call(d3.drag<SVGGElement, any>()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended) as any);

        // 节点圆圈
        node.append('circle')
            .attr('r', (d: any) => d.isMerge ? 8 : 6)
            .attr('fill', (d: any) => {
                if (d.isMerge) {
                    return '#f9a825'; // 合并提交用橙色
                }
                // 根据分支数量决定颜色深度
                const branchCount = d.branches?.length || 0;
                if (branchCount > 1) {
                    return '#66bb6a'; // 多分支共享的提交用绿色
                }
                return '#569cd6'; // 普通提交用蓝色
            })
            .attr('stroke', '#fff')
            .attr('stroke-width', 2);

        // 节点标签容器（用于显示更多信息）
        const labelGroup = node.append('g')
            .attr('class', 'node-label');

        // 背景矩形（用于提高文本可读性）
        const labelBg = labelGroup.append('rect')
            .attr('x', 12)
            .attr('y', -8)
            .attr('rx', 4)
            .attr('ry', 4)
            .attr('fill', 'rgba(0, 0, 0, 0.7)')
            .attr('stroke', 'rgba(255, 255, 255, 0.2)')
            .attr('stroke-width', 1);

        // 提交哈希（小字，灰色）
        const hashText = labelGroup.append('text')
            .attr('x', 16)
            .attr('y', 2)
            .attr('font-size', '9px')
            .attr('font-family', 'monospace')
            .attr('fill', '#a8a8a8')
            .text((d: any) => d.hash.substring(0, 7));

        // 提交消息（第一行，如果有）
        // 使用 xml:space="preserve" 和替换空格为不换行空格来保留空格显示
        const messageText = labelGroup.append('text')
            .attr('x', 16)
            .attr('y', 14)
            .attr('font-size', '10px')
            .attr('font-family', 'var(--vscode-font-family)')
            .attr('fill', '#ffffff')
            .attr('xml:space', 'preserve') // 保留空格
            .text((d: any) => {
                if (d.shortMessage) {
                    // 截断过长的消息
                    let message = d.shortMessage.length > 40 ? d.shortMessage.substring(0, 40) + '...' : d.shortMessage;
                    // 将普通空格替换为不换行空格，确保空格正确显示
                    message = message.replace(/ /g, '\u00A0');
                    return message;
                }
                return '';
            });

        // 更新背景矩形大小的函数
        const updateLabelBackgrounds = () => {
            labelGroup.each(function (d: any) {
                const group = d3.select(this);
                const texts = group.selectAll('text').nodes() as SVGTextElement[];
                const hashNode = texts[0];
                const messageNode = texts[1];

                if (hashNode) {
                    try {
                        const hashBBox = hashNode.getBBox();
                        let width = hashBBox.width + 8;
                        let height = hashBBox.height + 8;

                        if (messageNode && d.shortMessage) {
                            const messageBBox = messageNode.getBBox();
                            width = Math.max(width, messageBBox.width + 8);
                            height = hashBBox.height + messageBBox.height + 12;
                        }

                        group.select('rect')
                            .attr('width', width)
                            .attr('height', height);
                    } catch (e) {
                        // 如果 getBBox 失败（文本可能还未渲染），使用默认值
                        group.select('rect')
                            .attr('width', 60)
                            .attr('height', d.shortMessage ? 30 : 18);
                    }
                }
            });
        };

        // 更新标签背景大小（在节点渲染后）
        setTimeout(() => {
            updateLabelBackgrounds();
        }, 50);

        // 节点工具提示
        const tooltip = d3.select('body').append('div')
            .attr('class', 'branch-graph-tooltip')
            .style('position', 'absolute')
            .style('padding', '8px 12px')
            .style('background', 'rgba(0, 0, 0, 0.8)')
            .style('color', '#fff')
            .style('border-radius', '4px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('opacity', 0)
            .style('z-index', '1000');

        // 节点点击事件 - 显示详情面板
        node.on('click', (event, d: any) => {
            event.stopPropagation();
            selectedNodeRef.current = d;
            setSelectedNode(d);
            setShowDetails(true);
        });

        // 节点悬停事件 - 显示增强的工具提示
        node.on('mouseover', (event, d: any) => {
            const branches = d.branches?.join(', ') || '未知分支';
            const isMergeText = d.isMerge ? ' 🔀 合并提交' : '';
            const author = d.author_name || '未知作者';
            const date = d.formattedDate || d.relativeTime || '未知日期';
            const message = d.message ? d.message.split('\n')[0] : '无提交消息';
            const parentHashes = d.parents?.slice(0, 2).map((p: string) => p.substring(0, 7)).join(', ') || '无';

            tooltip
                .html(`
                    <div style="margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 6px;">
                        <div style="font-weight: bold; color: #569cd6; margin-bottom: 4px;">
                            ${d.hash.substring(0, 7)}${isMergeText}
                        </div>
                        <div style="font-size: 11px; color: #fff;">${message}</div>
                    </div>
                    <div style="margin: 4px 0;"><strong>👤 作者:</strong> ${author}</div>
                    <div style="margin: 4px 0;"><strong>📅 日期:</strong> ${date}</div>
                    <div style="margin: 4px 0;"><strong>🌿 分支:</strong> ${branches}</div>
                    <div style="margin: 4px 0;"><strong>🔗 父提交:</strong> ${parentHashes}</div>
                    <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 10px; color: #a8a8a8;">
                        点击查看完整详情
                    </div>
                `)
                .style('opacity', 1);
        })
            .on('mousemove', (event) => {
                tooltip
                    .style('left', (event.pageX + 15) + 'px')
                    .style('top', (event.pageY - 10) + 'px');
            })
            .on('mouseout', () => {
                tooltip.style('opacity', 0);
            });


        // 拖拽函数（更新节点位置和链接）
        function dragstarted(event: any, d: any) {
            if (!event.active) return;
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event: any, d: any) {
            d.fx = event.x;
            d.fy = event.y;

            // 更新节点位置
            d3.select(event.sourceEvent.target.parentElement)
                .attr('transform', `translate(${d.fx},${d.fy})`);

            // 更新所有相关的链接
            link.each(function (linkData: any) {
                let needsUpdate = false;
                let newX1 = linkData.source.x;
                let newY1 = linkData.source.y;
                let newX2 = linkData.target.x;
                let newY2 = linkData.target.y;

                if (linkData.source === d) {
                    newX1 = d.fx;
                    newY1 = d.fy;
                    needsUpdate = true;
                }
                if (linkData.target === d) {
                    newX2 = d.fx;
                    newY2 = d.fy;
                    needsUpdate = true;
                }

                if (needsUpdate) {
                    d3.select(this)
                        .attr('x1', newX1)
                        .attr('y1', newY1)
                        .attr('x2', newX2)
                        .attr('y2', newY2);
                }
            });
        }

        function dragended(event: any, d: any) {
            if (!event.active) return;
            d.fx = null;
            d.fy = null;

            // 重新更新所有链接以确保一致性
            link
                .attr('x1', (linkData: any) => (linkData.source.fx ?? linkData.source.x))
                .attr('y1', (linkData: any) => (linkData.source.fy ?? linkData.source.y))
                .attr('x2', (linkData: any) => (linkData.target.fx ?? linkData.target.x))
                .attr('y2', (linkData: any) => (linkData.target.fy ?? linkData.target.y));
        }

        // 清理函数
        return () => {
            tooltip.remove();
        };
    }, [data]);

    if (!data?.branchGraph?.dag || !data.branchGraph.dag.nodes || data.branchGraph.dag.nodes.length === 0) {
        return (
            <div className="branch-graph">
                <div className="section-header">
                    <h2>分支图</h2>
                    <p className="section-description">
                        使用 D3.js 可视化 Git 分支的有向无环图（DAG）结构
                    </p>
                </div>
                <div className="empty-state">
                    <p>📊 正在加载分支图数据...</p>
                </div>
            </div>
        );
    }

    const dag = data.branchGraph.dag;
    const nodeCount = dag.nodes?.length || 0;
    const linkCount = dag.links?.length || 0;

    return (
        <div className="branch-graph">
            <div className="section-header">
                <h2>分支图</h2>
                <p className="section-description">
                    使用 D3.js 可视化 Git 分支的有向无环图（DAG）结构
                </p>
                <div className="graph-stats">
                    <span>节点: {nodeCount}</span>
                    <span>链接: {linkCount}</span>
                </div>
            </div>
            <div className="branch-graph-content" style={{ width: '100%', minWidth: 0, overflow: 'visible' }}>
                {/* 图例移到图画上方 */}
                <div className="graph-legend" style={{
                    marginBottom: '16px',
                    padding: '24px',
                    background: 'var(--vscode-sideBar-background)',
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: '4px',
                    width: '100%',
                    boxSizing: 'border-box',
                    overflow: 'visible'
                }}>
                    <h3 style={{
                        fontSize: '14px',
                        marginBottom: '24px',
                        marginTop: 0,
                        color: 'var(--vscode-foreground)',
                        fontWeight: '500',
                        lineHeight: '1.4'
                    }}>图例</h3>
                    <div style={{
                        display: 'flex',
                        gap: '56px',
                        rowGap: '20px',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        width: '100%',
                        minWidth: 0
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            flexShrink: 0,
                            minWidth: 'fit-content',
                            marginRight: '8px'
                        }}>
                            <div style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                background: '#569cd6',
                                border: '2px solid #fff',
                                flexShrink: 0
                            }}></div>
                            <span style={{
                                fontSize: '12px',
                                color: 'var(--vscode-foreground)',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                lineHeight: '1.4'
                            }}>普通提交</span>
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            flexShrink: 0,
                            minWidth: 'fit-content',
                            marginRight: '8px'
                        }}>
                            <div style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                background: '#66bb6a',
                                border: '2px solid #fff',
                                flexShrink: 0
                            }}></div>
                            <span style={{
                                fontSize: '12px',
                                color: 'var(--vscode-foreground)',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                lineHeight: '1.4'
                            }}>多分支共享提交</span>
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            flexShrink: 0,
                            minWidth: 'fit-content',
                            marginRight: '8px'
                        }}>
                            <div style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                background: '#f9a825',
                                border: '2px solid #fff',
                                flexShrink: 0
                            }}></div>
                            <span style={{
                                fontSize: '12px',
                                color: 'var(--vscode-foreground)',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                lineHeight: '1.4'
                            }}>合并提交</span>
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            flexShrink: 0,
                            minWidth: 'fit-content',
                            marginRight: '8px'
                        }}>
                            <div style={{
                                width: '40px',
                                height: '2px',
                                background: '#569cd6',
                                flexShrink: 0
                            }}></div>
                            <span style={{
                                fontSize: '12px',
                                color: 'var(--vscode-foreground)',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                lineHeight: '1.4'
                            }}>提交关系</span>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '24px',
                        fontSize: '11px',
                        color: 'var(--vscode-descriptionForeground)',
                        lineHeight: '1.6',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word'
                    }}>
                        💡 提示：可以拖拽节点移动，使用鼠标滚轮缩放，拖拽空白区域平移，点击节点查看详情
                    </div>
                </div>
                <div className="branch-graph-layout" style={{ display: 'flex', gap: '16px', height: '600px' }}>
                    <div className="graph-container" ref={containerRef} style={{
                        flex: showDetails ? '1 1 70%' : '1 1 100%',
                        height: '100%',
                        overflow: 'auto', // 改为 auto 支持滚动
                        border: '1px solid var(--vscode-panel-border)',
                        borderRadius: '4px',
                        transition: 'flex 0.3s ease',
                        position: 'relative'
                    }}>
                        <svg ref={svgRef} style={{
                            width: '100%',
                            minHeight: '100%', // 允许更大的高度
                            cursor: 'move'
                        }} />

                        {/* 缩放控制按钮和百分比显示 */}
                        <div style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            zIndex: 1000,
                            alignItems: 'flex-end'
                        }}>
                            {/* 缩放百分比显示 */}
                            <div style={{
                                padding: '4px 8px',
                                background: 'rgba(0, 0, 0, 0.7)',
                                color: '#fff',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontFamily: 'monospace',
                                minWidth: '60px',
                                textAlign: 'center',
                                border: '1px solid rgba(255, 255, 255, 0.2)'
                            }}>
                                {zoomLevel}%
                            </div>
                            <button
                                onClick={() => {
                                    if (svgRef.current && zoomRef.current) {
                                        d3.select(svgRef.current).transition().duration(300).call(
                                            zoomRef.current.scaleBy as any,
                                            1.2
                                        );
                                        // 缩放百分比会在 zoom 事件中自动更新
                                    }
                                }}
                                style={{
                                    padding: '6px 12px',
                                    background: 'var(--vscode-button-background)',
                                    color: 'var(--vscode-button-foreground)',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}
                                title="放大"
                            >
                                +
                            </button>
                            <button
                                onClick={() => {
                                    if (svgRef.current && zoomRef.current) {
                                        d3.select(svgRef.current).transition().duration(300).call(
                                            zoomRef.current.scaleBy as any,
                                            0.8
                                        );
                                        // 缩放百分比会在 zoom 事件中自动更新
                                    }
                                }}
                                style={{
                                    padding: '6px 12px',
                                    background: 'var(--vscode-button-background)',
                                    color: 'var(--vscode-button-foreground)',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}
                                title="缩小"
                            >
                                −
                            </button>
                            <button
                                onClick={() => {
                                    // 适应窗口大小
                                    if (svgRef.current && zoomRef.current && gRef.current && containerRef.current) {
                                        try {
                                            const bounds = gRef.current.node()?.getBBox();
                                            if (bounds && bounds.width > 0 && bounds.height > 0) {
                                                const fullWidth = containerRef.current.clientWidth;
                                                const fullHeight = containerRef.current.clientHeight;
                                                const width = bounds.width;
                                                const height = bounds.height;
                                                const midX = bounds.x + width / 2;
                                                const midY = bounds.y + height / 2;
                                                const scale = 0.9 * Math.min(fullWidth / width, fullHeight / height);
                                                const translateX = fullWidth / 2 - scale * midX;
                                                const translateY = fullHeight / 2 - scale * midY;
                                                d3.select(svgRef.current).transition().duration(500).call(
                                                    zoomRef.current.transform as any,
                                                    d3.zoomIdentity.translate(translateX, translateY).scale(scale)
                                                );
                                                // 缩放百分比会在 zoom 事件中自动更新
                                            }
                                        } catch (e) {
                                            console.warn('Failed to fit to window:', e);
                                        }
                                    }
                                }}
                                style={{
                                    padding: '6px 12px',
                                    background: 'var(--vscode-button-background)',
                                    color: 'var(--vscode-button-foreground)',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}
                                title="适应窗口"
                            >
                                ⛶
                            </button>
                        </div>
                    </div>
                    {showDetails && selectedNode && (
                        <div className="node-details-panel" style={{ flex: '0 0 300px', height: '100%', background: 'var(--vscode-sideBar-background)', border: '1px solid var(--vscode-panel-border)', borderRadius: '4px', padding: '16px', overflow: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: '12px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px' }}>提交详情</h3>
                                <button
                                    onClick={() => {
                                        setShowDetails(false);
                                        setSelectedNode(null);
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid var(--vscode-panel-border)',
                                        borderRadius: '4px',
                                        padding: '4px 8px',
                                        cursor: 'pointer',
                                        color: 'var(--vscode-foreground)',
                                        fontSize: '12px'
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="detail-section" style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginBottom: '4px' }}>提交哈希</div>
                                <div style={{ fontFamily: 'monospace', fontSize: '14px', background: 'var(--vscode-textCodeBlock-background)', padding: '8px', borderRadius: '4px', wordBreak: 'break-all' }}>
                                    {selectedNode.hash}
                                </div>
                            </div>
                            {selectedNode.shortMessage && (
                                <div className="detail-section" style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginBottom: '4px' }}>提交消息</div>
                                    <div style={{ fontSize: '14px', background: 'var(--vscode-textBlockQuote-background)', padding: '12px', borderRadius: '4px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                                        {selectedNode.message || selectedNode.shortMessage}
                                    </div>
                                </div>
                            )}
                            {selectedNode.author_name && (
                                <div className="detail-section" style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginBottom: '4px' }}>作者</div>
                                    <div style={{ fontSize: '14px' }}>
                                        {selectedNode.author_name}
                                        {selectedNode.author_email && (
                                            <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginLeft: '8px' }}>
                                                &lt;{selectedNode.author_email}&gt;
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                            {(selectedNode.formattedDate || selectedNode.relativeTime) && (
                                <div className="detail-section" style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginBottom: '4px' }}>提交时间</div>
                                    <div style={{ fontSize: '14px' }}>
                                        {selectedNode.formattedDate}
                                        {selectedNode.relativeTime && (
                                            <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginLeft: '8px' }}>
                                                ({selectedNode.relativeTime})
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                            {selectedNode.branches && selectedNode.branches.length > 0 && (
                                <div className="detail-section" style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginBottom: '4px' }}>所属分支</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {selectedNode.branches.map((branch: string, idx: number) => (
                                            <span
                                                key={idx}
                                                style={{
                                                    fontSize: '12px',
                                                    background: branch === data?.branchGraph?.currentBranch ? 'var(--vscode-button-background)' : 'var(--vscode-textCodeBlock-background)',
                                                    color: branch === data?.branchGraph?.currentBranch ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    border: branch === data?.branchGraph?.currentBranch ? '1px solid var(--vscode-button-border)' : '1px solid var(--vscode-panel-border)'
                                                }}
                                            >
                                                {branch}
                                                {branch === data?.branchGraph?.currentBranch && ' (当前)'}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selectedNode.isMerge && (
                                <div className="detail-section" style={{ marginBottom: '16px', padding: '8px', background: 'rgba(249, 168, 37, 0.1)', borderRadius: '4px', border: '1px solid rgba(249, 168, 37, 0.3)' }}>
                                    <div style={{ fontSize: '12px', color: '#f9a825', fontWeight: 'bold', marginBottom: '4px' }}>🔀 合并提交</div>
                                    <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
                                        此提交有 {selectedNode.parents?.length || 0} 个父提交
                                    </div>
                                </div>
                            )}
                            {selectedNode.parents && selectedNode.parents.length > 0 && (
                                <div className="detail-section" style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginBottom: '4px' }}>父提交</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {selectedNode.parents.map((parent: string, idx: number) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    fontFamily: 'monospace',
                                                    fontSize: '12px',
                                                    background: 'var(--vscode-textCodeBlock-background)',
                                                    padding: '6px 8px',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'var(--vscode-textCodeBlock-background)';
                                                }}
                                                onClick={() => {
                                                    // 查找父提交节点并选中
                                                    if (data?.branchGraph?.dag?.nodes) {
                                                        const parentNode = data.branchGraph.dag.nodes.find((n: any) => n.hash === parent);
                                                        if (parentNode) {
                                                            // 合并提交信息
                                                            const commitInfo = data?.log?.all?.find((c: any) => c.hash === parent);
                                                            const enrichedNode = {
                                                                ...parentNode,
                                                                ...(commitInfo || {}),
                                                                shortMessage: commitInfo?.message ? commitInfo.message.split('\n')[0].substring(0, 50) : '',
                                                                formattedDate: commitInfo?.date ? new Date(commitInfo.date).toLocaleString('zh-CN', {
                                                                    year: 'numeric',
                                                                    month: 'short',
                                                                    day: 'numeric',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                }) : '',
                                                                relativeTime: commitInfo?.date ? getRelativeTime(commitInfo.date) : ''
                                                            };
                                                            setSelectedNode(enrichedNode);
                                                            setShowDetails(true);
                                                        }
                                                    }
                                                }}
                                            >
                                                {parent.substring(0, 7)} {idx === 0 && selectedNode.isMerge ? '(主分支)' : ''}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

