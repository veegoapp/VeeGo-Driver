import colors from "@/constants/colors";
import { useService } from "@/lib/serviceContext";

/**
 * Returns the design tokens for the current color scheme.
 * Dark/light mode is controlled globally via the toggle in Profile.
 * Defaults to dark mode (isDarkMode = true).
 */
export function useColors() {
  const { isDarkMode } = useService();
  const palette = isDarkMode ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
