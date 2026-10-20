import type { Editor } from "@earendil-works/pi-tui";
import type { AskQuestion } from "../extension/schemas.ts";
import type { QuestionState } from "../shared/types.ts";

export type MenuSession = {
  questions: AskQuestion[];
  states: QuestionState[];
  tab: number;
  editing: boolean;
};

// Mutable menu state plus the hooks key handling needs to repaint or finish.
export type MenuController = {
  session: MenuSession;
  editor: Editor;
  refresh: () => void;
  stop: (cancelled: boolean) => void;
};

/**
 * Creates the starting menu state: first tab selected, not editing, and every question
 * unanswered with its cursor on the first row.
 *
 * @param questions - Questions the menu asks.
 */
export function buildMenuSession(questions: AskQuestion[]): MenuSession {
  const states = questions.map(() => ({
    cursor: 0,
    checked: new Set<number>(),
    answered: false,
  }));
  return { questions, states, tab: 0, editing: false };
}

/**
 * Whether the menu holds more than one question, which turns on the tab bar and the submit tab.
 *
 * @param session - Menu state.
 */
export function isMultiQuestion(session: MenuSession): boolean {
  return session.questions.length > 1;
}

/**
 * Whether the selected tab is the review-and-submit tab that follows the question tabs.
 *
 * @param session - Menu state.
 */
export function isSubmitTab(session: MenuSession): boolean {
  return session.tab === session.questions.length;
}

/**
 * Whether every question has been answered, so the answers can be submitted.
 *
 * @param session - Menu state.
 */
export function isAllAnswered(session: MenuSession): boolean {
  return session.states.every((state) => state.answered);
}

/**
 * Returns the question on the selected tab. Only valid while a question tab is selected.
 *
 * @param session - Menu state.
 */
export function getCurrentQuestion(session: MenuSession): AskQuestion {
  return session.questions[session.tab];
}

/**
 * Returns the menu state of the question on the selected tab. Only valid while a question tab
 * is selected.
 *
 * @param session - Menu state.
 */
export function getCurrentState(session: MenuSession): QuestionState {
  return session.states[session.tab];
}
