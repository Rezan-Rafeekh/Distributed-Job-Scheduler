import Anthropic from "@anthropic-ai/sdk";
import { ServiceUnavailableError } from "./errors.js";

export class AiNotConfiguredError extends ServiceUnavailableError {
  constructor() {
    super("AI-generated failure summaries require ANTHROPIC_API_KEY to be set on the server");
  }
}

let client: Anthropic | undefined;

/** Lazily constructed so a missing API key only breaks the AI-summary feature, not the whole API. */
export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiNotConfiguredError();
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}
