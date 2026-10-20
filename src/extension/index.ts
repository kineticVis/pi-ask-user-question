import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildResultText } from "../shared/answers.ts";
import type { AskDetails } from "../shared/types.ts";
import { runQuestionsTui } from "../tui/menu.ts";
import { renderAskCall, renderAskResult } from "../tui/render.ts";
import { runQuestionsDialogs } from "./dialogs.ts";
import { AskParams } from "./schemas.ts";

/**
 * Registers the `ask_user_question` tool: its schema, model-facing description, execution and
 * result rendering.
 *
 * @param pi - Extension API the tool is registered with.
 */
export function registerAskUserQuestionTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ask_user_question",
    label: "Ask User Question",
    description:
      "Ask the user 1–4 multiple-choice questions through an interactive menu. Use it to gather preferences, " +
      "clarify ambiguous instructions, or get a decision between implementation choices. Each question has 2–4 " +
      "options; the user can always type their own answer instead. Set multiSelect when choices are not mutually " +
      "exclusive. If you recommend an option, put it first and add '(Recommended)' to its label.",
    promptSnippet:
      "ask_user_question: ask the user multiple-choice questions via an interactive menu",
    promptGuidelines: [
      "When a decision or missing requirement blocks progress and has a few clear alternatives, use ask_user_question instead of asking in prose.",
    ],
    parameters: AskParams,
    exposure: "model-only",
    executionMode: "sequential",

    /**
     * Asks the questions through the interactive menu in the TUI, or through generic select/input
     * dialogs for other UI clients, and returns the answers as text for the model plus structured
     * details for rendering. Throws when there is no interactive UI.
     *
     * @param _toolCallId - ID of this tool call (unused).
     * @param params - Validated tool arguments holding the questions.
     * @param signal - Abort signal that cancels the questions.
     * @param _onUpdate - Partial-result callback (unused).
     * @param ctx - Extension context with the UI and its mode.
     */
    // oxlint-disable-next-line max-params, local/single-object-param -- arity fixed by ToolDefinition.execute
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      let details: AskDetails;
      const args = { ui: ctx.ui, questions: params.questions, signal };
      if (ctx.mode === "tui") details = await runQuestionsTui(args);
      else if (ctx.hasUI) details = await runQuestionsDialogs(args);
      else
        throw new Error(
          "ask_user_question needs an interactive UI. Ask the user in plain text instead.",
        );

      return {
        content: [{ type: "text", text: buildResultText(details) }],
        details,
      };
    },

    /**
     * Renders the tool call line shown while the questions are pending.
     *
     * @param args - Tool arguments so far, possibly partial while streaming.
     * @param theme - Theme used to colour the line.
     */
    // oxlint-disable-next-line local/single-object-param -- arity fixed by ToolDefinition.renderCall
    renderCall: (args, theme) => renderAskCall({ args, theme }),
    /**
     * Renders the answered (or cancelled) result under the tool call.
     *
     * @param result - Tool result holding the answers.
     * @param _options - Render options (unused).
     * @param theme - Theme used to colour the lines.
     */
    // oxlint-disable-next-line local/single-object-param -- arity fixed by ToolDefinition.renderResult
    renderResult: (result, _options, theme) =>
      renderAskResult({ result, theme }),
  });
}
