import AsyncStorage from '@react-native-async-storage/async-storage';
import { clampAiCooldown, type AiCooldownKey } from '@/lib/local-story';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import type { LlamaContext } from 'llama.rn';
import { enemyTagPrompt, parseEnemyTagSuggestions, type EnemyTagRequest } from '@/lib/enemy-tag-suggestions';
import {
  COMBAT_RESPONSE_SCHEMA, combatAiPrompt, parseCombatAiPlan,
  type CombatAiPlan, type CombatAiRequest,
} from '@/lib/combat-ai';
import {
  createStoryQuest,
  goonQuestClasses,
  storyQuestObjectiveOptions,
  type PlayerRpgState,
  type StoryQuest,
} from '@/lib/player-rpg';
import {
  LOCAL_STORY_SETTINGS_KEY,
  emptyLocalStoryPreferences,
  parseCharacterLine,
  parseLocalStoryPreferences,
  parseStoryQuestNarrative,
  storyQuestPrompt,
  type LocalStoryPreferences,
  type CombatPreferenceKey,
  celebrationPrompt,
  honorIdeaPrompt,
  parseCelebrations,
  parseHonorIdea,
} from '@/lib/local-story';
import { parseGeneratedAchievements, type PlayerAchievement } from '@/lib/player-achievements';
import { chatContext, chatSystemPrompt, parseChatReply, type ChatMessage } from '@/lib/pawstar-chat';

export type LocalStoryBusy = 'importing' | 'loading' | 'unloading' | 'generating' | null;

const QUEST_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    strict: true,
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        enemyLine: { type: 'string' },
      },
      required: ['title', 'description', 'enemyLine'],
      additionalProperties: false,
    },
  },
};

const LINES_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    strict: true,
    schema: {
      type: 'object',
      properties: { lines: { type: 'array', items: { type: 'string' }, maxItems: 5 } },
      required: ['lines'],
      additionalProperties: false,
    },
  },
};

const HONOR_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    strict: true,
    schema: {
      type: 'object',
      properties: { title: { type: 'string' }, description: { type: 'string' } },
      required: ['title', 'description'],
      additionalProperties: false,
    },
  },
};

const ACHIEVEMENT_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    strict: true,
    schema: {
      type: 'object',
      properties: {
        achievements: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              metric: { type: 'string', enum: ['completedSessions', 'totalPlaybackMs', 'bestSessionMs', 'xp', 'totalVideosWatched', 'miniGamesWon'] },
              target: { type: 'integer' },
            },
            required: ['name', 'description', 'metric', 'target'],
            additionalProperties: false,
          },
        },
      },
      required: ['achievements'],
      additionalProperties: false,
    },
  },
};

const TAG_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    strict: true,
    schema: {
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' }, maxItems: 8 } },
      required: ['tags'],
      additionalProperties: false,
    },
  },
};

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'story-model.gguf';
}

function friendlyModelError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  if (/native.?module|jsi bindings|not found|not installed/i.test(detail)) {
    return 'Local models need the standalone Goon Quest Android app. They cannot run in Expo Go.';
  }
  return detail || 'The local model could not be used.';
}

export function useLocalStoryModel() {
  const [preferences, setPreferences] = useState<LocalStoryPreferences>(emptyLocalStoryPreferences);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [busy, setBusy] = useState<LocalStoryBusy>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState('');
  const contextRef = useRef<LlamaContext | null>(null);
  const completionBusy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(LOCAL_STORY_SETTINGS_KEY)
      .then((raw) => {
        if (!cancelled) setPreferences(parseLocalStoryPreferences(raw));
      })
      .catch(() => {
        if (!cancelled) setError('Local storyteller settings could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setPreferencesReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    AsyncStorage.setItem(LOCAL_STORY_SETTINGS_KEY, JSON.stringify(preferences))
      .catch(() => setError('Local storyteller settings could not be saved.'));
  }, [preferences, preferencesReady]);

  useEffect(() => () => {
    const context = contextRef.current;
    contextRef.current = null;
    if (context) void context.release().catch(() => undefined);
  }, []);

  const updatePrompt = useCallback((systemPrompt: string) => {
    setPreferences((current) => ({ ...current, systemPrompt: systemPrompt.slice(0, 4_000) }));
    setError('');
  }, []);

  const setEnemyBanterEnabled = useCallback((enabled: boolean) => {
    setPreferences((current) => ({ ...current, enemyBanterEnabled: enabled }));
  }, []);

  const setCombatPreference = useCallback((key: CombatPreferenceKey, enabled: boolean) => {
    setPreferences((current) => ({ ...current, [key]: enabled }));
  }, []);
  const setAutomationPreference = useCallback((key: 'autoQuestGeneration' | 'autoHonorGeneration' | 'autoCheerGeneration', enabled: boolean) => {
    setPreferences((current) => ({ ...current, [key]: enabled }));
  }, []);
  const setCooldown = useCallback((key: AiCooldownKey, value: number) => {
    setPreferences((current) => ({ ...current, [key]: clampAiCooldown(key, value) }));
  }, []);

  const importModel = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setError('Local GGUF models are currently available in the Android app only.');
      return;
    }
    setBusy('importing');
    setError('');
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      const asset = picked.canceled ? null : picked.assets?.[0];
      if (!asset) return;
      if (!asset.name.toLowerCase().endsWith('.gguf')) {
        throw new Error('Choose a GGUF model file. It is not downloaded by the app.');
      }
      const documentDirectory = FileSystem.documentDirectory;
      if (!documentDirectory) throw new Error('Private app storage is unavailable.');
      const modelDirectory = `${documentDirectory}local-story-models/`;
      const directoryInfo = await FileSystem.getInfoAsync(modelDirectory);
      if (!directoryInfo.exists) {
        await FileSystem.makeDirectoryAsync(modelDirectory, { intermediates: true });
      }
      const destination = `${modelDirectory}${Date.now()}-${safeFileName(asset.name)}`;
      await FileSystem.moveAsync({ from: asset.uri, to: destination });
      const info = await FileSystem.getInfoAsync(destination);
      if (!info.exists) throw new Error('The model file was not copied into app storage.');
      const bytes = asset.size ?? ('size' in info ? info.size : 0) ?? 0;
      const previousUri = preferences.modelUri;
      if (contextRef.current) {
        const current = contextRef.current;
        contextRef.current = null;
        await current.release();
        setModelLoaded(false);
      }
      const nextPreferences: LocalStoryPreferences = {
        ...preferences,
        modelUri: destination,
        modelName: asset.name,
        modelBytes: bytes,
      };
      await AsyncStorage.setItem(LOCAL_STORY_SETTINGS_KEY, JSON.stringify(nextPreferences));
      setPreferences(nextPreferences);
      if (previousUri && previousUri !== destination) {
        await FileSystem.deleteAsync(previousUri, { idempotent: true }).catch(() => undefined);
      }
      setTestResult('');
    } catch (reason) {
      setError(friendlyModelError(reason));
    } finally {
      setBusy(null);
    }
  }, [preferences]);

  const loadModel = useCallback(async () => {
    if (contextRef.current) {
      setModelLoaded(true);
      return;
    }
    if (Platform.OS !== 'android') {
      setError('Local GGUF models are currently available in the Android app only.');
      return;
    }
    if (!preferences.modelUri) {
      setError('Import a GGUF model before loading it.');
      return;
    }
    setBusy('loading');
    setLoadProgress(0);
    setError('');
    try {
      const info = await FileSystem.getInfoAsync(preferences.modelUri);
      if (!info.exists) throw new Error('The saved model file is missing. Import it again.');
      const { initLlama } = await import('llama.rn');
      const context = await initLlama({
        model: preferences.modelUri,
        n_ctx: 2_048,
        n_batch: 128,
        n_threads: 4,
        n_gpu_layers: 0,
      }, (progress) => {
        const percent = progress <= 1 ? progress * 100 : progress;
        setLoadProgress(Math.max(0, Math.min(100, Math.round(percent))));
      });
      contextRef.current = context;
      setModelLoaded(true);
      setLoadProgress(100);
    } catch (reason) {
      setModelLoaded(false);
      setError(friendlyModelError(reason));
    } finally {
      setBusy(null);
    }
  }, [preferences.modelUri]);

  const unloadModel = useCallback(async () => {
    const context = contextRef.current;
    if (!context) {
      setModelLoaded(false);
      return;
    }
    contextRef.current = null;
    setBusy('unloading');
    setError('');
    try {
      await context.release();
    } catch (reason) {
      setError(friendlyModelError(reason));
    } finally {
      setModelLoaded(false);
      setBusy(null);
    }
  }, []);

  const removeModel = useCallback(() => {
    if (!preferences.modelUri) return;
    Alert.alert(
      'Remove local model?',
      'This deletes the imported GGUF file from this device. It does not affect your quests or prompt.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove model',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await unloadModel();
              await FileSystem.deleteAsync(preferences.modelUri!, { idempotent: true })
                .catch((reason) => setError(friendlyModelError(reason)));
              setPreferences((current) => ({
                ...current,
                modelUri: null,
                modelName: '',
                modelBytes: 0,
              }));
              setModelLoaded(false);
              setTestResult('');
            })();
          },
        },
      ],
    );
  }, [preferences.modelUri, unloadModel]);

  const complete = useCallback(async (
    userPrompt: string,
    options: {
      nPredict: number; json?: boolean; tagSuggestions?: boolean; combatPlan?: boolean;
      schema?: typeof LINES_RESPONSE_SCHEMA | typeof HONOR_RESPONSE_SCHEMA | typeof ACHIEVEMENT_RESPONSE_SCHEMA;
      systemPrompt?: string; history?: ChatMessage[];
    },
  ) => {
    const context = contextRef.current;
    if (!context) throw new Error('Load your local model first.');
    if (completionBusy.current) throw new Error('The model is already writing a response.');
    completionBusy.current = true;
    try {
      await context.clearCache();
      const result = await context.completion({
        messages: options.history
          ? [{ role: 'system', content: options.systemPrompt ?? preferences.systemPrompt }, ...options.history]
          : [
            { role: 'system', content: options.systemPrompt ?? preferences.systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        n_predict: options.nPredict,
        temperature: 0.8,
        top_p: 0.9,
        ...(options.schema ? { response_format: options.schema } : options.combatPlan ? { response_format: COMBAT_RESPONSE_SCHEMA } :
          options.tagSuggestions ? { response_format: TAG_RESPONSE_SCHEMA } :
          options.json ? { response_format: QUEST_RESPONSE_SCHEMA } : {}),
      });
      return result.text;
    } finally {
      completionBusy.current = false;
    }
  }, [preferences.systemPrompt]);

  const generateStoryQuest = useCallback(async (state: PlayerRpgState) => {
    if (!contextRef.current) return null;
    if (completionBusy.current) {
      setError('The local model is busy with another reply. Try again when it finishes.');
      return null;
    }
    setBusy('generating');
    setError('');
    try {
      const objective = storyQuestObjectiveOptions[state.storyQuests.length % storyQuestObjectiveOptions.length];
      const className = goonQuestClasses.find((item) => item.id === state.classId)?.name ?? state.classId;
      const text = await complete(
        storyQuestPrompt(
          { id: objective.id, label: objective.label },
          { className, companionName: state.petName },
        ),
        { nPredict: 180, json: true },
      );
      const narrative = parseStoryQuestNarrative(text);
      if (!narrative) throw new Error('The model did not return a valid quest. Try another instruct-tuned GGUF.');
      const id = `story-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      const quest = createStoryQuest(id, objective.id, narrative.title, narrative.description);
      if (!quest) throw new Error('The generated quest was incomplete.');
      return { quest, enemyLine: narrative.enemyLine };
    } catch (reason) {
      setError(friendlyModelError(reason));
      return null;
    } finally {
      setBusy(null);
    }
  }, [complete]);

  const generateCharacterLine = useCallback(async (scene: string) => {
    if (!contextRef.current || completionBusy.current) return null;
    setBusy('generating');
    setError('');
    try {
      const text = await complete(
        `Write one brief in-character line for this game moment: ${scene.slice(0, 500)}`,
        { nPredict: 80 },
      );
      const line = parseCharacterLine(text);
      if (!line) throw new Error('The model returned an empty line.');
      return line;
    } catch (reason) {
      setError(friendlyModelError(reason));
      return null;
    } finally {
      setBusy(null);
    }
  }, [complete]);

  const testPrompt = useCallback(async () => {
    const line = await generateCharacterLine('Pawstar greets the player before a new quest begins.');
    if (line) setTestResult(line);
  }, [generateCharacterLine]);

  const suggestEnemyTags = useCallback(async (request: EnemyTagRequest): Promise<string[]> => {
    if (!contextRef.current) throw new Error('Load your GGUF model in Settings → Local storyteller first.');
    if (completionBusy.current) throw new Error('The local model is busy. Try again when it finishes.');
    setBusy('generating');
    setError('');
    try {
      const text = await complete(enemyTagPrompt(request), { nPredict: 160, tagSuggestions: true });
      const tags = parseEnemyTagSuggestions(text, request);
      if (!tags.length) throw new Error('No new valid tags were suggested. Try another theme or model.');
      return tags;
    } catch (reason) {
      const message = friendlyModelError(reason);
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(null);
    }
  }, [complete]);

  const generateCombatPlan = useCallback(async (request: CombatAiRequest): Promise<CombatAiPlan | null> => {
    if (!contextRef.current || completionBusy.current) return null;
    setBusy('generating');
    setError('');
    try {
      const text = await complete(combatAiPrompt(request), { nPredict: 500, combatPlan: true });
      const plan = parseCombatAiPlan(text, request);
      if (!plan) throw new Error('The local model returned no valid enemy actions. Random movement remains active.');
      return plan;
    } catch (reason) {
      setError(friendlyModelError(reason));
      return null;
    } finally { setBusy(null); }
  }, [complete]);

  /** Shared guard: explicit errors for a missing model or an in-flight completion. */
  const guarded = useCallback(async <T,>(run: () => Promise<T>): Promise<T | null> => {
    if (!contextRef.current) {
      setError('Load your GGUF model in Settings > Local storyteller first.');
      return null;
    }
    if (completionBusy.current) {
      setError('The local model is busy with another reply. Try again when it finishes.');
      return null;
    }
    setBusy('generating');
    setError('');
    try {
      return await run();
    } catch (reason) {
      setError(friendlyModelError(reason));
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  /** Bounded Pawstar conversation. rolePrompt overrides the stored storyteller prompt for chat only. */
  const generateChatReply = useCallback((messages: ChatMessage[], rolePrompt?: string) => guarded(async () => {
    const history = chatContext(messages);
    if (!history.length) throw new Error('Write a message for Pawstar first.');
    const text = await complete('', {
      nPredict: 900, history, systemPrompt: chatSystemPrompt(rolePrompt, preferences.systemPrompt),
    });
    const reply = parseChatReply(text);
    if (!reply) throw new Error('Pawstar returned an empty reply. Try again or another model.');
    return reply;
  }), [complete, guarded, preferences.systemPrompt]);

  /** Non-graphic encouragement variations built from the user's own seed line. */
  const generateCelebrations = useCallback(async (seed: string): Promise<string[]> => {
    const lines = await guarded(async () => {
      const recent = seed.split(/\r?\n/).filter(Boolean).slice(-12).join('\n').slice(-2_000);
      const text = await complete(`${celebrationPrompt(seed)}\nDo not repeat these existing notes:\n${recent}\nReturn genuinely new lines in the requested JSON format.`,
        { nPredict: 350, schema: LINES_RESPONSE_SCHEMA });
      const parsed = parseCelebrations(text);
      if (!parsed.length) throw new Error('The model returned no usable celebration lines.');
      return parsed;
    });
    return lines ?? [];
  }, [complete, guarded]);

  const generateAchievements = useCallback((count: number, existing: readonly PlayerAchievement[]) => guarded(async () => {
    const amount = Math.max(1, Math.min(5, Math.floor(count)));
    const existingNames = existing.map((item) => item.name.toLowerCase()).slice(0, 48).join(', ');
    const text = await complete(
      `Create ${amount} distinct Goon Quest achievements in a cozy adult furry pixel-fantasy RPG. Keep names playful, lewd-but-not-graphic, and concise. Every goal must track only one allowed metric. Use an achievable positive integer target. Allowed metrics: completedSessions, totalPlaybackMs (milliseconds), bestSessionMs (milliseconds), xp, totalVideosWatched, miniGamesWon. Avoid these existing names: ${existingNames || 'none'}. Return only the required JSON.`,
      { nPredict: 400, schema: ACHIEVEMENT_RESPONSE_SCHEMA },
    );
    let parsed: unknown;
    try { parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? ''); } catch { parsed = null; }
    const rows = parsed && typeof parsed === 'object' && 'achievements' in parsed
      ? (parsed as { achievements: unknown }).achievements : [];
    const accepted = parseGeneratedAchievements(rows, existing.map((item) => item.name));
    if (!accepted.length) throw new Error('The model did not return any new, trackable achievements.');
    return accepted;
  }), [complete]);

  /** Name and flavor only; the game assigns the tracked goal. */
  const generateHonorIdea = useCallback((context: { className: string; companionName: string }) => guarded(async () => {
    const text = await complete(honorIdeaPrompt(context), { nPredict: 120, schema: HONOR_RESPONSE_SCHEMA });
    const idea = parseHonorIdea(text);
    if (!idea) throw new Error('The model did not return a valid honor. Try again.');
    return idea;
  }), [complete, guarded]);

  return {
    generateChatReply,
    generateCelebrations,
    generateAchievements,
    generateHonorIdea,
    generateCombatPlan,
    setCombatPreference,
    setAutomationPreference,
    setCooldown,
    suggestEnemyTags,
    preferences,
    preferencesReady,
    modelLoaded,
    busy,
    loadProgress,
    error,
    testResult,
    importModel,
    loadModel,
    unloadModel,
    removeModel,
    updatePrompt,
    setEnemyBanterEnabled,
    generateStoryQuest,
    generateCharacterLine,
    testPrompt,
  };
}
