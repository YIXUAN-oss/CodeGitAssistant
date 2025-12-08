/**
 * 从 vscode-git-graph-develop 迁移的查找组件
 */
import { SVG_ICONS, alterClass, handledEvent, getCommitElems, getChildNodesWithTextContent, getChildrenWithClassName, modifyColourOpacity, formatShortDate, abbrevCommit, getBranchLabels, ATTR_ERROR, CLASS_ACTIVE, CLASS_DISABLED, CLASS_TRANSITION, UNCOMMITTED } from '../utils/vscode-git-utils.js';
const CLASS_FIND_CURRENT_COMMIT = 'findCurrentCommit';
const CLASS_FIND_MATCH = 'findMatch';
// Placeholder for workspaceState - should be provided by application
const getWorkspaceState = () => {
    if (typeof window.workspaceState !== 'undefined') {
        return window.workspaceState;
    }
    return {
        findIsCaseSensitive: false,
        findIsRegex: false,
        findOpenCommitDetailsView: false
    };
};
const updateWorkspaceViewState = (key, value) => {
    if (typeof window.updateWorkspaceViewState === 'function') {
        window.updateWorkspaceViewState(key, value);
    }
};
// Helper functions - these should be implemented or imported
// Note: formatShortDate, abbrevCommit, and getBranchLabels are now imported from vscode-git-utils
function findCommitElemWithId(commitElems, index) {
    for (let i = 0; i < commitElems.length; i++) {
        if (commitElems[i].dataset.id === index.toString()) {
            return commitElems[i];
        }
    }
    return null;
}
/**
 * Implements the Git Graph View's Find Widget.
 */
export class FindWidget {
    /**
     * Construct a new FindWidget instance.
     * @param view The Git Graph View that the FindWidget is for.
     * @returns The FindWidget instance.
     */
    constructor(view) {
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
        let keyupTimeout = null;
        this.inputElem.addEventListener('keyup', (e) => {
            if ((e.keyCode ? e.keyCode === 13 : e.key === 'Enter') && this.text !== '') {
                if (e.shiftKey) {
                    this.prev();
                }
                else {
                    this.next();
                }
                handledEvent(e);
            }
            else {
                if (keyupTimeout !== null)
                    clearTimeout(keyupTimeout);
                keyupTimeout = setTimeout(() => {
                    keyupTimeout = null;
                    if (this.text !== this.inputElem.value) {
                        this.text = this.inputElem.value;
                        this.clearMatches();
                        this.findMatches(this.getCurrentHash(), true);
                        this.openCommitDetailsViewForCurrentMatchIfEnabled();
                    }
                }, 200);
            }
        });
        this.caseSensitiveElem = document.getElementById('findCaseSensitive');
        const workspaceState = getWorkspaceState();
        alterClass(this.caseSensitiveElem, CLASS_ACTIVE, workspaceState.findIsCaseSensitive);
        this.caseSensitiveElem.addEventListener('click', () => {
            const wsState = getWorkspaceState();
            updateWorkspaceViewState('findIsCaseSensitive', !wsState.findIsCaseSensitive);
            alterClass(this.caseSensitiveElem, CLASS_ACTIVE, !wsState.findIsCaseSensitive);
            this.clearMatches();
            this.findMatches(this.getCurrentHash(), true);
            this.openCommitDetailsViewForCurrentMatchIfEnabled();
        });
        this.regexElem = document.getElementById('findRegex');
        const wsState = getWorkspaceState();
        alterClass(this.regexElem, CLASS_ACTIVE, wsState.findIsRegex);
        this.regexElem.addEventListener('click', () => {
            const currentState = getWorkspaceState();
            updateWorkspaceViewState('findIsRegex', !currentState.findIsRegex);
            alterClass(this.regexElem, CLASS_ACTIVE, !currentState.findIsRegex);
            this.clearMatches();
            this.findMatches(this.getCurrentHash(), true);
            this.openCommitDetailsViewForCurrentMatchIfEnabled();
        });
        this.positionElem = document.getElementById('findPosition');
        this.prevElem = document.getElementById('findPrev');
        this.prevElem.classList.add(CLASS_DISABLED);
        this.prevElem.innerHTML = SVG_ICONS.arrowUp;
        this.prevElem.addEventListener('click', () => this.prev());
        this.nextElem = document.getElementById('findNext');
        this.nextElem.classList.add(CLASS_DISABLED);
        this.nextElem.innerHTML = SVG_ICONS.arrowDown;
        this.nextElem.addEventListener('click', () => this.next());
        const openCdvElem = document.getElementById('findOpenCdv');
        openCdvElem.innerHTML = SVG_ICONS.cdv;
        const wsState2 = getWorkspaceState();
        alterClass(openCdvElem, CLASS_ACTIVE, wsState2.findOpenCommitDetailsView);
        openCdvElem.addEventListener('click', () => {
            const currentState = getWorkspaceState();
            updateWorkspaceViewState('findOpenCommitDetailsView', !currentState.findOpenCommitDetailsView);
            alterClass(openCdvElem, CLASS_ACTIVE, !currentState.findOpenCommitDetailsView);
            this.openCommitDetailsViewForCurrentMatchIfEnabled();
        });
        const findCloseElem = document.getElementById('findClose');
        findCloseElem.innerHTML = SVG_ICONS.close;
        findCloseElem.addEventListener('click', () => this.close());
    }
    /**
     * Show the Find Widget.
     * @param transition Should the Find Widget animate when becoming visible (sliding down).
     */
    show(transition) {
        if (!this.visible) {
            this.visible = true;
            this.inputElem.value = this.text;
            this.inputElem.disabled = false;
            this.updatePosition(-1, false);
            alterClass(this.widgetElem, CLASS_TRANSITION, transition);
            this.widgetElem.classList.add(CLASS_ACTIVE);
        }
        this.inputElem.focus();
    }
    /**
     * Close the Find Widget, sliding it up out of view.
     */
    close() {
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
    }
    /**
     * Refresh the Find Widget's state / matches after the commits have changed.
     */
    refresh() {
        if (this.visible) {
            this.findMatches(this.getCurrentHash(), false);
        }
    }
    /**
     * Set the colours used to indicate the find matches.
     * @param colour The base colour for the find matches.
     */
    setColour(colour) {
        document.body.style.setProperty('--git-graph-findMatch', colour);
        document.body.style.setProperty('--git-graph-findMatchCommit', modifyColourOpacity(colour, 0.5));
    }
    /* State */
    /**
     * Get the current state of the Find Widget.
     */
    getState() {
        return {
            text: this.text,
            currentHash: this.getCurrentHash(),
            visible: this.visible
        };
    }
    /**
     * Get the commit hash of the current find match.
     * @returns The commit hash, or NULL if no commit is currently matched.
     */
    getCurrentHash() {
        return this.position > -1 ? this.matches[this.position].hash : null;
    }
    /**
     * Restore the Find Widget to an existing state.
     * @param state The previous Find Widget state.
     */
    restoreState(state) {
        if (!state.visible)
            return;
        this.text = state.text;
        this.show(false);
        if (this.text !== '')
            this.findMatches(state.currentHash, false);
    }
    /**
     * Is the Find Widget currently visible.
     * @returns TRUE => The Find Widget is visible, FALSE => The Find Widget is not visible
     */
    isVisible() {
        return this.visible;
    }
    /* Matching */
    /**
     * Find all matches based on the user's criteria.
     * @param goToCommitHash If this commit hash matches the criteria, directly go to this commit instead of starting at the first match.
     * @param scrollToCommit Should the resultant find match be scrolled to (so it's visible in the view).
     */
    findMatches(goToCommitHash, scrollToCommit) {
        this.matches = [];
        this.position = -1;
        if (this.text !== '') {
            const wsState = getWorkspaceState();
            let colVisibility = this.view.getColumnVisibility(), findPattern, findGlobalPattern;
            const regexText = wsState.findIsRegex ? this.text : this.text.replace(/[\\\[\](){}|.*+?^$]/g, '\\$&'), flags = 'u' + (wsState.findIsCaseSensitive ? '' : 'i');
            try {
                findPattern = new RegExp(regexText, flags);
                findGlobalPattern = new RegExp(regexText, 'g' + flags);
                this.widgetElem.removeAttribute(ATTR_ERROR);
            }
            catch (e) {
                findPattern = null;
                findGlobalPattern = null;
                this.widgetElem.setAttribute(ATTR_ERROR, e.message);
            }
            if (findPattern !== null && findGlobalPattern !== null) {
                let commitElems = getCommitElems(), j = 0, commit, zeroLengthMatch = false;
                // Search the commit data itself to detect commits that match, so that dom tree traversal is performed on matching commit rows (for performance)
                const commits = this.view.getCommits();
                for (let i = 0; i < commits.length; i++) {
                    commit = commits[i];
                    let branchLabels = getBranchLabels(commit.heads, commit.remotes);
                    if (commit.hash !== UNCOMMITTED && ((colVisibility.author && findPattern.test(commit.author))
                        || (colVisibility.commit && (commit.hash.search(findPattern) === 0 || findPattern.test(abbrevCommit(commit.hash))))
                        || findPattern.test(commit.message)
                        || branchLabels.heads.some((head) => findPattern.test(head.name) || head.remotes.some((remote) => findPattern.test(remote)))
                        || branchLabels.remotes.some((remote) => findPattern.test(remote.name))
                        || commit.tags.some((tag) => findPattern.test(tag.name))
                        || (colVisibility.date && findPattern.test(formatShortDate(commit.date).formatted))
                        || (commit.stash !== null && findPattern.test(commit.stash.selector)))) {
                        let idStr = i.toString();
                        while (j < commitElems.length && commitElems[j].dataset.id !== idStr)
                            j++;
                        if (j === commitElems.length)
                            continue;
                        this.matches.push({ hash: commit.hash, elem: commitElems[j] });
                        // Highlight matches
                        let textElems = getChildNodesWithTextContent(commitElems[j]), textElem;
                        for (let k = 0; k < textElems.length; k++) {
                            textElem = textElems[k];
                            let matchStart = 0, matchEnd = 0, text = textElem.textContent, match;
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
                        if (colVisibility.commit && commit.hash.search(findPattern) === 0 && !findPattern.test(abbrevCommit(commit.hash)) && textElems.length > 0) {
                            // The commit matches on more than the abbreviated commit, so the commit should be highlighted
                            let commitNode = textElems[textElems.length - 1]; // Commit is always the last column if it is visible
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
        let newPos = -1;
        if (this.matches.length > 0) {
            newPos = 0;
            if (goToCommitHash !== null) {
                let pos = this.matches.findIndex(match => match.hash === goToCommitHash);
                if (pos > -1)
                    newPos = pos;
            }
        }
        this.updatePosition(newPos, scrollToCommit);
    }
    /**
     * Clear all of the highlighted find matches in the view.
     */
    clearMatches() {
        for (let i = 0; i < this.matches.length; i++) {
            if (i === this.position)
                this.matches[i].elem.classList.remove(CLASS_FIND_CURRENT_COMMIT);
            let matchElems = getChildrenWithClassName(this.matches[i].elem, CLASS_FIND_MATCH), matchElem;
            for (let j = 0; j < matchElems.length; j++) {
                matchElem = matchElems[j];
                let text = matchElem.childNodes[0].textContent;
                // Combine current text with the text from previous sibling text nodes
                let node = matchElem.previousSibling, elem = matchElem.previousElementSibling;
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
    }
    /**
     * Update the user's position in the set of find matches.
     * @param position The new position index within the find matches.
     * @param scrollToCommit After updating the user's position in the set of find matches, should the current match be scrolled to (so it's visible in the view).
     */
    updatePosition(position, scrollToCommit) {
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
    }
    /**
     * Move the user's position to the previous match in the set of find matches.
     */
    prev() {
        if (this.matches.length === 0)
            return;
        this.updatePosition(this.position > 0 ? this.position - 1 : this.matches.length - 1, true);
        this.openCommitDetailsViewForCurrentMatchIfEnabled();
    }
    /**
     * Move the user's position to the next match in the set of find matches.
     */
    next() {
        if (this.matches.length === 0)
            return;
        this.updatePosition(this.position < this.matches.length - 1 ? this.position + 1 : 0, true);
        this.openCommitDetailsViewForCurrentMatchIfEnabled();
    }
    /**
     * If the Find Widget is configured to open the Commit Details View for the current find match, load the Commit Details View accordingly.
     */
    openCommitDetailsViewForCurrentMatchIfEnabled() {
        const wsState = getWorkspaceState();
        if (wsState.findOpenCommitDetailsView) {
            const commitHash = this.getCurrentHash();
            if (commitHash !== null && !this.view.isCdvOpen(commitHash, null)) {
                const commitElem = findCommitElemWithId(getCommitElems(), this.view.getCommitId(commitHash));
                if (commitElem !== null) {
                    this.view.loadCommitDetails(commitElem);
                }
            }
        }
    }
    /**
     * Create a find match element containing the specified text.
     * @param text The text content of the find match.
     * @returns The HTML element for the find match.
     */
    static createMatchElem(text) {
        const span = document.createElement('span');
        span.className = CLASS_FIND_MATCH;
        span.innerHTML = text;
        return span;
    }
}
//# sourceMappingURL=find-widget.js.map