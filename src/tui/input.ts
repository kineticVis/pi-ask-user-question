import { Key, matchesKey } from "@earendil-works/pi-tui";
import type { AskQuestion } from "../extension/schemas.ts";
import { buildRows } from "../shared/answers.ts";
import type { Row } from "../shared/types.ts";
import {
  getCurrentQuestion,
  getCurrentState,
  isAllAnswered,
  isMultiQuestion,
  isSubmitTab,
  type MenuController,
} from "./session.ts";

export type MenuKey = {
  ctl: MenuController;
  data: string;
};

export type CustomAnswer = {
  ctl: MenuController;
  value: string;
};

type RowKey = {
  question: AskQuestion;
  row: Row;
  data: string;
};

type QuickPickKey = MenuKey & {
  rows: Row[];
};

type RowSelection = {
  ctl: MenuController;
  row: Row;
};

/**
 * Applies one key press to the menu. Keys go to the text editor while it is open; otherwise
 * they switch tabs, cancel on Esc, submit from the submit tab, or act on the current question.
 *
 * @param key - The key press and the menu it applies to.
 * @param key.ctl - Menu state and hooks.
 * @param key.data - Raw key data from the terminal.
 */
export function updateMenuFromKey(key: MenuKey): void {
  const { ctl, data } = key;
  if (ctl.session.editing) return updateEditorFromKey(key);
  if (updateTabFromKey(key)) return;
  if (matchesKey(data, Key.escape)) return ctl.stop(true);
  if (isSubmitTab(ctl.session)) {
    if (matchesKey(data, Key.enter) && isAllAnswered(ctl.session))
      ctl.stop(false);
    return;
  }
  updateQuestionFromKey(key);
}

/**
 * Stores the text submitted from the editor and closes it. For multi-choice questions the text
 * sets (or, when blank, clears) the custom answer. For single-choice questions non-blank text
 * replaces any picked option, answers the question and moves on; blank text just closes the
 * editor.
 *
 * @param answer - The submitted text and the menu it applies to.
 * @param answer.ctl - Menu state and hooks.
 * @param answer.value - Text submitted from the editor.
 */
export function updateCustomAnswer(answer: CustomAnswer): void {
  const { ctl, value } = answer;
  const { session, editor } = ctl;
  const state = getCurrentState(session);
  const text = value.trim();
  session.editing = false;
  editor.setText("");
  if (getCurrentQuestion(session).multiSelect) {
    state.custom = text || undefined;
    return ctl.refresh();
  }
  if (!text) return ctl.refresh();
  state.checked.clear();
  state.custom = text;
  state.answered = true;
  advanceTab(ctl);
}

/**
 * Moves on after a question is answered. A lone question finishes the menu straight away;
 * otherwise the next unanswered question after this one is selected, or the submit tab when
 * there is none.
 *
 * @param ctl - Menu state and hooks.
 */
function advanceTab(ctl: MenuController): void {
  const { session } = ctl;
  if (!isMultiQuestion(session)) return ctl.stop(false);
  const next = session.states.findIndex(
    (state, index) => index > session.tab && !state.answered,
  );
  session.tab = next === -1 ? session.questions.length : next;
  ctl.refresh();
}

/**
 * Sends a key to the open text editor. Esc closes the editor and discards the typed text.
 *
 * @param key - The key press and the menu it applies to.
 * @param key.ctl - Menu state and hooks.
 * @param key.data - Raw key data from the terminal.
 */
function updateEditorFromKey(key: MenuKey): void {
  const { ctl, data } = key;
  if (matchesKey(data, Key.escape)) {
    ctl.session.editing = false;
    ctl.editor.setText("");
  } else {
    ctl.editor.handleInput(data);
  }
  ctl.refresh();
}

/**
 * Switches tabs on Tab/→ (next) or Shift+Tab/← (previous), wrapping around through the
 * question tabs and the trailing submit tab. Only applies when there are several questions.
 *
 * @param key - The key press and the menu it applies to.
 * @param key.ctl - Menu state and hooks.
 * @param key.data - Raw key data from the terminal.
 *
 * @returns Whether the key switched tabs.
 */
function updateTabFromKey(key: MenuKey): boolean {
  const { ctl, data } = key;
  const { session } = ctl;
  if (!isMultiQuestion(session)) return false;
  const count = session.questions.length + 1;
  if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
    session.tab = (session.tab + 1) % count;
  } else if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
    session.tab = (session.tab + count - 1) % count;
  } else {
    return false;
  }
  ctl.refresh();
  return true;
}

/**
 * Applies a key to the current question: ↑/↓ move the cursor (wrapping), Enter or Space
 * activate the row under it, and 1–9 pick a row directly.
 *
 * @param key - The key press and the menu it applies to.
 * @param key.ctl - Menu state and hooks.
 * @param key.data - Raw key data from the terminal.
 */
function updateQuestionFromKey(key: MenuKey): void {
  const { ctl, data } = key;
  const question = getCurrentQuestion(ctl.session);
  const state = getCurrentState(ctl.session);
  const rows = buildRows(question);
  const step = pickCursorStep(data);
  if (step !== 0) {
    state.cursor = (state.cursor + step + rows.length) % rows.length;
    return ctl.refresh();
  }
  const row = rows[state.cursor];
  if (shouldSelectRow({ question, row, data })) return selectRow({ ctl, row });
  updateFromQuickPick({ ctl, data, rows });
}

/**
 * Maps a key to a cursor movement.
 *
 * @param data - Raw key data from the terminal.
 *
 * @returns -1 for ↑, 1 for ↓, 0 for any other key.
 */
function pickCursorStep(data: string): number {
  if (matchesKey(data, Key.up)) return -1;
  if (matchesKey(data, Key.down)) return 1;
  return 0;
}

/**
 * Whether the key activates the row under the cursor: Enter always does, and Space does for an
 * option row of a multi-choice question.
 *
 * @param key - The key press and the row under the cursor.
 * @param key.question - Current question.
 * @param key.row - Row under the cursor.
 * @param key.data - Raw key data from the terminal.
 */
function shouldSelectRow(key: RowKey): boolean {
  const { question, row, data } = key;
  if (matchesKey(data, Key.enter)) return true;
  return (
    matchesKey(data, Key.space) &&
    Boolean(question.multiSelect) &&
    row.kind === "option"
  );
}

/**
 * Handles the 1–9 quick-pick keys. The numbered rows are the options plus "Type something.";
 * a matching key moves the cursor to that row and activates it.
 *
 * @param key - The key press, the menu it applies to, and the question's rows.
 * @param key.ctl - Menu state and hooks.
 * @param key.data - Raw key data from the terminal.
 * @param key.rows - Rows of the current question.
 */
function updateFromQuickPick(key: QuickPickKey): void {
  const { ctl, data, rows } = key;
  if (!/^[1-9]$/.test(data)) return;
  const index = Number(data) - 1;
  if (index > getCurrentQuestion(ctl.session).options.length) return;
  getCurrentState(ctl.session).cursor = index;
  selectRow({ ctl, row: rows[index] });
}

/**
 * Activates a row. The free-text row opens the editor (pre-filled with the custom answer for
 * multi-choice questions), the "done" row answers the question, and an option row is toggled
 * for multi-choice questions or picked (answering and moving on) for single-choice ones.
 *
 * @param selection - The row to activate and the menu it belongs to.
 * @param selection.ctl - Menu state and hooks.
 * @param selection.row - Row to activate.
 */
function selectRow(selection: RowSelection): void {
  const { ctl, row } = selection;
  const { session, editor } = ctl;
  const question = getCurrentQuestion(session);
  const state = getCurrentState(session);
  if (row.kind === "other") {
    session.editing = true;
    editor.setText(question.multiSelect ? (state.custom ?? "") : "");
    return ctl.refresh();
  }
  if (row.kind === "done") {
    state.answered = true;
    return advanceTab(ctl);
  }
  if (question.multiSelect) {
    if (state.checked.has(row.index)) state.checked.delete(row.index);
    else state.checked.add(row.index);
    return ctl.refresh();
  }
  state.checked = new Set([row.index]);
  state.custom = undefined;
  state.answered = true;
  advanceTab(ctl);
}
