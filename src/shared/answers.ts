import type { AskQuestion } from "../extension/schemas.ts";
import type { Answer, AskDetails, QuestionState, Row } from "./types.ts";

export const OTHER_LABEL = "Type something.";

export type AnswerSource = {
  question: AskQuestion;
  state: QuestionState;
};

/**
 * Lists the menu rows for a question: one per option, then the free-text row, then a "done"
 * row for multi-choice questions only.
 *
 * @param question - Question to list rows for.
 */
export function buildRows(question: AskQuestion): Row[] {
  const optionRows: Row[] = question.options.map((option, index) => ({
    kind: "option",
    index,
    ...option,
  }));
  const doneRows: Row[] = question.multiSelect ? [{ kind: "done" }] : [];
  return [...optionRows, { kind: "other" }, ...doneRows];
}

/**
 * Turns a question's menu state into an answer: the labels of the checked options, in option
 * order, plus any custom text.
 *
 * @param source - The question and its menu state.
 * @param source.question - Question being answered.
 * @param source.state - Menu state holding the checked options and custom text.
 */
export function buildAnswer(source: AnswerSource): Answer {
  const { question, state } = source;
  const selected = question.options
    .filter((_, index) => state.checked.has(index))
    .map((option) => option.label);
  return {
    header: question.header,
    question: question.question,
    selected,
    custom: state.custom,
  };
}

/**
 * Formats an answer as a comma-separated list of the selected labels and custom text, or
 * "(no selection)" when there is neither.
 *
 * @param answer - Answer to format.
 */
export function formatAnswer(answer: Answer): string {
  const parts = answer.custom
    ? [...answer.selected, answer.custom]
    : answer.selected;
  return parts.length ? parts.join(", ") : "(no selection)";
}

/**
 * Builds the tool result text the model reads: every question paired with its answer, or a
 * note that the user declined so the model asks how to proceed.
 *
 * @param details - Questions, answers and whether the user cancelled.
 */
export function buildResultText(details: AskDetails): string {
  if (details.cancelled)
    return "User declined to answer the questions. Ask how they would like to proceed.";
  const pairs = details.answers
    .map((answer) => `"${answer.question}"="${formatAnswer(answer)}"`)
    .join(", ");
  return `User has answered your questions: ${pairs}. You can now continue with the user's answers in mind.`;
}
