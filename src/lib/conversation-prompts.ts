import {
  DEFAULT_CONVERSATION_PROMPTS,
  MAX_CONVERSATION_PROMPT_LENGTH,
  type ConversationPrompts,
} from "../conversation-prompt-types";

const storageKey = "nemodoc-conversation-prompts";

export function readConversationPrompts(): ConversationPrompts {
  const fallback = { ...DEFAULT_CONVERSATION_PROMPTS };
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return fallback;
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return fallback;
    const value = parsed as Partial<ConversationPrompts>;
    const prompt = (mode: keyof ConversationPrompts) => {
      const candidate = value[mode];
      return typeof candidate === "string" &&
        candidate.length <= MAX_CONVERSATION_PROMPT_LENGTH
        ? candidate
        : fallback[mode];
    };
    return { quick: prompt("quick"), deep: prompt("deep") };
  } catch {
    return fallback;
  }
}

export function saveConversationPrompts(prompts: ConversationPrompts) {
  localStorage.setItem(storageKey, JSON.stringify(prompts));
}
