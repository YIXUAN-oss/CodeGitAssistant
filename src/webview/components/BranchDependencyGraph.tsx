import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface MergeInfo {
    from: string;
    to: string;
    commit: string;
    type?: 'three-way' | 'fast-forward';
    description?: string;
    timestamp?: number;
}

/**
 * 分支依赖关系图组件 - 可视化分支合并路径与依赖
 */
export const BranchDependencyGraph: React.FC<{ data: any }> = ({ data }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const branchGraph = data?.branchGraph || {};
    const branches = branchGraph.branches || [];
    const merges = branchGraph.merges || [];
    const currentBranch = branchGraph.currentBranch || data?.currentBranch || '';
    const sortedMerges = React.useMemo(
        () => [...merges].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
        [merges]
    );
    const formatTimestamp = React.useCallback(
        (ts?: number) => (ts ? new Date(ts).toLocaleString() : '时间未知'),
        []
    );

    useEffect(() => {
        if (!svgRef.current) return;

        // 调试信息：打印分支和合并关系
        if (process.env.NODE_ENV === 'development') {
            console.log('Branch Dependency Graph Data:', {
                branches,
                merges,
                currentBranch,
                branchGraph
            });
        }

        if (branches.length === 0) {
            // 如果没有分支数据，显示空状态
            d3.select(svgRef.current).selectAll('*').remove();
            const width = (svgRef.current as any).clientWidth || 1000;
            const height = 600;
            const svg = d3.select(svgRef.current)
                .attr('width', width)
                .attr('height', height);

            svg.append('text')
                .attr('x', width / 2)
                .attr('y', height / 2)
                .attr('text-anchor', 'middle')
                .style('fill', '#888')
                .style('font-size', '16px')
                .text('暂无分支数据');
            return;
        }

        drawBranchGraph(svgRef.current, branches, merges, currentBranch);
    }, [branches, merges, currentBranch]);

    const drawBranchGraph = (container: SVGSVGElement, branches: string[], merges: MergeInfo[], currentBranch: string) => {
        d3.select(container).selectAll('*').remove();

        const width = (container as any).clientWidth || ((container as any).getBoundingClientRect?.()?.width) || 1000;
        const height = 600;
        const margin = { top: 40, right: 40, bottom: 40, left: 40 };

        const svg = d3.select(container)
            .attr('width', width)
            .attr('height', height);

        // 创建缩放和平移容器
        const g = svg.append('g');

        // 设置缩放行为
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4]) // 缩放范围：0.1倍到4倍
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom as any);

        // 创建力导向图，添加边界约束
        const simulation = d3.forceSimulation<any>()
            .force('link', d3.forceLink().id((d: any) => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(30))
            .force('x', d3.forceX(width / 2).strength(0.1))
            .force('y', d3.forceY(height / 2).strength(0.1));

        // 创建节点数据
        const nodes = branches.map(branch => ({
            id: branch,
            name: branch,
            isCurrent: branch === currentBranch
        }));

        // 创建边数据（合并关系）
        const links = merges.map(merge => ({
            source: merge.from,
            target: merge.to,
            commit: merge.commit,
            type: merge.type || 'three-way',
            description: merge.description,
            timestamp: merge.timestamp
        }));

        // 过滤掉不存在的节点
        const validLinks = links.filter(link =>
            nodes.some(n => n.id === link.source) &&
            nodes.some(n => n.id === link.target)
        );

        // 添加箭头标记（需要在 svg 的 defs 中，不受缩放影响）
        svg.append('defs').selectAll('marker')
            .data(['end'])
            .enter().append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 25)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#569cd6');

        // 绘制连接线（在缩放容器中）
        const link = g.append('g')
            .selectAll('line')
            .data(validLinks)
            .enter().append('line')
            .attr('stroke', (d: any) => d.type === 'fast-forward' ? '#9cdcfe' : '#569cd6')
            .attr('stroke-width', 2)
            .attr('marker-end', 'url(#arrowhead)')
            .attr('opacity', 0.8)
            .attr('stroke-dasharray', (d: any) => d.type === 'fast-forward' ? '6,4' : null);

        link.append('title')
            .text((d: any) => {
                const desc = d.description || `${d.type === 'fast-forward' ? '快速合并' : '三路合并'}：${d.source.id || d.source} → ${d.target.id || d.target}`;
                return `${desc}\n时间：${formatTimestamp(d.timestamp)}\n提交：${d.commit}`;
            });

        // 绘制节点（在缩放容器中）
        const node = g.append('g')
            .selectAll('g')
            .data(nodes)
            .enter().append('g')
            .call(d3.drag<any, any>()
                .on('start', function (event: any, d: any) {
                    event.sourceEvent.stopPropagation(); // 阻止事件传播，避免触发画布平移
                    dragstarted(event, d);
                })
                .on('drag', dragged)
                .on('end', dragended) as any);

        // 节点圆圈
        node.append('circle')
            .attr('r', 20)
            .attr('fill', (d: any) => d.isCurrent ? '#4a90e2' : '#569cd6')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer');

        // 节点标签
        node.append('text')
            .text((d: any) => d.name.length > 15 ? d.name.substring(0, 15) + '...' : d.name)
            .attr('x', 0)
            .attr('y', 35)
            .attr('text-anchor', 'middle')
            .style('fill', '#fff')
            .style('font-size', '12px')
            .style('pointer-events', 'none');

        // 当前分支标记
        node.filter((d: any) => d.isCurrent)
            .append('circle')
            .attr('r', 25)
            .attr('fill', 'none')
            .attr('stroke', '#4a90e2')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5')
            .style('animation', 'pulse 2s infinite');

        // 更新位置
        simulation.nodes(nodes as any);
        (simulation.force('link') as any).links(validLinks);

        simulation.on('tick', () => {
            // 边界约束：防止节点超出画布
            nodes.forEach((d: any) => {
                const radius = 25; // 节点半径 + 外圈
                d.x = Math.max(radius, Math.min(width - radius, d.x));
                d.y = Math.max(radius + margin.top, Math.min(height - radius - margin.bottom, d.y));
            });

            link
                .attr('x1', (d: any) => d.source.x)
                .attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => d.target.x)
                .attr('y2', (d: any) => d.target.y);

            node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
        });

        // 拖拽函数（考虑缩放变换）
        function dragstarted(event: any, d: any) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event: any, d: any) {
            // 获取当前的缩放变换
            const transform = d3.zoomTransform(svg.node() as any);
            // 将屏幕坐标转换为画布坐标
            d.fx = (event.x - transform.x) / transform.k;
            d.fy = (event.y - transform.y) / transform.k;
        }

        function dragended(event: any, d: any) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }

        // 添加标题
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', 20)
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .style('font-weight', 'bold')
            .style('fill', '#fff')
            .text('分支依赖关系图');

        // 添加图例
        const legend = svg.append('g')
            .attr('transform', `translate(${width - 150}, ${height - 100})`);

        legend.append('circle')
            .attr('r', 8)
            .attr('fill', '#4a90e2')
            .attr('cx', 0)
            .attr('cy', 0);

        legend.append('text')
            .attr('x', 15)
            .attr('y', 5)
            .style('fill', '#fff')
            .style('font-size', '12px')
            .text('当前分支');

        legend.append('circle')
            .attr('r', 8)
            .attr('fill', '#569cd6')
            .attr('cx', 0)
            .attr('cy', 20);

        legend.append('text')
            .attr('x', 15)
            .attr('y', 25)
            .style('fill', '#fff')
            .style('font-size', '12px')
            .text('其他分支');

        const legendItems = [
            { y: 40, label: '三路合并', dash: null, color: '#569cd6' },
            { y: 60, label: '快速合并', dash: '6,4', color: '#9cdcfe' }
        ];

        legendItems.forEach(item => {
            legend.append('line')
                .attr('x1', 0)
                .attr('y1', item.y)
                .attr('x2', 20)
                .attr('y2', item.y)
                .attr('stroke', item.color)
                .attr('stroke-width', 2)
                .attr('marker-end', 'url(#arrowhead)')
                .attr('stroke-dasharray', item.dash || null);

            legend.append('text')
                .attr('x', 25)
                .attr('y', item.y + 5)
                .style('fill', '#fff')
                .style('font-size', '12px')
                .text(item.label);
        });
    };

    return (
        <div className="branch-dependency-graph">
            <div className="section-header">
                <h2>分支依赖关系图</h2>
                <p className="section-description">
                    可视化分支合并路径与依赖关系，支持拖拽交互
                </p>
            </div>
            <div className="graph-container">
                <svg ref={svgRef} style={{ width: '100%', height: '600px', background: 'var(--vscode-sideBar-background)' }} />
            </div>
            {!data && (
                <div className="empty-state" style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                    <p>📊 正在加载分支数据...</p>
                </div>
            )}
            {data && (!data.branchGraph || !data.branchGraph.branches || data.branchGraph.branches.length === 0) && (
                <div className="empty-state" style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                    <p>📊 暂无分支数据，请确保仓库中有分支信息</p>
                </div>
            )}
            <div className="merge-history" style={{ marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                <h3 style={{ marginBottom: '12px' }}>📝 合并记录</h3>
                {sortedMerges.length === 0 ? (
                    <p style={{ color: '#888' }}>暂无合并记录</p>
                ) : (
                    sortedMerges.map((merge, index) => (
                        <div
                            key={`${merge.from}-${merge.to}-${merge.commit}-${index}`}
                            style={{
                                padding: '8px 0',
                                borderBottom: index === sortedMerges.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)'
                            }}
                        >
                            <div style={{ fontWeight: 600 }}>
                                {merge.description || `${merge.type === 'fast-forward' ? '快速合并' : '三路合并'}：${merge.from} → ${merge.to}`}
                            </div>
                            <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>
                                时间：{formatTimestamp(merge.timestamp)} ｜ 提交：{merge.commit?.slice(0, 8)}
                            </div>
                        </div>
                    ))
                )}
            </div>
            <div className="controls-hint" style={{ marginTop: '10px', fontSize: '12px', color: '#888' }}>
                💡 提示：可以拖拽节点调整布局，使用鼠标滚轮缩放，拖拽空白区域平移
            </div>
        </div>
    );
};

