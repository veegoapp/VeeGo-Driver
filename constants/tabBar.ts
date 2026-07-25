// Shared layout constants extracted from duplicated local declarations in
// BottomTabBar.tsx and ShuttleTabBar.tsx. Values are unchanged — moved verbatim.
export const CONTAINER_PX = 12;
export const PILL_PX = 8;

/**
 * Device-independent height of the floating tab bar, in points.
 *
 * Breakdown (matches BottomTabBar / ShuttleTabBar styles):
 *   container paddingTop      :  8
 *   pill paddingVertical × 2  : 16   (PILL_PX = 8, top + bottom)
 *   tabItem paddingVertical × 2: 16  (8 top + 8 bottom)
 *   icon (20) + gap (2) + label (~12): 34
 *   container paddingBottom base: 12
 *   ─────────────────────────────────
 *   subtotal                  : 86
 *
 * The remaining variable component is `insets.bottom` (safe-area / home
 * indicator), which each consumer must add at runtime:
 *
 *   const insets = useSafeAreaInsets();
 *   const tabBarHeight = TAB_BAR_HEIGHT_BASE + insets.bottom;
 */
export const TAB_BAR_HEIGHT_BASE = 86;
