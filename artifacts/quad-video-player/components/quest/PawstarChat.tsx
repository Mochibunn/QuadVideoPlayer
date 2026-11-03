import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { appendChat, cleanChatText, type ChatMessage } from '@/lib/pawstar-chat';
import { MAX_CHAT_ROLE_LENGTH } from '@/lib/guild-ledger';

type Props = {
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
  visible, onClose, petName, modelReady, modelBusy, modelError, rolePrompt, onRolePromptChange, onResetRole, onSend, onExchange,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleDraft, setRoleDraft] = useState(rolePrompt);
  const [waiting, setWaiting] = useState(false);
  const [notice, setNotice] = useState('');
  const [keyboard, setKeyboard] = useState(0);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const sending = useRef(false);

  useEffect(() => { if (!roleOpen) setRoleDraft(rolePrompt); }, [roleOpen, rolePrompt]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => setKeyboard(event.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboard(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

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
    } finally {
      sending.current = false;
      setWaiting(false);
    }
  };

  const panelWidth = Math.min(380, width - 24);
  const listHeight = Math.max(120, Math.min(260, (height - keyboard) * 0.36));
  const bottom = (keyboard ? keyboard + 8 : insets.bottom + 12);
  const status = !modelReady ? 'Model not loaded' : waiting ? `${petName} is typing` : modelBusy ? 'Model busy' : 'Local model';

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <View pointerEvents="box-none" style={[styles.panel, { width: panelWidth, bottom, left: 12 + insets.left }]}>
        <View style={styles.header}>
          <View style={[styles.statusDot, { backgroundColor: modelReady ? colors.primary : colors.destructive }]} />
          <Text style={[styles.headerText, { color: colors.foreground }]}>{petName}</Text>
          <Text style={[styles.headerMeta, { color: colors.mutedForeground }]}>{status}</Text>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Edit Pawstar role prompt" hitSlop={8}
            onPress={() => setRoleOpen((value) => !value)} style={styles.iconButton}>
            <Feather name="sliders" size={14} color={roleOpen ? colors.primary : colors.foreground} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Clear chat" hitSlop={8}
            onPress={() => { setMessages([]); setNotice(''); }} style={styles.iconButton}>
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
              style={[styles.roleInput, { color: colors.foreground, borderColor: colors.border }]}
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
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {!messages.length && (
            <Text style={[styles.comment, styles.emptyText, { color: colors.mutedForeground }]}>
              Say hi. {petName} answers from your local model; nothing leaves this device.
            </Text>
          )}
          {messages.map((message, index) => (
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

        <View style={[styles.inputRow, { borderColor: colors.border }]}>
          <TextInput
            accessibilityLabel={`Message ${petName}`}
            value={draft}
            onChangeText={setDraft}
            placeholder={modelReady ? `Talk to ${petName}` : 'Load a model to chat'}
            placeholderTextColor={colors.mutedForeground}
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => void send()}
            blurOnSubmit={false}
            style={[styles.input, { color: colors.foreground }]}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={waiting || !draft.trim()}
            onPress={() => void send()}
            style={[styles.send, { backgroundColor: colors.primary, opacity: waiting || !draft.trim() ? 0.45 : 1 }]}>
            <Feather name="arrow-up" size={16} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 120, elevation: 120 },
  panel: { position: 'absolute', gap: 6 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', width: '100%',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.42)',
  },
  statusDot: { width: 7, height: 7, borderRadius: 2 },
  headerText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.6 },
  headerMeta: { fontSize: 10 },
  iconButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
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
    paddingLeft: 14, paddingRight: 4, minHeight: 44, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  input: { flex: 1, fontSize: 13, paddingVertical: 8 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  roleBox: { borderWidth: 1, borderRadius: 12, padding: 8, gap: 6, backgroundColor: 'rgba(0,0,0,0.72)' },
  roleLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  roleInput: { minHeight: 64, maxHeight: 120, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 8, fontSize: 12, textAlignVertical: 'top' },
  roleActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  pill: { minHeight: 30, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center' },
  pillText: { fontSize: 11, fontWeight: '800' },
});
