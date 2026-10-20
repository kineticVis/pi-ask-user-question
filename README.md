# pi-ask-user-question

This Pi extension adds the `ask_user_question` tool, which lets the model ask
the user 1 to 4 multiple-choice questions and get the answers back as a tool
result. Read this to install the extension, to learn how the menu behaves, or
to work on the code.

## Installing

Pi loads any subdirectory of `~/.pi/agent/extensions/` that has an `index.ts`,
so this repo works in place at `~/.pi/agent/extensions/ask-user-question`. To
load it from another path for one session, pass the entry point:

```bash
pi --extension ./index.ts
```

Install the type and lint dependencies with `pnpm install` before you run the
development scripts. Pi itself doesn't need them, because it compiles
TypeScript on load with `jiti`.

## How the questions appear

The tool picks a UI from the mode Pi runs in:

| Mode                   | UI                                                |
| ---------------------- | ------------------------------------------------- |
| TUI                    | Interactive menu with a tab per question          |
| Other UI clients (RPC) | One host select dialog per question, in order     |
| No interactive UI      | Tool error telling the model to ask in plain text |

Every question gets an extra "Type something." row for a free-text answer, so
the model never adds its own "Other" option. The menu adds a "Done" row to
each multi-select question, which confirms the selection.
[`schemas.ts`](src/extension/schemas.ts) holds the parameter schema, including
the limits on questions and options.

### Menu keys

| Key           | Action                                          |
| ------------- | ----------------------------------------------- |
| ↑ / ↓         | Move the cursor                                 |
| Enter         | Pick the row, or submit from the submit tab     |
| Space         | Toggle an option in a multi-select question     |
| 1–9           | Jump to that row and pick it                    |
| Tab / →       | Next question (only with several questions)     |
| Shift+Tab / ← | Previous question (only with several questions) |
| Esc           | Cancel the menu, or close the free-text editor  |

With one question, picking a single-select option returns the answer straight
away. With several, the menu moves to the next unanswered question after each
answer and ends on a submit tab, where Enter submits once every question has an
answer.

## The tool result

When the user answers, the model receives each question paired with its answer,
and the result's `details` holds the questions and answers for rendering. When
the user cancels, the model receives a note that the user declined, with an
instruction to ask how to proceed. Cancelling discards any answers given before
it.

## Code layout

- `index.ts` is the Pi entry point and only registers the tool.
- `src/extension/` holds the tool definition, its schema, and the dialog
  fallback for non-TUI clients.
- `src/tui/` holds the interactive menu: session state, key handling, and
  rendering.
- `src/shared/` holds the types and the answer formatting both UIs use.
- `lint/plugin.js` is a local oxlint plugin with this repo's extra rules.

## Development

Run the checks before each commit:

```bash
pnpm typecheck
pnpm lint
pnpm fmt:check
```

`pnpm lint:fix` and `pnpm fmt` fix what they can. The lint config in
[`.oxlintrc.json`](.oxlintrc.json) caps function length, complexity, and
parameter count, and the local plugin requires a single object parameter for
most functions.
