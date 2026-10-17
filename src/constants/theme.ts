/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#fff6e7',
    backgroundElement: '#ffffff',
    backgroundSelected: '#e5e2de',
    textSecondary: '#60646C',
    border: '#E3E4E8',
    accent: '#f6920e',
    accentText: '#ffffff',
    userBubble: '#208AEF',
    danger: '#D93025',
    success: '#1E8E3E',
    warning: '#B06000',
  },
  dark: {
    text: '#ffffff',
    background: '#212121',
    backgroundElement: '#17171a',
    backgroundSelected: '#24282d',
    textSecondary: '#B0B4BA',
    border: '#33353A',
    accent: '#f6920e',
    accentText: '#000000',
    userBubble: '#d8b400',
    danger: '#F28B82',
    success: '#81C995',
    warning: '#FDD663',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
