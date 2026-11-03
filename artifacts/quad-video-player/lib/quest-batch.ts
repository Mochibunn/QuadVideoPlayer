/** Sequential storyteller quest batches. One model call at a time; finished quests are kept. */
export const STORY_QUEST_CAPACITY = 10;
export const MAX_QUEST_BATCH = 5;

export function openStoryQuestSlots(quests: readonly { claimed: boolean }[]): number {
  const unclaimed = quests.filter((quest) => !quest.claimed).length;
  return Math.max(0, STORY_QUEST_CAPACITY - unclaimed);
}

export function clampBatchCount(value: number, openSlots: number): number {
  const limit = Math.max(0, Math.min(MAX_QUEST_BATCH, openSlots));
  if (limit === 0) return 0;
  const n = Number.isFinite(value) ? Math.round(value) : 1;
  return Math.max(1, Math.min(limit, n));
}

export type BatchStop = 'done' | 'cancelled' | 'model' | 'full';

export async function runQuestBatch<Q>(options: {
  count: number;
  generate: () => Promise<Q | null>;
  add: (quest: Q) => boolean;
  isCancelled: () => boolean;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ added: Q[]; stop: BatchStop }> {
  const added: Q[] = [];
  for (let index = 0; index < options.count; index += 1) {
    if (options.isCancelled()) return { added, stop: 'cancelled' };
    options.onProgress?.(index, options.count);
    const quest = await options.generate();
    if (!quest) return { added, stop: 'model' };
    if (!options.add(quest)) return { added, stop: 'full' };
    added.push(quest);
    options.onProgress?.(index + 1, options.count);
  }
  return { added, stop: options.isCancelled() && added.length < options.count ? 'cancelled' : 'done' };
}

export function batchSummary(added: number, requested: number, stop: BatchStop): string {
  const kept = `${added} of ${requested} quest${requested === 1 ? '' : 's'} added`;
  if (stop === 'cancelled') return `Batch stopped. ${kept}; finished quests were kept.`;
  if (stop === 'model') return `The model stopped answering. ${kept}; check Storyteller AI status.`;
  if (stop === 'full') return `Your quest journal is full. ${kept}. Claim a storyteller quest to free a slot.`;
  return `${kept} to the guild ledger.`;
}
