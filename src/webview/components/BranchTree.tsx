import React, { useState, useEffect, useRef } from 'react';

/**
 * 分支树组件
 */
export const BranchTree: React.FC<{ data: any }> = ({ data }) => {
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
    const [isCreatingBranch, setIsCreatingBranch] = useState<boolean>(false);
    const [createRequestTimestamp, setCreateRequestTimestamp] = useState<number | null>(null);
    const [creationResult, setCreationResult] = useState<'success' | 'error' | null>(null);

    // 切换分支状态
    const [isSwitchingBranch, setIsSwitchingBranch] = useState<boolean>(false);
    const [switchingBranchName, setSwitchingBranchName] = useState<string | null>(null);
    const [switchResult, setSwitchResult] = useState<'success' | 'error' | null>(null);
    const previousCurrentBranch = React.useRef<string | null>(null);
    const switchRequestTimestamp = useRef<number | null>(null);
    const switchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isSwitchingRef = useRef<boolean>(false);

    // 合并分支状态
    const [isMergingBranch, setIsMergingBranch] = useState<boolean>(false);
    const [mergingBranchName, setMergingBranchName] = useState<string | null>(null);
    const [mergeResult, setMergeResult] = useState<'success' | 'error' | null>(null);
    const mergeRequestTimestamp = useRef<number | null>(null);
    const previousLogCount = useRef<number>(0);
    const mergeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isMergingRef = useRef<boolean>(false);

    const handleBranchClick = (branchName: string) => {
        setSelectedBranch(branchName);
    };

    const handleSwitchBranch = (branchName: string) => {
        setIsSwitchingBranch(true);
        isSwitchingRef.current = true;
        setSwitchingBranchName(branchName);
        setSwitchResult(null);
        switchRequestTimestamp.current = Date.now();
        previousCurrentBranch.current = data?.branches?.current || null;

        // 清除之前的超时
        if (switchTimeoutRef.current) {
            clearTimeout(switchTimeoutRef.current);
        }

        // 设置超时：如果5秒内没有完成操作，自动重置状态（可能是用户取消了操作）
        switchTimeoutRef.current = setTimeout(() => {
            if (isSwitchingRef.current) {
                setIsSwitchingBranch(false);
                isSwitchingRef.current = false;
                setSwitchingBranchName(null);
                switchRequestTimestamp.current = null;
            }
        }, 5000);

        vscode.postMessage({
            command: 'switchBranch',
            branch: branchName
        });
    };

    const handleMergeBranch = (branchName: string) => {
        setIsMergingBranch(true);
        isMergingRef.current = true;
        setMergingBranchName(branchName);
        setMergeResult(null);
        mergeRequestTimestamp.current = Date.now();
        previousLogCount.current = data?.log?.all?.length || 0;

        // 清除之前的超时
        if (mergeTimeoutRef.current) {
            clearTimeout(mergeTimeoutRef.current);
        }

        // 设置超时：如果5秒内没有完成操作，自动重置状态（可能是用户取消了操作）
        mergeTimeoutRef.current = setTimeout(() => {
            if (isMergingRef.current) {
                setIsMergingBranch(false);
                isMergingRef.current = false;
                setMergingBranchName(null);
                mergeRequestTimestamp.current = null;
            }
        }, 5000);

        vscode.postMessage({
            command: 'mergeBranch',
            branch: branchName
        });
    };

    const handleCreateBranch = () => {
        setIsCreatingBranch(true);
        setCreateRequestTimestamp(Date.now());
        setCreationResult(null);
        vscode.postMessage({ command: 'createBranch' });
    };

    useEffect(() => {
        if (!isCreatingBranch || !createRequestTimestamp || !data?.commandHistory) {
            return;
        }

        const matchedEntry = data.commandHistory.find(
            (item: any) =>
                item.command === 'git-assistant.createBranch' &&
                item.timestamp >= createRequestTimestamp
        );

        if (matchedEntry) {
            setIsCreatingBranch(false);
            setCreateRequestTimestamp(null);
            setCreationResult(matchedEntry.success ? 'success' : 'error');
        }
    }, [data?.commandHistory, isCreatingBranch, createRequestTimestamp]);

    useEffect(() => {
        if (!creationResult) {
            return;
        }
        const timer = setTimeout(() => setCreationResult(null), 2500);
        return () => clearTimeout(timer);
    }, [creationResult]);

    // 监听切换分支操作完成
    useEffect(() => {
        if (!isSwitchingBranch || !switchingBranchName || !data?.branches || !switchRequestTimestamp.current) {
            return;
        }

        const currentBranch = data.branches.current;
        const timeSinceRequest = Date.now() - switchRequestTimestamp.current;

        // 检查命令历史，看是否有对应的切换命令记录
        const hasSwitchCommand = data?.commandHistory?.some((item: any) => {
            const commandMatch = item.command === 'git-assistant.switchBranch' ||
                (item.command && item.command.includes('checkout'));
            const timeMatch = item.timestamp && item.timestamp >= switchRequestTimestamp.current!;
            return commandMatch && timeMatch;
        });

        // 如果超过3秒且命令历史中没有对应的切换命令，可能是用户取消了操作
        if (timeSinceRequest > 3000 && !hasSwitchCommand && currentBranch === previousCurrentBranch.current) {
            // 清除超时定时器
            if (switchTimeoutRef.current) {
                clearTimeout(switchTimeoutRef.current);
                switchTimeoutRef.current = null;
            }
            // 重置状态（操作被取消）
            setIsSwitchingBranch(false);
            isSwitchingRef.current = false;
            setSwitchingBranchName(null);
            switchRequestTimestamp.current = null;
            return;
        }

        // 如果当前分支已经改变为目标分支，说明切换成功
        if (currentBranch === switchingBranchName && currentBranch !== previousCurrentBranch.current) {
            // 清除超时定时器
            if (switchTimeoutRef.current) {
                clearTimeout(switchTimeoutRef.current);
                switchTimeoutRef.current = null;
            }
            setIsSwitchingBranch(false);
            isSwitchingRef.current = false;
            setSwitchResult('success');
            setSwitchingBranchName(null);
            switchRequestTimestamp.current = null;
            previousCurrentBranch.current = currentBranch;
        }
    }, [data?.branches?.current, data?.commandHistory, isSwitchingBranch, switchingBranchName]);

    // 清除切换分支结果提示
    useEffect(() => {
        if (!switchResult) {
            return;
        }
        const timer = setTimeout(() => {
            setSwitchResult(null);
        }, 2500);
        return () => clearTimeout(timer);
    }, [switchResult]);

    // 监听合并分支操作完成 - 通过检测数据刷新来判断
    useEffect(() => {
        if (!isMergingBranch || !mergingBranchName || !mergeRequestTimestamp.current) {
            return;
        }

        const currentLogCount = data?.log?.all?.length || 0;
        const currentTimestamp = Date.now();
        const timeSinceRequest = currentTimestamp - mergeRequestTimestamp.current;

        // 检查命令历史，看是否有对应的合并命令记录
        const hasMergeCommand = data?.commandHistory?.some((item: any) => {
            const commandMatch = item.command === 'git-assistant.mergeBranch' ||
                (item.command && item.command.includes('merge'));
            const timeMatch = item.timestamp && item.timestamp >= mergeRequestTimestamp.current!;
            return commandMatch && timeMatch;
        });

        // 如果超过3秒且命令历史中没有对应的合并命令，可能是用户取消了操作
        if (timeSinceRequest > 3000 && !hasMergeCommand) {
            // 清除超时定时器
            if (mergeTimeoutRef.current) {
                clearTimeout(mergeTimeoutRef.current);
                mergeTimeoutRef.current = null;
            }
            // 重置状态（操作被取消）
            setIsMergingBranch(false);
            isMergingRef.current = false;
            setMergingBranchName(null);
            mergeRequestTimestamp.current = null;
            return;
        }

        // 如果数据已经刷新（提交数量增加），认为合并操作完成
        if (timeSinceRequest > 500) {
            // 检查是否有新的提交（合并会产生新的提交）
            if (currentLogCount > previousLogCount.current) {
                // 清除超时定时器
                if (mergeTimeoutRef.current) {
                    clearTimeout(mergeTimeoutRef.current);
                    mergeTimeoutRef.current = null;
                }
                // 合并成功
                setIsMergingBranch(false);
                isMergingRef.current = false;
                setMergeResult('success');
                setMergingBranchName(null);
                mergeRequestTimestamp.current = null;
                previousLogCount.current = currentLogCount;
            } else if (hasMergeCommand) {
                // 有命令记录但没有新提交，可能是快速合并（fast-forward）或失败
                // 检查命令历史中的成功/失败状态
                const mergeCommand = data?.commandHistory?.find((item: any) => {
                    const commandMatch = item.command === 'git-assistant.mergeBranch' ||
                        (item.command && item.command.includes('merge'));
                    const timeMatch = item.timestamp && item.timestamp >= mergeRequestTimestamp.current!;
                    return commandMatch && timeMatch;
                });

                if (mergeCommand && timeSinceRequest > 1500) {
                    // 清除超时定时器
                    if (mergeTimeoutRef.current) {
                        clearTimeout(mergeTimeoutRef.current);
                        mergeTimeoutRef.current = null;
                    }
                    // 根据命令结果设置状态
                    setIsMergingBranch(false);
                    isMergingRef.current = false;
                    setMergeResult(mergeCommand.success ? 'success' : 'error');
                    setMergingBranchName(null);
                    mergeRequestTimestamp.current = null;
                }
            }
        }
    }, [data?.log, data?.commandHistory, isMergingBranch, mergingBranchName]);

    // 清除合并分支结果提示
    useEffect(() => {
        if (!mergeResult) {
            return;
        }
        const timer = setTimeout(() => {
            setMergeResult(null);
        }, 2500);
        return () => clearTimeout(timer);
    }, [mergeResult]);

    // 清理超时定时器
    useEffect(() => {
        return () => {
            if (mergeTimeoutRef.current) {
                clearTimeout(mergeTimeoutRef.current);
            }
            if (switchTimeoutRef.current) {
                clearTimeout(switchTimeoutRef.current);
            }
        };
    }, []);

    // 更新当前分支引用
    useEffect(() => {
        if (data?.branches?.current) {
            previousCurrentBranch.current = data.branches.current;
        }
    }, [data?.branches?.current]);

    if (!data?.branches) {
        return (
            <div className="empty-state">
                <p>🌿 正在加载分支信息...</p>
            </div>
        );
    }

    const localBranches = data.branches.all.filter((b: string) => !b.startsWith('remotes/'));
    const remoteBranches = data.branches.all.filter((b: string) => b.startsWith('remotes/'));
    const currentBranch = data.branches.current;

    return (
        <div className="branch-tree">
            <div className="section-header">
                <h2>分支管理</h2>
                <button
                    className={`primary-button ${isCreatingBranch ? 'loading' : ''}`}
                    onClick={handleCreateBranch}
                    disabled={isCreatingBranch}
                >
                    {isCreatingBranch ? '⏳ 正在创建...' : '➕ 创建新分支'}
                </button>
            </div>

            {((isCreatingBranch || creationResult) || (isSwitchingBranch || switchResult) || (isMergingBranch || mergeResult)) && (
                <div
                    className={`branch-creation-status ${creationResult || switchResult || mergeResult
                        ? (creationResult || switchResult || mergeResult)
                        : 'loading'
                        }`}
                >
                    {isCreatingBranch && (
                        <>
                            <span className="mini-spinner" />
                            <span>正在创建/刷新分支数据...</span>
                        </>
                    )}
                    {!isCreatingBranch && creationResult === 'success' && (
                        <>
                            <span className="status-icon">✅</span>
                            <span>新分支已创建并同步</span>
                        </>
                    )}
                    {!isCreatingBranch && creationResult === 'error' && (
                        <>
                            <span className="status-icon">⚠️</span>
                            <span>创建分支失败，请检查命令反馈</span>
                        </>
                    )}

                    {isSwitchingBranch && (
                        <>
                            <span className="mini-spinner" />
                            <span>正在切换到分支 "{switchingBranchName}"...</span>
                        </>
                    )}
                    {!isSwitchingBranch && switchResult === 'success' && (
                        <>
                            <span className="status-icon">✅</span>
                            <span>已成功切换到分支 "{switchingBranchName}"</span>
                        </>
                    )}

                    {isMergingBranch && (
                        <>
                            <span className="mini-spinner" />
                            <span>正在合并分支 "{mergingBranchName}"...</span>
                        </>
                    )}
                    {!isMergingBranch && mergeResult === 'success' && (
                        <>
                            <span className="status-icon">✅</span>
                            <span>分支 "{mergingBranchName}" 已成功合并</span>
                        </>
                    )}
                </div>
            )}

            <div className="branch-section">
                <h3>📁 本地分支 ({localBranches.length})</h3>
                <div className="branch-list">
                    {localBranches.length > 0 ? (
                        localBranches.map((branch: string) => (
                            <div
                                key={branch}
                                className={`branch-item ${branch === currentBranch ? 'current' : ''} ${branch === selectedBranch ? 'selected' : ''
                                    }`}
                                onClick={() => handleBranchClick(branch)}
                            >
                                <div className="branch-info">
                                    <span className="branch-icon">
                                        {branch === currentBranch ? '✓' : '○'}
                                    </span>
                                    <span className="branch-name">{branch}</span>
                                    {branch === currentBranch && (
                                        <span className="branch-badge">当前</span>
                                    )}
                                </div>
                                {branch !== currentBranch && (
                                    <div className="branch-actions">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSwitchBranch(branch);
                                            }}
                                            title="切换到此分支"
                                        >
                                            🔀
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleMergeBranch(branch);
                                            }}
                                            title="合并此分支"
                                        >
                                            🔗
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="empty-state" style={{ padding: '20px', textAlign: 'center' }}>
                            <p style={{ color: '#888' }}>暂无本地分支</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="branch-section">
                <h3>☁️ 远程分支 ({remoteBranches.length})</h3>
                <div className="branch-list">
                    {remoteBranches.length > 0 ? (
                        remoteBranches.map((branch: string) => (
                            <div
                                key={branch}
                                className="branch-item"
                                onClick={() => handleBranchClick(branch)}
                            >
                                <div className="branch-info">
                                    <span className="branch-icon">☁️</span>
                                    <span className="branch-name">
                                        {branch.replace('remotes/', '')}
                                    </span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="empty-state" style={{ padding: '20px', textAlign: 'center' }}>
                            <p style={{ color: '#888' }}>暂无远程分支</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

