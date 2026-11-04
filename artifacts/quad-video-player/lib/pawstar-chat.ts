export type ChatRole = 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };

export const MAX_CHAT_HISTORY = 40;
export const MAX_CHAT_CONTEXT = 10;
export const MAX_CHAT_MESSAGE_LENGTH = 6_000;

export const CHAT_GUARDRAIL =
  'Stay in character and follow the player’s latest topic and role instructions. Give a detailed, coherent answer of about 3–5 paragraphs when useful. Do not invent a new topic, repeat yourself, or ramble. Keep content non-graphic.';

export function autoChatPrompt(history: readonly ChatMessage[], petName: string): string {
  const anchor = [...history].reverse().find((item) => item.role === 'user');
  return anchor
    ? `Continue your answer to the player's latest message: "${anchor.content.slice(0, 1_000)}". Stay on this exact topic and follow the configured character role. Add useful detail in coherent paragraphs without repeating your previous answer. Do not introduce an unrelated plot or topic.`
    : `As ${petName}, introduce yourself in character and describe the current fantasy guild setting in a few detailed paragraphs. Follow the configured character role. Do not invent personal facts about the player.`;
}

export function cleanChatText(text: string, max = MAX_CHAT_MESSAGE_LENGTH): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

export function appendChat(history: readonly ChatMessage[], message: ChatMessage): ChatMessage[] {
  const content = cleanChatText(message.content);
  if (!content) return [...history];
  const all: ChatMessage[] = [...history, { role: message.role, content }];
  const recent = all.slice(-MAX_CHAT_HISTORY);
  if (recent.some((item) => item.role === 'user')) return recent;
  const anchor = [...all].reverse().find((item) => item.role === 'user');
  return anchor ? [anchor, ...recent.slice(-(MAX_CHAT_HISTORY - 1))] : recent;
}

/** Bounded context window for the model: last N turns, starting with a user turn. */
export function chatContext(history: readonly ChatMessage[], limit = MAX_CHAT_CONTEXT): ChatMessage[] {
  const recent = history
    .map((item) => ({ role: item.role, content: cleanChatText(item.content) }))
    .filter((item) => item.content)
    .slice(-limit);
  const firstUser = recent.findIndex((item) => item.role === 'user');
  if (firstUser >= 0) {
    const context = recent.slice(firstUser);
    // Leave room for a verbose answer in the on-device 2048-token context.
    while (context.length > 1 && context.reduce((n, item) => n + item.content.length, 0) > 3_200) context.shift();
    while (context.length && context[0].role !== 'user') context.shift();
    return context.map((item) => ({ ...item, content: item.content.slice(0, 3_200) }));
  }
  const anchor = [...history].reverse().find((item) => item.role === 'user');
  return anchor ? [{ role: 'user', content: cleanChatText(anchor.content) }, ...recent.slice(-(limit - 1))] : [];
}

export function chatSystemPrompt(rolePrompt: string | undefined, fallback: string): string {
  const role = cleanChatText(rolePrompt ?? '', 1_200) || fallback;
  return `${role}\n${CHAT_GUARDRAIL}`;
}

export function parseChatReply(text: string): string | null {
  const clean = cleanChatText(text.replace(/<\|[^|]+\|>/g, '').replace(/^(assistant|pawstar)\s*:\s*/i, ''), 6_000);
  return clean || null;
}
