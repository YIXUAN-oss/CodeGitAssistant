"use strict";
/**
 * Implements the Git Graph View's Settings Widget.
 */
var SettingsWidget = /** @class */ (function () {
    /**
     * Construct a new SettingsWidget instance.
     * @param view The Git Graph View that the SettingsWidget is for.
     * @returns The SettingsWidget instance.
     */
    function SettingsWidget(view) {
        var _this = this;
        this.currentRepo = null;
        this.repo = null;
        this.config = null;
        this.loading = false;
        this.scrollTop = 0;
        this.view = view;
        this.widgetElem = document.createElement('div');
        this.widgetElem.id = 'settingsWidget';
        this.widgetElem.innerHTML = '<h2>Repository Settings</h2><div id="settingsContent"></div><div id="settingsLoading"></div><div id="settingsClose"></div>';
        document.body.appendChild(this.widgetElem);
        observeElemScroll('settingsWidget', this.scrollTop, function (scrollTop) {
            _this.scrollTop = scrollTop;
        }, function () {
            if (_this.currentRepo !== null) {
                _this.view.saveState();
            }
        });
        this.contentsElem = document.getElementById('settingsContent');
        this.loadingElem = document.getElementById('settingsLoading');
        var settingsClose = document.getElementById('settingsClose');
        settingsClose.innerHTML = SVG_ICONS.close;
        settingsClose.addEventListener('click', function () { return _this.close(); });
    }
    /**
     * Show the Settings Widget.
     * @param currentRepo The repository that is currently loaded in the view.
     * @param isInitialLoad Is this the initial load of the Setting Widget, or is it being shown when restoring a previous state.
     * @param scrollTop The scrollTop the Settings Widget should initially be set to.
     */
    SettingsWidget.prototype.show = function (currentRepo, isInitialLoad, scrollTop) {
        if (isInitialLoad === void 0) { isInitialLoad = true; }
        if (scrollTop === void 0) { scrollTop = 0; }
        if (this.currentRepo !== null)
            return;
        this.currentRepo = currentRepo;
        this.scrollTop = scrollTop;
        alterClass(this.widgetElem, CLASS_TRANSITION, isInitialLoad);
        this.widgetElem.classList.add(CLASS_ACTIVE);
        this.view.saveState();
        this.refresh();
        if (isInitialLoad) {
            this.view.requestLoadConfig();
        }
    };
    /**
     * Refresh the Settings Widget after an action affecting it's content has completed.
     */
    SettingsWidget.prototype.refresh = function () {
        if (this.currentRepo === null)
            return;
        this.repo = this.view.getRepoState(this.currentRepo);
        this.config = this.view.getRepoConfig();
        this.loading = this.view.isConfigLoading();
        this.render();
    };
    /**
     * Close the Settings Widget, sliding it up out of view.
     */
    SettingsWidget.prototype.close = function () {
        if (this.currentRepo === null)
            return;
        this.currentRepo = null;
        this.repo = null;
        this.config = null;
        this.loading = false;
        this.widgetElem.classList.add(CLASS_TRANSITION);
        this.widgetElem.classList.remove(CLASS_ACTIVE);
        this.widgetElem.classList.remove(CLASS_LOADING);
        this.contentsElem.innerHTML = '';
        this.loadingElem.innerHTML = '';
        this.view.saveState();
    };
    /* State */
    /**
     * Get the current state of the Settings Widget.
     */
    SettingsWidget.prototype.getState = function () {
        return {
            currentRepo: this.currentRepo,
            scrollTop: this.scrollTop
        };
    };
    /**
     * Restore the Settings Widget to an existing state.
     * @param state The previous Settings Widget state.
     */
    SettingsWidget.prototype.restoreState = function (state) {
        if (state.currentRepo === null)
            return;
        this.show(state.currentRepo, false, state.scrollTop);
    };
    /**
     * Is the Settings Widget currently visible.
     * @returns TRUE => The Settings Widget is visible, FALSE => The Settings Widget is not visible
     */
    SettingsWidget.prototype.isVisible = function () {
        return this.currentRepo !== null;
    };
    /* Render Methods */
    /**
     * Render the Settings Widget.
     */
    SettingsWidget.prototype.render = function () {
        var _this = this;
        var _a, _b, _c, _d;
        if (this.currentRepo !== null && this.repo !== null) {
            var escapedRepoName = escapeHtml(this.repo.name || getRepoName(this.currentRepo));
            var initialBranchesLocallyConfigured = this.repo.onRepoLoadShowCheckedOutBranch !== GG.BooleanOverride.Default || this.repo.onRepoLoadShowSpecificBranches !== null;
            var initialBranches_1 = [];
            if (getOnRepoLoadShowCheckedOutBranch(this.repo.onRepoLoadShowCheckedOutBranch)) {
                initialBranches_1.push('Checked Out');
            }
            var branchOptions_1 = this.view.getBranchOptions();
            getOnRepoLoadShowSpecificBranches(this.repo.onRepoLoadShowSpecificBranches).forEach(function (branch) {
                var option = branchOptions_1.find(function (option) { return option.value === branch; });
                if (option) {
                    initialBranches_1.push(option.name);
                }
            });
            var initialBranchesStr = initialBranches_1.length > 0
                ? escapeHtml(formatCommaSeparatedList(initialBranches_1))
                : 'Show All';
            var html_1 = '<div class="settingsSection general"><h3>General</h3>' +
                '<table>' +
                '<tr class="lineAbove"><td class="left">Name:</td><td class="leftWithEllipsis" title="' + escapedRepoName + (this.repo.name === null ? ' (Default Name from the File System)' : '') + '">' + escapedRepoName + '</td><td class="btns right"><div id="editRepoName" title="Edit Name' + ELLIPSIS + '">' + SVG_ICONS.pencil + '</div>' + (this.repo.name !== null ? ' <div id="deleteRepoName" title="Delete Name' + ELLIPSIS + '">' + SVG_ICONS.close + '</div>' : '') + '</td></tr>' +
                '<tr class="lineAbove lineBelow"><td class="left">Initial Branches:</td><td class="leftWithEllipsis" title="' + initialBranchesStr + ' (' + (initialBranchesLocallyConfigured ? 'Local' : 'Global') + ')">' + initialBranchesStr + '</td><td class="btns right"><div id="editInitialBranches" title="Edit Initial Branches' + ELLIPSIS + '">' + SVG_ICONS.pencil + '</div>' + (initialBranchesLocallyConfigured ? ' <div id="clearInitialBranches" title="Clear Initial Branches' + ELLIPSIS + '">' + SVG_ICONS.close + '</div>' : '') + '</td></tr>' +
                '</table>' +
                '<label id="settingsShowStashes"><input type="checkbox" id="settingsShowStashesCheckbox" tabindex="-1"><span class="customCheckbox"></span>Show Stashes</label><br/>' +
                '<label id="settingsShowTags"><input type="checkbox" id="settingsShowTagsCheckbox" tabindex="-1"><span class="customCheckbox"></span>Show Tags</label><br/>' +
                '<label id="settingsIncludeCommitsMentionedByReflogs"><input type="checkbox" id="settingsIncludeCommitsMentionedByReflogsCheckbox" tabindex="-1"><span class="customCheckbox"></span>Include commits only mentioned by reflogs</label><span class="settingsWidgetInfo" title="Only applies when showing all branches.">' + SVG_ICONS.info + '</span><br/>' +
                '<label id="settingsOnlyFollowFirstParent"><input type="checkbox" id="settingsOnlyFollowFirstParentCheckbox" tabindex="-1"><span class="customCheckbox"></span>Only follow the first parent of commits</label><span class="settingsWidgetInfo" title="Instead of following all parents of commits, only follow the first parent when discovering the commits to load.">' + SVG_ICONS.info + '</span>' +
                '</div>';
            var userNameSet = false, userEmailSet = false;
            if (this.config !== null) {
                html_1 += '<div class="settingsSection centered"><h3>User Details</h3>';
                var userName = this.config.user.name, userEmail = this.config.user.email;
                userNameSet = userName.local !== null || userName.global !== null;
                userEmailSet = userEmail.local !== null || userEmail.global !== null;
                if (userNameSet || userEmailSet) {
                    var escapedUserName = escapeHtml((_b = (_a = userName.local) !== null && _a !== void 0 ? _a : userName.global) !== null && _b !== void 0 ? _b : 'Not Set');
                    var escapedUserEmail = escapeHtml((_d = (_c = userEmail.local) !== null && _c !== void 0 ? _c : userEmail.global) !== null && _d !== void 0 ? _d : 'Not Set');
                    html_1 += '<table>' +
                        '<tr><td class="left">User Name:</td><td class="leftWithEllipsis" title="' + escapedUserName + (userNameSet ? ' (' + (userName.local !== null ? 'Local' : 'Global') + ')' : '') + '">' + escapedUserName + '</td></tr>' +
                        '<tr><td class="left">User Email:</td><td class="leftWithEllipsis" title="' + escapedUserEmail + (userEmailSet ? ' (' + (userEmail.local !== null ? 'Local' : 'Global') + ')' : '') + '">' + escapedUserEmail + '</td></tr>' +
                        '</table>' +
                        '<div class="settingsSectionButtons"><div id="editUserDetails" class="editBtn">' + SVG_ICONS.pencil + 'Edit</div><div id="removeUserDetails" class="removeBtn">' + SVG_ICONS.close + 'Remove</div></div>';
                }
                else {
                    html_1 += '<span>User Details (such as name and email) are used by Git to record the Author and Committer of commit objects.</span>' +
                        '<div class="settingsSectionButtons"><div id="editUserDetails" class="addBtn">' + SVG_ICONS.plus + 'Add User Details</div></div>';
                }
                html_1 += '</div>';
                html_1 += '<div class="settingsSection"><h3>Remote Configuration</h3><table><tr><th>Remote</th><th>URL</th><th>Type</th><th>Action</th></tr>';
                if (this.config.remotes.length > 0) {
                    var hideRemotes_1 = this.repo.hideRemotes;
                    this.config.remotes.forEach(function (remote, i) {
                        var hidden = hideRemotes_1.includes(remote.name);
                        var fetchUrl = escapeHtml(remote.url || 'Not Set'), pushUrl = escapeHtml(remote.pushUrl || remote.url || 'Not Set');
                        html_1 += '<tr class="lineAbove">' +
                            '<td class="left" rowspan="2"><span class="hideRemoteBtn" data-index="' + i + '" title="Click to ' + (hidden ? 'show' : 'hide') + ' branches of this remote.">' + (hidden ? SVG_ICONS.eyeClosed : SVG_ICONS.eyeOpen) + '</span>' + escapeHtml(remote.name) + '</td>' +
                            '<td class="leftWithEllipsis" title="Fetch URL: ' + fetchUrl + '">' + fetchUrl + '</td><td>Fetch</td>' +
                            '<td class="btns remoteBtns" rowspan="2" data-index="' + i + '"><div class="fetchRemote" title="Fetch from Remote' + ELLIPSIS + '">' + SVG_ICONS.download + '</div> <div class="pruneRemote" title="Prune Remote' + ELLIPSIS + '">' + SVG_ICONS.branch + '</div><br><div class="editRemote" title="Edit Remote' + ELLIPSIS + '">' + SVG_ICONS.pencil + '</div> <div class="deleteRemote" title="Delete Remote' + ELLIPSIS + '">' + SVG_ICONS.close + '</div></td>' +
                            '</tr><tr><td class="leftWithEllipsis" title="Push URL: ' + pushUrl + '">' + pushUrl + '</td><td>Push</td></tr>';
                    });
                }
                else {
                    html_1 += '<tr class="lineAbove"><td colspan="4">There are no remotes configured for this repository.</td></tr>';
                }
                html_1 += '</table><div class="settingsSectionButtons lineAbove"><div id="settingsAddRemote" class="addBtn">' + SVG_ICONS.plus + 'Add Remote</div></div></div>';
            }
            html_1 += '<div class="settingsSection centered"><h3>Issue Linking</h3>';
            var issueLinkingConfig = this.repo.issueLinkingConfig || globalState.issueLinkingConfig;
            if (issueLinkingConfig !== null) {
                var escapedIssue = escapeHtml(issueLinkingConfig.issue), escapedUrl = escapeHtml(issueLinkingConfig.url);
                html_1 += '<table><tr><td class="left">Issue Regex:</td><td class="leftWithEllipsis" title="' + escapedIssue + '">' + escapedIssue + '</td></tr><tr><td class="left">Issue URL:</td><td class="leftWithEllipsis" title="' + escapedUrl + '">' + escapedUrl + '</td></tr></table>' +
                    '<div class="settingsSectionButtons"><div id="editIssueLinking" class="editBtn">' + SVG_ICONS.pencil + 'Edit</div><div id="removeIssueLinking" class="removeBtn">' + SVG_ICONS.close + 'Remove</div></div>';
            }
            else {
                html_1 += '<span>Issue Linking converts issue numbers in commit &amp; tag messages into hyperlinks, that open the issue in your issue tracking system. If a branch\'s name contains an issue number, the issue can be viewed via the branch\'s context menu.</span>' +
                    '<div class="settingsSectionButtons"><div id="editIssueLinking" class="addBtn">' + SVG_ICONS.plus + 'Add Issue Linking</div></div>';
            }
            html_1 += '</div>';
            if (this.config !== null) {
                html_1 += '<div class="settingsSection centered"><h3>Pull Request Creation</h3>';
                var pullRequestConfig = this.repo.pullRequestConfig;
                if (pullRequestConfig !== null) {
                    var provider = escapeHtml((pullRequestConfig.provider === GG.PullRequestProvider.Bitbucket
                        ? 'Bitbucket'
                        : pullRequestConfig.provider === GG.PullRequestProvider.Custom
                            ? pullRequestConfig.custom.name
                            : pullRequestConfig.provider === GG.PullRequestProvider.GitHub
                                ? 'GitHub'
                                : 'GitLab') + ' (' + pullRequestConfig.hostRootUrl + ')');
                    var source = escapeHtml(pullRequestConfig.sourceOwner + '/' + pullRequestConfig.sourceRepo + ' (' + pullRequestConfig.sourceRemote + ')');
                    var destination = escapeHtml(pullRequestConfig.destOwner + '/' + pullRequestConfig.destRepo + (pullRequestConfig.destRemote !== null ? ' (' + pullRequestConfig.destRemote + ')' : ''));
                    var destinationBranch = escapeHtml(pullRequestConfig.destBranch);
                    html_1 += '<table><tr><td class="left">Provider:</td><td class="leftWithEllipsis" title="' + provider + '">' + provider + '</td></tr>' +
                        '<tr><td class="left">Source Repo:</td><td class="leftWithEllipsis" title="' + source + '">' + source + '</td></tr>' +
                        '<tr><td class="left">Destination Repo:</td><td class="leftWithEllipsis" title="' + destination + '">' + destination + '</td></tr>' +
                        '<tr><td class="left">Destination Branch:</td><td class="leftWithEllipsis" title="' + destinationBranch + '">' + destinationBranch + '</td></tr></table>' +
                        '<div class="settingsSectionButtons"><div id="editPullRequestIntegration" class="editBtn">' + SVG_ICONS.pencil + 'Edit</div><div id="removePullRequestIntegration" class="removeBtn">' + SVG_ICONS.close + 'Remove</div></div>';
                }
                else {
                    html_1 += '<span>Pull Request Creation automates the opening and pre-filling of a Pull Request form, directly from a branch\'s context menu.</span>' +
                        '<div class="settingsSectionButtons"><div id="editPullRequestIntegration" class="addBtn">' + SVG_ICONS.plus + 'Configure "Pull Request Creation" Integration</div></div>';
                }
                html_1 += '</div>';
            }
            html_1 += '<div class="settingsSection"><h3>Git Graph Configuration</h3><div class="settingsSectionButtons">' +
                '<div id="openExtensionSettings">' + SVG_ICONS.gear + 'Open Git Graph Extension Settings</div><br/>' +
                '<div id="exportRepositoryConfig">' + SVG_ICONS.package + 'Export Repository Configuration</div>' +
                '</div></div>';
            this.contentsElem.innerHTML = html_1;
            document.getElementById('editRepoName').addEventListener('click', function () {
                if (_this.currentRepo === null || _this.repo === null)
                    return;
                dialog.showForm('Specify a Name for this Repository:', [
                    { type: 0 /* DialogInputType.Text */, name: 'Name', default: _this.repo.name || '', placeholder: getRepoName(_this.currentRepo) }
                ], 'Save Name', function (values) {
                    if (_this.currentRepo === null)
                        return;
                    _this.view.saveRepoStateValue(_this.currentRepo, 'name', values[0] || null);
                    _this.view.renderRepoDropdownOptions();
                    _this.render();
                }, null);
            });
            if (this.repo.name !== null) {
                document.getElementById('deleteRepoName').addEventListener('click', function () {
                    if (_this.currentRepo === null || _this.repo === null || _this.repo.name === null)
                        return;
                    dialog.showConfirmation('Are you sure you want to delete the manually configured name <b><i>' + escapeHtml(_this.repo.name) + '</i></b> for this repository, and use the default name from the File System <b><i>' + escapeHtml(getRepoName(_this.currentRepo)) + '</i></b>?', 'Yes, delete', function () {
                        if (_this.currentRepo === null)
                            return;
                        _this.view.saveRepoStateValue(_this.currentRepo, 'name', null);
                        _this.view.renderRepoDropdownOptions();
                        _this.render();
                    }, null);
                });
            }
            document.getElementById('editInitialBranches').addEventListener('click', function () {
                if (_this.repo === null)
                    return;
                var showCheckedOutBranch = getOnRepoLoadShowCheckedOutBranch(_this.repo.onRepoLoadShowCheckedOutBranch);
                var showSpecificBranches = getOnRepoLoadShowSpecificBranches(_this.repo.onRepoLoadShowSpecificBranches);
                dialog.showForm('<b>Configure Initial Branches</b><p style="margin:6px 0;">Configure the branches that are initially shown when this repository is loaded in the Git Graph View.</p><p style="font-size:12px; margin:6px 0 0 0;">Note: When "Checked Out Branch" is Disabled, and no "Specific Branches" are selected, all branches will be shown.</p>', [
                    { type: 4 /* DialogInputType.Checkbox */, name: 'Checked Out Branch', value: showCheckedOutBranch },
                    { type: 2 /* DialogInputType.Select */, name: 'Specific Branches', options: _this.view.getBranchOptions(), defaults: showSpecificBranches, multiple: true }
                ], 'Save Configuration', function (values) {
                    if (_this.currentRepo === null)
                        return;
                    if (showCheckedOutBranch !== values[0] || !arraysStrictlyEqualIgnoringOrder(showSpecificBranches, values[1])) {
                        _this.view.saveRepoStateValue(_this.currentRepo, 'onRepoLoadShowCheckedOutBranch', values[0] ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
                        _this.view.saveRepoStateValue(_this.currentRepo, 'onRepoLoadShowSpecificBranches', values[1]);
                        _this.render();
                    }
                }, null, 'Cancel', null, false);
            });
            if (initialBranchesLocallyConfigured) {
                document.getElementById('clearInitialBranches').addEventListener('click', function () {
                    dialog.showConfirmation('Are you sure you want to clear the branches that are initially shown when this repository is loaded in the Git Graph View?', 'Yes, clear', function () {
                        if (_this.currentRepo === null)
                            return;
                        _this.view.saveRepoStateValue(_this.currentRepo, 'onRepoLoadShowCheckedOutBranch', GG.BooleanOverride.Default);
                        _this.view.saveRepoStateValue(_this.currentRepo, 'onRepoLoadShowSpecificBranches', null);
                        _this.render();
                    }, null);
                });
            }
            var showStashesElem = document.getElementById('settingsShowStashesCheckbox');
            showStashesElem.checked = getShowStashes(this.repo.showStashes);
            showStashesElem.addEventListener('change', function () {
                if (_this.currentRepo === null)
                    return;
                var elem = document.getElementById('settingsShowStashesCheckbox');
                if (elem === null)
                    return;
                _this.view.saveRepoStateValue(_this.currentRepo, 'showStashes', elem.checked ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
                _this.view.refresh(true);
            });
            var showTagsElem = document.getElementById('settingsShowTagsCheckbox');
            showTagsElem.checked = getShowTags(this.repo.showTags);
            showTagsElem.addEventListener('change', function () {
                if (_this.currentRepo === null)
                    return;
                var elem = document.getElementById('settingsShowTagsCheckbox');
                if (elem === null)
                    return;
                _this.view.saveRepoStateValue(_this.currentRepo, 'showTags', elem.checked ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
                _this.view.refresh(true);
            });
            var includeCommitsMentionedByReflogsElem = document.getElementById('settingsIncludeCommitsMentionedByReflogsCheckbox');
            includeCommitsMentionedByReflogsElem.checked = getIncludeCommitsMentionedByReflogs(this.repo.includeCommitsMentionedByReflogs);
            includeCommitsMentionedByReflogsElem.addEventListener('change', function () {
                if (_this.currentRepo === null)
                    return;
                var elem = document.getElementById('settingsIncludeCommitsMentionedByReflogsCheckbox');
                if (elem === null)
                    return;
                _this.view.saveRepoStateValue(_this.currentRepo, 'includeCommitsMentionedByReflogs', elem.checked ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
                _this.view.refresh(true);
            });
            var settingsOnlyFollowFirstParentElem = document.getElementById('settingsOnlyFollowFirstParentCheckbox');
            settingsOnlyFollowFirstParentElem.checked = getOnlyFollowFirstParent(this.repo.onlyFollowFirstParent);
            settingsOnlyFollowFirstParentElem.addEventListener('change', function () {
                if (_this.currentRepo === null)
                    return;
                var elem = document.getElementById('settingsOnlyFollowFirstParentCheckbox');
                if (elem === null)
                    return;
                _this.view.saveRepoStateValue(_this.currentRepo, 'onlyFollowFirstParent', elem.checked ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
                _this.view.refresh(true);
            });
            if (this.config !== null) {
                document.getElementById('editUserDetails').addEventListener('click', function () {
                    var _a, _b, _c, _d;
                    if (_this.config === null)
                        return;
                    var userName = _this.config.user.name, userEmail = _this.config.user.email;
                    dialog.showForm('Set the user name and email used by Git to record the Author and Committer of commit objects:', [
                        { type: 0 /* DialogInputType.Text */, name: 'User Name', default: (_b = (_a = userName.local) !== null && _a !== void 0 ? _a : userName.global) !== null && _b !== void 0 ? _b : '', placeholder: null },
                        { type: 0 /* DialogInputType.Text */, name: 'User Email', default: (_d = (_c = userEmail.local) !== null && _c !== void 0 ? _c : userEmail.global) !== null && _d !== void 0 ? _d : '', placeholder: null },
                        { type: 4 /* DialogInputType.Checkbox */, name: 'Use Globally', value: userName.local === null && userEmail.local === null, info: 'Use the "User Name" and "User Email" globally for all Git repositories (it can be overridden per repository).' }
                    ], 'Set User Details', function (values) {
                        if (_this.currentRepo === null)
                            return;
                        var useGlobally = values[2];
                        runAction({
                            command: 'editUserDetails',
                            repo: _this.currentRepo,
                            name: values[0],
                            email: values[1],
                            location: useGlobally ? GG.GitConfigLocation.Global : GG.GitConfigLocation.Local,
                            deleteLocalName: useGlobally && userName.local !== null,
                            deleteLocalEmail: useGlobally && userEmail.local !== null
                        }, 'Setting User Details');
                    }, null);
                });
                if (userNameSet || userEmailSet) {
                    document.getElementById('removeUserDetails').addEventListener('click', function () {
                        if (_this.config === null)
                            return;
                        var userName = _this.config.user.name, userEmail = _this.config.user.email;
                        var isGlobal = userName.local === null && userEmail.local === null;
                        dialog.showConfirmation('Are you sure you want to remove the <b>' + (isGlobal ? 'globally' : 'locally') + ' configured</b> user name and email, which are used by Git to record the Author and Committer of commit objects?', 'Yes, remove', function () {
                            if (_this.currentRepo === null)
                                return;
                            runAction({
                                command: 'deleteUserDetails',
                                repo: _this.currentRepo,
                                name: (isGlobal ? userName.global : userName.local) !== null,
                                email: (isGlobal ? userEmail.global : userEmail.local) !== null,
                                location: isGlobal ? GG.GitConfigLocation.Global : GG.GitConfigLocation.Local
                            }, 'Removing User Details');
                        }, null);
                    });
                }
                var pushUrlPlaceholder_1 = 'Leave blank to use the Fetch URL';
                document.getElementById('settingsAddRemote').addEventListener('click', function () {
                    dialog.showForm('Add a new remote to this repository:', [
                        { type: 0 /* DialogInputType.Text */, name: 'Name', default: '', placeholder: null },
                        { type: 0 /* DialogInputType.Text */, name: 'Fetch URL', default: '', placeholder: null },
                        { type: 0 /* DialogInputType.Text */, name: 'Push URL', default: '', placeholder: pushUrlPlaceholder_1 },
                        { type: 4 /* DialogInputType.Checkbox */, name: 'Fetch Immediately', value: true }
                    ], 'Add Remote', function (values) {
                        if (_this.currentRepo === null)
                            return;
                        runAction({ command: 'addRemote', repo: _this.currentRepo, name: values[0], url: values[1], pushUrl: values[2] !== '' ? values[2] : null, fetch: values[3] }, 'Adding Remote');
                    }, { type: TargetType.Repo });
                });
                addListenerToClass('editRemote', 'click', function (e) {
                    var remote = _this.getRemoteForBtnEvent(e);
                    if (remote === null)
                        return;
                    dialog.showForm('Edit the remote <b><i>' + escapeHtml(remote.name) + '</i></b>:', [
                        { type: 0 /* DialogInputType.Text */, name: 'Name', default: remote.name, placeholder: null },
                        { type: 0 /* DialogInputType.Text */, name: 'Fetch URL', default: remote.url !== null ? remote.url : '', placeholder: null },
                        { type: 0 /* DialogInputType.Text */, name: 'Push URL', default: remote.pushUrl !== null ? remote.pushUrl : '', placeholder: pushUrlPlaceholder_1 }
                    ], 'Save Changes', function (values) {
                        if (_this.currentRepo === null)
                            return;
                        runAction({ command: 'editRemote', repo: _this.currentRepo, nameOld: remote.name, nameNew: values[0], urlOld: remote.url, urlNew: values[1] !== '' ? values[1] : null, pushUrlOld: remote.pushUrl, pushUrlNew: values[2] !== '' ? values[2] : null }, 'Saving Changes to Remote');
                    }, { type: TargetType.Repo });
                });
                addListenerToClass('deleteRemote', 'click', function (e) {
                    var remote = _this.getRemoteForBtnEvent(e);
                    if (remote === null)
                        return;
                    dialog.showConfirmation('Are you sure you want to delete the remote <b><i>' + escapeHtml(remote.name) + '</i></b>?', 'Yes, delete', function () {
                        if (_this.currentRepo === null)
                            return;
                        runAction({ command: 'deleteRemote', repo: _this.currentRepo, name: remote.name }, 'Deleting Remote');
                    }, { type: TargetType.Repo });
                });
                addListenerToClass('fetchRemote', 'click', function (e) {
                    var remote = _this.getRemoteForBtnEvent(e);
                    if (remote === null)
                        return;
                    dialog.showForm('Are you sure you want to fetch from the remote <b><i>' + escapeHtml(remote.name) + '</i></b>?', [
                        { type: 4 /* DialogInputType.Checkbox */, name: 'Prune', value: initialState.config.dialogDefaults.fetchRemote.prune, info: 'Before fetching, remove any remote-tracking references that no longer exist on the remote.' },
                        { type: 4 /* DialogInputType.Checkbox */, name: 'Prune Tags', value: initialState.config.dialogDefaults.fetchRemote.pruneTags, info: 'Before fetching, remove any local tags that no longer exist on the remote. Requires Git >= 2.17.0, and "Prune" to be enabled.' }
                    ], 'Yes, fetch', function (values) {
                        if (_this.currentRepo === null)
                            return;
                        runAction({ command: 'fetch', repo: _this.currentRepo, name: remote.name, prune: values[0], pruneTags: values[1] }, 'Fetching from Remote');
                    }, { type: TargetType.Repo });
                });
                addListenerToClass('pruneRemote', 'click', function (e) {
                    var remote = _this.getRemoteForBtnEvent(e);
                    if (remote === null)
                        return;
                    dialog.showConfirmation('Are you sure you want to prune remote-tracking references that no longer exist on the remote <b><i>' + escapeHtml(remote.name) + '</i></b>?', 'Yes, prune', function () {
                        if (_this.currentRepo === null)
                            return;
                        runAction({ command: 'pruneRemote', repo: _this.currentRepo, name: remote.name }, 'Pruning Remote');
                    }, { type: TargetType.Repo });
                });
                addListenerToClass('hideRemoteBtn', 'click', function (e) {
                    if (_this.currentRepo === null || _this.repo === null || _this.config === null)
                        return;
                    var source = e.target.closest('.hideRemoteBtn');
                    var remote = _this.config.remotes[parseInt(source.dataset.index)].name;
                    var hideRemote = !_this.repo.hideRemotes.includes(remote);
                    source.title = 'Click to ' + (hideRemote ? 'show' : 'hide') + ' branches of this remote.';
                    source.innerHTML = hideRemote ? SVG_ICONS.eyeClosed : SVG_ICONS.eyeOpen;
                    if (hideRemote) {
                        _this.repo.hideRemotes.push(remote);
                    }
                    else {
                        _this.repo.hideRemotes.splice(_this.repo.hideRemotes.indexOf(remote), 1);
                    }
                    _this.view.saveRepoStateValue(_this.currentRepo, 'hideRemotes', _this.repo.hideRemotes);
                    _this.view.refresh(true);
                });
            }
            document.getElementById('editIssueLinking').addEventListener('click', function () {
                if (_this.repo === null)
                    return;
                var issueLinkingConfig = _this.repo.issueLinkingConfig || globalState.issueLinkingConfig;
                if (issueLinkingConfig !== null) {
                    _this.showIssueLinkingDialog(issueLinkingConfig.issue, issueLinkingConfig.url, _this.repo.issueLinkingConfig === null && globalState.issueLinkingConfig !== null, true);
                }
                else {
                    _this.showIssueLinkingDialog(null, null, false, false);
                }
            });
            if (this.repo.issueLinkingConfig !== null || globalState.issueLinkingConfig !== null) {
                document.getElementById('removeIssueLinking').addEventListener('click', function () {
                    if (_this.repo === null)
                        return;
                    var locallyConfigured = _this.repo.issueLinkingConfig !== null;
                    dialog.showConfirmation('Are you sure you want to remove ' + (locallyConfigured ? (globalState.issueLinkingConfig !== null ? 'the <b>locally configured</b> ' : '') + 'Issue Linking from this repository' : 'the <b>globally configured</b> Issue Linking in Git Graph') + '?', 'Yes, remove', function () {
                        _this.setIssueLinkingConfig(null, !locallyConfigured);
                    }, null);
                });
            }
            if (this.config !== null) {
                document.getElementById('editPullRequestIntegration').addEventListener('click', function () {
                    if (_this.repo === null || _this.config === null)
                        return;
                    if (_this.config.remotes.length === 0) {
                        dialog.showError('Unable to configure the "Pull Request Creation" Integration', 'The repository must have at least one remote to configure the "Pull Request Creation" Integration. There are no remotes in the current repository.', null, null);
                        return;
                    }
                    var config;
                    if (_this.repo.pullRequestConfig === null) {
                        var originIndex = _this.config.remotes.findIndex(function (remote) { return remote.name === 'origin'; });
                        var sourceRemoteUrl = _this.config.remotes[originIndex > -1 ? originIndex : 0].url;
                        var provider = void 0;
                        if (sourceRemoteUrl !== null) {
                            if (sourceRemoteUrl.match(/^(https?:\/\/|git@)[^/]*github/) !== null) {
                                provider = GG.PullRequestProvider.GitHub;
                            }
                            else if (sourceRemoteUrl.match(/^(https?:\/\/|git@)[^/]*gitlab/) !== null) {
                                provider = GG.PullRequestProvider.GitLab;
                            }
                            else {
                                provider = GG.PullRequestProvider.Bitbucket;
                            }
                        }
                        else {
                            provider = GG.PullRequestProvider.Bitbucket;
                        }
                        config = {
                            provider: provider, hostRootUrl: '',
                            sourceRemote: '', sourceOwner: '', sourceRepo: '',
                            destRemote: '', destOwner: '', destRepo: '', destProjectId: '', destBranch: '',
                            custom: null
                        };
                    }
                    else {
                        config = Object.assign({}, _this.repo.pullRequestConfig);
                    }
                    _this.showCreatePullRequestIntegrationDialog1(config);
                });
                if (this.repo.pullRequestConfig !== null) {
                    document.getElementById('removePullRequestIntegration').addEventListener('click', function () {
                        dialog.showConfirmation('Are you sure you want to remove the configured "Pull Request Creation" Integration?', 'Yes, remove', function () {
                            _this.setPullRequestConfig(null);
                        }, null);
                    });
                }
            }
            document.getElementById('openExtensionSettings').addEventListener('click', function () {
                sendMessage({ command: 'openExtensionSettings' });
            });
            document.getElementById('exportRepositoryConfig').addEventListener('click', function () {
                dialog.showConfirmation('Exporting the Git Graph Repository Configuration will generate a file that can be committed in this repository. It allows others working in this repository to use the same configuration.', 'Yes, export', function () {
                    if (_this.currentRepo === null)
                        return;
                    runAction({ command: 'exportRepoConfig', repo: _this.currentRepo }, 'Exporting Repository Configuration');
                }, null);
            });
        }
        alterClass(this.widgetElem, CLASS_LOADING, this.loading);
        this.loadingElem.innerHTML = this.loading ? '<span>' + SVG_ICONS.loading + 'Loading ...</span>' : '';
        this.widgetElem.scrollTop = this.scrollTop;
        this.loadingElem.style.top = (this.scrollTop + (this.widgetElem.clientHeight / 2) - 12) + 'px';
    };
    /* Private Helper Methods */
    /**
     * Save the issue linking configuration for this repository, and refresh the view so these changes are taken into affect.
     * @param config The issue linking configuration to save.
     * @param global Should this configuration be set globally for all repositories, or locally for this specific repository.
     */
    SettingsWidget.prototype.setIssueLinkingConfig = function (config, global) {
        if (this.currentRepo === null || this.repo === null)
            return;
        if (global) {
            if (this.repo.issueLinkingConfig !== null) {
                this.view.saveRepoStateValue(this.currentRepo, 'issueLinkingConfig', null);
            }
            updateGlobalViewState('issueLinkingConfig', config);
        }
        else {
            this.view.saveRepoStateValue(this.currentRepo, 'issueLinkingConfig', config);
        }
        this.view.refresh(true);
        this.render();
    };
    /**
     * Save the pull request configuration for this repository.
     * @param config The pull request configuration to save.
     */
    SettingsWidget.prototype.setPullRequestConfig = function (config) {
        if (this.currentRepo === null)
            return;
        this.view.saveRepoStateValue(this.currentRepo, 'pullRequestConfig', config);
        this.render();
    };
    /**
     * Show the dialog allowing the user to configure the issue linking for this repository.
     * @param defaultIssueRegex The default regular expression used to match issue numbers.
     * @param defaultIssueUrl The default URL for the issue number to be substituted into.
     * @param defaultUseGlobally The default value for the checkbox determining whether the issue linking configuration should be used globally (for all repositories).
     * @param isEdit Is the dialog editing an existing issue linking configuration.
     */
    SettingsWidget.prototype.showIssueLinkingDialog = function (defaultIssueRegex, defaultIssueUrl, defaultUseGlobally, isEdit) {
        var _this = this;
        var html = '<b>' + (isEdit ? 'Edit Issue Linking for' : 'Add Issue Linking to') + ' this Repository</b>';
        html += '<p style="font-size:12px; margin:6px 0;">The following example links <b>#123</b> in commit messages to <b>https://github.com/mhutchie/repo/issues/123</b>:</p>';
        html += '<table style="display:inline-table; width:360px; text-align:left; font-size:12px; margin-bottom:2px;"><tr><td>Issue Regex:</td><td>#(\\d+)</td></tr><tr><td>Issue URL:</td><td>https://github.com/mhutchie/repo/issues/$1</td></tr></tbody></table>';
        if (!isEdit && defaultIssueRegex === null && defaultIssueUrl === null) {
            defaultIssueRegex = SettingsWidget.autoDetectIssueRegex(this.view.getCommits());
            if (defaultIssueRegex !== null) {
                html += '<p style="font-size:12px"><i>The prefilled Issue Regex was detected in commit messages in this repository. Review and/or correct it if necessary.</i></p>';
            }
        }
        dialog.showForm(html, [
            { type: 0 /* DialogInputType.Text */, name: 'Issue Regex', default: defaultIssueRegex !== null ? defaultIssueRegex : '', placeholder: null, info: 'A regular expression that matches your issue numbers, with one or more capturing groups ( ) that will be substituted into the "Issue URL".' },
            { type: 0 /* DialogInputType.Text */, name: 'Issue URL', default: defaultIssueUrl !== null ? defaultIssueUrl : '', placeholder: null, info: 'The issue\'s URL in your issue tracking system, with placeholders ($1, $2, etc.) for the groups captured ( ) in the "Issue Regex".' },
            { type: 4 /* DialogInputType.Checkbox */, name: 'Use Globally', value: defaultUseGlobally, info: 'Use the "Issue Regex" and "Issue URL" for all repositories by default (it can be overridden per repository). Note: "Use Globally" is only suitable if identical Issue Linking applies to the majority of your repositories (e.g. when using JIRA or Pivotal Tracker).' }
        ], 'Save', function (values) {
            var issueRegex = values[0].trim(), issueUrl = values[1].trim(), useGlobally = values[2];
            var regExpParseError = null;
            try {
                if (issueRegex.indexOf('(') === -1 || issueRegex.indexOf(')') === -1) {
                    regExpParseError = 'The regular expression does not contain a capturing group ( ).';
                }
                else if (new RegExp(issueRegex, 'gu')) {
                    regExpParseError = null;
                }
            }
            catch (e) {
                regExpParseError = e.message;
            }
            if (regExpParseError !== null) {
                dialog.showError('Invalid Issue Regex', regExpParseError, 'Go Back', function () {
                    _this.showIssueLinkingDialog(issueRegex, issueUrl, useGlobally, isEdit);
                });
            }
            else if (!(/\$([1-9][0-9]*)/.test(issueUrl))) {
                dialog.showError('Invalid Issue URL', 'The Issue URL does not contain any placeholders ($1, $2, etc.) for the issue number components captured in the Issue Regex.', 'Go Back', function () {
                    _this.showIssueLinkingDialog(issueRegex, issueUrl, useGlobally, isEdit);
                });
            }
            else {
                _this.setIssueLinkingConfig({ issue: issueRegex, url: issueUrl }, useGlobally);
            }
        }, null, 'Cancel', null, false);
    };
    /**
     * Show the first dialog for configuring the pull request integration.
     * @param config The pull request configuration.
     */
    SettingsWidget.prototype.showCreatePullRequestIntegrationDialog1 = function (config) {
        var _this = this;
        if (this.config === null)
            return;
        var originIndex = this.config.remotes.findIndex(function (remote) { return remote.name === 'origin'; });
        var upstreamIndex = this.config.remotes.findIndex(function (remote) { return remote.name === 'upstream'; });
        var sourceRemoteIndex = this.config.remotes.findIndex(function (remote) { return remote.name === config.sourceRemote; });
        var destRemoteIndex = this.config.remotes.findIndex(function (remote) { return remote.name === config.destRemote; });
        if (config.sourceRemote === '' || sourceRemoteIndex === -1) {
            sourceRemoteIndex = originIndex > -1 ? originIndex : 0;
        }
        if (config.destRemote === '') {
            destRemoteIndex = upstreamIndex > -1 ? upstreamIndex : originIndex > -1 ? originIndex : 0;
        }
        var defaultProvider = config.provider.toString();
        var providerOptions = [
            { name: 'Bitbucket', value: (GG.PullRequestProvider.Bitbucket).toString() },
            { name: 'GitHub', value: (GG.PullRequestProvider.GitHub).toString() },
            { name: 'GitLab', value: (GG.PullRequestProvider.GitLab).toString() }
        ];
        var providerTemplateLookup = {};
        initialState.config.customPullRequestProviders.forEach(function (provider) {
            providerOptions.push({ name: provider.name, value: (providerOptions.length + 1).toString() });
            providerTemplateLookup[provider.name] = provider.templateUrl;
        });
        if (config.provider === GG.PullRequestProvider.Custom) {
            if (!providerOptions.some(function (provider) { return provider.name === config.custom.name; })) {
                // The existing custom Pull Request provider no longer exists, so add it.
                providerOptions.push({ name: config.custom.name, value: (providerOptions.length + 1).toString() });
                providerTemplateLookup[config.custom.name] = config.custom.templateUrl;
            }
            defaultProvider = providerOptions.find(function (provider) { return provider.name === config.custom.name; }).value;
        }
        providerOptions.sort(function (a, b) { return a.name.localeCompare(b.name); });
        var sourceRemoteOptions = this.config.remotes.map(function (remote, index) { return ({ name: remote.name, value: index.toString() }); });
        var destRemoteOptions = sourceRemoteOptions.map(function (option) { return option; });
        destRemoteOptions.push({ name: 'Not a remote', value: '-1' });
        dialog.showForm('Configure "Pull Request Creation" Integration (Step&nbsp;1/2)', [
            {
                type: 2 /* DialogInputType.Select */, name: 'Provider',
                options: providerOptions, default: defaultProvider,
                info: 'In addition to the built-in publicly hosted Pull Request providers, custom providers can be configured using the Extension Setting "git-graph.customPullRequestProviders" (e.g. for use with privately hosted Pull Request providers).'
            },
            {
                type: 2 /* DialogInputType.Select */, name: 'Source Remote',
                options: sourceRemoteOptions, default: sourceRemoteIndex.toString(),
                info: 'The remote that corresponds to the source of the Pull Request.'
            },
            {
                type: 2 /* DialogInputType.Select */, name: 'Destination Remote',
                options: destRemoteOptions, default: destRemoteIndex.toString(),
                info: 'The remote that corresponds to the destination / target of the Pull Request.'
            }
        ], 'Next', function (values) {
            if (_this.config === null)
                return;
            var newProvider = parseInt(values[0]);
            if (newProvider > 3)
                newProvider = GG.PullRequestProvider.Custom;
            var newSourceRemoteIndex = parseInt(values[1]);
            var newDestRemoteIndex = parseInt(values[2]);
            var newSourceRemote = _this.config.remotes[newSourceRemoteIndex].name;
            var newDestRemote = newDestRemoteIndex > -1 ? _this.config.remotes[newDestRemoteIndex].name : null;
            var newSourceUrl = _this.config.remotes[newSourceRemoteIndex].url;
            var newDestUrl = newDestRemoteIndex > -1 ? _this.config.remotes[newDestRemoteIndex].url : null;
            if (config.hostRootUrl === '' || config.provider !== newProvider) {
                var remoteUrlForHost = newSourceUrl !== null ? newSourceUrl : newDestUrl;
                if (remoteUrlForHost !== null) {
                    var match = remoteUrlForHost.match(/^(https?:\/\/|git@)((?=[^/]+@)[^@]+@|(?![^/]+@))([^/:]+)/);
                    config.hostRootUrl = match !== null ? 'https://' + match[3] : '';
                }
                else {
                    config.hostRootUrl = '';
                }
            }
            if (newProvider === GG.PullRequestProvider.Custom) {
                var customProviderName = providerOptions.find(function (provider) { return provider.value === values[0]; }).name;
                config.custom = { name: customProviderName, templateUrl: providerTemplateLookup[customProviderName] };
            }
            else {
                config.custom = null;
            }
            config.provider = newProvider;
            if (config.sourceRemote !== newSourceRemote) {
                config.sourceRemote = newSourceRemote;
                var match = newSourceUrl !== null ? newSourceUrl.match(/^(https?:\/\/|git@)[^/:]+[/:]([^/]+)\/([^/]*?)(.git|)$/) : null;
                config.sourceOwner = match !== null ? match[2] : '';
                config.sourceRepo = match !== null ? match[3] : '';
            }
            if (config.provider !== GG.PullRequestProvider.GitLab || config.destRemote !== newDestRemote) {
                config.destProjectId = '';
            }
            if (config.destRemote !== newDestRemote) {
                config.destRemote = newDestRemote;
                if (newDestRemote !== null) {
                    var match = newDestUrl !== null ? newDestUrl.match(/^(https?:\/\/|git@)[^/:]+[/:]([^/]+)\/([^/]*?)(.git|)$/) : null;
                    config.destOwner = match !== null ? match[2] : '';
                    config.destRepo = match !== null ? match[3] : '';
                    var branches = _this.view.getBranches()
                        .filter(function (branch) { return branch.startsWith('remotes/' + newDestRemote + '/') && branch !== ('remotes/' + newDestRemote + '/HEAD'); })
                        .map(function (branch) { return branch.substring(newDestRemote.length + 9); });
                    config.destBranch = branches.length > 0 ? branches.includes('master') ? 'master' : branches[0] : '';
                }
                else {
                    config.destOwner = '';
                    config.destRepo = '';
                    config.destBranch = '';
                }
            }
            _this.showCreatePullRequestIntegrationDialog2(config);
        }, { type: TargetType.Repo });
    };
    /**
     * Show the second dialog for configuring the pull request integration.
     * @param config The pull request configuration.
     */
    SettingsWidget.prototype.showCreatePullRequestIntegrationDialog2 = function (config) {
        var _this = this;
        if (this.config === null)
            return;
        var destBranches = config.destRemote !== null
            ? this.view.getBranches()
                .filter(function (branch) { return branch.startsWith('remotes/' + config.destRemote + '/') && branch !== ('remotes/' + config.destRemote + '/HEAD'); })
                .map(function (branch) { return branch.substring(config.destRemote.length + 9); })
            : [];
        var destBranchInfo = 'The name of the branch that is the destination / target of the Pull Request.';
        var updateConfigWithFormValues = function (values) {
            var hostRootUri = values[0];
            config.hostRootUrl = hostRootUri.endsWith('/') ? hostRootUri.substring(0, hostRootUri.length - 1) : hostRootUri;
            config.sourceOwner = values[1];
            config.sourceRepo = values[2];
            config.destOwner = values[3];
            config.destRepo = values[4];
            config.destProjectId = config.provider === GG.PullRequestProvider.GitLab ? values[5] : '';
            var destBranch = values[config.provider === GG.PullRequestProvider.GitLab ? 6 : 5];
            config.destBranch = config.destRemote === null || destBranches.length === 0
                ? destBranch
                : destBranches[parseInt(destBranch)];
        };
        var inputs = [
            { type: 0 /* DialogInputType.Text */, name: 'Host Root URL', default: config.hostRootUrl, placeholder: null, info: 'The Pull Request provider\'s Host Root URL (e.g. https://github.com).' },
            { type: 0 /* DialogInputType.Text */, name: 'Source Owner', default: config.sourceOwner, placeholder: null, info: 'The owner of the repository that is the source of the Pull Request.' },
            { type: 0 /* DialogInputType.Text */, name: 'Source Repo', default: config.sourceRepo, placeholder: null, info: 'The name of the repository that is the source of the Pull Request.' },
            { type: 0 /* DialogInputType.Text */, name: 'Destination Owner', default: config.destOwner, placeholder: null, info: 'The owner of the repository that is the destination / target of the Pull Request.' },
            { type: 0 /* DialogInputType.Text */, name: 'Destination Repo', default: config.destRepo, placeholder: null, info: 'The name of the repository that is the destination / target of the Pull Request.' }
        ];
        if (config.provider === GG.PullRequestProvider.GitLab) {
            inputs.push({ type: 0 /* DialogInputType.Text */, name: 'Destination Project ID', default: config.destProjectId, placeholder: null, info: 'The GitLab Project ID of the destination / target of the Pull Request. Leave this field blank to use the default destination / target configured in GitLab.' });
        }
        inputs.push(config.destRemote === null || destBranches.length === 0
            ? { type: 0 /* DialogInputType.Text */, name: 'Destination Branch', default: config.destBranch, placeholder: null, info: destBranchInfo }
            : {
                type: 2 /* DialogInputType.Select */,
                name: 'Destination Branch',
                options: destBranches.map(function (branch, index) { return ({ name: branch, value: index.toString() }); }),
                default: destBranches.includes(config.destBranch) ? destBranches.indexOf(config.destBranch).toString() : '0',
                info: destBranchInfo
            });
        dialog.showForm('Configure "Pull Request Creation" Integration (Step&nbsp;2/2)', inputs, 'Save Configuration', function (values) {
            updateConfigWithFormValues(values);
            _this.setPullRequestConfig(config);
        }, { type: TargetType.Repo }, 'Back', function (values) {
            updateConfigWithFormValues(values);
            _this.showCreatePullRequestIntegrationDialog1(config);
        });
    };
    /**
     * Get the remote details corresponding to a mouse event.
     * @param e The mouse event.
     * @returns The details of the remote.
     */
    SettingsWidget.prototype.getRemoteForBtnEvent = function (e) {
        return this.config !== null
            ? this.config.remotes[parseInt(e.target.closest('.remoteBtns').dataset.index)]
            : null;
    };
    /**
     * Automatically detect common issue number formats in the specified commits, returning the most common.
     * @param commits The commits to analyse.
     * @returns The regular expression of the most likely issue number format.
     */
    SettingsWidget.autoDetectIssueRegex = function (commits) {
        var patterns = ['#(\\d+)', '^(\\d+)\\.(?=\\s|$)', '^(\\d+):(?=\\s|$)', '([A-Za-z]+-\\d+)'].map(function (pattern) {
            var regexp = new RegExp(pattern);
            return {
                pattern: pattern,
                matches: commits.filter(function (commit) { return regexp.test(commit.message); }).length
            };
        }).sort(function (a, b) { return b.matches - a.matches; });
        if (patterns[0].matches > 0.1 * commits.length) {
            // If the most common pattern was matched in more than 10% of commits, return the pattern
            return patterns[0].pattern;
        }
        return null;
    };
    return SettingsWidget;
}());
//# sourceMappingURL=settingsWidget.js.map