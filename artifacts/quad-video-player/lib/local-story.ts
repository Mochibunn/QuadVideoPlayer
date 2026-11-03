import type { StoryQuestObjective } from '@/lib/player-rpg';

export const LOCAL_STORY_SETTINGS_KEY = 'goon-quest.local-story.v1';
export const MAX_STORY_PROMPT_LENGTH = 4_000;
export const AI_COOLDOWNS = {
  chatCooldownSeconds: { label: 'Pawstar Auto chat', unit: 'seconds', min: 5, max: 300, step: 5, initial: 30 },
  questCooldownMinutes: { label: 'Automatic quests', unit: 'minutes', min: 1, max: 60, step: 1, initial: 15 },
  honorCooldownMinutes: { label: 'Automatic guild honors', unit: 'minutes', min: 1, max: 60, step: 1, initial: 30 },
  cheerCooldownMinutes: { label: 'Automatic cheer notes', unit: 'minutes', min: 1, max: 60, step: 1, initial: 30 },
  combatCooldownSeconds: { label: 'AI combat director', unit: 'seconds', min: 5, max: 120, step: 5, initial: 20 },
} as const;
export type AiCooldownKey = keyof typeof AI_COOLDOWNS;
export function clampAiCooldown(key: AiCooldownKey, value: unknown): number {
  const spec = AI_COOLDOWNS[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(spec.min, Math.min(spec.max, Math.round(value / spec.step) * spec.step)) : spec.initial;
}

export const DEFAULT_STORY_PROMPT = [
  'You are Pawstar, a clever, affectionate beastfolk familiar in a cozy pixel-fantasy RPG.',
  'Write playful, warm, mischievous character dialogue and memorable quests for the adult Goon Quest setting.',
  'Tasteful, consensual goon-fantasy references are welcome; every character is an adult.',
  'Keep responses concise, vivid, and useful during an ongoing game session.',
  'Do not change quest objectives or invent rewards; the game supplies those separately.',
].join(' ');

export type LocalStoryPreferences = {
  chatCooldownSeconds: number;
  questCooldownMinutes: number;
  honorCooldownMinutes: number;
  cheerCooldownMinutes: number;
  combatCooldownSeconds: number;
  modelUri: string | null;
  modelName: string;
  modelBytes: number;
  systemPrompt: string;
  enemyBanterEnabled: boolean;
  combatAiEnabled: boolean;
  combatSpeechEnabled: boolean;
  combatAutoTagsEnabled: boolean;
  combatProfanityEnabled: boolean;
  autoQuestGeneration: boolean;
  autoHonorGeneration: boolean;
  autoCheerGeneration: boolean;
};

export type CombatPreferenceKey =
  'combatAiEnabled' | 'combatSpeechEnabled' | 'combatAutoTagsEnabled' | 'combatProfanityEnabled';

export type StoryQuestNarrative = {
  title: string;
  description: string;
  enemyLine: string;
};

export function emptyLocalStoryPreferences(): LocalStoryPreferences {
  return {
    chatCooldownSeconds: 30,
    questCooldownMinutes: 15,
    honorCooldownMinutes: 30,
    cheerCooldownMinutes: 30,
    combatCooldownSeconds: 20,
    modelUri: null,
    modelName: '',
    modelBytes: 0,
    systemPrompt: DEFAULT_STORY_PROMPT,
    enemyBanterEnabled: false,
    combatAiEnabled: false,
    combatSpeechEnabled: true,
    combatAutoTagsEnabled: false,
    combatProfanityEnabled: true,
    autoQuestGeneration: false,
    autoHonorGeneration: false,
    autoCheerGeneration: false,
  };
}

export function parseLocalStoryPreferences(raw: string | null): LocalStoryPreferences {
  const empty = emptyLocalStoryPreferences();
  if (!raw) return empty;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
    const data = parsed as Record<string, unknown>;
    const prompt = typeof data.systemPrompt === 'string'
      ? data.systemPrompt.slice(0, MAX_STORY_PROMPT_LENGTH)
      : empty.systemPrompt;
    const modelUri = typeof data.modelUri === 'string' && data.modelUri.startsWith('file://')
      ? data.modelUri : null;
    return {
      chatCooldownSeconds: clampAiCooldown('chatCooldownSeconds', data.chatCooldownSeconds),
      questCooldownMinutes: clampAiCooldown('questCooldownMinutes', data.questCooldownMinutes),
      honorCooldownMinutes: clampAiCooldown('honorCooldownMinutes', data.honorCooldownMinutes),
      cheerCooldownMinutes: clampAiCooldown('cheerCooldownMinutes', data.cheerCooldownMinutes),
      combatCooldownSeconds: clampAiCooldown('combatCooldownSeconds', data.combatCooldownSeconds),
      modelUri,
      modelName: modelUri && typeof data.modelName === 'string'
        ? data.modelName.replace(/[\u0000-\u001f]/g, '').slice(0, 140) : '',
      modelBytes: modelUri && typeof data.modelBytes === 'number' && Number.isSafeInteger(data.modelBytes)
        ? Math.max(0, data.modelBytes) : 0,
      systemPrompt: prompt.trim() ? prompt : empty.systemPrompt,
      enemyBanterEnabled: data.enemyBanterEnabled === true,
      combatAiEnabled: data.combatAiEnabled === true,
      combatSpeechEnabled: data.combatSpeechEnabled !== false,
      combatAutoTagsEnabled: data.combatAutoTagsEnabled === true,
      combatProfanityEnabled: data.combatProfanityEnabled !== false,
      autoQuestGeneration: data.autoQuestGeneration === true,
      autoHonorGeneration: data.autoHonorGeneration === true,
      autoCheerGeneration: data.autoCheerGeneration === true,
    };
  } catch {
    return empty;
  }
}

function cleanOutput(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

export function parseStoryQuestNarrative(text: string): StoryQuestNarrative | null {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const data = value as Record<string, unknown>;
    const title = cleanOutput(data.title, 64);
    const description = cleanOutput(data.description, 280);
    const enemyLine = cleanOutput(data.enemyLine, 180);
    return title && description && enemyLine ? { title, description, enemyLine } : null;
  } catch {
    return null;
  }
}

export function parseCharacterLine(text: string): string | null {
  const clean = cleanOutput(text.replace(/<\|[^|]+\|>/g, ''), 240);
  return clean || null;
}

export function storyQuestPrompt(
  objective: { id: StoryQuestObjective; label: string },
  character: { className: string; companionName: string },
): string {
  return [
    `Write a compact fantasy RPG quest whose exact measurable objective is: ${objective.label}.`,
    `The player is a ${character.className}; their familiar is ${character.companionName}.`,
    'Return only JSON with string fields title, description, and enemyLine.',
    'The description must motivate the supplied objective without adding another task or reward.',
    'enemyLine is one short, playful line the target might say when defeated.',
  ].join(' ');
}

export const MAX_CELEBRATIONS = 5;

export function celebrationPrompt(seed: string): string {
  const clean = cleanOutput(seed, 200) || 'You did it';
  return [
    `Write ${MAX_CELEBRATIONS} short, upbeat celebration lines in a cozy fantasy guild voice, inspired by: "${clean}".`,
    'Each line under 16 words, encouraging and non-graphic. Vary the wording.',
    'Return only JSON: {"lines": [string, ...]}.',
  ].join(' ');
}

export function parseCelebrations(text: string): string[] {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  let lines: unknown[] = [];
  if (json) {
    try {
      const value = JSON.parse(json) as { lines?: unknown };
      if (Array.isArray(value?.lines)) lines = value.lines;
    } catch { /* fall through to line split */ }
  }
  if (!lines.length) lines = text.split(/\n+/).map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, ''));
  const seen = new Set<string>();
  return lines.map((line) => cleanOutput(line, 120).replace(/^"|"$/g, ''))
    .filter((line) => line.length >= 3 && !seen.has(line.toLowerCase()) && (seen.add(line.toLowerCase()), true))
    .slice(0, MAX_CELEBRATIONS);
}

export function honorIdeaPrompt(context: { className: string; companionName: string }): string {
  return [
    `Invent one guild honor title for a ${context.className} adventurer whose familiar is ${context.companionName}.`,
    'title: 2 to 4 words. description: one short, non-graphic sentence of flavor praising persistence in battle.',
    'Do not mention numbers, rewards, or goals; the game sets those.',
    'Return only JSON with string fields title and description.',
  ].join(' ');
}

export function parseHonorIdea(text: string): { title: string; description: string } | null {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Record<string, unknown>;
    const title = cleanOutput(value?.title, 48);
    const description = cleanOutput(value?.description, 110);
    return title && description ? { title, description } : null;
  } catch {
    return null;
  }
}
