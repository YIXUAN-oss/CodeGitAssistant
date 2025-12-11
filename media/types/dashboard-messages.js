/**
 * 仪表盘 Webview 与扩展之间的消息协议定义（Web 前端侧）
 */
export var DashboardCommand;
(function (DashboardCommand) {
    DashboardCommand["GetData"] = "getData";
    DashboardCommand["Refresh"] = "refresh";
    DashboardCommand["ExecuteCommand"] = "executeCommand";
    DashboardCommand["ClearHistory"] = "clearHistory";
    DashboardCommand["Push"] = "push";
    DashboardCommand["Pull"] = "pull";
    DashboardCommand["CreateBranch"] = "createBranch";
    DashboardCommand["SwitchBranch"] = "switchBranch";
    DashboardCommand["MergeBranch"] = "mergeBranch";
    DashboardCommand["BranchActions"] = "branchActions";
    DashboardCommand["RenameBranch"] = "renameBranch";
    DashboardCommand["DeleteBranch"] = "deleteBranch";
    DashboardCommand["CreateTag"] = "createTag";
    DashboardCommand["DeleteTag"] = "deleteTag";
    DashboardCommand["PushTag"] = "pushTag";
    DashboardCommand["PushAllTags"] = "pushAllTags";
    DashboardCommand["ClearBranchGraphCache"] = "clearBranchGraphCache";
    DashboardCommand["SetGitGraphFilter"] = "setGitGraphFilter";
    DashboardCommand["InitRepository"] = "initRepository";
    DashboardCommand["CloneRepository"] = "cloneRepository";
    DashboardCommand["AddRemote"] = "addRemote";
    DashboardCommand["EditRemote"] = "editRemote";
    DashboardCommand["DeleteRemote"] = "deleteRemote";
    DashboardCommand["ResolveConflict"] = "resolveConflict";
    DashboardCommand["OpenFile"] = "openFile";
    DashboardCommand["OpenFileAtRevision"] = "openFileAtRevision";
    DashboardCommand["OpenCommitDiff"] = "openCommitDiff";
    DashboardCommand["LoadCommitFiles"] = "loadCommitFiles";
    DashboardCommand["CreatePatchFromCommit"] = "createPatchFromCommit";
    DashboardCommand["SaveState"] = "saveState";
    DashboardCommand["CopyToClipboard"] = "copyToClipboard";
    DashboardCommand["OpenRemoteUrl"] = "openRemoteUrl";
    DashboardCommand["ShowCommitContextMenu"] = "showCommitContextMenu";
    DashboardCommand["CheckoutCommit"] = "checkoutCommit";
    DashboardCommand["FetchCommitDetails"] = "fetchCommitDetails";
    DashboardCommand["CreateBranchFromCommit"] = "createBranchFromCommit";
    DashboardCommand["CreateTagFromCommit"] = "createTagFromCommit";
    DashboardCommand["CheckoutBranch"] = "checkoutBranch";
    DashboardCommand["ShowBranchContextMenu"] = "showBranchContextMenu";
})(DashboardCommand || (DashboardCommand = {}));
//# sourceMappingURL=dashboard-messages.js.map