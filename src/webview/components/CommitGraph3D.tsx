import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * 3D 提交图谱组件 - 使用 WebGL 展示三维提交历史
 */
export const CommitGraph3D: React.FC<{ data: any }> = ({ data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; content: string }>({
        visible: false,
        x: 0,
        y: 0,
        content: ''
    });
    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        commitMeshes: Array<{ mesh: THREE.Mesh; commit: any }>;
        raycaster: THREE.Raycaster;
        mouse: THREE.Vector2;
    } | null>(null);

    useEffect(() => {
        if (!containerRef.current || !data?.log?.all) {
            return;
        }

        const commits = data.log.all;
        if (commits.length === 0) {
            return;
        }

        // 初始化 Three.js 场景
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1e1e1e);

        const containerEl = containerRef.current as any;
        const width = containerEl.clientWidth || (containerEl.getBoundingClientRect?.()?.width) || 1000;
        const height = containerEl.clientHeight || (containerEl.getBoundingClientRect?.()?.height) || 600;

        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.set(0, 10, 20);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        (containerRef.current as any).appendChild(renderer.domElement);

        // 添加光源
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 5);
        scene.add(directionalLight);

        // 创建提交节点
        const commitNodes: THREE.Mesh[] = [];
        const commitMeshes: Array<{ mesh: THREE.Mesh; commit: any }> = [];
        const commitSpacing = 2;
        const maxCommits = Math.min(commits.length, 50); // 限制显示数量以提高性能

        // 创建射线检测器用于鼠标交互
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        commits.slice(0, maxCommits).forEach((commit: any, index: number) => {
            // 创建球体表示提交节点
            const geometry = new THREE.SphereGeometry(0.3, 16, 16);
            const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color().setHSL((index / maxCommits) * 0.6, 0.8, 0.6),
                emissive: new THREE.Color().setHSL((index / maxCommits) * 0.6, 0.8, 0.2)
            });

            const sphere = new THREE.Mesh(geometry, material);

            // 存储提交信息到mesh的用户数据中
            (sphere as any).userData = { commit, index };

            // 螺旋排列节点
            const angle = (index / maxCommits) * Math.PI * 4;
            const radius = 2 + (index / maxCommits) * 3;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = (index / maxCommits) * 8 - 4;

            sphere.position.set(x, y, z);
            scene.add(sphere);
            commitNodes.push(sphere);
            commitMeshes.push({ mesh: sphere, commit });

            // 添加连接线
            if (index > 0) {
                const prevCommit = commitNodes[index - 1];
                const lineGeometry = new THREE.BufferGeometry().setFromPoints([
                    prevCommit.position,
                    sphere.position
                ]);
                const lineMaterial = new THREE.LineBasicMaterial({
                    color: 0x569cd6,
                    opacity: 0.5,
                    transparent: true
                });
                const line = new THREE.Line(lineGeometry, lineMaterial);
                scene.add(line);
            }
        });

        // 简单的轨道控制（鼠标拖拽旋转）
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        let rotationX = 0;
        let rotationY = 0;

        const onMouseDown = (e: any) => {
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
        };

        const onMouseMove = (e: any) => {
            if (!isDragging) return;

            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;

            rotationY += deltaX * 0.01;
            rotationX += deltaY * 0.01;

            // 限制垂直旋转角度
            rotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationX));

            const radius = 20;
            camera.position.x = Math.sin(rotationY) * Math.cos(rotationX) * radius;
            camera.position.y = Math.sin(rotationX) * radius;
            camera.position.z = Math.cos(rotationY) * Math.cos(rotationX) * radius;
            camera.lookAt(0, 0, 0);

            previousMousePosition = { x: e.clientX, y: e.clientY };
        };

        const onMouseUp = () => {
            isDragging = false;
        };

        renderer.domElement.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        // 鼠标滚轮缩放
        const onWheel = (e: any) => {
            e.preventDefault();
            const scale = e.deltaY > 0 ? 1.1 : 0.9;
            camera.position.multiplyScalar(scale);
        };

        renderer.domElement.addEventListener('wheel', onWheel);

        // 鼠标移动检测（用于显示tooltip）
        let lastHighlightedNode: THREE.Mesh | null = null;

        const onMouseMoveForTooltip = (e: any) => {
            if (isDragging) {
                setTooltip({ visible: false, x: 0, y: 0, content: '' });
                // 恢复之前高亮的节点
                if (lastHighlightedNode) {
                    lastHighlightedNode.scale.set(1, 1, 1);
                    lastHighlightedNode = null;
                }
                return;
            }

            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(commitNodes);

            if (intersects.length > 0) {
                const intersected = intersects[0].object as THREE.Mesh;
                const commitData = (intersected as any).userData.commit;
                if (commitData) {
                    // 恢复之前高亮的节点
                    if (lastHighlightedNode && lastHighlightedNode !== intersected) {
                        lastHighlightedNode.scale.set(1, 1, 1);
                    }

                    // 高亮当前节点（稍微放大）
                    if (lastHighlightedNode !== intersected) {
                        intersected.scale.set(1.3, 1.3, 1.3);
                        lastHighlightedNode = intersected;
                    }

                    const message = commitData.message.split('\n')[0];
                    const date = new Date(commitData.date).toLocaleString('zh-CN');
                    const content = `
                        <div style="font-weight: bold; margin-bottom: 5px;">${message}</div>
                        <div style="font-size: 11px; color: #aaa;">哈希: ${commitData.hash.substring(0, 8)}</div>
                        <div style="font-size: 11px; color: #aaa;">作者: ${commitData.author_name}</div>
                        <div style="font-size: 11px; color: #aaa;">日期: ${date}</div>
                    `;
                    setTooltip({
                        visible: true,
                        x: e.clientX - rect.left + 10,
                        y: e.clientY - rect.top - 10,
                        content
                    });
                }
            } else {
                setTooltip({ visible: false, x: 0, y: 0, content: '' });
                // 恢复之前高亮的节点
                if (lastHighlightedNode) {
                    lastHighlightedNode.scale.set(1, 1, 1);
                    lastHighlightedNode = null;
                }
            }
        };

        renderer.domElement.addEventListener('mousemove', onMouseMoveForTooltip);

        // 鼠标离开时隐藏tooltip
        const onMouseLeave = () => {
            setTooltip({ visible: false, x: 0, y: 0, content: '' });
            // 恢复之前高亮的节点
            if (lastHighlightedNode) {
                lastHighlightedNode.scale.set(1, 1, 1);
                lastHighlightedNode = null;
            }
        };

        renderer.domElement.addEventListener('mouseleave', onMouseLeave);

        // 动画循环
        const animate = () => {
            (window as any).requestAnimationFrame(animate);
            renderer.render(scene, camera);
        };
        animate();

        sceneRef.current = { scene, camera, renderer, commitMeshes, raycaster, mouse };

        // 清理函数
        return () => {
            renderer.domElement.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            renderer.domElement.removeEventListener('wheel', onWheel);
            renderer.domElement.removeEventListener('mousemove', onMouseMoveForTooltip);
            renderer.domElement.removeEventListener('mouseleave', onMouseLeave);

            if (containerEl && renderer.domElement.parentNode) {
                containerEl.removeChild(renderer.domElement);
            }
            renderer.dispose();
        };
    }, [data]);

    return (
        <div className="commit-graph-3d">
            <div className="section-header">
                <h2>3D 提交图谱</h2>
                <p className="section-description">
                    使用 WebGL 展示三维提交历史，支持鼠标拖拽旋转和滚轮缩放
                </p>
            </div>
            <div className="graph-container-3d" ref={containerRef} style={{ width: '100%', height: '600px', position: 'relative' }}>
                {!data?.log && (
                    <div className="empty-state">
                        <p>📊 正在加载提交历史...</p>
                    </div>
                )}
                {/* Tooltip 显示提交信息 */}
                {tooltip.visible && (
                    <div
                        ref={tooltipRef}
                        style={{
                            position: 'absolute',
                            left: `${tooltip.x}px`,
                            top: `${tooltip.y}px`,
                            background: 'rgba(30, 30, 30, 0.95)',
                            border: '1px solid #569cd6',
                            borderRadius: '4px',
                            padding: '10px',
                            color: '#fff',
                            fontSize: '12px',
                            pointerEvents: 'none',
                            zIndex: 1000,
                            maxWidth: '300px',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                        }}
                        dangerouslySetInnerHTML={{ __html: tooltip.content }}
                    />
                )}
            </div>
            <div className="controls-hint" style={{ marginTop: '10px', fontSize: '12px', color: '#888' }}>
                💡 提示：拖拽鼠标旋转视角，滚轮缩放，悬停节点查看提交信息
            </div>
        </div>
    );
};

