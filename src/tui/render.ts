import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { AskQuestion } from "../extension/schemas.ts";
import type { AskDetails } from "../shared/types.ts";

type AskCallArgs = {
  questions?: Partial<AskQuestion>[];
};

type AskResultView = {
  details?: unknown;
  content: { type: string; text?: string }[];
};

export type AskCallRender = {
  args: AskCallArgs;
  theme: Theme;
};

export type AskResultRender = {
  result: AskResultView;
  theme: Theme;
};

/**
 * Renders the tool call line: the tool name, how many questions were asked, and their headers.
 * Copes with partial arguments while the call is still streaming in.
 *
 * @param render - The call arguments and the theme.
 * @param render.args - Tool arguments so far, possibly partial while streaming.
 * @param render.theme - Theme used to colour the line.
 */
export function renderAskCall(render: AskCallRender): Text {
  const { args, theme } = render;
  const qs = Array.isArray(args.questions) ? args.questions : [];
  const headers = qs.map((question) => question?.header).filter(Boolean);
  let text = theme.fg("toolTitle", theme.bold("ask_user_question "));
  text += theme.fg(
    "muted",
    `${qs.length} question${qs.length === 1 ? "" : "s"}`,
  );
  if (headers.length) text += theme.fg("dim", ` (${headers.join(", ")})`);
  return new Text(text, 0, 0);
}

/**
 * Renders the tool result: one line per question with its header and answer (custom text
 * marked "(wrote)"), or "Cancelled by user". Falls back to the plain result text when there
 * are no structured details.
 *
 * @param render - The tool result and the theme.
 * @param render.result - Tool result holding the answers.
 * @param render.theme - Theme used to colour the lines.
 */
export function renderAskResult(render: AskResultRender): Text {
  const { result, theme } = render;
  const details = result.details as AskDetails | undefined;
  if (!details) {
    const first = result.content[0];
    return new Text(first?.type === "text" ? (first.text ?? "") : "", 0, 0);
  }
  if (details.cancelled)
    return new Text(theme.fg("warning", "Cancelled by user"), 0, 0);
  const lines = details.answers.map((answer) => {
    const custom = answer.custom
      ? `${answer.selected.length ? ", " : ""}${theme.fg("muted", "(wrote) ")}${answer.custom}`
      : "";
    return `${theme.fg("success", "✓ ")}${theme.fg("accent", answer.header)}: ${answer.selected.join(", ")}${custom}`;
  });
  return new Text(lines.join("\n"), 0, 0);
}
