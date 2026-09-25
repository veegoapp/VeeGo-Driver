import { useService } from './serviceContext';

// ── "C · Split Panel" design tokens ─────────────────────────────────────────
// The Split-Panel redesign (ride/[rideId].tsx, shuttle trip screens,
// earnings, wallet, home) shipped with a single fixed hex palette,
// independent of the app's light/dark theme — toggling dark mode left these
// screens looking identical to light mode. This is the shared, theme-aware
// replacement: same field shape every file already used as C_BG/C_INK/etc,
// just sourced from here instead of a local hex literal, computed against
// the app's existing light/dark tokens (constants/colors.ts) so it matches
// the rest of the app's dark mode instead of inventing a new one.
//
// The always-dark "panel" side of the split-card design (hero header, dark
// rail) stays a fixed near-black in both modes — it's a deliberate dark
// accent surface by design, not something that should go "more dark" or
// invert. Only the light "card" side, ink/caption text, hairlines, and
// backgrounds actually change between light and dark mode. Status/accent
// hues (teal, mint, gold star, red, green) are unchanged — they're already
// legible on both a white and a dark surface.
export type SplitColors = {
  isDark: boolean;
  bg: string;
  panel: string;
  card: string;
  surfaceMuted: string;
  ink: string;
  inkSoft: string;
  cap: string;
  capOnDark: string;
  hair: string;
  teal: string;
};

export function makeSplitColors(isDark: boolean): SplitColors {
  return {
    isDark,
    bg: isDark ? '#0F0F1E' : '#EAECEF',
    panel: '#14151A',
    card: isDark ? '#1C1C30' : '#FFFFFF',
    // In light mode this sat 1-2 points off `bg` (#F0F2F3 vs #EEF0F2) — visually
    // indistinguishable, so the period-pill track and card interiors read as
    // flat with `bg`. Darkened enough to read as a distinct groove, matching
    // how dark mode's surfaceMuted already clearly separates from its bg.
    surfaceMuted: isDark ? '#22233A' : '#E1E4E8',
    ink: isDark ? '#FFFFFF' : '#14151A',
    inkSoft: isDark ? '#C7CBD3' : '#6B7178',
    cap: isDark ? '#8A9096' : '#9AA0A6',
    capOnDark: '#8A9096',
    // Was '#EEF0F1' — nearly identical to `bg`, so card borders were
    // effectively invisible in light mode. A translucent black hairline (same
    // idea as dark mode's translucent white one) reads as a real edge against
    // both `bg` and the white `card` regardless of the exact bg tone.
    hair: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    teal: '#0E9F8E',
  };
}

export function useSplitColors(): SplitColors {
  const { isDarkMode } = useService();
  return makeSplitColors(isDarkMode);
}
