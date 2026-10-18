/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Token set every palette must fill for both schemes. */
type Scheme = {
  text: string;
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  textSecondary: string;
  border: string;
  accent: string;
  accentText: string;
  userBubble: string;
  userBubbleText: string;
  danger: string;
  success: string;
  warning: string;
};

/**
 * Named color palettes (Settings → Appearance). Each has light + dark
 * variants; the mode (system/light/dark) picks which one is shown.
 * Keep in sync with COLOR_PALETTES in settingsSanitize.ts.
 */
export const PALETTES = {
  /** Stripe-ish: slate neutrals + emerald. */
  emerald: {
    light: {
      text: '#0F172A',
      background: '#F8FAFC',
      backgroundElement: '#FFFFFF',
      backgroundSelected: '#E2E8F0',
      textSecondary: '#64748B',
      border: '#E2E8F0',
      accent: '#059669',
      accentText: '#ffffff',
      userBubble: '#059669',
      userBubbleText: '#ffffff',
      danger: '#DC2626',
      success: '#16A34A',
      warning: '#D97706',
    },
    dark: {
      text: '#F8FAFC',
      background: '#0F172A',
      backgroundElement: '#1E293B',
      backgroundSelected: '#334155',
      textSecondary: '#94A3B8',
      border: '#334155',
      accent: '#10B981',
      accentText: '#052E16',
      userBubble: '#059669',
      userBubbleText: '#ffffff',
      danger: '#F87171',
      success: '#34D399',
      warning: '#FBBF24',
    },
  },
  /** Linear/Notion-ish: gray neutrals + indigo. */
  indigo: {
    light: {
      text: '#111827',
      background: '#FAFAFA',
      backgroundElement: '#FFFFFF',
      backgroundSelected: '#E5E7EB',
      textSecondary: '#6B7280',
      border: '#E5E7EB',
      accent: '#4F46E5',
      accentText: '#ffffff',
      userBubble: '#4F46E5',
      userBubbleText: '#ffffff',
      danger: '#DC2626',
      success: '#16A34A',
      warning: '#D97706',
    },
    dark: {
      text: '#F9FAFB',
      background: '#111827',
      backgroundElement: '#1F2937',
      backgroundSelected: '#374151',
      textSecondary: '#9CA3AF',
      border: '#374151',
      accent: '#818CF8',
      accentText: '#1E1B4B',
      userBubble: '#6366F1',
      userBubbleText: '#ffffff',
      danger: '#F87171',
      success: '#34D399',
      warning: '#FBBF24',
    },
  },
  /** Classic trust blue (WhatsApp/Telegram family). */
  ocean: {
    light: {
      text: '#0F172A',
      background: '#F8FAFC',
      backgroundElement: '#FFFFFF',
      backgroundSelected: '#E2E8F0',
      textSecondary: '#64748B',
      border: '#E2E8F0',
      accent: '#2563EB',
      accentText: '#ffffff',
      userBubble: '#2563EB',
      userBubbleText: '#ffffff',
      danger: '#DC2626',
      success: '#16A34A',
      warning: '#D97706',
    },
    dark: {
      text: '#F8FAFC',
      background: '#0B1220',
      backgroundElement: '#162235',
      backgroundSelected: '#2A3B55',
      textSecondary: '#94A3B8',
      border: '#2A3B55',
      accent: '#3B82F6',
      accentText: '#0B1220',
      userBubble: '#2563EB',
      userBubbleText: '#ffffff',
      danger: '#F87171',
      success: '#34D399',
      warning: '#FBBF24',
    },
  },
  /** Rose accent on neutral zinc. */
  rose: {
    light: {
      text: '#18181B',
      background: '#FAFAFA',
      backgroundElement: '#FFFFFF',
      backgroundSelected: '#E4E4E7',
      textSecondary: '#71717A',
      border: '#E4E4E7',
      accent: '#E11D48',
      accentText: '#ffffff',
      userBubble: '#E11D48',
      userBubbleText: '#ffffff',
      danger: '#DC2626',
      success: '#16A34A',
      warning: '#D97706',
    },
    dark: {
      text: '#FAFAFA',
      background: '#18181B',
      backgroundElement: '#27272A',
      backgroundSelected: '#3F3F46',
      textSecondary: '#A1A1AA',
      border: '#3F3F46',
      accent: '#FB7185',
      accentText: '#4C0519',
      userBubble: '#E11D48',
      userBubbleText: '#ffffff',
      danger: '#F87171',
      success: '#34D399',
      warning: '#FBBF24',
    },
  },
  /** Amber accent on warm stone neutrals. */
  amber: {
    light: {
      text: '#292524',
      background: '#FAFAF9',
      backgroundElement: '#FFFFFF',
      backgroundSelected: '#E7E5E4',
      textSecondary: '#78716C',
      border: '#E7E5E4',
      accent: '#D97706',
      accentText: '#ffffff',
      userBubble: '#D97706',
      userBubbleText: '#ffffff',
      danger: '#DC2626',
      success: '#16A34A',
      warning: '#B45309',
    },
    dark: {
      text: '#FAFAF9',
      background: '#1C1917',
      backgroundElement: '#292524',
      backgroundSelected: '#44403C',
      textSecondary: '#A8A29E',
      border: '#44403C',
      accent: '#F59E0B',
      accentText: '#451A03',
      userBubble: '#B45309',
      userBubbleText: '#ffffff',
      danger: '#F87171',
      success: '#34D399',
      warning: '#FBBF24',
    },
  },
} satisfies Record<string, { light: Scheme; dark: Scheme }>;

export type PaletteName = keyof typeof PALETTES;

/** Default palette; also the source of the ThemeColor token-name union. */
export const Colors = PALETTES.emerald;

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
