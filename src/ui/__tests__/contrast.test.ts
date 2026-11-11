import { colors } from '../theme';

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('colour contrast (WCAG AA, 4.5:1 for text)', () => {
  const surfaces = [colors.background, colors.surface, colors.surfaceAlt];
  const texts = {
    text: colors.text,
    textMuted: colors.textMuted,
    primaryDark: colors.primaryDark,
    accent: colors.accent,
    danger: colors.danger,
    pulse: colors.pulse,
    xp: colors.xp,
    streakText: colors.streakText,
  };

  it.each(Object.entries(texts))('%s is readable on every surface', (_name, color) => {
    for (const surface of surfaces) expect(contrast(color, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps button labels readable', () => {
    expect(contrast(colors.textOnPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textOnPrimary, colors.xp)).toBeGreaterThanOrEqual(4.5);
  });
});
