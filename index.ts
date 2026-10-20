import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAskUserQuestionTool } from "./src/extension/index.ts";

/**
 * Pi extension entry point. Registers the `ask_user_question` tool with the host.
 *
 * @param pi - Extension API the tool is registered with.
 */
export default function askUserQuestion(pi: ExtensionAPI): void {
  registerAskUserQuestionTool(pi);
}
