import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import type { LlamaContext } from 'llama.rn';
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
} from '@/lib/local-story';

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
    options: { nPredict: number; json?: boolean },
  ) => {
    const context = contextRef.current;
    if (!context) throw new Error('Load your local model first.');
    if (completionBusy.current) throw new Error('The model is already writing a response.');
    completionBusy.current = true;
    try {
      await context.clearCache();
      const result = await context.completion({
        messages: [
          { role: 'system', content: preferences.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        n_predict: options.nPredict,
        temperature: 0.8,
        top_p: 0.9,
        ...(options.json ? { response_format: QUEST_RESPONSE_SCHEMA } : {}),
      });
      return result.text;
    } finally {
      completionBusy.current = false;
    }
  }, [preferences.systemPrompt]);

  const generateStoryQuest = useCallback(async (state: PlayerRpgState) => {
    if (!contextRef.current) return null;
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
    if (!contextRef.current) return null;
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

  return {
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
