import * as vscode from 'vscode';

export interface MergeHistoryItem {
    id: string;
    from: string;
    to: string;
    commit: string;
    type: 'three-way' | 'fast-forward';
    timestamp: number;
    description?: string;
}

/**
 * 合并历史记录，用于补充无法从 git 日志直接推断的快进合并关系
 */
export class MergeHistory {
    private static readonly STORAGE_KEY = 'git-assistant.mergeHistory';
    private static readonly MAX_HISTORY = 100;
    private static context: vscode.ExtensionContext | null = null;
    private static history: MergeHistoryItem[] = [];

    static initialize(context: vscode.ExtensionContext) {
        this.context = context;
        const stored = context.globalState.get<MergeHistoryItem[]>(this.STORAGE_KEY);
        if (stored) {
            this.history = stored;
        }
    }

    static recordMerge(item: Omit<MergeHistoryItem, 'id' | 'timestamp'>) {
        const entry: MergeHistoryItem = {
            ...item,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now()
        };

        this.history.unshift(entry);
        if (this.history.length > this.MAX_HISTORY) {
            this.history = this.history.slice(0, this.MAX_HISTORY);
        }
        this.save();
    }

    static getHistory(): MergeHistoryItem[] {
        return [...this.history];
    }

    private static async save() {
        if (this.context) {
            await this.context.globalState.update(this.STORAGE_KEY, this.history);
        }
    }
}


