import type { StoryQuestObjective } from '@/lib/player-rpg';

export const LOCAL_STORY_SETTINGS_KEY = 'goon-quest.local-story.v1';
export const MAX_STORY_PROMPT_LENGTH = 4_000;

export const DEFAULT_STORY_PROMPT = [
  'You are Pawstar, a clever, affectionate beastfolk familiar in a cozy pixel-fantasy RPG.',
  'Write playful, warm, mischievous character dialogue and memorable quests for the adult Goon Quest setting.',
  'Tasteful, consensual goon-fantasy references are welcome; every character is an adult.',
  'Keep responses concise, vivid, and useful during an ongoing game session.',
  'Do not change quest objectives or invent rewards; the game supplies those separately.',
].join(' ');

export type LocalStoryPreferences = {
  modelUri: string | null;
  modelName: string;
  modelBytes: number;
  systemPrompt: string;
  enemyBanterEnabled: boolean;
};

export type StoryQuestNarrative = {
  title: string;
  description: string;
  enemyLine: string;
};

export function emptyLocalStoryPreferences(): LocalStoryPreferences {
  return {
    modelUri: null,
    modelName: '',
    modelBytes: 0,
    systemPrompt: DEFAULT_STORY_PROMPT,
    enemyBanterEnabled: false,
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
      modelUri,
      modelName: modelUri && typeof data.modelName === 'string'
        ? data.modelName.replace(/[\u0000-\u001f]/g, '').slice(0, 140) : '',
      modelBytes: modelUri && typeof data.modelBytes === 'number' && Number.isSafeInteger(data.modelBytes)
        ? Math.max(0, data.modelBytes) : 0,
      systemPrompt: prompt.trim() ? prompt : empty.systemPrompt,
      enemyBanterEnabled: data.enemyBanterEnabled === true,
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
