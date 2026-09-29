// Design tokens for OpsComm (enterprise incident-communication tool).
// Monochromatic Vercel/Linear base; color is reserved for the 5 incident
// status stages. Light + dark, following the device setting automatically.
//
// Use makeStyles() for StyleSheets and useTheme().colors for color props.
// Never write color literals in components.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#111111",
  surfaceSecondary: "#F5F5F5",
  onSurfaceSecondary: "#333333",
  surfaceTertiary: "#EBEBEB",
  onSurfaceTertiary: "#555555",
  surfaceInverse: "#111111",
  onSurfaceInverse: "#FFFFFF",
  muted: "#737373",

  brand: "#111111",
  onBrand: "#FFFFFF",
  brandPrimary: "#1A1A1A",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#EAEAEA",
  onBrandSecondary: "#111111",
  brandTertiary: "#F0F0F0",
  onBrandTertiary: "#333333",

  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#64748B",
  onInfo: "#FFFFFF",

  border: "#E5E5E5",
  borderStrong: "#CCCCCC",
  divider: "#F0F0F0",

  statusInvestigating: "#F59E0B",
  onStatusInvestigating: "#FFFFFF",
  statusIdentified: "#F97316",
  onStatusIdentified: "#FFFFFF",
  statusRecovering: "#14B8A6",
  onStatusRecovering: "#FFFFFF",
  statusMonitoring: "#64748B",
  onStatusMonitoring: "#FFFFFF",
  statusResolved: "#10B981",
  onStatusResolved: "#FFFFFF",
};

const dark: typeof light = {
  surface: "#000000",
  onSurface: "#FAFAFA",
  surfaceSecondary: "#1A1A1A",
  onSurfaceSecondary: "#EBEBEB",
  surfaceTertiary: "#2A2A2A",
  onSurfaceTertiary: "#A3A3A3",
  surfaceInverse: "#FAFAFA",
  onSurfaceInverse: "#111111",
  muted: "#888888",

  brand: "#FAFAFA",
  onBrand: "#111111",
  brandPrimary: "#FAFAFA",
  onBrandPrimary: "#111111",
  brandSecondary: "#333333",
  onBrandSecondary: "#FAFAFA",
  brandTertiary: "#222222",
  onBrandTertiary: "#EBEBEB",

  success: "#34D399",
  onSuccess: "#064E3B",
  warning: "#FBBF24",
  onWarning: "#78350F",
  error: "#F87171",
  onError: "#450A0A",
  info: "#94A3B8",
  onInfo: "#0F172A",

  border: "#333333",
  borderStrong: "#555555",
  divider: "#222222",

  statusInvestigating: "#FBBF24",
  onStatusInvestigating: "#78350F",
  statusIdentified: "#FB923C",
  onStatusIdentified: "#7C2D12",
  statusRecovering: "#2DD4BF",
  onStatusRecovering: "#134E4A",
  statusMonitoring: "#94A3B8",
  onStatusMonitoring: "#0F172A",
  statusResolved: "#34D399",
  onStatusResolved: "#064E3B",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// ---------------------------------------------------------------------------
// Shared design tokens
// ---------------------------------------------------------------------------
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const fontSize = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export type Stage =
  | "INVESTIGATING"
  | "IDENTIFIED"
  | "RECOVERING"
  | "MONITORING"
  | "RESOLVED";

export const STAGE_LABEL: Record<Stage, string> = {
  INVESTIGATING: "Investigating",
  IDENTIFIED: "Identified",
  RECOVERING: "Recovering",
  MONITORING: "Monitoring",
  RESOLVED: "Resolved",
};

export function stageColors(colors: ThemeColors, stage: Stage): { bg: string; on: string } {
  switch (stage) {
    case "INVESTIGATING":
      return { bg: colors.statusInvestigating, on: colors.onStatusInvestigating };
    case "IDENTIFIED":
      return { bg: colors.statusIdentified, on: colors.onStatusIdentified };
    case "RECOVERING":
      return { bg: colors.statusRecovering, on: colors.onStatusRecovering };
    case "MONITORING":
      return { bg: colors.statusMonitoring, on: colors.onStatusMonitoring };
    case "RESOLVED":
      return { bg: colors.statusResolved, on: colors.onStatusResolved };
  }
}
