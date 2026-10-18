import { type ReactNode } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { toBlocks, type Block, type Inline } from '@/chat/markdownModel';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** Renders assistant markdown; user bubbles stay plain text. */
export function MarkdownText({ text, color }: { text: string; color: string }) {
  const theme = useTheme();
  const blocks = toBlocks(text);
  const st = makeStyles(theme, color);
  return <View>{renderBlocks(blocks, st, 'b')}</View>;
}

function makeStyles(theme: ReturnType<typeof useTheme>, color: string) {
  return StyleSheet.create({
    p: { color, marginBottom: 4 },
    heading: { fontWeight: '700', fontSize: 16 },
    strong: { fontWeight: '700' },
    em: { fontStyle: 'italic' },
    codespan: {
      fontFamily: MONO,
      fontSize: 13,
      backgroundColor: theme.background,
    },
    codeBlock: {
      backgroundColor: theme.background,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      padding: Spacing.two,
      marginVertical: 4,
    },
    codeText: { fontFamily: MONO, fontSize: 13, color: theme.text },
    listItem: { color, marginBottom: 2 },
    quote: {
      borderLeftWidth: 3,
      borderLeftColor: theme.accent,
      paddingLeft: Spacing.two,
      marginVertical: 4,
    },
    hr: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
      marginVertical: Spacing.two,
    },
    link: { color: theme.accent },
  });
}

function renderBlocks(
  blocks: Block[],
  st: ReturnType<typeof makeStyles>,
  keyBase: string,
): ReactNode[] {
  return blocks.map((b, i) => {
    const key = `${keyBase}.${i}`;
    switch (b.type) {
      case 'paragraph':
        return (
          <Text key={key} style={st.p}>
            {renderInlines(b.inlines, st, key)}
          </Text>
        );
      case 'heading':
        return (
          <Text key={key} style={[st.p, st.heading]}>
            {renderInlines(b.inlines, st, key)}
          </Text>
        );
      case 'code':
        return (
          <View key={key} style={st.codeBlock}>
            <ScrollView horizontal>
              <Text style={st.codeText}>{b.text}</Text>
            </ScrollView>
          </View>
        );
      case 'list':
        return (
          <View key={key} style={st.p}>
            {b.items.map((item, j) => (
              <Text key={`${key}.${j}`} style={st.listItem}>
                {b.ordered ? `${j + 1}. ` : '• '}
                {renderInlines(item, st, `${key}.${j}`)}
              </Text>
            ))}
          </View>
        );
      case 'quote':
        return (
          <View key={key} style={st.quote}>
            {renderBlocks(b.blocks, st, key)}
          </View>
        );
      case 'hr':
        return <View key={key} style={st.hr} />;
      case 'text':
        return (
          <Text key={key} style={st.p}>
            {b.text}
          </Text>
        );
    }
  });
}

function renderInlines(inlines: Inline[], st: ReturnType<typeof makeStyles>, keyBase: string): ReactNode {
  return inlines.map((n, i) => {
    const key = `${keyBase}.${i}`;
    switch (n.type) {
      case 'text':
        return n.text;
      case 'strong':
        return (
          <Text key={key} style={st.strong}>
            {renderInlines(n.children, st, key)}
          </Text>
        );
      case 'em':
        return (
          <Text key={key} style={st.em}>
            {renderInlines(n.children, st, key)}
          </Text>
        );
      case 'code':
        return (
          <Text key={key} style={st.codespan}>
            {n.text}
          </Text>
        );
      case 'br':
        return '\n';
      case 'link':
        return (
          <Text key={key} style={st.link} onPress={() => void Linking.openURL(n.href)}>
            {renderInlines(n.children, st, key)}
          </Text>
        );
    }
  });
}
