import { filterEnemyTagSuggestions, type EnemyTagRequest } from './enemy-tag-suggestions';

export const COMBAT_PATTERNS = ['wander', 'dash', 'zigzag', 'orbit', 'drift'] as const;
export type CombatPattern = typeof COMBAT_PATTERNS[number];
export type CombatMotion = { pattern: CombatPattern; speed: number; x: number; y: number };
export type CombatActor = { id: string; name: string; hp: number; maxHp: number };
export type CombatAiRequest = {
  enemies: CombatActor[];
  wave: number;
  bpm: number | null;
  tagContext: EnemyTagRequest | null;
  allowTags: boolean;
  allowProfanity: boolean;
};
export type CombatAiActorPlan = {
  id: string; motion: CombatMotion; taunt: string; defeatLine: string;
};
export type CombatAiPlan = { actors: CombatAiActorPlan[]; tags: string[] };
export type EnemySpeechEvent = {
  id: string; enemyId: string; text: string; kind: 'taunt' | 'defeat'; createdAt: number;
};

export const COMBAT_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    strict: true,
    schema: {
      type: 'object',
      properties: {
        actors: {
          type: 'array', maxItems: 4,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              pattern: { type: 'string', enum: [...COMBAT_PATTERNS] },
              speed: { type: 'number' },
              x: { type: 'number' }, y: { type: 'number' },
              taunt: { type: 'string' }, defeatLine: { type: 'string' },
            },
            required: ['id', 'pattern', 'speed', 'x', 'y', 'taunt', 'defeatLine'],
            additionalProperties: false,
          },
        },
        tags: { type: 'array', maxItems: 2, items: { type: 'string' } },
      },
      required: ['actors', 'tags'],
      additionalProperties: false,
    },
  },
};

const bounded = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value)) : fallback;
const phrase = (value: unknown): string => typeof value === 'string'
  ? value.replace(/<\|[^|]+\|>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 120) : '';

export function parseCombatAiPlan(text: string, request: CombatAiRequest): CombatAiPlan | null {
  try {
    const raw = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '');
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.actors)) return null;
    const ids = new Set(request.enemies.slice(0, 4).map((enemy) => enemy.id));
    const seen = new Set<string>();
    const actors: CombatAiActorPlan[] = [];
    for (const actor of raw.actors) {
      if (!actor || typeof actor.id !== 'string' || !ids.has(actor.id) || seen.has(actor.id) ||
        !COMBAT_PATTERNS.includes(actor.pattern)) continue;
      seen.add(actor.id);
      actors.push({
        id: actor.id,
        motion: {
          pattern: actor.pattern,
          speed: bounded(actor.speed, 0.5, 1.6, 1),
          x: bounded(actor.x, 0, 1, 0.5), y: bounded(actor.y, 0, 1, 0.5),
        },
        taunt: phrase(actor.taunt), defeatLine: phrase(actor.defeatLine),
      });
      if (actors.length === 4) break;
    }
    const tags = request.allowTags && request.tagContext
      ? filterEnemyTagSuggestions(raw.tags, request.tagContext).slice(0, 2) : [];
    return actors.length || tags.length ? { actors, tags } : null;
  } catch { return null; }
}

export function combatAiPrompt(request: CombatAiRequest): string {
  return [
    'Direct fantasy image enemies in a live video-overlay RPG. Return compact JSON only.',
    'Choose each actor pattern (wander, dash, zigzag, orbit, drift), speed multiplier 0.5–1.6, and normalized x/y focus 0–1.',
    'Write a short taunt and a witty last line spoken by the enemy when defeated, each under 90 characters.',
    request.allowProfanity ? 'Swearing is welcome in the fantasy banter; do not use hateful slurs.' : 'Keep the language free of profanity.',
    'Keep dialogue non-graphic. No sexual instructions, real-world threats, or invented game rewards.',
    request.allowTags && request.tagContext
      ? 'Also suggest at most two NEW non-graphic species, creature, outfit or scenery tags. No ratings, URLs, operators, age-coded characters, or excluded tags. These will automatically start temporary searches.'
      : 'Return tags as an empty array.',
    'Use only supplied actor IDs. Do not write code or change HP, rewards, damage, or encounter rules.',
    'Output: {"actors":[{"id":"supplied-id","pattern":"orbit","speed":1,"x":0.5,"y":0.5,"taunt":"...","defeatLine":"..."}],"tags":[]}',
    `Scene data: ${JSON.stringify({
      wave: request.wave, bpm: request.bpm,
      enemies: request.enemies.slice(0, 4).map((enemy) => ({ ...enemy, name: enemy.name.slice(0, 80) })),
      search: request.tagContext ? {
        provider: request.tagContext.provider,
        existing: request.tagContext.existingTags.slice(0, 500),
        avoid: request.tagContext.excludeTags.slice(0, 500),
        safeOnly: request.tagContext.safeOnly,
      } : null,
    })}`,
  ].join('\n');
}
