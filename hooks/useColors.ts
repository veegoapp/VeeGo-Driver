import colors from "@/constants/colors";
import { useService } from "@/lib/serviceContext";

/**
 * Returns the design tokens for the current color scheme.
 * Respects the isDarkMode toggle from ServiceContext.
 */
export function useColors() {
  const { isDarkMode } = useService();
  return { ...(isDarkMode ? colors.dark : colors.light), radius: colors.radius };
}
