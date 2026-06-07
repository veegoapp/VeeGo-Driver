import colors from "@/constants/colors";

/**
 * Returns the design tokens for the current color scheme.
 * Dark mode is disabled — always returns the light palette.
 */
export function useColors() {
  return { ...colors.light, radius: colors.radius };
}
