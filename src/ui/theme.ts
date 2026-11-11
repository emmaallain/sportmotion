/** Natural, soft palette: countryside greens, wood, cream. No neon. */
export const colors = {
  background: '#F3EEE3',
  surface: '#FFFCF5',
  surfaceAlt: '#EAE3D3',
  border: '#D9D0BC',
  text: '#2E3A2C',
  textMuted: '#5F6B5A',
  textOnPrimary: '#FFFFFF',
  primary: '#4F7F4E',
  primaryDark: '#3B6340',
  accent: '#B8683F',
  danger: '#B4443C',
  pulse: '#C9463D',
  xp: '#7A6BB0',
  streak: '#D9822B',
  success: '#4F7F4E',
  locked: '#A39E90',
  overlay: 'rgba(30, 36, 28, 0.55)',
  materials: {
    wood: '#9A6A3C',
    stone: '#7F8480',
    water: '#4E8FC4',
    energy: '#D29A1F',
    brick: '#B0553A',
    glass: '#6FB1B8',
    steel: '#6B7785',
  } as Record<string, string>,
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

export const font = {
  small: 13,
  body: 15,
  label: 16,
  title: 20,
  hero: 28,
} as const;

/** Minimum touch target (WCAG / platform guidelines). */
export const TOUCH = 44;

export const icons = {
  pulses: '❤️',
  xp: '⭐',
  streak: '🔥',
  joker: '🛌',
  chest: '🎁',
  lock: '🔒',
  check: '✓',
  materials: {
    wood: '🪵',
    stone: '🪨',
    water: '💧',
    energy: '⚡',
    brick: '🧱',
    glass: '🪟',
    steel: '🔩',
  } as Record<string, string>,
  activities: {
    walk: '🚶',
    run: '🏃',
    strength: '🏋️',
    stretch: '🤸',
    yoga: '🧘',
    mobility: '🤸',
    cycling: '🚴',
    swimming: '🏊',
    team_sport: '⚽',
  } as Record<string, string>,
  quests: { walk: '🚶', sport: '🏋️', stretch: '🧘' } as Record<string, string>,
  tabs: { city: '🏡', quests: '🎯', activities: '👟', progress: '📈', profile: '⚙️' },
} as const;
