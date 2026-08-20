import { MD3LightTheme } from "react-native-paper";

export const colors = {
  background: "#F8F9FF",
  surface: "#FFFFFF",
  surfaceMuted: "#EDF2FF",
  primary: "#584CB9",
  primarySoft: "#E4DFFF",
  accent: "#6D43B7",
  text: "#0B1C30",
  textMuted: "#474552",
  success: "#197A52",
  successSoft: "#DDF5E9",
  warning: "#A55B00",
  warningSoft: "#FFF0D7",
  danger: "#B3261E",
  border: "#DCE3F5",
};

export const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    secondary: colors.accent,
    background: colors.background,
    surface: colors.surface,
    onSurface: colors.text,
  },
};
