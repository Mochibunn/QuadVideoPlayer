export type ChatRole = 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };

export const MAX_CHAT_HISTORY = 40;
export const MAX_CHAT_CONTEXT = 10;
export const MAX_CHAT_MESSAGE_LENGTH = 500;

export const CHAT_GUARDRAIL =
  'Stay in character. Keep replies under 50 words, friendly, and non-graphic. Do not describe explicit acts.';

export function cleanChatText(text: string, max = MAX_CHAT_MESSAGE_LENGTH): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

export function appendChat(history: readonly ChatMessage[], message: ChatMessage): ChatMessage[] {
  const content = cleanChatText(message.content);
  if (!content) return [...history];
  return [...history, { role: message.role, content }].slice(-MAX_CHAT_HISTORY);
}

/** Bounded context window for the model: last N turns, starting with a user turn. */
export function chatContext(history: readonly ChatMessage[], limit = MAX_CHAT_CONTEXT): ChatMessage[] {
  const recent = history
    .map((item) => ({ role: item.role, content: cleanChatText(item.content) }))
    .filter((item) => item.content)
    .slice(-limit);
  const firstUser = recent.findIndex((item) => item.role === 'user');
  return firstUser < 0 ? [] : recent.slice(firstUser);
}

export function chatSystemPrompt(rolePrompt: string | undefined, fallback: string): string {
  const role = cleanChatText(rolePrompt ?? '', 1_200) || fallback;
  return `${role}\n${CHAT_GUARDRAIL}`;
}

export function parseChatReply(text: string): string | null {
  const clean = cleanChatText(text.replace(/<\|[^|]+\|>/g, '').replace(/^(assistant|pawstar)\s*:\s*/i, ''), 400);
  return clean || null;
}
