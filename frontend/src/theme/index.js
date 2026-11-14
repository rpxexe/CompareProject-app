import { Platform } from 'react-native';

export const colors = {
  ink: '#131C3B', plum: '#102360', charcoal: '#121A33',
  ivory: '#FDFEFE', champagneSoft: '#F5F9FB', lavender: '#F2F6F8',
  gold: '#5C80F6', goldDeep: '#2851D9', rose: '#7D9BFF',
  success: '#0E9F6E', error: '#D32F2F',
  white: '#FFFFFF', line: '#E8EEF0', muted: '#686F85', text: '#121B38',
  overlay: 'rgba(10, 18, 46, 0.55)',
  neon: '#7D9BFF', violet: '#2457FF', deepViolet: '#040B20',
  primary: '#2457FF', primaryLight: '#5C80F6', primaryDark: '#2851D9',
  purpleSurface: '#F9FCFD', purpleBorder: 'rgba(92, 128, 246, 0.25)',
  purpleGlow: '#557BF7', mint: '#10B981',
};

// Brand palette from the 2026 onboarding redesign. New UI should read from here (or `colors`)
// rather than hardcoding hex values.
export const brand = {
  violet: '#2457FF',
  deep: '#163CB8',
  magenta: '#1FB6F0',
  lavender: '#F4F8FA',
  lavenderMid: '#E7EFF2',
  bg: '#FDFEFE',
  ink: '#131C3B',
  inkSoft: '#686F85',
  placeholder: '#949AAE',
  gold: '#C98A0B',
  goldBright: '#F5B82E',
  goldSoft: '#FFF5DC',
  goldBorder: 'rgba(214, 160, 40, 0.55)',
  errorSoft: '#FDECEC',
  errorBorder: '#F5C2C2',
};

export const gradients = {
  // Primary CTA. White text stays above 4.5:1 across the centre of the fill.
  cta: ['#3A6BFF', '#2457FF', '#1A44E0'],
  logo: ['#1FB6F0', '#3260F7', '#163CB8'],
  progress: ['#6B8EFF', '#2457FF'],
  canvas: ['#FFFFFF', '#FAFCFD', '#F6FAFB'],
  iconGold: ['#FFE7A6', '#F5B82E'],
  // Secondary action (card "Enquire Now"); white text stays above 4.5:1.
  info: ['#3F8CFF', '#1F5FE0'],
};

// Three glass strengths: decorative surfaces can be airy, anything holding inputs stays near-opaque.
export const surfaces = {
  glassSoft: { backgroundColor: 'rgba(255, 255, 255, 0.55)', borderColor: 'rgba(255, 255, 255, 0.85)', borderWidth: 1 },
  glass: { backgroundColor: 'rgba(255, 255, 255, 0.74)', borderColor: 'rgba(255, 255, 255, 0.95)', borderWidth: 1 },
  glassStrong: { backgroundColor: 'rgba(255, 255, 255, 0.92)', borderColor: 'rgba(36, 87, 255, 0.10)', borderWidth: 1 },
  field: { backgroundColor: '#FDFEFE', borderColor: '#E3EAED', borderWidth: 1.2 },
};

export const motion = { fast: 160, base: 280, slow: 420 };

export const radius = { sm: 10, md: 16, lg: 22, xl: 30, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

// One app font, Plus Jakarta Sans (loaded in App.js; AppText picks the face for each weight).
// `serif` is kept as a name so existing heading styles keep working - it is the same family.
export const fonts = {
  serif: 'PlusJakartaSans',
  sans: 'PlusJakartaSans',
};

export const shadow = {
  card: Platform.select({
    android: { elevation: 3 },
    default: { shadowColor: '#0A122E', shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  }),
  float: Platform.select({
    android: { elevation: 10 },
    default: { shadowColor: '#0A122E', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
  }),
  glass: Platform.select({
    android: { elevation: 4 },
    default: {
      shadowColor: '#0A122E',
      shadowOpacity: 0.07,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
  }),
  glassFloat: Platform.select({
    android: { elevation: 12 },
    default: {
      shadowColor: '#0A122E',
      shadowOpacity: 0.16,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 12 },
    },
  }),
};

// Soft neon-violet glow used on primary actions and highlights.
export const glow = Platform.select({
  android: { elevation: 8 },
  default: { shadowColor: '#6B8EFF', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
});

export const glowSubtle = Platform.select({
  android: { elevation: 4 },
  default: { shadowColor: '#6B8EFF', shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
});

// Comprehensive glassmorphism & liquid glass system tokens
export const glass = {
  light: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1.2,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1.2,
  },
  liquid: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderColor: 'rgba(210, 224, 231, 0.6)',
    borderWidth: 1.4,
  },
  subtle: {
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
    borderColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1,
  },
  pill: {
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1.2,
    borderRadius: radius.pill,
  },
  dark: {
    backgroundColor: 'rgba(10, 18, 46, 0.78)',
    borderColor: 'rgba(125, 155, 255, 0.35)',
    borderWidth: 1.2,
  },
  darkCard: {
    backgroundColor: 'rgba(14, 28, 76, 0.78)',
    borderColor: 'rgba(125, 155, 255, 0.38)',
    borderWidth: 1.2,
  },
  liquidDark: {
    backgroundColor: 'rgba(12, 24, 65, 0.82)',
    borderColor: 'rgba(160, 199, 255, 0.5)',
    borderWidth: 1.4,
  },
  gradients: {
    light: ['rgba(255, 255, 255, 0.88)', 'rgba(255, 255, 255, 0.62)'],
    liquid: ['rgba(255, 255, 255, 0.84)', 'rgba(248, 251, 252, 0.62)', 'rgba(243, 248, 250, 0.48)'],
    sheen: ['rgba(255, 255, 255, 0.85)', 'rgba(255, 255, 255, 0.1)'],
    liquidSheen: ['rgba(255, 255, 255, 0.95)', 'rgba(234, 243, 246, 0.4)', 'rgba(255, 255, 255, 0.05)'],
    dark: ['rgba(16, 35, 96, 0.85)', 'rgba(10, 18, 46, 0.82)'],
    liquidDark: ['rgba(18, 38, 105, 0.88)', 'rgba(11, 22, 56, 0.82)', 'rgba(6, 13, 36, 0.88)'],
    darkSheen: ['rgba(255, 255, 255, 0.35)', 'rgba(255, 255, 255, 0.02)'],
    violet: ['rgba(125, 155, 255, 0.28)', 'rgba(36, 87, 255, 0.15)'],
    goldGlass: ['rgba(162, 202, 255, 0.85)', 'rgba(107, 142, 255, 0.7)'],
  },
};

export const type = {
  display: { fontFamily: fonts.serif, fontWeight: '700', fontSize: 34, lineHeight: 40, color: colors.ink, letterSpacing: -0.8 },
  h1: { fontFamily: fonts.serif, fontWeight: '700', fontSize: 26, lineHeight: 32, color: colors.ink, letterSpacing: -0.4 },
  h2: { fontFamily: fonts.serif, fontWeight: '700', fontSize: 20, lineHeight: 26, color: colors.ink, letterSpacing: -0.2 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, lineHeight: 21, color: colors.text },
  small: { fontSize: 12, lineHeight: 17, color: colors.muted },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: colors.muted, textTransform: 'uppercase' },
};
