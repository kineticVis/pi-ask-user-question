import { type Static, Type } from "typebox";

export const OptionSchema = Type.Object({
  label: Type.String({
    description: "Short choice text (1–5 words) shown in the menu",
  }),
  description: Type.Optional(
    Type.String({
      description:
        "What this option means or its trade-offs, shown under the label",
    }),
  ),
});

export const QuestionSchema = Type.Object({
  question: Type.String({
    description: "The full question, ending with a question mark",
  }),
  header: Type.String({
    description:
      "Very short label for the tab bar, max ~12 chars, e.g. 'Auth', 'Library'",
  }),
  options: Type.Array(OptionSchema, {
    minItems: 2,
    maxItems: 4,
    description:
      "2–4 distinct choices. Do not add an 'Other' option; one is added automatically.",
  }),
  multiSelect: Type.Optional(
    Type.Boolean({
      description:
        "Allow choosing several options instead of exactly one (default false)",
    }),
  ),
});

export const AskParams = Type.Object({
  questions: Type.Array(QuestionSchema, {
    minItems: 1,
    maxItems: 4,
    description: "1–4 questions to ask",
  }),
});

export type AskQuestion = Static<typeof QuestionSchema>;
