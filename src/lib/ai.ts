import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// All Claude calls happen here, on the server. The API key never reaches the browser.

export const AI_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5";

// Models that accept the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export class AiError extends Error {
  constructor(message: string, public retryable = true) {
    super(message);
  }
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  return client;
}

/**
 * One-shot text completion. Returns the concatenated text blocks.
 * Throws AiError with a user-friendly message on failure.
 */
export async function complete({
  system,
  user,
  maxTokens = 8000,
  effort = "low",
}: {
  system: string;
  user: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}): Promise<string> {
  if (!aiConfigured()) throw new AiError("AI features need an ANTHROPIC_API_KEY in your .env file.", false);
  const useFallback = FALLBACK_MODELS.has(AI_MODEL);
  try {
    const res = await getClient().beta.messages.create({
      model: AI_MODEL,
      max_tokens: maxTokens,
      system,
      output_config: { effort },
      messages: [{ role: "user", content: user }],
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (res.stop_reason === "refusal") throw new AiError("The AI declined this request. Try rephrasing or removing sensitive details.", false);
    if (res.stop_reason === "max_tokens") throw new AiError("That text was too long to process in one go. Try pasting a smaller chunk.", false);
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (!text) throw new AiError("The AI returned an empty response. Please try again.");
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("Your Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.", false);
    if (e instanceof Anthropic.NotFoundError) throw new AiError(`Model "${AI_MODEL}" wasn't found. Check ANTHROPIC_MODEL in .env.`, false);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("The AI service is busy (rate limited). Wait a moment and retry.");
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`The AI request was rejected: ${e.message}`, false);
    if (e instanceof Anthropic.APIError) throw new AiError("The AI service had a problem. Please retry in a moment.");
    console.error("AI call failed", e);
    throw new AiError("Couldn't reach the AI service. Check your connection and retry.");
  }
}
