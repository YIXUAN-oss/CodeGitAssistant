/**
 * 从 vscode-git-graph-develop 迁移的对话框组件
 */
import { SVG_ICONS, escapeHtml, alterClass, alterClassOfCollection, handledEvent, getCommitElems, formatCommaSeparatedList, addListenerToCollectionElems, REF_INVALID_REGEX, CLASS_FOCUSSED, CLASS_SELECTED, EventOverlay } from '../utils/vscode-git-utils.js';
import { TargetType } from './context-menu.js';
const CLASS_DIALOG_ACTIVE = 'dialogActive';
const CLASS_DIALOG_INPUT_INVALID = 'inputInvalid';
const CLASS_DIALOG_NO_INPUT = 'noInput';
export var DialogType;
(function (DialogType) {
    DialogType[DialogType["Form"] = 0] = "Form";
    DialogType[DialogType["ActionRunning"] = 1] = "ActionRunning";
    DialogType[DialogType["Message"] = 2] = "Message";
})(DialogType || (DialogType = {}));
export var DialogInputType;
(function (DialogInputType) {
    DialogInputType[DialogInputType["Text"] = 0] = "Text";
    DialogInputType[DialogInputType["TextRef"] = 1] = "TextRef";
    DialogInputType[DialogInputType["Select"] = 2] = "Select";
    DialogInputType[DialogInputType["Radio"] = 3] = "Radio";
    DialogInputType[DialogInputType["Checkbox"] = 4] = "Checkbox";
})(DialogInputType || (DialogInputType = {}));
// Helper function to find commit element by ID
function findCommitElemWithId(commitElems, index) {
    for (let i = 0; i < commitElems.length; i++) {
        const elem = commitElems[i];
        const elemId = elem.dataset.id || elem.getAttribute('data-id');
        if (elemId === index.toString()) {
            return elem;
        }
    }
    return null;
}
// Helper function to close dialog and context menu
function closeDialogAndContextMenu() {
    // Close context menu if available
    const contextMenu = window.contextMenu;
    if (contextMenu && typeof contextMenu.close === 'function') {
        contextMenu.close();
    }
}
// Event overlay instance
const eventOverlay = new EventOverlay();
// Placeholder for initialState - this should be provided by the application
// If not available, use default values
const getInitialState = () => {
    if (typeof window.initialState !== 'undefined') {
        return window.initialState;
    }
    return {
        config: {
            dialogDefaults: {
                general: {
                    referenceInputSpaceSubstitution: null
                }
            }
        }
    };
};
/**
 * Implements the Git Graph View's dialogs.
 */
export class Dialog {
    constructor() {
        this.elem = null;
        this.target = null;
        this.actioned = null;
        this.type = null;
        this.customSelects = {};
    }
    /**
     * Show a confirmation dialog to the user.
     * @param message A message outlining what the user is being asked to confirm.
     * @param actionName The name of the affirmative action (e.g. "Yes, \<verb\>").
     * @param actioned A callback to be invoked if the user takes the affirmative action.
     * @param target The target that the dialog was triggered on.
     */
    showConfirmation(message, actionName, actioned, target) {
        this.show(DialogType.Form, message, actionName, 'Cancel', () => {
            this.close();
            actioned();
        }, null, target);
    }
    /**
     * Show a dialog presenting two options to the user.
     * @param message A message outlining the decision the user has.
     * @param buttonLabel1 The label for the primary (default) action.
     * @param buttonAction1 A callback to be invoked when the primary (default) action is selected by the user.
     * @param buttonLabel2 The label for the secondary action.
     * @param buttonAction2 A callback to be invoked when the secondary action is selected by the user.
     * @param target The target that the dialog was triggered on.
     */
    showTwoButtons(message, buttonLabel1, buttonAction1, buttonLabel2, buttonAction2, target) {
        this.show(DialogType.Form, message, buttonLabel1, buttonLabel2, () => {
            this.close();
            buttonAction1();
        }, () => {
            this.close();
            buttonAction2();
        }, target);
    }
    /**
     * Show a dialog asking the user to enter the name for a Git reference. The reference name will be validated before the dialog can be actioned.
     * @param message A message outlining the purpose of the reference.
     * @param defaultValue The default name of the reference.
     * @param actionName The name of the action that the user must choose to proceed.
     * @param actioned A callback to be invoked when the action is triggered (with the reference name as the first argument).
     * @param target The target that the dialog was triggered on.
     */
    showRefInput(message, defaultValue, actionName, actioned, target) {
        this.showForm(message, [
            { type: DialogInputType.TextRef, name: '', default: defaultValue }
        ], actionName, (values) => actioned(values[0]), target);
    }
    /**
     * Show a dialog to the user with a single checkbox input.
     * @param message A message outlining the purpose of the dialog.
     * @param checkboxLabel The label to be displayed alongside the checkbox.
     * @param checkboxValue The default value of the checkbox.
     * @param actionName The name of the action that the user must choose to proceed.
     * @param actioned A callback to be invoked when the action is triggered (with the checkbox value as the first argument).
     * @param target The target that the dialog was triggered on.
     */
    showCheckbox(message, checkboxLabel, checkboxValue, actionName, actioned, target) {
        this.showForm(message, [
            { type: DialogInputType.Checkbox, name: checkboxLabel, value: checkboxValue }
        ], actionName, (values) => actioned(values[0]), target);
    }
    /**
     * Show a dialog to the user with a single select input.
     * @param message A message outlining the purpose of the dialog.
     * @param defaultValue The default value for the select input.
     * @param options An array containing the options for the select input.
     * @param actionName The name of the action that the user must choose to proceed.
     * @param actioned A callback to be invoked when the action is triggered (with the selected value as the first argument).
     * @param target The target that the dialog was triggered on.
     */
    showSelect(message, defaultValue, options, actionName, actioned, target) {
        this.showForm(message, [
            { type: DialogInputType.Select, name: '', options: options, default: defaultValue }
        ], actionName, (values) => actioned(values[0]), target);
    }
    /**
     * Show a dialog to the user with a single multi-select input.
     * @param message A message outlining the purpose of the dialog.
     * @param defaultValue The default value(s) for the select input.
     * @param options An array containing the options for the select input.
     * @param actionName The name of the action that the user must choose to proceed.
     * @param actioned A callback to be invoked when the action is triggered (with the selected value(s) as the first argument).
     * @param target The target that the dialog was triggered on.
     */
    showMultiSelect(message, defaultValues, options, actionName, actioned, target) {
        this.showForm(message, [
            { type: DialogInputType.Select, name: '', options: options, defaults: defaultValues, multiple: true }
        ], actionName, (values) => actioned(values[0]), target);
    }
    /**
     * Show a dialog to the user which can include any number of form inputs.
     * @param message A message outlining the purpose of the dialog.
     * @param inputs An array defining the form inputs to display in the dialog.
     * @param actionName The name of the action that the user must choose to proceed.
     * @param actioned A callback to be invoked when the action is triggered (with the form values as the first argument).
     * @param target The target that the dialog was triggered on.
     * @param secondaryActionName An optional name for the secondary action.
     * @param secondaryActioned An optional callback to be invoked when the secondary action is selected by the user.
     * @param includeLineBreak Should a line break be added between the message and form inputs.
     */
    showForm(message, inputs, actionName, actioned, target, secondaryActionName = 'Cancel', secondaryActioned = null, includeLineBreak = true) {
        const multiElement = inputs.length > 1;
        const multiCheckbox = multiElement && inputs.every((input) => input.type === DialogInputType.Checkbox);
        const infoColRequired = inputs.some((input) => input.type !== DialogInputType.Checkbox && input.type !== DialogInputType.Radio && input.info);
        const inputRowsHtml = inputs.map((input, id) => {
            let inputHtml;
            if (input.type === DialogInputType.Radio) {
                inputHtml = '<td class="inputCol"' + (infoColRequired ? ' colspan="2"' : '') + '><span class="dialogFormRadio">' +
                    input.options.map((option, optionId) => '<label><input type="radio" name="dialogInput' + id + '" value="' + optionId + '"' + (option.value === input.default ? ' checked' : '') + ' tabindex="' + (id + 1) + '"/><span class="customRadio"></span>' + escapeHtml(option.name) + '</label>').join('<br>') +
                    '</span></td>';
            }
            else {
                const infoHtml = input.info ? '<span class="dialogInfo" title="' + escapeHtml(input.info) + '">' + SVG_ICONS.info + '</span>' : '';
                if (input.type === DialogInputType.Select) {
                    inputHtml = '<td class="inputCol"><div id="dialogFormSelect' + id + '"></div></td>' + (infoColRequired ? '<td>' + infoHtml + '</td>' : '');
                }
                else if (input.type === DialogInputType.Checkbox) {
                    inputHtml = '<td class="inputCol"' + (infoColRequired ? ' colspan="2"' : '') + '><span class="dialogFormCheckbox"><label><input id="dialogInput' + id + '" type="checkbox"' + (input.value ? ' checked' : '') + ' tabindex="' + (id + 1) + '"/><span class="customCheckbox"></span>' + (multiElement && !multiCheckbox ? '' : input.name) + infoHtml + '</label></span></td>';
                }
                else {
                    inputHtml = '<td class="inputCol"><input id="dialogInput' + id + '" type="text" value="' + escapeHtml(input.default) + '"' + (input.type === DialogInputType.Text && input.placeholder !== null ? ' placeholder="' + escapeHtml(input.placeholder) + '"' : '') + ' tabindex="' + (id + 1) + '"/></td>' + (infoColRequired ? '<td>' + infoHtml + '</td>' : '');
                }
            }
            return '<tr' + (input.type === DialogInputType.Radio ? ' class="mediumField"' : input.type !== DialogInputType.Checkbox ? ' class="largeField"' : '') + '>' + (multiElement && !multiCheckbox ? '<td>' + input.name + ': </td>' : '') + inputHtml + '</tr>';
        });
        const html = message + (includeLineBreak ? '<br>' : '') +
            '<table class="dialogForm ' + (multiElement ? multiCheckbox ? 'multiCheckbox' : 'multi' : 'single') + '">' +
            inputRowsHtml.join('') +
            '</table>';
        const areFormValuesInvalid = () => this.elem === null || this.elem.classList.contains(CLASS_DIALOG_NO_INPUT) || this.elem.classList.contains(CLASS_DIALOG_INPUT_INVALID);
        const getFormValues = () => inputs.map((input, index) => {
            if (input.type === DialogInputType.Radio) {
                // Iterate through all of the radio options to get the checked value
                const elems = document.getElementsByName('dialogInput' + index);
                for (let i = 0; i < elems.length; i++) {
                    if (elems[i].checked) {
                        return input.options[parseInt(elems[i].value)].value;
                    }
                }
                return input.default; // If no option is checked, return the default value
            }
            else if (input.type === DialogInputType.Select) {
                return this.customSelects[index.toString()].getValue();
            }
            else {
                const elem = document.getElementById('dialogInput' + index);
                return input.type === DialogInputType.Checkbox
                    ? elem.checked // Checkboxes return a boolean indicating if the value is checked
                    : elem.value; // All other fields return the value as a string
            }
        });
        this.show(DialogType.Form, html, actionName, secondaryActionName, () => {
            if (areFormValuesInvalid())
                return;
            const values = getFormValues();
            this.close();
            actioned(values);
        }, secondaryActioned !== null ? () => {
            if (areFormValuesInvalid())
                return;
            const values = getFormValues();
            this.close();
            secondaryActioned(values);
        } : null, target);
        // Create custom select inputs
        inputs.forEach((input, index) => {
            if (input.type === DialogInputType.Select) {
                this.customSelects[index.toString()] = new CustomSelect(input, 'dialogFormSelect' + index, index + 1, this.elem);
            }
        });
        // If the dialog contains a TextRef input, attach event listeners for validation
        const textRefInput = inputs.findIndex((input) => input.type === DialogInputType.TextRef);
        if (textRefInput > -1) {
            const dialogInput = document.getElementById('dialogInput' + textRefInput), dialogAction = document.getElementById('dialogAction');
            if (dialogInput.value === '')
                this.elem.classList.add(CLASS_DIALOG_NO_INPUT);
            dialogInput.addEventListener('keyup', () => {
                if (this.elem === null)
                    return;
                const initialState = getInitialState();
                if (initialState.config.dialogDefaults.general.referenceInputSpaceSubstitution !== null) {
                    const selectionStart = dialogInput.selectionStart, selectionEnd = dialogInput.selectionEnd;
                    dialogInput.value = dialogInput.value.replace(Dialog.WHITESPACE_REGEXP, initialState.config.dialogDefaults.general.referenceInputSpaceSubstitution);
                    dialogInput.selectionStart = selectionStart;
                    dialogInput.selectionEnd = selectionEnd;
                }
                const noInput = dialogInput.value === '', invalidInput = dialogInput.value.match(REF_INVALID_REGEX) !== null;
                alterClass(this.elem, CLASS_DIALOG_NO_INPUT, noInput);
                if (alterClass(this.elem, CLASS_DIALOG_INPUT_INVALID, !noInput && invalidInput)) {
                    dialogAction.title = invalidInput ? 'Unable to ' + actionName + ', one or more invalid characters entered.' : '';
                }
            });
        }
        if (inputs.length > 0 && (inputs[0].type === DialogInputType.Text || inputs[0].type === DialogInputType.TextRef)) {
            // If the first input is a text field, set focus to it.
            document.getElementById('dialogInput0').focus();
        }
    }
    /**
     * Show a message to the user in a dialog.
     * @param html The HTML to display in the dialog.
     */
    showMessage(html) {
        this.show(DialogType.Message, html, null, 'Close', null, null, null);
    }
    /**
     * Show an error to the user in a dialog.
     * @param message The high-level category of the error.
     * @param reason The error details.
     * @param actionName An optional name for a primary action (if one is required).
     * @param actioned An optional callback to be invoked when the primary action is triggered.
     */
    showError(message, reason, actionName, actioned) {
        this.show(DialogType.Message, '<span class="dialogAlert">' + SVG_ICONS.alert + 'Error: ' + message + '</span>' + (reason !== null ? '<br><span class="messageContent errorContent">' + escapeHtml(reason).split('\n').join('<br>') + '</span>' : ''), actionName, 'Dismiss', () => {
            this.close();
            if (actioned !== null)
                actioned();
        }, null, null);
    }
    /**
     * Show a dialog to indicate that an action is currently running.
     * @param action A short name that identifies the action that is running.
     */
    showActionRunning(action) {
        this.show(DialogType.ActionRunning, '<span class="actionRunning">' + SVG_ICONS.loading + action + ' ...</span>', null, 'Dismiss', null, null, null);
    }
    /**
     * Show a dialog in the Git Graph View.
     * @param type The type of dialog being shown.
     * @param html The HTML content for the dialog.
     * @param actionName The name of the primary (default) action.
     * @param secondaryActionName The name of the secondary action.
     * @param actioned A callback to be invoked when the primary (default) action is selected by the user.
     * @param secondaryActioned A callback to be invoked when the secondary action is selected by the user.
     * @param target The target that the dialog was triggered on.
     */
    show(type, html, actionName, secondaryActionName, actioned, secondaryActioned, target) {
        closeDialogAndContextMenu();
        this.type = type;
        this.target = target;
        eventOverlay.create('dialogBacking', null, null);
        const dialog = document.createElement('div'), dialogContent = document.createElement('div');
        dialog.className = 'dialog';
        dialogContent.className = 'dialogContent';
        dialogContent.innerHTML = html + '<br>' + (actionName !== null ? '<div id="dialogAction" class="roundedBtn">' + actionName + '</div>' : '') + '<div id="dialogSecondaryAction" class="roundedBtn">' + secondaryActionName + '</div>';
        dialog.appendChild(dialogContent);
        this.elem = dialog;
        document.body.appendChild(dialog);
        let docHeight = document.body.clientHeight, dialogHeight = dialog.clientHeight + 2;
        if (type !== DialogType.Form && dialogHeight > 0.8 * docHeight) {
            dialogContent.style.height = Math.round(0.8 * docHeight - 22) + 'px';
            dialogHeight = Math.round(0.8 * docHeight);
        }
        dialog.style.top = Math.max(Math.round((docHeight - dialogHeight) / 2), 10) + 'px';
        if (actionName !== null && actioned !== null) {
            document.getElementById('dialogAction').addEventListener('click', actioned);
            this.actioned = actioned;
        }
        document.getElementById('dialogSecondaryAction').addEventListener('click', secondaryActioned !== null ? secondaryActioned : () => this.close());
        if (this.target !== null && this.target.type !== TargetType.Repo) {
            alterClass(this.target.elem, CLASS_DIALOG_ACTIVE, true);
        }
    }
    /**
     * Close the dialog (if one is currently open in the Git Graph View).
     */
    close() {
        eventOverlay.remove();
        if (this.elem !== null) {
            this.elem.remove();
            this.elem = null;
        }
        alterClassOfCollection(document.getElementsByClassName(CLASS_DIALOG_ACTIVE), CLASS_DIALOG_ACTIVE, false);
        this.target = null;
        Object.keys(this.customSelects).forEach((index) => this.customSelects[index].remove());
        this.customSelects = {};
        this.actioned = null;
        this.type = null;
    }
    /**
     * Close the action running dialog (if one is currently open in the Git Graph View).
     */
    closeActionRunning() {
        if (this.type === DialogType.ActionRunning)
            this.close();
    }
    /**
     * Submit the primary action of the dialog.
     */
    submit() {
        if (this.actioned !== null)
            this.actioned();
    }
    /**
     * Refresh the dialog (if one is currently open in the Git Graph View). If the dialog has a dynamic source, re-link
     * it to the newly rendered HTML Element, or close it if the target is no longer visible in the Git Graph View.
     * @param commits The new array of commits that is rendered in the Git Graph View.
     */
    refresh(commits) {
        if (!this.isOpen() || this.target === null || this.target.type === TargetType.Repo) {
            // Don't need to refresh if: no dialog is open, it is not dynamic, or it is not reliant on commit changes
            return;
        }
        const commitIndex = commits.findIndex((commit) => commit.hash === this.target.hash);
        if (commitIndex > -1) {
            // The commit still exists
            const commitElem = findCommitElemWithId(getCommitElems(), commitIndex);
            if (commitElem !== null) {
                if (typeof this.target.ref === 'undefined') {
                    // Dialog is only dependent on the commit itself
                    if (this.target.type !== TargetType.CommitDetailsView) {
                        this.target.elem = commitElem;
                        alterClass(this.target.elem, CLASS_DIALOG_ACTIVE, true);
                    }
                    return;
                }
                else {
                    // Dialog is dependent on the commit and ref
                    const elems = commitElem.querySelectorAll('[data-fullref]');
                    for (let i = 0; i < elems.length; i++) {
                        if (elems[i].dataset.fullref === this.target.ref) {
                            this.target.elem = this.target.type === TargetType.Ref ? elems[i] : commitElem;
                            alterClass(this.target.elem, CLASS_DIALOG_ACTIVE, true);
                            return;
                        }
                    }
                }
            }
        }
        this.close();
    }
    /**
     * Is a dialog currently open in the Git Graph View.
     * @returns TRUE => A dialog is open, FALSE => No dialog is open
     */
    isOpen() {
        return this.elem !== null;
    }
    /**
     * Is the target of the dialog dynamic (i.e. is it tied to a Git object & HTML Element in the Git Graph View).
     * @returns TRUE => The dialog is dynamic, FALSE => The dialog is not dynamic
     */
    isTargetDynamicSource() {
        return this.isOpen() && this.target !== null;
    }
    /**
     * Get the type of the dialog that is currently open.
     * @returns The type of the dialog.
     */
    getType() {
        return this.type;
    }
}
Dialog.WHITESPACE_REGEXP = /\s/g;
/**
 * Implements the Custom Select inputs used in dialogs.
 */
class CustomSelect {
    /**
     * Construct a new CustomSelect instance.
     * @param data The data configuring the CustomSelect input.
     * @param containerId The ID of the container to render the select input in.
     * @param tabIndex The tabIndex of the select input.
     * @param dialogElem The HTML Element of the dialog that the CustomSelect is being rendered in.
     * @returns The CustomSelect instance.
     */
    constructor(data, containerId, tabIndex, dialogElem) {
        this.lastSelected = -1;
        this.focussed = -1;
        this.optionsElem = null;
        this.data = data;
        this.selected = data.options.map(() => false);
        this.open = false;
        this.dialogElem = dialogElem;
        const container = document.getElementById(containerId);
        container.className = 'customSelectContainer';
        this.elem = container;
        const currentElem = document.createElement('div');
        currentElem.className = 'customSelectCurrent';
        currentElem.tabIndex = tabIndex;
        this.currentElem = currentElem;
        container.appendChild(currentElem);
        this.clickHandler = (e) => {
            if (!e.target)
                return;
            const targetElem = e.target;
            if (targetElem.closest('.customSelectContainer') !== this.elem && (this.optionsElem === null || targetElem.closest('.customSelectOptions') !== this.optionsElem)) {
                this.render(false);
                return;
            }
            if (targetElem.className === 'customSelectCurrent') {
                this.render(!this.open);
            }
            else if (this.open) {
                const optionElem = targetElem.closest('.customSelectOption');
                if (optionElem !== null) {
                    const selectedOptionIndex = parseInt(optionElem.dataset.index);
                    this.setItemSelectedState(selectedOptionIndex, data.multiple ? !this.selected[selectedOptionIndex] : true);
                    if (!this.data.multiple) {
                        this.render(false);
                    }
                    if (this.currentElem !== null) {
                        this.currentElem.focus();
                    }
                }
            }
        };
        document.addEventListener('click', this.clickHandler, true);
        currentElem.addEventListener('keydown', (e) => {
            if (this.open && e.key === 'Tab') {
                this.render(false);
            }
            else if (this.open && (e.key === 'Enter' || e.key === 'Escape')) {
                this.render(false);
                handledEvent(e);
            }
            else if (this.data.multiple) {
                if (e.key === ' ' && this.focussed > -1) {
                    this.setItemSelectedState(this.focussed, !this.selected[this.focussed]);
                    handledEvent(e);
                }
                else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                    if (!this.open) {
                        this.render(true);
                    }
                    this.setFocussed(this.focussed > 0 ? this.focussed - 1 : this.data.options.length - 1);
                    this.scrollOptionIntoView(this.focussed);
                    handledEvent(e);
                }
                else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                    if (!this.open) {
                        this.render(true);
                    }
                    this.setFocussed(this.focussed < this.data.options.length - 1 ? this.focussed + 1 : 0);
                    this.scrollOptionIntoView(this.focussed);
                    handledEvent(e);
                }
            }
            else {
                if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                    this.setItemSelectedState(this.lastSelected > 0 ? this.lastSelected - 1 : this.data.options.length - 1, true);
                    this.scrollOptionIntoView(this.lastSelected);
                    handledEvent(e);
                }
                else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                    this.setItemSelectedState(this.lastSelected < this.data.options.length - 1 ? this.lastSelected + 1 : 0, true);
                    this.scrollOptionIntoView(this.lastSelected);
                    handledEvent(e);
                }
            }
        });
        if (data.multiple) {
            for (let i = data.options.length - 1; i >= 0; i--) {
                if (data.defaults.includes(data.options[i].value)) {
                    this.setItemSelectedState(i, true);
                }
            }
        }
        else {
            const defaultIndex = data.options.findIndex((option) => option.value === data.default);
            this.setItemSelectedState(defaultIndex > -1 ? defaultIndex : 0, true);
        }
        this.renderCurrentValue();
    }
    /**
     * Remove a CustomSelect instance, cleaning up all resources that is linked to it.
     */
    remove() {
        this.dialogElem = null;
        if (this.elem !== null) {
            this.elem.remove();
            this.elem = null;
        }
        if (this.currentElem !== null) {
            this.currentElem.remove();
            this.currentElem = null;
        }
        if (this.optionsElem !== null) {
            this.optionsElem.remove();
            this.optionsElem = null;
        }
        if (this.clickHandler !== null) {
            document.removeEventListener('click', this.clickHandler, true);
            this.clickHandler = null;
        }
    }
    /**
     * Get the value(s) selected by the user.
     * @returns The selected value(s).
     */
    getValue() {
        const values = this.data.options.map((option) => option.value).filter((_, index) => this.selected[index]);
        return this.data.multiple ? values : values[0];
    }
    /**
     * Set whether an item is selected.
     * @param index The index of the item to alter.
     * @param state The new state for whether the item is selected or not (TRUE => Selected, FALSE => Not Selected).
     */
    setItemSelectedState(index, state) {
        if (!this.data.multiple && this.lastSelected > -1) {
            this.selected[this.lastSelected] = false;
        }
        this.selected[index] = state;
        this.lastSelected = index;
        this.renderCurrentValue();
        this.renderOptionsStates();
    }
    /**
     * Set the focused item of the select input.
     * @param index The index of the item that should be focussed.
     */
    setFocussed(index) {
        if (this.focussed !== index) {
            if (this.focussed > -1) {
                const currentlyFocussedOption = this.getOptionElem(this.focussed);
                if (currentlyFocussedOption !== null) {
                    alterClass(currentlyFocussedOption, CLASS_FOCUSSED, false);
                }
            }
            this.focussed = index;
            const newlyFocussedOption = this.getOptionElem(this.focussed);
            if (newlyFocussedOption !== null) {
                alterClass(newlyFocussedOption, CLASS_FOCUSSED, true);
            }
        }
    }
    /**
     * Render the select input.
     * @param open Should the select be open (displaying the select options list).
     */
    render(open) {
        if (this.elem === null || this.currentElem === null || this.dialogElem === null)
            return;
        if (this.open !== open) {
            this.open = open;
            if (open) {
                if (this.optionsElem !== null) {
                    this.optionsElem.remove();
                }
                this.optionsElem = document.createElement('div');
                const currentElemRect = this.currentElem.getBoundingClientRect(), dialogElemRect = this.dialogElem.getBoundingClientRect();
                this.optionsElem.style.top = (currentElemRect.top - dialogElemRect.top + currentElemRect.height - 2) + 'px';
                this.optionsElem.style.left = (currentElemRect.left - dialogElemRect.left - 1) + 'px';
                this.optionsElem.style.width = currentElemRect.width + 'px';
                this.optionsElem.style.maxHeight = Math.max(document.body.clientHeight - currentElemRect.top - currentElemRect.height - 2, 50) + 'px';
                this.optionsElem.className = 'customSelectOptions' + (this.data.multiple ? ' multiple' : '');
                const icon = this.data.multiple ? '<div class="selectedIcon">' + SVG_ICONS.check + '</div>' : '';
                this.optionsElem.innerHTML = this.data.options.map((option, index) => '<div class="customSelectOption" data-index="' + index + '">' + icon + escapeHtml(option.name) + '</div>').join('');
                addListenerToCollectionElems(this.optionsElem.children, 'mousemove', (e) => {
                    if (!e.target)
                        return;
                    const elem = e.target.closest('.customSelectOption');
                    if (elem === null)
                        return;
                    this.setFocussed(parseInt(elem.dataset.index));
                });
                this.optionsElem.addEventListener('mouseleave', () => this.setFocussed(-1));
                this.dialogElem.appendChild(this.optionsElem);
            }
            else {
                if (this.optionsElem !== null) {
                    this.optionsElem.remove();
                    this.optionsElem = null;
                }
                this.setFocussed(-1);
            }
            alterClass(this.elem, 'open', open);
        }
        if (open) {
            this.renderOptionsStates();
        }
    }
    /**
     * Render the current value of the select input.
     */
    renderCurrentValue() {
        if (this.currentElem === null)
            return;
        const value = formatCommaSeparatedList(this.data.options.filter((_, index) => this.selected[index]).map((option) => option.name)) || 'None';
        this.currentElem.title = value;
        this.currentElem.innerHTML = escapeHtml(value);
    }
    /**
     * Render the selected & focussed states of each option with it's corresponding HTML Element.
     */
    renderOptionsStates() {
        if (this.optionsElem !== null) {
            let optionElems = this.optionsElem.children, elemIndex;
            for (let i = 0; i < optionElems.length; i++) {
                elemIndex = parseInt(optionElems[i].dataset.index);
                alterClass(optionElems[i], CLASS_SELECTED, this.selected[elemIndex]);
                alterClass(optionElems[i], CLASS_FOCUSSED, this.focussed === elemIndex);
            }
        }
    }
    /**
     * Get the HTML Element of the option at the specified index.
     * @param index The index of the item.
     * @returns The HTML Element.
     */
    getOptionElem(index) {
        if (this.optionsElem !== null && index > -1) {
            const optionElems = this.optionsElem.children, indexStr = index.toString();
            for (let i = 0; i < optionElems.length; i++) {
                if (optionElems[i].dataset.index === indexStr) {
                    return optionElems[i];
                }
            }
        }
        return null;
    }
    /**
     * Scroll the HTML Element of an option to be visible in the options list.
     * @param index The index of the option to scroll into view.
     */
    scrollOptionIntoView(index) {
        const elem = this.getOptionElem(index);
        if (this.optionsElem !== null && elem !== null) {
            const elemOffsetTop = elem.offsetTop, elemHeight = elem.clientHeight;
            const optionsScrollTop = this.optionsElem.scrollTop, optionsHeight = this.optionsElem.clientHeight;
            if (elemOffsetTop < optionsScrollTop) {
                this.optionsElem.scroll(0, elemOffsetTop);
            }
            else if (elemOffsetTop + elemHeight > optionsScrollTop + optionsHeight) {
                this.optionsElem.scroll(0, Math.max(elemOffsetTop + elemHeight - optionsHeight, 0));
            }
        }
    }
}
//# sourceMappingURL=dialog.js.map