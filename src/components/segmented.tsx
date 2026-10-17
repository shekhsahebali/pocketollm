import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Simple accessible segmented choice — no extra dependency. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  labelFor = (v) => String(v),
  accessibilityLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labelFor?: (value: T) => string;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={[styles.row, { backgroundColor: theme.backgroundElement }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={String(option)}
            onPress={() => onChange(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.segment,
              selected && { backgroundColor: theme.backgroundSelected },
              pressed && { opacity: 0.75 },
            ]}>
            <ThemedText
              type="small"
              themeColor={selected ? 'text' : 'textSecondary'}
              style={selected ? styles.selectedText : undefined}>
              {labelFor(option)}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: Spacing.four,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.one + 2,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  selectedText: { fontWeight: '700' },
});
