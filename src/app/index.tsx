import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import {
  Bot,
  Brain,
  Camera,
  Copy,
  FileText,
  Globe,
  Image as ImageIcon,
  Menu,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  SendHorizontal,
  Square,
  SquarePen,
  Trash2,
  Volume2,
  X
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clearNotification, modelStore } from '@/ai/modelManager';
import { deleteConversation, listConversations } from '@/chat/chatRepository';
import {
  chatStore,
  deleteMessageAndResponse,
  editUserMessage,
  initChatSession,
  newChat,
  openConversation,
  regenerateFromMessage,
  retryLastTurn,
  sendUserMessage,
  setChatMode,
  stopStreaming,
} from '@/chat/chatSession';
import { MarkdownText } from '@/components/markdown-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useStore } from '@/hooks/use-store';
import { useTheme } from '@/hooks/use-theme';
import { getModelEntry } from '@/models/catalog';
import { Attachment, ChatMessage, Conversation } from '@/types';

const SIDEBAR_WIDTH = 200;

export default function ChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { conversation, sending, error, chatMode } = useStore(chatStore);
  const model = useStore(modelStore);
  const [draft, setDraft] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  // Id of the sent user message being edited; send then regenerates from it.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Custom dropdown over the + button (native Alert can't be themed).
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [thinkingMode, setThinkingMode] = useState(false);
  // Slides in from the left; starts off-screen. Native driver for 60fps.
  // Lazy useState instead of useRef: Animated.Value is render-stable state,
  // and reading ref.current during render trips react-hooks/refs.
  const [sidebarX] = useState(() => new Animated.Value(-SIDEBAR_WIDTH));
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void initChatSession();
  }, []);

  useEffect(() => {
    if (model.notification) {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      toastTimer.current = setTimeout(() => {
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => clearNotification());
      }, 2000);
    } else {
      toastOpacity.setValue(0);
    }
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [model.notification, toastOpacity]);

  // Newest at the top of an inverted list = visually newest at the bottom.
  const invertedMessages = useMemo(
    () => (conversation ? [...conversation.messages].reverse() : []),
    [conversation],
  );

  const modelLoaded = model.status === 'loaded';
  const canSend =
    modelLoaded && !sending && (draft.trim().length > 0 || attachment !== null);

  const onSend = () => {
    if (!canSend) return;
    if (attachment?.kind === 'image' && !model.vision) {
      Alert.alert(
        'Vision not available',
        'The loaded model cannot process images. Detach the photo or load a vision model from the Models tab.',
      );
      return;
    }
    const text = draft;
    const att = attachment ?? undefined;
    const target = editingId;
    setDraft('');
    setAttachment(null);
    setEditingId(null);
    if (target) void editUserMessage(target, text);
    else void sendUserMessage(text, att);
  };

  // Long-press a sent user message: load it into the composer for editing.
  // The conversation is only truncated when the edit is actually sent, so
  // cancel just restores the composer.
  const startEdit = (message: ChatMessage) => {
    if (sending || message.pending) return;
    setEditingId(message.id);
    setAttachment(null);
    setDraft(message.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
  };

  const openSidebar = () => {
    setSidebarOpen(true);
    Animated.timing(sidebarX, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    void listConversations().then((all) => {
      setHistory(all);
    });
  };

  const closeSidebar = () => {
    Animated.timing(sidebarX, {
      toValue: -SIDEBAR_WIDTH,
      duration: 150,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSidebarOpen(false);
    });
  };

  const pickImage = async (fromCamera: boolean) => {
    if (!model.vision) {
      Alert.alert(
        'Vision model needed',
        'Load a vision model (for example Qwen3-VL) from the Models tab to attach photos.',
      );
      return;
    }
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            'Camera access needed',
            'Allow camera access in system settings to take a photo.',
          );
          return;
        }
      }
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      const asset = res.canceled ? null : res.assets?.[0];
      if (asset) setAttachment({ kind: 'image', uri: asset.uri, name: asset.fileName ?? 'Photo' });
    } catch {
      Alert.alert(
        fromCamera ? 'Could not open camera' : 'Could not open photos',
        'Try again, or attach a text file instead.',
      );
    }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/json'],
        copyToCacheDirectory: true,
      });
      const asset = res.canceled ? null : res.assets?.[0];
      if (!asset) return;
      if (asset.size != null && asset.size > 20_000) {
        Alert.alert('File too large', 'Attached text files are limited to 20 KB.');
        return;
      }
      const text = await new File(asset.uri).text();
      setAttachment({ kind: 'file', name: asset.name, text });
    } catch {
      Alert.alert('Could not read file', 'Only plain text files can be attached.');
    }
  };

  const attachOptions = [
    { icon: Camera, label: 'Camera', run: () => void pickImage(true) },
    { icon: ImageIcon, label: 'Photo library', run: () => void pickImage(false) },
    { icon: FileText, label: 'File', run: () => void pickFile() },
  ];

  const moreOptions = [
    {
      icon: Globe,
      label: 'Web',
      active: webSearchEnabled,
      run: () => {
        setWebSearchEnabled((v) => !v);

      },
    },
    {
      icon: Brain,
      label: 'Thinking',
      active: thinkingMode,
      run: () => {
        setThinkingMode((v) => !v);
      },
    },

  ];

  const onDeleteConversation = (conv: Conversation) => {
    if (sending) return;
    Alert.alert('Delete conversation?', `"${conv.title}" will be removed permanently.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const isCurrent = conversation?.id === conv.id;
          void deleteConversation(conv.id).then(() => {
            if (isCurrent) void newChat();
            setHistory((h) => h.filter((c) => c.id !== conv.id));
          });
        },
      },
    ]);
  };

  const copyMessage = (message: ChatMessage) => {
    if (!message.content || message.pending) return;
    Alert.alert('Assistant message', undefined, [
      { text: 'Copy', onPress: () => void Clipboard.setStringAsync(message.content) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <ThemedView style={styles.flex}>
      {model.notification && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              top: insets.top + Spacing.two,
              backgroundColor: model.notification.type === 'success' ? theme.success : theme.accent,
              opacity: toastOpacity,
              transform: [
                {
                  translateY: toastOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-10, 0],
                  }),
                },
              ],
            },
          ]}>
          <ThemedText type="smallBold" style={{ color: '#fff' }}>
            {model.notification.text}
          </ThemedText>
        </Animated.View>
      )}
      <KeyboardAvoidingView
        style={styles.flex}
        // ponytail: edge-to-edge (RN 0.88 default) leaves the Android IME
        // overlaying the window, so adjustResize doesn't move our content —
        // verified on API 36 (composer bounds identical with keyboard open).
        // KAV padding covers it everywhere; if a device also resizes the
        // window the composer just floats a bit high. Upgrade path:
        // expo-build-properties with edgeToEdgeEnabled=false + adjustResize.
        behavior="padding">
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + Spacing.two,
              borderBottomColor: theme.border,
            },
          ]}>
          <View style={styles.headerTitleBlock}>
            <Pressable
              onPress={openSidebar}
              hitSlop={8}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
              accessibilityLabel="Open chat history">
              <ThemedText type="smallBold" themeColor="accent" style={styles.hamburger}>
                <Menu size={20} color={theme.accent} />
              </ThemedText>
            </Pressable>
            <ThemedText type="smallBold" style={styles.appTitle}>
              PocketOllm
            </ThemedText>
            <View style={{ position: 'relative', left: 50, top: 0, bottom: 0, justifyContent: 'center', paddingRight: Spacing.two }}>
              {chatMode === 'chat' ? 
              <ThemedText type="link" themeColor="accent">
            Chat
          </ThemedText> : <ThemedText type="link" themeColor="accent">
            Agentic
          </ThemedText> }
        </View>


          </View>
          <View style={styles.headerActions}>
            <Pressable
              disabled
              hitSlop={8}
              style={styles.headerButton}
              accessibilityLabel="Chat mode">
              <MessageSquare size={20} color={theme.textSecondary} />
            </Pressable>
            <Pressable
              onPress={() => {
                setEditingId(null);
                setDraft('');
                void newChat();
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <ThemedText type="small" themeColor="accent">
                <SquarePen size={20} color={theme.accent} />
              </ThemedText>
            </Pressable>
          </View>
        </View>

        

        {/* No-model banner with navigation to Models */}
        {!modelLoaded && (
          <Pressable
            onPress={() => router.push('/models')}
            style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              {model.status === 'loading'
                ? 'A model is loading…'
                : 'No model is loaded. Download and load a model to start chatting.'}
            </ThemedText>
            {model.status !== 'loading' && (
              <ThemedText type="small" themeColor="accent" style={styles.bannerAction}>
                Open Models →
              </ThemedText>
            )}
          </Pressable>
        )}

        {/* Error / retry banner */}
        {error && (
          <View style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
            <View style={styles.errorActions}>
              <Pressable
                onPress={() => void retryLastTurn()}
                style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
                <ThemedText type="small" themeColor="accent">
                  Retry
                </ThemedText>
              </Pressable>
            </View>
          </View>
        )}

        {/* Conversation */}
        {invertedMessages.length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText type="subtitle" style={styles.emptyTitle}>
              PocketOllm
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyBody}>
              {modelLoaded
                ? 'Chat fully on-device with the loaded model. Nothing you write leaves your phone.'
                : 'Once a model is downloaded, your conversations work with no internet connection.'}
            </ThemedText>
            {!modelLoaded && (
              <Pressable
                onPress={() => router.push('/models')}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: theme.accent },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                  Browse models
                </ThemedText>
              </Pressable>
            )}
          </View>
        ) : (
          <FlatList
            data={invertedMessages}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent}
            keyboardDismissMode="interactive"
            renderItem={({ item }) => (
              <Bubble
                message={item}
                isUser={item.role === 'user'}
                onLongPress={() => { }}
                onEdit={item.role === 'user' ? () => startEdit(item) : undefined}
                onCopy={() => void Clipboard.setStringAsync(item.content)}
                onSpeak={() => Speech.speak(item.content.replace(/```[\s\S]*?```/g, ''))}
                onRegenerate={item.role === 'assistant' ? () => void regenerateFromMessage(item.id) : undefined}
                onDelete={item.role === 'user' ? () => void deleteMessageAndResponse(item.id) : undefined}
              />
            )}
          />
        )}

        {/* Composer */}
        <View
          style={[
            styles.composerColumn,
            { borderTopColor: theme.border, backgroundColor: theme.background },
          ]}>
          {editingId && (
            <View style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="accent" style={styles.flex}>
                Editing message — send to replace its reply
              </ThemedText>
              <Pressable
                onPress={cancelEdit}
                hitSlop={8}
                accessibilityLabel="Cancel editing">
                <ThemedText type="small" themeColor="textSecondary">
                  <X size={20} color={theme.textSecondary} />
                </ThemedText>
              </Pressable>
            </View>
          )}
          {attachment && (
            <View style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
              {attachment.kind === 'image' && (
                <Image source={{ uri: attachment.uri }} style={styles.chipThumb} contentFit="cover" />
              )}
              <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                {attachment.name}
              </ThemedText>
              <Pressable
                onPress={() => setAttachment(null)}
                hitSlop={8}
                accessibilityLabel="Remove attachment">
                <ThemedText type="small" themeColor="textSecondary">
                  <X size={20} />
                </ThemedText>
              </Pressable>
            </View>
          )}
          {attachMenuOpen && (
            <View
              style={[
                styles.attachMenu,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              {attachOptions.map((opt) => {
                const Icon = opt.icon;
                return (
                  <Pressable
                    key={opt.label}
                    onPress={() => {
                      setAttachMenuOpen(false);
                      opt.run();
                    }}
                    style={({ pressed }) => [
                      styles.attachMenuRow,
                      pressed && { backgroundColor: theme.backgroundSelected },
                    ]}
                    accessibilityLabel={`Attach ${opt.label}`}>
                    <Icon size={18} color={theme.text} />
                    <ThemedText type="small">{opt.label}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}

          {chatMode === 'chat' ? (
            <View
              style={[
                styles.composer,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                  alignItems: 'center',
                  flexDirection: 'row',
                  borderRadius: 28,
                },
              ]}>
              <Pressable
                onPress={() => setAttachMenuOpen((v) => !v)}
                disabled={!modelLoaded || sending || editingId !== null}
                style={({ pressed }) => [
                  styles.attachButton,
                  {
                    opacity:
                      !modelLoaded || sending || editingId !== null ? 0.45 : pressed ? 0.6 : 1,
                  },
                ]}
                accessibilityLabel="Attach photo or file">
                <Plus size={20} color={theme.text} />
              </Pressable>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={
                  editingId
                    ? 'Edited message'
                    : modelLoaded
                      ? 'Message'
                      : 'Select a model to chat'
                }
                placeholderTextColor={theme.textSecondary}
                multiline
                editable={modelLoaded && !sending}
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    flex: 1,
                  },
                ]}
                maxLength={8000}
                accessibilityLabel="Message input"
              />
              {sending ? (
                <Pressable
                  onPress={stopStreaming}
                  style={({ pressed }) => [
                    styles.sendButton,
                    { backgroundColor: theme.danger },
                    pressed && styles.pressed,
                  ]}
                  accessibilityLabel="Stop generation">
                  <Square size={18} color="#fff" />
                </Pressable>
              ) : (
                <Pressable
                  onPress={onSend}
                  disabled={!canSend}
                  style={({ pressed }) => [
                    styles.sendButton,
                    {
                      backgroundColor: canSend ? theme.accent : theme.backgroundSelected,
                      opacity: canSend && !pressed ? 1 : 0.8,
                    },
                  ]}
                  accessibilityLabel="Send message">
                  <SendHorizontal size={18} color={canSend ? theme.accentText : theme.textSecondary} />
                </Pressable>
              )}
            </View>
          ) : (
            <View
              style={[
                styles.composer,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                  minHeight: 52,
                  paddingVertical: Spacing.one,
                  alignItems: 'flex-start',
                  flexDirection: 'column',
                  borderRadius: 24,
                },
              ]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={
                  editingId
                    ? 'Edited message'
                    : modelLoaded
                      ? 'Ask anything...'
                      : 'Select a model to chat'
                }
                placeholderTextColor={theme.textSecondary}
                multiline
                editable={modelLoaded && !sending}
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    minHeight: 60,
                    maxHeight: 180,
                    paddingHorizontal: Spacing.three,
                    paddingTop: Spacing.two,
                    paddingBottom: Spacing.one,
                    width: '100%',
                  },
                ]}
                maxLength={8000}
                accessibilityLabel="Message input"
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.two, paddingBottom: Spacing.one, width: '100%' }}>
                <Pressable
                  onPress={() => setAttachMenuOpen((v) => !v)}
                  disabled={!modelLoaded || sending || editingId !== null}
                  style={({ pressed }) => [
                    styles.attachButton,
                    {
                      opacity:
                        !modelLoaded || sending || editingId !== null ? 0.45 : pressed ? 0.6 : 1,
                    },
                  ]}
                  accessibilityLabel="Attach photo or file">
                  <Plus size={20} color={theme.text} />
                </Pressable>
          {chatMode === 'agentic' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginHorizontal: Spacing.three, marginTop: Spacing.one }}>
              {moreOptions
                .filter((opt) => opt.label !== 'Thinking Mode' || getModelEntry(model.model?.id || '')?.thinking)
                .map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <Pressable
                      key={opt.label}
                      onPress={opt.run}
                      style={({ pressed }) => [
                        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: opt.active ? theme.accent : theme.border, backgroundColor: opt.active ? theme.backgroundSelected : theme.backgroundElement },
                        pressed && { opacity: 0.7 },
                      ]}>
                      <Icon size={14} color={opt.active ? theme.accent : theme.textSecondary} />
                      <ThemedText type="small" style={{ color: opt.active ? theme.accent : theme.textSecondary }}>
                        {opt.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
            </View>
          )}
              <View style={{ flex: 1 }} />
              {sending ? (
                <Pressable
                  onPress={stopStreaming}
                  style={({ pressed }) => [
                    styles.sendButton,
                    { backgroundColor: theme.danger },
                    pressed && styles.pressed,
                  ]}
                  accessibilityLabel="Stop generation">
                  <Square size={18} color="#fff" />
                </Pressable>
              ) : (
                <Pressable
                  onPress={onSend}
                  disabled={!canSend}
                  style={({ pressed }) => [
                    styles.sendButton,
                    {
                      backgroundColor: canSend ? theme.accent : theme.backgroundSelected,
                      opacity: canSend && !pressed ? 1 : 0.8,
                    },
                  ]}
                  accessibilityLabel="Send message">
                  {chatMode === 'agentic' ? (
                    <Send size={18} color={canSend ? theme.accentText : theme.textSecondary} />
                  ) : (
                    <SendHorizontal size={18} color={canSend ? theme.accentText : theme.textSecondary} />
                  )}
                </Pressable>
              )}
              </View>
            </View>
          )}
        </View>
        {/* <View style={{ height: BottomTabInset, backgroundColor: theme.background }} /> */}
      </KeyboardAvoidingView>

      {/* ChatGPT-style history sidebar (top-left ☰) */}
      {sidebarOpen && (
        <>
          <Pressable
            style={styles.backdrop}
            onPress={closeSidebar}
            accessibilityLabel="Close chat history"
          />
          <Animated.View
            style={[
              styles.sidebar,
              {
                transform: [{ translateX: sidebarX }],
                backgroundColor: theme.background,
                borderRightColor: theme.border,
                paddingTop: insets.top + Spacing.two,
              },
            ]}>
            <View style={styles.sidebarHeader}>
              <ThemedText type="smallBold">Chats</ThemedText>
              <Pressable
                onPress={() => {
                  closeSidebar();
                  setEditingId(null);
                  setDraft('');
                  void newChat();
                }}
                hitSlop={8}
                style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
                <ThemedText type="small" themeColor="accent">
                  <SquarePen size={20} color={theme.accent} />
                </ThemedText>
              </Pressable>
            </View>
            {history.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.sidebarEmpty}>
                No conversations yet.
              </ThemedText>
            ) : (
              <ScrollView style={styles.flex}>
                {history.map((conv) => (
                  <View
                    key={conv.id}
                    style={[
                      styles.historyRow,
                      conv.id === conversation?.id && {
                        backgroundColor: theme.backgroundSelected,
                      },
                    ]}>
                    <Pressable
                      onPress={() => {
                        closeSidebar();
                        setEditingId(null);
                        setDraft('');
                      if (conv.chatMode) setChatMode(conv.chatMode);
                      void openConversation(conv.id);
                    }}
                    style={styles.flex}
                    accessibilityLabel={`Open ${conv.title}`}>
                    <ThemedText type="small" numberOfLines={1}>
                      {conv.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {conv.chatMode === 'agentic' ? 'Agentic' : 'Chat'} · {conv.messages.length} messages
                    </ThemedText>
                  </Pressable>
                    <Pressable
                      onPress={() => onDeleteConversation(conv)}
                      hitSlop={10}
                      disabled={sending}
                      style={({ pressed }) => pressed && styles.pressed}
                      accessibilityLabel={`Delete ${conv.title}`}>
                      <ThemedText type="small" themeColor="textSecondary">
                        <X size={20} color={theme.textSecondary} />
                      </ThemedText>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

          </Animated.View>
        </>
      )}
    </ThemedView>
  );
}

function Bubble({
  message,
  isUser,
  onLongPress,
  onEdit,
  onCopy,
  onSpeak,
  onRegenerate,
  onDelete,
}: {
  message: ChatMessage;
  isUser: boolean;
  onLongPress: () => void;
  /** Tap-to-edit affordance shown under user messages. */
  onEdit?: () => void;
  onCopy?: () => void;
  onSpeak?: () => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
}) {
  const theme = useTheme();
  const isError = Boolean(message.error);
  const isTool = message.role === 'tool';
  const isAssistant = message.role === 'assistant';
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    return () => {
      try {
        Speech.stop();
      } catch { }
    };
  }, []);

  const handleSpeak = () => {
    if (speaking) {
      try {
        Speech.stop();
      } catch { }
      setSpeaking(false);
      return;
    }
    const text = message.content.replace(/```[\s\S]*?```/g, '');
    setSpeaking(true);
    Speech.speak(text, {
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
    onSpeak?.();
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
    onCopy?.();
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    await onRegenerate?.();
    setTimeout(() => setRegenerating(false), 800);
  };

  return (
    <View style={styles.bubbleBlock}>
      <View
        style={[
          styles.bubbleRow,
          { justifyContent: isUser ? 'flex-end' : 'flex-start' },
        ]}>
        <View
          style={[
            styles.bubble,
            isAssistant && styles.bubbleFull,
            isAssistant && { paddingHorizontal: 0, paddingVertical: 0, borderWidth: 0, backgroundColor: 'transparent' },
            isUser && {
              backgroundColor: theme.userBubble,
              borderColor: 'transparent',
            },
            isTool && {
              backgroundColor: theme.backgroundSelected,
              borderColor: theme.border,
              paddingHorizontal: Spacing.three,
              paddingVertical: Spacing.two,
            },
            isError && {
              borderColor: theme.danger,
            },
          ]}>
          {message.imageUri ? (
            // ponytail: if the picker's cache copy was cleared the thumb just
            // disappears — text history is unaffected. Upgrade path: copy the
            // photo into document storage when persisting the conversation.
            <Image source={{ uri: message.imageUri }} style={styles.bubbleImage} contentFit="cover" />
          ) : null}
          {isTool && (
            <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: 2 }}>
              Tool: {message.toolName || 'tool'}
            </ThemedText>
          )}
          {message.content.length === 0 && message.pending ? (
            <ThemedText
              type="small"
              style={{ color: isUser ? theme.accentText : theme.textSecondary }}>
              thinking…
            </ThemedText>
          ) : isUser ? (
            <Text
              selectable
              selectionColor={theme.accent}
              style={{ color: theme.userBubbleText, fontSize: 16, lineHeight: 22 }}>
              {message.content}
              {message.pending ? ' ▍' : ''}
            </Text>
          ) : (
            <View style={{ width: '100%' }}>
              <MarkdownText
                text={message.content + (message.pending ? ' ▍' : '')}
                color={isError ? theme.danger : theme.text}
              />
            </View>
          )}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <View style={{ marginTop: 4, gap: 2 }}>
              {message.toolCalls.map((tc) => (
                <ThemedText key={tc.id} type="small" themeColor="textSecondary">
                  → {tc.name}({tc.arguments.slice(0, 80)}{tc.arguments.length > 80 ? '...' : ''})
                </ThemedText>
              ))}
            </View>
          )}
        </View>
      </View>
      {(isAssistant && !message.pending) || isTool ? (
        <View style={[styles.actionRow, isAssistant && { paddingHorizontal: 0 }]}>
          {onCopy && (
            <Pressable onPress={handleCopy} hitSlop={6} style={styles.actionBtn}>
              <Copy size={14} color={copied ? theme.accent : theme.textSecondary} />
            </Pressable>
          )}
          {onSpeak && (
            <Pressable onPress={handleSpeak} hitSlop={6} style={styles.actionBtn}>
              <Volume2 size={14} color={speaking ? theme.accent : theme.textSecondary} />
            </Pressable>
          )}
          {onRegenerate && (
            <Pressable onPress={handleRegenerate} hitSlop={6} style={styles.actionBtn}>
              <RefreshCw size={14} color={regenerating ? theme.accent : theme.textSecondary} />
            </Pressable>
          )}
        </View>
      ) : null}
      {isUser && !message.pending && (
        <View style={[styles.actionRow, { alignSelf: 'flex-end', alignItems: 'center' }]}>
          {onEdit && (
            <Pressable onPress={onEdit} hitSlop={6} style={styles.actionBtn}>
              <Pencil size={14} color={theme.textSecondary} />
            </Pressable>
          )}
          {onCopy && (
            <Pressable onPress={handleCopy} hitSlop={6} style={styles.actionBtn}>
              <Copy size={14} color={copied ? theme.accent : theme.textSecondary} />
            </Pressable>
          )}
          {onDelete && (
            <Pressable onPress={onDelete} hitSlop={6} style={styles.actionBtn}>
              <Trash2 size={14} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  headerTitleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    flexShrink: 1,
  },
  appTitle: { fontSize: 16 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { flexShrink: 1 },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginLeft: 'auto',
  },
  modeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.one },
  pressed: { opacity: 0.6 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  bannerAction: { marginLeft: 'auto' },
  errorActions: { marginLeft: 'auto' },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  emptyTitle: { fontSize: 28, lineHeight: 34 },
  emptyBody: { textAlign: 'center' },
  primaryButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.four,
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  bubbleBlock: {
    gap: 2,
    marginBottom: Spacing.one,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
    borderWidth: 1,
  },
  bubbleFull: {
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  actionBtn: {
    padding: 4,
  },
  hamburger: { fontSize: 20, lineHeight: 22 },
  composerColumn: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
  },
  chipThumb: { width: 28, height: 28, borderRadius: Spacing.one },
  attachMenu: {
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  attachMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    marginBottom: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 26,
    gap: 2,
  },
  attachButton: {
    minHeight: 36,
    minWidth: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  input: {
    minHeight: 40,
    maxHeight: 160,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    fontSize: 16,
  },
  sendButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  sidebarEmpty: { paddingVertical: Spacing.three },
  sidebarHint: { textAlign: 'center', paddingVertical: Spacing.two },
  historyRow: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  bubbleImage: {
    width: 180,
    height: 180,
    borderRadius: Spacing.two,
    marginBottom: Spacing.one,
  },
  editPen: { position: 'absolute', right: Spacing.two, bottom: 0 },
  editPenIcon: { opacity: 1, },
});
