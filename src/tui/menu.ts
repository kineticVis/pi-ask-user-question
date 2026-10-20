import type {
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Editor,
  type EditorTheme,
  type TUI,
} from "@earendil-works/pi-tui";
import type { AskQuestion } from "../extension/schemas.ts";
import { buildAnswer } from "../shared/answers.ts";
import type { AskDetails } from "../shared/types.ts";
import { updateCustomAnswer, updateMenuFromKey } from "./input.ts";
import { buildMenuSession, type MenuController } from "./session.ts";
import { renderMenu } from "./view.ts";

type MenuOptions = {
  tui: TUI;
  theme: Theme;
  questions: AskQuestion[];
  signal: AbortSignal | undefined;
  done: (result: AskDetails) => void;
};

type RenderCache = { lines: string[] | undefined };

type MenuControllerArgs = MenuOptions & {
  session: MenuController["session"];
  editor: Editor;
  cache: RenderCache;
};

export type QuestionsTuiArgs = {
  ui: ExtensionUIContext;
  questions: AskQuestion[];
  signal: AbortSignal | undefined;
};

/**
 * Builds the free-text editor's colours from the pi theme.
 *
 * @param theme - Pi theme to take the colours from.
 */
function buildEditorTheme(theme: Theme): EditorTheme {
  return {
    borderColor: (str) => theme.fg("accent", str),
    selectList: {
      selectedPrefix: (str) => theme.fg("accent", str),
      selectedText: (str) => theme.fg("accent", str),
      description: (str) => theme.fg("muted", str),
      scrollInfo: (str) => theme.fg("dim", str),
      noMatch: (str) => theme.fg("warning", str),
    },
  };
}

/**
 * Shows the questions as an interactive menu in the TUI and resolves with the answers once the
 * user submits, or with a cancelled result on Esc or when `signal` aborts.
 *
 * @param args - The questions to ask and where to ask them.
 * @param args.ui - Host UI that shows the custom menu.
 * @param args.questions - Questions to ask.
 * @param args.signal - Abort signal that cancels the menu.
 */
export async function runQuestionsTui(
  args: QuestionsTuiArgs,
): Promise<AskDetails> {
  const { ui, questions, signal } = args;
  // oxlint-disable-next-line max-params -- arity fixed by ExtensionUIContext.custom
  return ui.custom<AskDetails>((tui, theme, _kb, done) =>
    createMenuComponent({ tui, theme, questions, signal, done }),
  );
}

/**
 * Creates the menu component: its state, its free-text editor, and the render, input and
 * dispose hooks the TUI calls. Calls `done` exactly once, when the menu finishes or is
 * cancelled.
 *
 * @param options - What the menu needs from the TUI and the tool call.
 * @param options.tui - TUI that owns the component and repaints it.
 * @param options.theme - Theme used to colour the menu.
 * @param options.questions - Questions to ask.
 * @param options.signal - Abort signal that cancels the menu.
 * @param options.done - Called once with the answers or a cancelled result.
 */
function createMenuComponent(
  options: MenuOptions,
): Component & { dispose(): void } {
  const { tui, theme, questions, signal } = options;
  const session = buildMenuSession(questions);
  const editor = new Editor(tui, buildEditorTheme(theme));
  const cache: RenderCache = { lines: undefined };
  const { ctl, onAbort } = createMenuController({
    ...options,
    session,
    editor,
    cache,
  });
  editor.onSubmit = (value) => updateCustomAnswer({ ctl, value });

  return {
    /**
     * Returns the menu's lines, rendering them only when the cache was cleared by a state change.
     *
     * @param width - Available width in terminal columns.
     */
    render(width) {
      cache.lines ??= renderMenu({
        session,
        theme,
        editor,
        width: Math.max(1, width),
      });
      return cache.lines;
    },
    /**
     * Clears the cached lines so the next render redraws, for example after a theme change.
     */
    invalidate: () => {
      cache.lines = undefined;
    },
    /**
     * Applies a key press from the TUI to the menu.
     *
     * @param data - Raw key data from the terminal.
     */
    handleInput: (data) => updateMenuFromKey({ ctl, data }),
    /**
     * Detaches the abort listener when the TUI tears the component down.
     */
    dispose: () => signal?.removeEventListener("abort", onAbort),
  };
}

/**
 * Creates the menu controller and attaches its abort listener to `signal`. The controller's
 * `stop` calls `done` exactly once.
 *
 * @param args - Menu options plus the session, editor and render cache the controller drives.
 */
function createMenuController(args: MenuControllerArgs): {
  ctl: MenuController;
  onAbort: () => void;
} {
  const { tui, questions, signal, done, session, editor, cache } = args;
  let finished = false;

  /**
   * Cancels the menu when the tool call's abort signal fires.
   */
  const onAbort = (): void => ctl.stop(true);
  const ctl: MenuController = {
    session,
    editor,
    /**
     * Drops the cached lines and asks the TUI to repaint.
     */
    refresh() {
      cache.lines = undefined;
      tui.requestRender();
    },
    /**
     * Finishes the menu once: detaches the abort listener and reports the answers, or an empty
     * cancelled result. Later calls do nothing.
     *
     * @param cancelled - Whether the user cancelled instead of submitting.
     */
    stop(cancelled) {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", onAbort);
      const answers = cancelled
        ? []
        : questions.map((question, index) =>
            buildAnswer({ question, state: session.states[index] }),
          );
      done({ questions, answers, cancelled });
    },
  };
  signal?.addEventListener("abort", onAbort);
  return { ctl, onAbort };
}
