const colors = {
  light: {
    text: '#0D1117',
    tint: '#1e1e28',
    background: '#FAFAFD',
    foreground: '#0D1117',
    card: '#FFFFFF',
    cardForeground: '#0D1117',
    primary: '#1e1e28',
    primaryForeground: '#FFFFFF',
    secondary: '#EAEDF2',
    secondaryForeground: '#0D1117',
    muted: '#EAEDF2',
    mutedForeground: '#6B7280',
    // Unified VeeGo accent (shared with Passenger app) — replaces the former gold accent.
    accent: '#55c49a',
    accentForeground: '#0D1117',
    destructive: '#E85454',
    destructiveForeground: '#FFFFFF',
    success: '#3CC97A',
    warning: '#D5A623',
    // Canonical aliases matching the shared token names (mirror existing fields above).
    error: '#E85454',
    errorForeground: '#FFFFFF',
    info: '#3D52D5',
    infoForeground: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceForeground: '#0D1117',
    // Canonical payment/fare-emphasis token (shared with Passenger app) —
    // fixed value, same in light and dark, for money-specific UI moments
    // (post-trip fare amount, fare-breakdown total) independent of theme.
    gold: '#C8A535',
    border: 'rgba(0,0,0,0.08)',
    // Softer than `border` — for internal list-row separators, distinct from
    // an outer card/component outline.
    divider: 'rgba(0,0,0,0.05)',
    input: 'rgba(0,0,0,0.08)',
    glass: 'rgba(255,255,255,0.85)',
    glassStrong: 'rgba(255,255,255,0.97)',
    gradientPrimary: ['#2d2d42', '#1e1e28'] as const,
    gradientEarnings: ['#2d2d42', '#55c49a'] as const,
    // Vibrant brand-green CTA gradient — for primary actions that should pop
    // (e.g. Cash Out), distinct from the neutral gradientPrimary.
    gradientAccent: ['#55c49a', '#3CC97A'] as const,
    gradientMap: ['#C5D5E8', '#DDE8F2'] as const,
  },
  dark: {
    text: '#FFFFFF',
    tint: '#2d2d42',
    background: '#0F0F1E',
    foreground: '#FFFFFF',
    // Elevated slate — clearly separated from `background` so cards actually
    // pop instead of blending in (was '#16162A', a near-match for background).
    card: '#1C1C30',
    cardForeground: '#FFFFFF',
    primary: '#2d2d42',
    primaryForeground: '#FFFFFF',
    secondary: '#1C1C30',
    secondaryForeground: '#FFFFFF',
    muted: '#1C1C30',
    // Raised from '#B0B0B0' for legibility in bright/outdoor conditions.
    mutedForeground: '#C7CBD3',
    // Unified VeeGo accent (shared with Passenger app) — replaces the former gold accent.
    accent: '#55c49a',
    accentForeground: '#0D1117',
    destructive: '#E85454',
    destructiveForeground: '#FFFFFF',
    success: '#3CC97A',
    warning: '#D5A623',
    // Canonical aliases matching the shared token names (mirror existing fields above).
    error: '#E85454',
    errorForeground: '#FFFFFF',
    info: '#3D52D5',
    infoForeground: '#FFFFFF',
    surface: '#1C1C30',
    surfaceForeground: '#FFFFFF',
    // Canonical payment/fare-emphasis token (shared with Passenger app) —
    // fixed value, same in light and dark, for money-specific UI moments
    // (post-trip fare amount, fare-breakdown total) independent of theme.
    gold: '#C8A535',
    // Semi-transparent instead of a flat near-black hex, so it reads as a
    // subtle edge on any elevated surface rather than another solid block.
    border: 'rgba(255,255,255,0.08)',
    // Softer than `border` — for internal list-row separators.
    divider: 'rgba(255,255,255,0.05)',
    input: 'rgba(255,255,255,0.08)',
    glass: 'rgba(28,28,48,0.92)',
    glassStrong: 'rgba(28,28,48,0.98)',
    gradientPrimary: ['#2d2d42', '#1e1e28'] as const,
    gradientEarnings: ['#2d2d42', '#55c49a'] as const,
    // Vibrant brand-green CTA gradient — for primary actions that should pop
    // (e.g. Cash Out) instead of blending into dark navy/gray.
    gradientAccent: ['#55c49a', '#3CC97A'] as const,
    gradientMap: ['#0B0B0F', '#0B0B0F'] as const,
  },
  radius: 16,
};

export default colors;