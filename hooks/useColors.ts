import { useMemo } from "react";
import colors from "@/constants/colors";
import { useService } from "@/lib/serviceContext";

/**
 * Returns the design tokens for the current color scheme.
 * Respects the isDarkMode toggle from ServiceContext.
 *
 * Memoized on isDarkMode: this used to build a brand-new object on every
 * call, so any component receiving `colors` as a prop (which is most of the
 * app) had it change reference every render — silently defeating React.memo
 * on those components regardless of whether the theme actually changed.
 */
export function useColors() {
  const { isDarkMode } = useService();
  return useMemo(
    () => ({ ...(isDarkMode ? colors.dark : colors.light), radius: colors.radius }),
    [isDarkMode],
  );
}
