"use strict";
var CLASS_FIND_CURRENT_COMMIT = 'findCurrentCommit';
var CLASS_FIND_MATCH = 'findMatch';
/**
 * Implements the Git Graph View's Find Widget.
 */
var FindWidget = /** @class */ (function () {
    /**
     * Construct a new FindWidget instance.
     * @param view The Git Graph View that the FindWidget is for.
     * @returns The FindWidget instance.
     */
    function FindWidget(view) {
        var _this = this;
        this.text = '';
        this.matches = [];
        this.position = -1;
        this.visible = false;
        this.view = view;
        this.widgetElem = document.createElement('div');
        this.widgetElem.className = 'findWidget';
        this.widgetElem.innerHTML = '<input id="findInput" type="text" placeholder="Find" disabled/><span id="findCaseSensitive" class="findModifier" title="Match Case">Aa</span><span id="findRegex" class="findModifier" title="Use Regular Expression">.*</span><span id="findPosition"></span><span id="findPrev" title="Previous match (Shift+Enter)"></span><span id="findNext" title="Next match (Enter)"></span><span id="findOpenCdv" title="Open the Commit Details View for the current match"></span><span id="findClose" title="Close (Escape)"></span>';
        document.body.appendChild(this.widgetElem);
        this.inputElem = document.getElementById('findInput');
        var keyupTimeout = null;
        this.inputElem.addEventListener('keyup', function (e) {
            if ((e.keyCode ? e.keyCode === 13 : e.key === 'Enter') && _this.text !== '') {
                if (e.shiftKey) {
                    _this.prev();
                }
                else {
                    _this.next();
                }
                handledEvent(e);
            }
            else {
                if (keyupTimeout !== null)
                    clearTimeout(keyupTimeout);
                keyupTimeout = setTimeout(function () {
                    keyupTimeout = null;
                    if (_this.text !== _this.inputElem.value) {
                        _this.text = _this.inputElem.value;
                        _this.clearMatches();
                        _this.findMatches(_this.getCurrentHash(), true);
                        _this.openCommitDetailsViewForCurrentMatchIfEnabled();
                    }
                }, 200);
            }
        });
        this.caseSensitiveElem = document.getElementById('findCaseSensitive');
        alterClass(this.caseSensitiveElem, CLASS_ACTIVE, workspaceState.findIsCaseSensitive);
        this.caseSensitiveElem.addEventListener('click', function () {
            updateWorkspaceViewState('findIsCaseSensitive', !workspaceState.findIsCaseSensitive);
            alterClass(_this.caseSensitiveElem, CLASS_ACTIVE, workspaceState.findIsCaseSensitive);
            _this.clearMatches();
            _this.findMatches(_this.getCurrentHash(), true);
            _this.openCommitDetailsViewForCurrentMatchIfEnabled();
        });
        this.regexElem = document.getElementById('findRegex');
        alterClass(this.regexElem, CLASS_ACTIVE, workspaceState.findIsRegex);
        this.regexElem.addEventListener('click', function () {
            updateWorkspaceViewState('findIsRegex', !workspaceState.findIsRegex);
            alterClass(_this.regexElem, CLASS_ACTIVE, workspaceState.findIsRegex);
            _this.clearMatches();
            _this.findMatches(_this.getCurrentHash(), true);
            _this.openCommitDetailsViewForCurrentMatchIfEnabled();
        });
        this.positionElem = document.getElementById('findPosition');
        this.prevElem = document.getElementById('findPrev');
        this.prevElem.classList.add(CLASS_DISABLED);
        this.prevElem.innerHTML = SVG_ICONS.arrowUp;
        this.prevElem.addEventListener('click', function () { return _this.prev(); });
        this.nextElem = document.getElementById('findNext');
        this.nextElem.classList.add(CLASS_DISABLED);
        this.nextElem.innerHTML = SVG_ICONS.arrowDown;
        this.nextElem.addEventListener('click', function () { return _this.next(); });
        var openCdvElem = document.getElementById('findOpenCdv');
        openCdvElem.innerHTML = SVG_ICONS.cdv;
        alterClass(openCdvElem, CLASS_ACTIVE, workspaceState.findOpenCommitDetailsView);
        openCdvElem.addEventListener('click', function () {
            updateWorkspaceViewState('findOpenCommitDetailsView', !workspaceState.findOpenCommitDetailsView);
            alterClass(openCdvElem, CLASS_ACTIVE, workspaceState.findOpenCommitDetailsView);
            _this.openCommitDetailsViewForCurrentMatchIfEnabled();
        });
        var findCloseElem = document.getElementById('findClose');
        findCloseElem.innerHTML = SVG_ICONS.close;
        findCloseElem.addEventListener('click', function () { return _this.close(); });
    }
    /**
     * Show the Find Widget.
     * @param transition Should the Find Widget animate when becoming visible (sliding down).
     */
    FindWidget.prototype.show = function (transition) {
        if (!this.visible) {
            this.visible = true;
            this.inputElem.value = this.text;
            this.inputElem.disabled = false;
            this.updatePosition(-1, false);
            alterClass(this.widgetElem, CLASS_TRANSITION, transition);
            this.widgetElem.classList.add(CLASS_ACTIVE);
        }
        this.inputElem.focus();
    };
    /**
     * Close the Find Widget, sliding it up out of view.
     */
    FindWidget.prototype.close = function () {
        if (!this.visible)
            return;
        this.visible = false;
        this.widgetElem.classList.add(CLASS_TRANSITION);
        this.widgetElem.classList.remove(CLASS_ACTIVE);
        this.clearMatches();
        this.text = '';
        this.matches = [];
        this.position = -1;
        this.inputElem.value = this.text;
        this.inputElem.disabled = true;
        this.widgetElem.removeAttribute(ATTR_ERROR);
        this.prevElem.classList.add(CLASS_DISABLED);
        this.nextElem.classList.add(CLASS_DISABLED);
        this.view.saveState();
    };
    /**
     * Refresh the Find Widget's state / matches after the commits have changed.
     */
    FindWidget.prototype.refresh = function () {
        if (this.visible) {
            this.findMatches(this.getCurrentHash(), false);
        }
    };
    /**
     * Set the colours used to indicate the find matches.
     * @param colour The base colour for the find matches.
     */
    FindWidget.prototype.setColour = function (colour) {
        document.body.style.setProperty('--git-graph-findMatch', colour);
        document.body.style.setProperty('--git-graph-findMatchCommit', modifyColourOpacity(colour, 0.5));
    };
    /* State */
    /**
     * Get the current state of the Find Widget.
     */
    FindWidget.prototype.getState = function () {
        return {
            text: this.text,
            currentHash: this.getCurrentHash(),
            visible: this.visible
        };
    };
    /**
     * Get the commit hash of the current find match.
     * @returns The commit hash, or NULL if no commit is currently matched.
     */
    FindWidget.prototype.getCurrentHash = function () {
        return this.position > -1 ? this.matches[this.position].hash : null;
    };
    /**
     * Restore the Find Widget to an existing state.
     * @param state The previous Find Widget state.
     */
    FindWidget.prototype.restoreState = function (state) {
        if (!state.visible)
            return;
        this.text = state.text;
        this.show(false);
        if (this.text !== '')
            this.findMatches(state.currentHash, false);
    };
    /**
     * Is the Find Widget currently visible.
     * @returns TRUE => The Find Widget is visible, FALSE => The Find Widget is not visible
     */
    FindWidget.prototype.isVisible = function () {
        return this.visible;
    };
    /* Matching */
    /**
     * Find all matches based on the user's criteria.
     * @param goToCommitHash If this commit hash matches the criteria, directly go to this commit instead of starting at the first match.
     * @param scrollToCommit Should the resultant find match be scrolled to (so it's visible in the view).
     */
    FindWidget.prototype.findMatches = function (goToCommitHash, scrollToCommit) {
        this.matches = [];
        this.position = -1;
        if (this.text !== '') {
            var colVisibility = this.view.getColumnVisibility(), findPattern_1, findGlobalPattern = void 0;
            var regexText = workspaceState.findIsRegex ? this.text : this.text.replace(/[\\\[\](){}|.*+?^$]/g, '\\$&'), flags = 'u' + (workspaceState.findIsCaseSensitive ? '' : 'i');
            try {
                findPattern_1 = new RegExp(regexText, flags);
                findGlobalPattern = new RegExp(regexText, 'g' + flags);
                this.widgetElem.removeAttribute(ATTR_ERROR);
            }
            catch (e) {
                findPattern_1 = null;
                findGlobalPattern = null;
                this.widgetElem.setAttribute(ATTR_ERROR, e.message);
            }
            if (findPattern_1 !== null && findGlobalPattern !== null) {
                var commitElems = getCommitElems(), j = 0, commit = void 0, zeroLengthMatch = false;
                // Search the commit data itself to detect commits that match, so that dom tree traversal is performed on matching commit rows (for performance)
                var commits = this.view.getCommits();
                for (var i = 0; i < commits.length; i++) {
                    commit = commits[i];
                    var branchLabels = getBranchLabels(commit.heads, commit.remotes);
                    if (commit.hash !== UNCOMMITTED && ((colVisibility.author && findPattern_1.test(commit.author))
                        || (colVisibility.commit && (commit.hash.search(findPattern_1) === 0 || findPattern_1.test(abbrevCommit(commit.hash))))
                        || findPattern_1.test(commit.message)
                        || branchLabels.heads.some(function (head) { return findPattern_1.test(head.name) || head.remotes.some(function (remote) { return findPattern_1.test(remote); }); })
                        || branchLabels.remotes.some(function (remote) { return findPattern_1.test(remote.name); })
                        || commit.tags.some(function (tag) { return findPattern_1.test(tag.name); })
                        || (colVisibility.date && findPattern_1.test(formatShortDate(commit.date).formatted))
                        || (commit.stash !== null && findPattern_1.test(commit.stash.selector)))) {
                        var idStr = i.toString();
                        while (j < commitElems.length && commitElems[j].dataset.id !== idStr)
                            j++;
                        if (j === commitElems.length)
                            continue;
                        this.matches.push({ hash: commit.hash, elem: commitElems[j] });
                        // Highlight matches
                        var textElems = getChildNodesWithTextContent(commitElems[j]), textElem = void 0;
                        for (var k = 0; k < textElems.length; k++) {
                            textElem = textElems[k];
                            var matchStart = 0, matchEnd = 0, text = textElem.textContent, match = void 0;
                            findGlobalPattern.lastIndex = 0;
                            while (match = findGlobalPattern.exec(text)) {
                                if (match[0].length === 0) {
                                    zeroLengthMatch = true;
                                    break;
                                }
                                if (matchEnd !== match.index) {
                                    // This match isn't immediately after the previous match, or isn't at the beginning of the text
                                    if (matchStart !== matchEnd) {
                                        // There was a previous match, insert it in a text node
                                        textElem.parentNode.insertBefore(FindWidget.createMatchElem(text.substring(matchStart, matchEnd)), textElem);
                                    }
                                    // Insert a text node containing the text between the last match and the current match
                                    textElem.parentNode.insertBefore(document.createTextNode(text.substring(matchEnd, match.index)), textElem);
                                    matchStart = match.index;
                                }
                                matchEnd = findGlobalPattern.lastIndex;
                            }
                            if (matchEnd > 0) {
                                // There were one or more matches
                                if (matchStart !== matchEnd) {
                                    // There was a match, insert it in a text node
                                    textElem.parentNode.insertBefore(FindWidget.createMatchElem(text.substring(matchStart, matchEnd)), textElem);
                                }
                                if (matchEnd !== text.length) {
                                    // There was some text after last match, update the textElem (the last node of it's parent) to contain the remaining text.
                                    textElem.textContent = text.substring(matchEnd);
                                }
                                else {
                                    // The last match was at the end of the text, the textElem is no longer required, so delete it
                                    textElem.parentNode.removeChild(textElem);
                                }
                            }
                            if (zeroLengthMatch)
                                break;
                        }
                        if (colVisibility.commit && commit.hash.search(findPattern_1) === 0 && !findPattern_1.test(abbrevCommit(commit.hash)) && textElems.length > 0) {
                            // The commit matches on more than the abbreviated commit, so the commit should be highlighted
                            var commitNode = textElems[textElems.length - 1]; // Commit is always the last column if it is visible
                            commitNode.parentNode.replaceChild(FindWidget.createMatchElem(commitNode.textContent), commitNode);
                        }
                        if (zeroLengthMatch)
                            break;
                    }
                }
                if (zeroLengthMatch) {
                    this.widgetElem.setAttribute(ATTR_ERROR, 'Cannot use a regular expression which has zero length matches');
                    this.clearMatches();
                    this.matches = [];
                }
            }
        }
        else {
            this.widgetElem.removeAttribute(ATTR_ERROR);
        }
        alterClass(this.prevElem, CLASS_DISABLED, this.matches.length === 0);
        alterClass(this.nextElem, CLASS_DISABLED, this.matches.length === 0);
        var newPos = -1;
        if (this.matches.length > 0) {
            newPos = 0;
            if (goToCommitHash !== null) {
                var pos = this.matches.findIndex(function (match) { return match.hash === goToCommitHash; });
                if (pos > -1)
                    newPos = pos;
            }
        }
        this.updatePosition(newPos, scrollToCommit);
    };
    /**
     * Clear all of the highlighted find matches in the view.
     */
    FindWidget.prototype.clearMatches = function () {
        for (var i = 0; i < this.matches.length; i++) {
            if (i === this.position)
                this.matches[i].elem.classList.remove(CLASS_FIND_CURRENT_COMMIT);
            var matchElems = getChildrenWithClassName(this.matches[i].elem, CLASS_FIND_MATCH), matchElem = void 0;
            for (var j = 0; j < matchElems.length; j++) {
                matchElem = matchElems[j];
                var text = matchElem.childNodes[0].textContent;
                // Combine current text with the text from previous sibling text nodes
                var node = matchElem.previousSibling, elem = matchElem.previousElementSibling;
                while (node !== null && node !== elem && node.textContent !== null) {
                    text = node.textContent + text;
                    matchElem.parentNode.removeChild(node);
                    node = matchElem.previousSibling;
                }
                // Combine current text with the text from next sibling text nodes
                node = matchElem.nextSibling;
                elem = matchElem.nextElementSibling;
                while (node !== null && node !== elem && node.textContent !== null) {
                    text = text + node.textContent;
                    matchElem.parentNode.removeChild(node);
                    node = matchElem.nextSibling;
                }
                matchElem.parentNode.replaceChild(document.createTextNode(text), matchElem);
            }
        }
    };
    /**
     * Update the user's position in the set of find matches.
     * @param position The new position index within the find matches.
     * @param scrollToCommit After updating the user's position in the set of find matches, should the current match be scrolled to (so it's visible in the view).
     */
    FindWidget.prototype.updatePosition = function (position, scrollToCommit) {
        if (this.position > -1)
            this.matches[this.position].elem.classList.remove(CLASS_FIND_CURRENT_COMMIT);
        this.position = position;
        if (this.position > -1) {
            this.matches[this.position].elem.classList.add(CLASS_FIND_CURRENT_COMMIT);
            if (scrollToCommit)
                this.view.scrollToCommit(this.matches[position].hash, false);
        }
        this.positionElem.innerHTML = this.matches.length > 0 ? (this.position + 1) + ' of ' + this.matches.length : 'No Results';
        this.view.saveState();
    };
    /**
     * Move the user's position to the previous match in the set of find matches.
     */
    FindWidget.prototype.prev = function () {
        if (this.matches.length === 0)
            return;
        this.updatePosition(this.position > 0 ? this.position - 1 : this.matches.length - 1, true);
        this.openCommitDetailsViewForCurrentMatchIfEnabled();
    };
    /**
     * Move the user's position to the next match in the set of find matches.
     */
    FindWidget.prototype.next = function () {
        if (this.matches.length === 0)
            return;
        this.updatePosition(this.position < this.matches.length - 1 ? this.position + 1 : 0, true);
        this.openCommitDetailsViewForCurrentMatchIfEnabled();
    };
    /**
     * If the Find Widget is configured to open the Commit Details View for the current find match, load the Commit Details View accordingly.
     */
    FindWidget.prototype.openCommitDetailsViewForCurrentMatchIfEnabled = function () {
        if (workspaceState.findOpenCommitDetailsView) {
            var commitHash = this.getCurrentHash();
            if (commitHash !== null && !this.view.isCdvOpen(commitHash, null)) {
                var commitElem = findCommitElemWithId(getCommitElems(), this.view.getCommitId(commitHash));
                if (commitElem !== null) {
                    this.view.loadCommitDetails(commitElem);
                }
            }
        }
    };
    /**
     * Create a find match element containing the specified text.
     * @param text The text content of the find match.
     * @returns The HTML element for the find match.
     */
    FindWidget.createMatchElem = function (text) {
        var span = document.createElement('span');
        span.className = CLASS_FIND_MATCH;
        span.innerHTML = text;
        return span;
    };
    return FindWidget;
}());
//# sourceMappingURL=findWidget.js.map