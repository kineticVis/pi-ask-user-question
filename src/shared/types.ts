import type { AskQuestion } from "../extension/schemas.ts";

export type Answer = {
  header: string;
  question: string;
  selected: string[];
  custom?: string;
};

export type AskDetails = {
  questions: AskQuestion[];
  answers: Answer[];
  cancelled: boolean;
};

export type Row =
  | { kind: "option"; index: number; label: string; description?: string }
  | { kind: "other" }
  | { kind: "done" };

export type QuestionState = {
  cursor: number;
  checked: Set<number>;
  custom?: string;
  answered: boolean;
};
