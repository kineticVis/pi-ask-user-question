import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { AskQuestion } from "./schemas.ts";
import { OTHER_LABEL } from "../shared/answers.ts";
import type { Answer, AskDetails } from "../shared/types.ts";

const DONE_LABEL = "Done";

type DialogContext = {
  ui: Pick<ExtensionUIContext, "select" | "input">;
  question: AskQuestion;
  title: string;
  signal: AbortSignal | undefined;
};

export type QuestionsDialogsArgs = {
  ui: DialogContext["ui"];
  questions: AskQuestion[];
  signal: AbortSignal | undefined;
};

type MultiItemsState = {
  labels: string[];
  checked: Set<number>;
  custom: string | undefined;
};

/**
 * Asks each question in turn with the generic select/input dialogs. RPC clients get these
 * instead of the custom menu. Cancelling any dialog cancels the whole set and discards answers
 * given so far.
 *
 * @param args - The questions to ask and where to ask them.
 * @param args.ui - Host UI that shows the select and input dialogs.
 * @param args.questions - Questions to ask, in order.
 * @param args.signal - Abort signal that closes any open dialog.
 */
export async function runQuestionsDialogs(
  args: QuestionsDialogsArgs,
): Promise<AskDetails> {
  const { questions } = args;
  const answers = await runDialogsInOrder(args);
  return answers
    ? { questions, answers, cancelled: false }
    : { questions, answers: [], cancelled: true };
}

/**
 * Asks the first question, then the rest one at a time. Returns every answer in question order,
 * or `undefined` as soon as the user cancels a dialog.
 *
 * @param args - The questions still to ask and where to ask them.
 * @param args.ui - Host UI that shows the select and input dialogs.
 * @param args.questions - Questions still to ask, in order.
 * @param args.signal - Abort signal that closes any open dialog.
 */
async function runDialogsInOrder(
  args: QuestionsDialogsArgs,
): Promise<Answer[] | undefined> {
  const { ui, signal } = args;
  const [question, ...rest] = args.questions;
  if (!question) return [];
  const title = `${question.header}: ${question.question}`;
  const ctx: DialogContext = { ui, question, signal, title };
  const answer = question.multiSelect
    ? await runMultiChoiceDialog(ctx)
    : await runSingleChoiceDialog(ctx);
  if (!answer) return undefined;
  const restAnswers = await runDialogsInOrder({ ...args, questions: rest });
  return restAnswers && [answer, ...restAnswers];
}

/**
 * Prompts for a free-text answer and returns it trimmed, or `undefined` when the user cancels
 * or leaves it blank.
 *
 * @param ctx - Dialog context for the current question.
 */
async function runCustomInput(ctx: DialogContext): Promise<string | undefined> {
  const text = await ctx.ui.input(ctx.title, "Your answer", {
    signal: ctx.signal,
  });
  return text?.trim() || undefined;
}

/**
 * Asks a single-choice question as one select dialog with the options plus "Type something.".
 * Picking that row opens a text input. Returns `undefined` when the user cancels either dialog
 * or submits empty text.
 *
 * @param ctx - Dialog context for the single-choice question.
 */
async function runSingleChoiceDialog(
  ctx: DialogContext,
): Promise<Answer | undefined> {
  const { question } = ctx;
  const labels = question.options.map((option) => option.label);
  const choice = await ctx.ui.select(ctx.title, [...labels, OTHER_LABEL], {
    signal: ctx.signal,
  });
  if (choice === undefined) return undefined;
  if (choice !== OTHER_LABEL)
    return {
      header: question.header,
      question: question.question,
      selected: [choice],
    };
  const custom = await runCustomInput(ctx);
  return custom
    ? {
        header: question.header,
        question: question.question,
        selected: [],
        custom,
      }
    : undefined;
}

/**
 * Builds the select items for a multi-choice question: each option with a `[x]`/`[ ]` box, then
 * the free-text row (showing the typed answer once there is one), then "Done".
 *
 * @param state - What to show in the item list.
 * @param state.labels - Option labels, in order.
 * @param state.checked - Indexes of the checked options.
 * @param state.custom - Typed answer, or `undefined` when there is none yet.
 */
function renderMultiItems(state: MultiItemsState): string[] {
  const { labels, checked, custom } = state;
  const optionItems = labels.map(
    (label, index) => `${checked.has(index) ? "[x]" : "[ ]"} ${label}`,
  );
  return [
    ...optionItems,
    `${custom ? "[x]" : "[ ]"} ${custom ?? OTHER_LABEL}`,
    DONE_LABEL,
  ];
}

/**
 * Asks a multi-choice question by reopening a select dialog after each pick. Picking an option
 * toggles it, picking the free-text row prompts for (or replaces) a custom answer, and "Done"
 * finishes. Returns `undefined` when the user cancels.
 *
 * @param ctx - Dialog context for the multi-choice question.
 */
async function runMultiChoiceDialog(
  ctx: DialogContext,
): Promise<Answer | undefined> {
  const { question } = ctx;
  const labels = question.options.map((option) => option.label);
  const checked = new Set<number>();
  let custom: string | undefined;
  for (;;) {
    const items = renderMultiItems({ labels, checked, custom });
    const choice = await ctx.ui.select(ctx.title, items, {
      signal: ctx.signal,
    });
    if (choice === undefined) return undefined;
    if (choice === DONE_LABEL) break;
    const index = items.indexOf(choice);
    if (index >= labels.length) custom = await runCustomInput(ctx);
    else if (checked.has(index)) checked.delete(index);
    else checked.add(index);
  }
  const selected = labels.filter((_, index) => checked.has(index));
  return {
    header: question.header,
    question: question.question,
    selected,
    custom,
  };
}
