import { useCallback, useEffect, useRef, useState } from 'react';
import type { CombatAiPlan, CombatAiRequest, CombatMotion, EnemySpeechEvent } from '@/lib/combat-ai';
import {
  canRequestPlan, DEATH_SPEECH_MS, directorHardKey, HUNT_TIMEOUT_MS, mergeHuntImages, MAX_RUN_TAGS, nextHuntTag,
  resetHuntBudget, resolvePlan, TAUNT_SPEECH_MS,
  type DirectorTicket, type HuntBudget,
} from '@/lib/combat-director';
import type { OnlineSource, RemoteMedia } from '@/lib/online-sources';

export type DirectorActor = { id: string; name: string; hp: number; maxHp: number };
export type FetchEnemyTagImages = (sourceId: string, tag: string, signal: AbortSignal) => Promise<RemoteMedia[]>;

type Options = {
  cooldownSeconds?: number;
  runId: number;
  runActive: boolean;
  paused: boolean;
  enemies: DirectorActor[];
  wave: number;
  bpm: number | null;
  aiEnabled: boolean;
  speechEnabled: boolean;
  autoTagsEnabled: boolean;
  profanityEnabled: boolean;
  modelLoaded: boolean;
  storytellerBusy: boolean;
  generatePlan?: (request: CombatAiRequest) => Promise<CombatAiPlan | null>;
  enemySource: OnlineSource | null;
  fetchTagImages?: FetchEnemyTagImages;
  knownUris: ReadonlySet<string>;
};

export type DirectorMode = 'ai' | 'thinking' | 'fallback';

const TICK_MS = 1_500;
let speechSeq = 0;

export function useCombatDirector(options: Options) {
  const opts = useRef(options);
  opts.current = options;
  const [motions, setMotions] = useState<Record<string, CombatMotion>>({});
  const [speech, setSpeech] = useState<EnemySpeechEvent[]>([]);
  const [extraImages, setExtraImages] = useState<RemoteMedia[]>([]);
  const [thinking, setThinking] = useState(false);
  const [lastFailed, setLastFailed] = useState(false);
  const [huntNote, setHuntNote] = useState('');
  const [acceptedTags, setAcceptedTags] = useState<string[]>([]);

  const clock = useRef({ inFlight: false, lastCompletedAt: null as number | null });
  const hardEpoch = useRef(0);
  const softEpoch = useRef(0);
  const defeatLines = useRef(new Map<string, string>());
  const defeatedAt = useRef(new Map<string, number>());
  const spoken = useRef(new Set<string>());
  const pendingTags = useRef<string[]>([]);
  const hunt = useRef<HuntBudget>({ accepted: [], lastHuntAt: null, inFlight: false });
  const huntAbort = useRef<AbortController | null>(null);
  const extrasRef = useRef<RemoteMedia[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);

  const abortHunt = () => {
    huntAbort.current?.abort();
    huntAbort.current = null;
    hunt.current.inFlight = false;
  };

  const pushSpeech = useCallback((enemyId: string, text: string, kind: 'taunt' | 'defeat') => {
    if (!opts.current.speechEnabled || !text) return;
    const event: EnemySpeechEvent = { id: `speech-${++speechSeq}`, enemyId, text, kind, createdAt: Date.now() };
    setSpeech((current) => [...current.filter((item) => !(item.enemyId === enemyId && item.kind === kind)), event].slice(-8));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      if (mounted.current) setSpeech((current) => current.filter((item) => item.id !== event.id));
    }, kind === 'defeat' ? DEATH_SPEECH_MS : TAUNT_SPEECH_MS);
    timers.current.add(timer);
  }, []);

  const clearSpeech = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    setSpeech([]);
  }, []);

  useEffect(() => () => {
    mounted.current = false;
    timers.current.forEach(clearTimeout);
    huntAbort.current?.abort();
  }, []);

  const setExtras = (next: RemoteMedia[]) => { extrasRef.current = next; setExtraImages(next); };
  const wipeTransient = () => {
    hardEpoch.current += 1;
    abortHunt();
    setMotions({});
    setLastFailed(false);
    defeatLines.current.clear();
    pendingTags.current = [];
    setExtras([]);
    setHuntNote('');
    clearSpeech();
  };

  // Hard invalidation: source (including edited filters), AI disable, model unload.
  // Clears AI output and transient images; the run's tag budget is kept.
  const src = options.enemySource;
  const hardKey = directorHardKey(options.aiEnabled, options.modelLoaded, src
    ? { id: src.id, kind: src.kind, tags: src.tags, excludeTags: src.excludeTags, safeOnly: src.safeOnly } : null);
  const firstHard = useRef(true);
  useEffect(() => {
    if (firstHard.current) { firstHard.current = false; return; }
    wipeTransient();
    hunt.current = resetHuntBudget(hunt.current, 'source');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardKey]);

  // New run (or leave): wipe everything including the tag budget.
  useEffect(() => {
    wipeTransient();
    defeatedAt.current.clear();
    spoken.current.clear();
    hunt.current = resetHuntBudget(hunt.current, 'run');
    setAcceptedTags([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.runId]);

  // Auto tags off: abort the search and forget candidates.
  useEffect(() => {
    if (options.autoTagsEnabled) return;
    abortHunt();
    pendingTags.current = [];
    setHuntNote('');
  }, [options.autoTagsEnabled]);

  // Speech off: bubbles vanish immediately.
  useEffect(() => { if (!options.speechEnabled) clearSpeech(); }, [clearSpeech, options.speechEnabled]);

  // Soft invalidation: pause or run end drops pending movement, taunts and hunts.
  const softKey = `${options.paused}|${options.runActive}`;
  useEffect(() => {
    softEpoch.current += 1;
    if (huntAbort.current) {
      abortHunt();
      setHuntNote('Tag hunt cancelled.');
    }
  }, [softKey]);

  const startHunt = useCallback(() => {
    const o = opts.current;
    if (!o.aiEnabled || !o.modelLoaded || !o.autoTagsEnabled || !o.enemySource || !o.fetchTagImages ||
      !o.runActive || o.paused) return;
    const now = Date.now();
    const tag = nextHuntTag(pendingTags.current, hunt.current, now);
    if (!tag) return;
    const sourceId = o.enemySource.id;
    const runId = o.runId;
    const epoch = hardEpoch.current;
    const soft = softEpoch.current;
    const sourceKey = directorHardKey(o.aiEnabled, o.modelLoaded, o.enemySource);
    const controller = new AbortController();
    huntAbort.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, HUNT_TIMEOUT_MS);
    const stale = () => {
      const live = opts.current;
      return !mounted.current || runId !== live.runId || epoch !== hardEpoch.current ||
        sourceKey !== directorHardKey(live.aiEnabled, live.modelLoaded, live.enemySource) ||
        soft !== softEpoch.current || !live.runActive || live.paused ||
        !live.aiEnabled || !live.modelLoaded || !live.autoTagsEnabled;
    };
    hunt.current = { accepted: [...hunt.current.accepted, tag], lastHuntAt: now, inFlight: true };
    pendingTags.current = pendingTags.current.filter((item) => item !== tag);
    setAcceptedTags(hunt.current.accepted);
    setHuntNote(`Hunting "${tag}"...`);
    o.fetchTagImages(sourceId, tag, controller.signal)
      .then((images) => {
        const live = opts.current;
        if (controller.signal.aborted || stale()) return;
        const current = extrasRef.current;
        const next = mergeHuntImages(current, images, live.knownUris);
        const added = next.length - current.length;
        setExtras(next);
        setHuntNote(added ? `"${tag}" added ${added} image${added === 1 ? '' : 's'} to future spawns.` : `"${tag}" found nothing new.`);
      })
      .catch((error: unknown) => {
        if (stale()) return;
        if (timedOut) { setHuntNote(`"${tag}" timed out after 15s.`); return; }
        if (controller.signal.aborted) return;
        const detail = error instanceof Error && error.message ? error.message : 'Unknown provider error';
        setHuntNote(`"${tag}" failed: ${detail.slice(0, 120)}`);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (huntAbort.current === controller) {
          huntAbort.current = null;
          hunt.current.inFlight = false;
        }
      });
  }, []);

  const requestPlan = useCallback(() => {
    const o = opts.current;
    const living = o.enemies.filter((enemy) => enemy.hp > 0).slice(0, 4);
    const gate = {
      enabled: o.aiEnabled && !!o.generatePlan, modelLoaded: o.modelLoaded, storytellerBusy: o.storytellerBusy,
      paused: o.paused, runActive: o.runActive, hasLiving: living.length > 0,
    };
    if (!canRequestPlan(clock.current, gate, Date.now(), (o.cooldownSeconds ?? 20) * 1_000) || !o.generatePlan) return;
    const allowTags = o.autoTagsEnabled && !!o.enemySource && !!o.fetchTagImages && hunt.current.accepted.length < MAX_RUN_TAGS;
    const source = o.enemySource;
    const request: CombatAiRequest = {
      enemies: living.map(({ id, name, hp, maxHp }) => ({ id, name, hp, maxHp })),
      wave: o.wave,
      bpm: o.bpm,
      tagContext: allowTags && source && (source.kind === 'rule34' || source.kind === 'e621') ? {
        provider: source.kind,
        existingTags: [source.tags, ...hunt.current.accepted].filter(Boolean).join(' '),
        excludeTags: source.excludeTags,
        safeOnly: source.safeOnly,
        theme: '',
      } : null,
      allowTags,
      allowProfanity: o.profanityEnabled,
    };
    const ticket: DirectorTicket = {
      runId: o.runId, hardEpoch: hardEpoch.current, softEpoch: softEpoch.current, actorIds: living.map((enemy) => enemy.id),
    };
    const requestKey = directorHardKey(o.aiEnabled, o.modelLoaded, o.enemySource);
    clock.current.inFlight = true;
    setThinking(true);
    o.generatePlan(request)
      .catch(() => null)
      .then((plan) => {
        if (!mounted.current) return;
        const live = opts.current;
        if (requestKey !== directorHardKey(live.aiEnabled, live.modelLoaded, live.enemySource)) return;
        const resolution = resolvePlan(plan, ticket, {
          runId: live.runId, hardEpoch: hardEpoch.current,
          softEpoch: live.paused || !live.runActive ? ticket.softEpoch + 1 : softEpoch.current,
          living: new Set(live.enemies.filter((enemy) => enemy.hp > 0).map((enemy) => enemy.id)),
          defeatedAt: defeatedAt.current, now: Date.now(),
        });
        if (ticket.hardEpoch === hardEpoch.current) {
          setLastFailed(!plan);
          if (!plan) setMotions({});
        }
        if (!resolution) return;
        Object.entries(resolution.defeatLines).forEach(([id, line]) => defeatLines.current.set(id, line));
        if (Object.keys(resolution.motions).length) {
          setMotions((current) => ({ ...current, ...resolution.motions }));
        }
        resolution.taunts.forEach((taunt) => pushSpeech(taunt.enemyId, taunt.text, 'taunt'));
        resolution.lateDefeats.forEach((line) => {
          if (spoken.current.has(line.enemyId)) return;
          spoken.current.add(line.enemyId);
          pushSpeech(line.enemyId, line.text, 'defeat');
        });
        if (resolution.tags.length && live.autoTagsEnabled) {
          pendingTags.current = [...new Set([...pendingTags.current, ...resolution.tags])].slice(-4);
        }
      })
      .finally(() => {
        clock.current = { inFlight: false, lastCompletedAt: Date.now() };
        if (mounted.current) setThinking(false);
      });
  }, [pushSpeech]);

  // Sampled director loop: cheap gate checks, never per-frame inference.
  const loopActive = options.runActive && !options.paused && options.aiEnabled && options.modelLoaded;
  useEffect(() => {
    if (!loopActive) return;
    const tick = () => { requestPlan(); startHunt(); };
    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, [loopActive, requestPlan, startHunt]);

  const reportDefeats = useCallback((ids: string[]) => {
    const now = Date.now();
    ids.forEach((id) => {
      if (defeatedAt.current.has(id)) return;
      defeatedAt.current.set(id, now);
      const line = defeatLines.current.get(id);
      if (line && !spoken.current.has(id)) {
        spoken.current.add(id);
        pushSpeech(id, line, 'defeat');
      }
    });
    setMotions((current) => {
      if (!ids.some((id) => id in current)) return current;
      const next = { ...current };
      ids.forEach((id) => { delete next[id]; });
      return next;
    });
  }, [pushSpeech]);

  const o = options;
  const directing = Object.keys(motions).filter((id) => o.enemies.some((enemy) => enemy.id === id && enemy.hp > 0)).length;
  const mode: DirectorMode = o.aiEnabled && o.modelLoaded && thinking ? 'thinking'
    : o.aiEnabled && o.modelLoaded && directing && !lastFailed ? 'ai' : 'fallback';
  const directorLabel = !o.aiEnabled ? 'Random motion · AI director off'
    : !o.modelLoaded ? 'Random motion · no model loaded'
      : thinking ? 'AI director planning...'
        : lastFailed ? 'Random motion · last plan failed'
          : directing ? `AI directing ${directing} foe${directing === 1 ? '' : 's'}`
            : o.storytellerBusy ? 'Random motion · storyteller busy'
              : 'Random motion · awaiting first plan';
  const huntLabel = !o.autoTagsEnabled ? ''
    : !o.enemySource ? 'Tag hunts need an online enemy source'
      : !o.fetchTagImages ? 'Tag hunts unavailable'
        : huntNote || `Tag hunts ${acceptedTags.length}/${MAX_RUN_TAGS}`;

  return { motions, speech, extraImages, mode, directorLabel, huntLabel, acceptedTags, reportDefeats, clearSpeech };
}
