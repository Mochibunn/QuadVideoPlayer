import Feather from '@/components/GameIcon';
import React, { useEffect, useRef, useState } from 'react';
import { useSavedSetting } from '@/hooks/useSavedSetting';
import {
  Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions,
} from 'react-native';
import { GameText as Text } from '@/components/GameText';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { appendChat, autoChatPrompt, cleanChatText, type ChatMessage } from '@/lib/pawstar-chat';
import { MAX_CHAT_ROLE_LENGTH } from '@/lib/guild-ledger';
import { startAutoChatLoop } from '@/lib/auto-chat-loop';

type ChatEntry = ChatMessage & { hidden?: boolean };

type Props = {
  cooldownSeconds?: number;
  visible: boolean;
  onClose: () => void;
  petName: string;
  modelReady: boolean;
  modelBusy: boolean;
  modelError?: string;
  rolePrompt: string;
  onRolePromptChange: (prompt: string) => void;
  onResetRole: () => void;
  onSend?: (messages: ChatMessage[], rolePrompt: string) => Promise<string | null>;
  onExchange?: () => void;
};

/** Compact, translucent comment-stream chat that leaves the four videos visible. */
export default function PawstarChat({
  cooldownSeconds = 30,
  visible, onClose, petName, modelReady, modelBusy, modelError, rolePrompt, onRolePromptChange, onResetRole, onSend, onExchange,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleDraft, setRoleDraft] = useState(rolePrompt);
  const [waiting, setWaiting] = useState(false);
  const [autoTalk, setAutoTalk] = useSavedSetting('goon-quest.pawstar-auto-chat', false, (value) => value === true);
  const [notice, setNotice] = useState('');
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const sending = useRef(false);
  const latest = useRef({ messages, modelReady, modelBusy, modelError, onSend, onExchange, rolePrompt, petName });
  latest.current = { messages, modelReady, modelBusy, modelError, onSend, onExchange, rolePrompt, petName };

  useEffect(() => { if (!roleOpen) setRoleDraft(rolePrompt); }, [roleOpen, rolePrompt]);

  useEffect(() => {
    if (!visible || !autoTalk) return;
    let active = true;
    const stop = startAutoChatLoop({
      cooldownMs: () => cooldownSeconds * 1_000,
      ready: () => {
        const current = latest.current;
        return current.modelReady && !current.modelBusy && !sending.current && !!current.onSend;
      },
      run: async () => {
        const current = latest.current;
        if (!current.onSend) return;
        sending.current = true;
        setWaiting(true);
        setNotice('');
        const visibleHistory = current.messages.filter((message) => !message.hidden);
        const prompt = autoChatPrompt(visibleHistory, current.petName);
        const nextHistory: ChatEntry[] = [
          ...visibleHistory, { role: 'user' as const, content: prompt, hidden: true },
        ].slice(-40);
        // Automatic steering prompts are model input, not new player messages.
        try {
          const reply = await current.onSend(nextHistory, current.rolePrompt);
          if (!active) return;
          if (!reply) throw new Error(latest.current.modelError || `${current.petName} could not continue. Check the local model status.`);
          setMessages((history) => appendChat(history.filter((message) => !message.hidden), { role: 'assistant', content: reply }));
          latest.current.onExchange?.();
        } finally {
          sending.current = false;
          setWaiting(false);
        }
      },
      onError: (error) => {
        setNotice(error instanceof Error ? error.message : `${latest.current.petName} could not continue.`);
        setAutoTalk(false);
      },
    });
    return () => { active = false; stop(); };
  }, [autoTalk, visible, cooldownSeconds]);

  if (!visible) return null;

  const send = async () => {
    const content = cleanChatText(draft);
    if (!content || sending.current) return;
    if (!onSend || !modelReady) {
      setNotice('No local model is loaded. Import and load a GGUF model in Settings > Local storyteller.');
      return;
    }
    if (modelBusy) {
      setNotice('The model is busy with another task. Send again when it finishes.');
      return;
    }
    sending.current = true;
    setNotice('');
    const nextHistory = appendChat(messages, { role: 'user', content });
    setMessages(nextHistory);
    setDraft('');
    setWaiting(true);
    try {
      const reply = await onSend(nextHistory, rolePrompt);
      if (reply) {
        setMessages((current) => appendChat(current, { role: 'assistant', content: reply }));
        onExchange?.();
      } else {
        setNotice(modelError || `${petName} could not answer. Check the local model status.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `${petName} could not answer.`);
    } finally {
      sending.current = false;
      setWaiting(false);
    }
  };

  const panelWidth = Math.min(380, width - 24);
  const listHeight = Math.max(72, Math.min(220, height * 0.32));
  const status = !modelReady ? 'Model not loaded' : waiting ? `${petName} is typing` :
    modelBusy ? 'Model busy' : autoTalk ? `Auto · ${cooldownSeconds}s cooldown` : 'Local model';

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <KeyboardAvoidingView
        pointerEvents="box-none"
        behavior="padding"
        keyboardVerticalOffset={0}
        style={styles.keyboardAvoider}
      >
      <View style={[styles.panel, { width: panelWidth, marginLeft: 12 + insets.left, marginBottom: insets.bottom + 8 }]}>
        <View style={styles.header}>
          <View style={[styles.statusDot, { backgroundColor: modelReady ? colors.primary : colors.destructive }]} />
          <Text style={[styles.headerText, { color: colors.foreground, fontFamily: 'Pixelta' }]} numberOfLines={1}>{petName}</Text>
          <Text style={[styles.headerMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{status}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={autoTalk ? 'Turn continuous Pawstar chat off' : 'Turn continuous Pawstar chat on'}
            accessibilityState={{ checked: autoTalk }}
            hitSlop={4}
            onPress={() => { setAutoTalk((value) => !value); setNotice(''); }}
            style={[
              styles.autoToggle,
              { borderColor: autoTalk ? colors.primary : colors.border, backgroundColor: autoTalk ? colors.accent : 'transparent' },
            ]}
          >
            <Feather name={autoTalk ? 'activity' : 'repeat'} size={12} color={autoTalk ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.autoToggleText, { color: autoTalk ? colors.primary : colors.mutedForeground }]}>Auto</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit Pawstar role prompt" hitSlop={8}
            onPress={() => setRoleOpen((value) => !value)} style={styles.iconButton}>
            <Feather name="sliders" size={14} color={roleOpen ? colors.primary : colors.foreground} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Clear chat" hitSlop={8}
            onPress={() => { setAutoTalk(false); setMessages([]); setNotice(''); }} style={styles.iconButton}>
            <Feather name="trash-2" size={14} color={colors.foreground} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close chat" hitSlop={8}
            onPress={() => { Keyboard.dismiss(); onClose(); }} style={styles.iconButton}>
            <Feather name="x" size={16} color={colors.foreground} />
          </Pressable>
        </View>

        {roleOpen && (
          <View style={[styles.roleBox, { borderColor: colors.border }]}>
            <Text style={[styles.roleLabel, { color: colors.primary }]}>ROLE PROMPT</Text>
            <TextInput
              accessibilityLabel="Pawstar role prompt"
              value={roleDraft}
              onChangeText={(text) => setRoleDraft(text.slice(0, MAX_CHAT_ROLE_LENGTH))}
              multiline
              style={[styles.roleInput, { color: colors.foreground, borderColor: colors.border, fontFamily: 'YosterIsland' }]}
              placeholderTextColor={colors.mutedForeground}
              placeholder="Describe how Pawstar should talk"
            />
            <View style={styles.roleActions}>
              <Pressable accessibilityRole="button" onPress={() => { onResetRole(); setRoleOpen(false); }}
                style={[styles.pill, { borderColor: colors.border }]}>
                <Text style={[styles.pillText, { color: colors.mutedForeground }]}>Default</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={!roleDraft.trim()}
                onPress={() => { onRolePromptChange(roleDraft.trim()); setRoleOpen(false); }}
                style={[styles.pill, { borderColor: colors.primary, opacity: roleDraft.trim() ? 1 : 0.45 }]}>
                <Text style={[styles.pillText, { color: colors.primary }]}>Save role</Text>
              </Pressable>
            </View>
          </View>
        )}

        <ScrollView ref={scrollRef} style={{ maxHeight: listHeight }} contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {!messages.length && (
            <Text style={[styles.comment, styles.emptyText, { color: colors.mutedForeground }]}>
              Say hi. {petName} answers from your local model; nothing leaves this device.
            </Text>
          )}
          {messages.filter((message) => !message.hidden).map((message, index) => (
            <View key={index} style={styles.commentRow}>
              <Text style={[styles.comment, { color: colors.foreground }]}>
                <Text style={{ color: message.role === 'assistant' ? colors.primary : colors.mutedForeground, fontWeight: '900' }}>
                  {message.role === 'assistant' ? petName : 'You'}{'  '}
                </Text>
                {message.content}
              </Text>
            </View>
          ))}
          {waiting && (
            <Text style={[styles.comment, styles.emptyText, { color: colors.primary }]}>{petName} is writing...</Text>
          )}
        </ScrollView>
        {!!notice && <Text accessibilityRole="alert" style={[styles.notice, { color: colors.destructive }]}>{notice}</Text>}

        <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <TextInput
            accessibilityLabel={`Message ${petName}`}
            value={draft}
            onChangeText={setDraft}
            placeholder={modelReady ? `Talk to ${petName}` : 'Load a model to chat'}
            placeholderTextColor={colors.mutedForeground}
            maxLength={500}
            selectionColor={colors.primary}
            returnKeyType="send"
            onSubmitEditing={() => void send()}
            blurOnSubmit={false}
            style={[styles.input, { color: colors.foreground, fontFamily: 'YosterIsland' }]}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={waiting || !draft.trim()}
            onPress={() => void send()}
            style={[styles.send, { backgroundColor: colors.primary, opacity: waiting || !draft.trim() ? 0.45 : 1 }]}>
            <Feather name="arrow-up" size={16} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 120, elevation: 120 },
  keyboardAvoider: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', alignItems: 'flex-start' },
  panel: { gap: 6, maxWidth: '100%' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', width: '100%',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.42)',
  },
  statusDot: { width: 7, height: 7, borderRadius: 2 },
  headerText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.3, flexShrink: 1 },
  headerMeta: { fontSize: 10, flexShrink: 1 },
  iconButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  autoToggle: { height: 28, borderRadius: 14, borderWidth: 1, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoToggleText: { fontSize: 10, fontWeight: '800' },
  list: { gap: 5, paddingVertical: 2 },
  commentRow: { alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(0,0,0,0.38)' },
  comment: {
    fontSize: 13, lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  emptyText: { fontSize: 11, paddingHorizontal: 4 },
  notice: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 22,
    paddingLeft: 14, paddingRight: 4, minHeight: 48, zIndex: 2, elevation: 2,
  },
  input: {
    flex: 1, fontSize: 13, minHeight: 42, height: 42, lineHeight: 20, paddingVertical: 0,
    includeFontPadding: false, textAlignVertical: 'center', backgroundColor: 'transparent',
  },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  roleBox: { borderWidth: 1, borderRadius: 12, padding: 8, gap: 6, backgroundColor: 'rgba(0,0,0,0.72)' },
  roleLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  roleInput: { minHeight: 64, maxHeight: 120, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 8, fontSize: 12, textAlignVertical: 'top' },
  roleActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  pill: { minHeight: 30, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center' },
  pillText: { fontSize: 11, fontWeight: '800' },
});
