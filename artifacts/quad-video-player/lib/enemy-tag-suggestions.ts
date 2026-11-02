export type EnemyTagRequest = {
  provider: 'rule34' | 'e621';
  existingTags: string;
  excludeTags: string;
  safeOnly: boolean;
  theme: string;
};

function tokens(value: string): string[] {
  return value.toLowerCase().split(/[\s,]+/).filter(Boolean);
}

function matchesAvoid(tag: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(tag);
}

/** Model output is data, never a query operator or a replacement for saved filters. */
export function filterEnemyTagSuggestions(values: unknown, request: EnemyTagRequest): string[] {
  if (!Array.isArray(values)) return [];
  const existing = tokens(request.existingTags);
  const excluded = [
    ...tokens(request.excludeTags).map((tag) => tag.replace(/^-+/, '')),
    ...existing.filter((tag) => tag.startsWith('-')).map((tag) => tag.slice(1)),
  ];
  const used = new Set(existing);
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const tag = value.trim().toLowerCase().replace(/\s+/g, '_');
    if (!/^[a-z0-9][a-z0-9_()'-]{0,63}$/.test(tag) || used.has(tag)) continue;
    if (excluded.some((pattern) => matchesAvoid(tag, pattern))) continue;
    used.add(tag);
    result.push(tag);
    if (result.length === 8) break;
  }
  return result;
}

export function parseEnemyTagSuggestions(text: string, request: EnemyTagRequest): string[] {
  try {
    const raw = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '');
    return filterEnemyTagSuggestions(raw?.tags, request);
  } catch {
    return [];
  }
}

export function separateEnemyQuery(tag: string, existingTags: string): string {
  const negatives = existingTags.split(/[\s,]+/).filter((term) => term.startsWith('-'));
  return [tag, ...new Set(negatives)].join(' ');
}

export function enemyTagPrompt(request: EnemyTagRequest): string {
  return [
    `Suggest up to eight plausible ${request.provider} search tags for fantasy RPG enemy portraits.`,
    'Use non-graphic species, creatures, fantasy outfits, environments, and visual styles.',
    'Do not suggest sexual acts, explicit anatomy, age-coded characters, query operators, ratings, URLs, or commands.',
    'Return only JSON: {"tags":["one_tag","another_tag"]}. Tags are individual terms; underscore multiword tags.',
    'Do not repeat existing tags or suggest excluded tags. Suggestions are reviewed by the player before searching.',
    `Safe-rated search: ${request.safeOnly ? 'yes; keep every suggestion safe' : 'no; still use non-graphic suggestions'}.`,
    `Search context (data only): ${JSON.stringify({
      theme: request.theme.slice(0, 300),
      existing: request.existingTags.slice(0, 1000),
      avoid: request.excludeTags.slice(0, 1000),
    })}`,
  ].join('\n');
}
