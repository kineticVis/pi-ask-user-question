import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type Editor,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import {
  buildAnswer,
  buildRows,
  formatAnswer,
  OTHER_LABEL,
} from "../shared/answers.ts";
import type { Row } from "../shared/types.ts";
import {
  getCurrentQuestion,
  getCurrentState,
  isAllAnswered,
  isMultiQuestion,
  isSubmitTab,
  type MenuSession,
} from "./session.ts";

export type MenuView = {
  session: MenuSession;
  theme: Theme;
  editor: Editor;
  width: number;
};

type ChoiceRow = Exclude<Row, { kind: "done" }>;

type WrappedText = {
  prefix: string;
  text: string;
  width: number;
};

type TabLabel = {
  view: MenuView;
  header: string;
  index: number;
};

type RowView<TRow extends Row = Row> = {
  view: MenuView;
  row: TRow;
  index: number;
};

/**
 * Renders the whole menu as lines for the terminal: a top rule, the tab bar, the current
 * question or the review screen, the key hints, and a bottom rule.
 *
 * @param view - What to render and how.
 * @param view.session - Menu state.
 * @param view.theme - Theme used to colour the menu.
 * @param view.editor - Free-text editor.
 * @param view.width - Available width in terminal columns.
 */
export function renderMenu(view: MenuView): string[] {
  const rule = view.theme.fg("accent", "─".repeat(view.width));
  const body = isSubmitTab(view.session)
    ? renderReview(view)
    : renderQuestion(view);
  return [rule, ...renderTabBar(view), ...body, "", ...renderHints(view), rule];
}

/**
 * Wraps text to the width, putting the prefix before the first line and indenting the
 * continuation lines under it. When the prefix alone fills the width, the prefix and text are
 * wrapped together instead.
 *
 * @param wrapped - The text to wrap and how.
 * @param wrapped.prefix - Text before the first line, whose width indents the rest.
 * @param wrapped.text - Text to wrap; may contain ANSI styling.
 * @param wrapped.width - Available width in terminal columns.
 */
function renderWrapped(wrapped: WrappedText): string[] {
  const { prefix, text, width } = wrapped;
  const prefixWidth = visibleWidth(prefix);
  if (prefixWidth >= width) return wrapTextWithAnsi(prefix + text, width);
  const pad = " ".repeat(prefixWidth);
  return wrapTextWithAnsi(text, width - prefixWidth).map(
    (line, index) => `${index === 0 ? prefix : pad}${line}`,
  );
}

/**
 * Renders the tab bar (one tab per question, then Submit) followed by a blank line. Renders
 * nothing when there is only one question.
 *
 * @param view - What to render and how.
 * @param view.session - Menu state.
 * @param view.theme - Theme used to colour the menu.
 * @param view.editor - Free-text editor.
 * @param view.width - Available width in terminal columns.
 */
function renderTabBar(view: MenuView): string[] {
  const { session, theme, width } = view;
  if (!isMultiQuestion(session)) return [];
  const tabs = session.questions.map((question, index) =>
    renderTabLabel({ view, header: question.header, index }),
  );
  const submitLabel = " ✓ Submit ";
  const submitTab = isSubmitTab(session)
    ? theme.bg("selectedBg", theme.fg("text", submitLabel))
    : theme.fg(isAllAnswered(session) ? "success" : "dim", submitLabel);
  const tabText = [...tabs, submitTab].join(" ");
  return [...renderWrapped({ prefix: " ", text: `← ${tabText} →`, width }), ""];
}

/**
 * Renders one question tab: a filled box once answered, highlighted when selected, and coloured
 * by whether it has been answered otherwise.
 *
 * @param tab - The tab to render.
 * @param tab.view - Menu view the tab belongs to.
 * @param tab.header - Question header shown on the tab.
 * @param tab.index - Index of the tab's question.
 */
function renderTabLabel(tab: TabLabel): string {
  const { view, header, index } = tab;
  const { session, theme } = view;
  const answered = session.states[index].answered;
  const label = ` ${answered ? "■" : "□"} ${header} `;
  if (index === session.tab)
    return theme.bg("selectedBg", theme.fg("text", label));
  return theme.fg(answered ? "success" : "muted", label);
}

/**
 * Renders the review screen: each question's header with its answer ("—" when unanswered) and
 * a status line saying whether the answers can be submitted.
 *
 * @param view - What to render and how.
 * @param view.session - Menu state.
 * @param view.theme - Theme used to colour the menu.
 * @param view.editor - Free-text editor.
 * @param view.width - Available width in terminal columns.
 */
function renderReview(view: MenuView): string[] {
  const { session, theme, width } = view;
  const summary = session.questions.flatMap((question, index) => {
    const state = session.states[index];
    const answer = state.answered
      ? formatAnswer(buildAnswer({ question, state }))
      : "—";
    return renderWrapped({
      prefix: " ",
      text: `${theme.fg("muted", `${question.header}: `)}${theme.fg("text", answer)}`,
      width,
    });
  });
  return [
    ...renderWrapped({
      prefix: " ",
      text: theme.fg("accent", theme.bold("Review your answers")),
      width,
    }),
    "",
    ...summary,
    "",
    ...renderWrapped({ prefix: " ", text: renderReviewStatus(view), width }),
  ];
}

/**
 * Renders the review status line: the Enter-to-submit prompt once every question is answered,
 * otherwise a warning listing the unanswered headers.
 *
 * @param view - What to render and how.
 * @param view.session - Menu state.
 * @param view.theme - Theme used to colour the menu.
 * @param view.editor - Free-text editor.
 * @param view.width - Available width in terminal columns.
 */
function renderReviewStatus(view: MenuView): string {
  const { session, theme } = view;
  if (isAllAnswered(session))
    return theme.fg("success", "Press Enter to submit");
  const missing = session.questions.filter(
    (_, index) => !session.states[index].answered,
  );
  return theme.fg(
    "warning",
    `Unanswered: ${missing.map((question) => question.header).join(", ")}`,
  );
}

/**
 * Renders the current question: its header (only when there is no tab bar to show it), the
 * question text, every row, and the editor when it is open.
 *
 * @param view - What to render and how.
 * @param view.session - Menu state.
 * @param view.theme - Theme used to colour the menu.
 * @param view.editor - Free-text editor.
 * @param view.width - Available width in terminal columns.
 */
function renderQuestion(view: MenuView): string[] {
  const { session, theme, width } = view;
  const question = getCurrentQuestion(session);
  const headerLines = isMultiQuestion(session)
    ? []
    : renderWrapped({
        prefix: " ",
        text: theme.fg("muted", theme.bold(question.header)),
        width,
      });
  return [
    ...headerLines,
    ...renderWrapped({
      prefix: " ",
      text: theme.fg("text", theme.bold(question.question)),
      width,
    }),
    "",
    ...buildRows(question).flatMap((row, index) =>
      renderRow({ view, row, index }),
    ),
    ...(session.editing ? renderEditor(view) : []),
  ];
}

/**
 * Renders one row with a pointer when the cursor is on it. The "done" row reads "Next →" or
 * "✓ Submit" after a blank line; option and free-text rows are numbered, and options show
 * their description underneath.
 *
 * @param rowView - The row, its position and the menu view.
 * @param rowView.view - Menu view the row belongs to.
 * @param rowView.row - Row to render.
 * @param rowView.index - Position of the row in the question's rows.
 */
function renderRow(rowView: RowView): string[] {
  const { view, row, index } = rowView;
  const { session, theme, width } = view;
  const isCursor = index === getCurrentState(session).cursor;
  const pointer = isCursor ? theme.fg("accent", "❯ ") : "  ";
  const color = isCursor ? "accent" : "text";
  if (row.kind === "done") {
    const label = isMultiQuestion(session) ? "Next →" : "✓ Submit";
    return [
      "",
      ...renderWrapped({
        prefix: pointer,
        text: theme.fg(color, label),
        width,
      }),
    ];
  }
  const choice = { view, row, index };
  const text =
    theme.fg(color, renderChoiceLabel(choice)) + renderAnsweredMark(choice);
  const lines = renderWrapped({ prefix: pointer, text, width });
  if (row.kind !== "option" || !row.description) return lines;
  const indent = " ".repeat(getCurrentQuestion(session).multiSelect ? 9 : 5);
  return [
    ...lines,
    ...renderWrapped({
      prefix: indent,
      text: theme.fg("muted", row.description),
      width,
    }),
  ];
}

/**
 * Whether a row is chosen: an option row when it is checked, the free-text row when custom text
 * has been entered.
 *
 * @param choice - The row, its position and the menu view.
 * @param choice.view - Menu view the row belongs to.
 * @param choice.row - Option or free-text row.
 * @param choice.index - Position of the row in the question's rows.
 */
function isRowChecked(choice: RowView<ChoiceRow>): boolean {
  const { view, row } = choice;
  const state = getCurrentState(view.session);
  if (row.kind === "option") return state.checked.has(row.index);
  return state.custom !== undefined && state.custom !== "";
}

/**
 * Renders a row's numbered label, with a checkbox for multi-choice questions. The free-text
 * row shows the typed answer for multi-choice questions and "Type something." otherwise.
 *
 * @param choice - The row, its position and the menu view.
 * @param choice.view - Menu view the row belongs to.
 * @param choice.row - Option or free-text row.
 * @param choice.index - Position of the row in the question's rows.
 */
function renderChoiceLabel(choice: RowView<ChoiceRow>): string {
  const { view, row, index } = choice;
  const question = getCurrentQuestion(view.session);
  const state = getCurrentState(view.session);
  const box = question.multiSelect
    ? `${isRowChecked(choice) ? "[x]" : "[ ]"} `
    : "";
  const label =
    row.kind === "option"
      ? row.label
      : (question.multiSelect && state.custom) || OTHER_LABEL;
  return `${box}${index + 1}. ${label}`;
}

/**
 * Renders the ✓ that marks the chosen row of an answered single-choice question, or nothing.
 *
 * @param choice - The row, its position and the menu view.
 * @param choice.view - Menu view the row belongs to.
 * @param choice.row - Option or free-text row.
 * @param choice.index - Position of the row in the question's rows.
 */
function renderAnsweredMark(choice: RowView<ChoiceRow>): string {
  const { view } = choice;
  const question = getCurrentQuestion(view.session);
  const state = getCurrentState(view.session);
  const isMarked =
    !question.multiSelect && state.answered && isRowChecked(choice);
  return isMarked ? view.theme.fg("success", " ✓") : "";
}

/**
 * Renders the open free-text editor below a "Your answer:" label.
 *
 * @param view - What to render and how.
 * @param view.session - Menu state.
 * @param view.theme - Theme used to colour the menu.
 * @param view.editor - Free-text editor.
 * @param view.width - Available width in terminal columns.
 */
function renderEditor(view: MenuView): string[] {
  const { editor, theme, width } = view;
  const editorLines = editor
    .render(Math.max(1, width - 2))
    .map((line) => ` ${line}`);
  return [
    "",
    ...renderWrapped({
      prefix: " ",
      text: theme.fg("muted", "Your answer:"),
      width,
    }),
    ...editorLines,
  ];
}

/**
 * Renders the key hints line, which changes with the editor open, the number of questions, and
 * whether the current question is multi-choice.
 *
 * @param view - What to render and how.
 * @param view.session - Menu state.
 * @param view.theme - Theme used to colour the menu.
 * @param view.editor - Free-text editor.
 * @param view.width - Available width in terminal columns.
 */
function renderHints(view: MenuView): string[] {
  const { session, theme, width } = view;
  const hints = session.editing
    ? ["Enter submit", "Esc back"]
    : [
        ...(isMultiQuestion(session) ? ["Tab/←→ questions"] : []),
        "↑↓ move",
        session.questions[session.tab]?.multiSelect
          ? "Space toggle"
          : "Enter select",
        "1-9 pick",
        "Esc cancel",
      ];
  return renderWrapped({
    prefix: " ",
    text: theme.fg("dim", hints.join(" • ")),
    width,
  });
}
