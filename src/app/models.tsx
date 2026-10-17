import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadModel, modelStore, unloadModel } from '@/ai/modelManager';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useStore } from '@/hooks/use-store';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, getModelEntry, MODEL_CATALOG, totalSizeBytes } from '@/models/catalog';
import {
  cancelDownload,
  downloadStore,
  isDownloading,
  isOnCellular,
  removeDownloaded,
  startDownload,
} from '@/models/downloadManager';
import { modelsStore, reconcileModels, totalDownloadedBytes } from '@/models/storage';
import { ModelEntry } from '@/types';
import { DatabaseCheck, Eye, Search, Type, X } from 'lucide-react-native';

type ModelsTab = 'browse' | 'downloaded';

export default function ModelsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const model = useStore(modelStore);
  const downloaded = useStore(modelsStore);
  useStore(downloadStore); // re-render on download progress
  const [tab, setTab] = useState<ModelsTab>('browse');
  const [query, setQuery] = useState('');

  useEffect(() => {
    void reconcileModels().catch(() => {});
  }, []);

  const downloadedIds = new Set(downloaded.map((d) => d.id));

  const q = query.trim().toLowerCase();
  const browseModels = q
    ? MODEL_CATALOG.filter((e) =>
        `${e.provider} ${e.name} ${e.description} ${e.params} ${e.quant}`.toLowerCase().includes(q),
      )
    : MODEL_CATALOG;

  const onDownloadPress = async (entry: ModelEntry) => {
    if (isDownloading(entry.id)) return;
    if (await isOnCellular()) {
      Alert.alert(
        'Download over mobile data?',
        `${entry.name} is about ${formatBytes(totalSizeBytes(entry))}. ` +
          'Downloading over mobile data may use a lot of your data allowance.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Download', onPress: () => void startDownload(entry) },
        ],
      );
      return;
    }
    void startDownload(entry);
  };

  const onDelete = (id: string, name: string, sizeBytes: number) => {
    Alert.alert(
      'Delete model?',
      `${name} (${formatBytes(sizeBytes)}) will be removed from your phone. ` +
        'You can download it again later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const finish = () => void removeDownloaded(id);
            // Never delete the active model file without unloading it first.
            if (model.model?.id === id && model.status === 'loaded') {
              void unloadModel().then(finish);
            } else {
              finish();
            }
          },
        },
      ],
    );
  };

  const activeName =
    model.model?.name ??
    (model.status === 'loading' ? 'Loading model…' : null);


  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.three,
            paddingBottom: Spacing.six + BottomTabInset,
          },
        ]}
        keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle" style={styles.screenTitle}>
          Models
        </ThemedText>

        {/* Currently loaded model */}
        <Section title="Active model">
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={styles.flexShrink}>
                <ThemedText type="smallBold" numberOfLines={2}>
                  {activeName ?? 'Nothing loaded'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {model.status === 'loaded' && model.model
                    ? 'Loaded in memory · inference is on-device'
                    : model.status === 'loading'
                      ? 'Preparing context — one model at a time'
                      : 'Load a downloaded model to chat'}
                </ThemedText>
              </View>
              {model.status === 'loaded' && (
                <ActionButton label="Unload" onPress={() => void unloadModel()} />
              )}
            </View>

            {model.status === 'loading' && (
              <ProgressBar
                received={model.loadProgress}
                total={100}
                theme={theme}
                label={`Initializing ${model.loadProgress}%`}
              />
            )}

            {model.error && (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {model.error}
              </ThemedText>
            )}
          </ThemedView>
        </Section>

        {/* Browse / Downloaded tabs */}
        <Segmented<ModelsTab>
          options={['browse', 'downloaded']}
          value={tab}
          onChange={setTab}
          labelFor={(v) => (v === 'browse' ? 'Browse' : 'Downloaded')}
          accessibilityLabel="Models view"
        />

        {tab === 'downloaded' ? (
          <Section title={`Downloaded (${downloaded.length} · ${formatBytes(totalDownloadedBytes())})`}>
            {downloaded.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No models downloaded yet. Switch to Browse and pick one — files
                are stored in this app&apos;s private storage and never bundled
                with the app.
              </ThemedText>
            ) : (
              downloaded.map((stored) => {
                const entry = getModelEntry(stored.id);
                if (!entry) return null;
                const isActive = model.model?.id === stored.id && model.status === 'loaded';
                const onDisk = stored.sizeBytes + (stored.mmprojSizeBytes ?? 0);
                return (
                  <ThemedView key={stored.id} type="backgroundElement" style={styles.card}>
                    <View style={styles.rowBetween}>
                      <View style={styles.flexShrink}>
                        <ThemedText type="smallBold">{entry.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {entry.provider} · {entry.params} · {entry.quant} · {formatBytes(onDisk)} on disk
                        </ThemedText>
                      </View>
                      <View style={styles.tagRow}>
                        {entry.vision && <Tag label="Vision" color={theme.accent} />}
                        {isActive &&  <DatabaseCheck size={20} color={theme.success} />}
                      </View>
                    </View>
                    <View style={styles.actionsRow}>
                      {isActive ? (
                        <ActionButton
                          label="Unload"
                          onPress={() => void unloadModel()}
                          disabled={model.status === 'loading'}
                        />
                      ) : (
                        <>
                         <ActionButton
                          label={model.status === 'loading' ? 'Loading…' : 'Load'}
                          onPress={() => void loadModel(stored.id)}
                          disabled={model.status === 'loading'}
                          primary
                        />
                        <ActionButton
                        label="Delete"
                        onPress={() => onDelete(stored.id, entry.name, onDisk)}
                        disabled={model.status === 'loading'}
                        danger
                      /></>
                       
                      )}
                      
                      
                    </View>
                  </ThemedView>
                );
              })
            )}
          </Section>
        ) : (
          <>
            <View
              style={[
                styles.searchRow,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <Search size={16} color={theme.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search models"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={[styles.searchInput, { color: theme.text }]}
                accessibilityLabel="Search models"
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                  <X size={16} color={theme.textSecondary} />
                </Pressable>
              )}
            </View>
            <Section title={q ? `Results (${browseModels.length})` : 'All models'}>
              {browseModels.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  No models match “{query.trim()}”.
                </ThemedText>
              ) : (
                browseModels.map((entry) => (
                  <CatalogCard
                    key={entry.id}
                    entry={entry}
                    installed={downloadedIds.has(entry.id)}
                    onDownload={() => void onDownloadPress(entry)}
                  />
                ))
              )}
            </Section>
            
            <ThemedText type="small" themeColor="textSecondary">
              Sizes are estimates until downloaded — each file is verified
              against its published SHA-256 checksum after transfer. Vision
              models also download a projector file for image understanding.
            </ThemedText>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

/** One catalogue row on the Browse tab: info, links, download + progress. */
function CatalogCard({
  entry,
  installed,
  onDownload,
}: {
  entry: ModelEntry;
  installed: boolean;
  onDownload: () => void;
}) {
  const theme = useTheme();
  // Subscribe to this model's download status directly so the progress bar and
  // Cancel button re-render as bytes arrive, instead of depending on a parent
  // re-render (which is what made the progress invisible before).
  const downloads = useStore(downloadStore);
  const status = downloads[entry.id] ?? { state: 'idle' as const };
  const total = totalSizeBytes(entry);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={styles.flexShrink}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {entry.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {entry.provider} · {entry.params} · {entry.quant} · ~{formatBytes(total)}
          </ThemedText>
        </View>
        <View style={styles.tagRow}>
          <Type size={16} color={theme.accent} />
          {entry.vision && <Eye size={16} color={theme.accent} />}
        </View>
      </View>

      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
        {entry.description}
      </ThemedText>

      {/* Download action area */}
      {!installed && status.state !== 'downloading' && status.state !== 'done' && (
        <View style={styles.actionsRow}>
          <ActionButton label="Download" onPress={onDownload} primary />
          {(status.state === 'error' || status.state === 'cancelled') && (
            <ThemedText
              type="small"
              style={{ color: status.state === 'error' ? theme.danger : theme.warning }}>
              {status.state === 'cancelled'
                ? 'Cancelled'
                : status.message.slice(0, 120)}
            </ThemedText>
          )}
        </View>
      )}

      {!installed && status.state === 'downloading' && (
        <View style={styles.downloadBlock}>
          <ProgressBar
            // One smooth bar across both files: finished bytes + current stage.
            received={(status.doneBytes ?? 0) + status.received}
            total={total}
            theme={theme}
            label={(() => {
              const done = (status.doneBytes ?? 0) + status.received;
              const pct = Math.floor((done / total) * 100);
              const stage = status.stage === 'mmproj' ? ' · projector' : '';
              return `${pct}% · ${formatBytes(done)} of ${formatBytes(total)}${stage}`;
            })()}
          />
          <View style={styles.actionsRow}>
            <ActionButton label="Cancel" onPress={() => cancelDownload(entry.id)} danger />
          </View>
        </View>
      )}

      {installed && status.state === 'downloading' && (
        <ThemedText type="small" themeColor="textSecondary">
          Re-downloading…
        </ThemedText>
      )}

      
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <ThemedText type="small" style={{ color, fontSize: 12 }}>
        {label}
      </ThemedText>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  primary,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const backgroundColor = primary
    ? theme.accent
    : danger
      ? theme.backgroundSelected
      : theme.background;
  const textColor = primary
    ? theme.accentText
    : danger
      ? theme.danger
      : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="small" style={{ color: textColor, fontWeight: '600' }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function ProgressBar({
  received,
  total,
  theme,
  label,
}: {
  received: number;
  total: number | null;
  theme: ReturnType<typeof useTheme>;
  label: string;
}) {
  const ratio = total && total > 0 ? Math.min(1, received / total) : null;
  return (
    <View style={styles.progressBlock}>
      <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: theme.accent,
              width: `${Math.round((ratio ?? 0.5) * 100)}%`,
              opacity: ratio === null ? 0.5 : 1,
            },
          ]}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  content: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.four,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  screenTitle: { fontSize: 28, lineHeight: 34 },
  section: { gap: Spacing.two },
  sectionTitle: { letterSpacing: 0.6, fontSize: 12 },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  tagRow: { flexDirection: 'row', gap: Spacing.one, flexShrink: 1 },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  linkRow: { flexDirection: 'row', gap: Spacing.three },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 15,
  },
  actionButton: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    minHeight: 36,
    justifyContent: 'center',
  },
  tag: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  downloadBlock: { gap: Spacing.two },
  progressBlock: { gap: Spacing.one },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: { height: 6, borderRadius: 3 },
});
