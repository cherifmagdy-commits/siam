import { Text, View } from "react-native";

import { makeStyles, radius, spacing } from "@/src/theme";

// Coca-Cola HBC wordmark. Uses the brand red from the theme; the "HBC" chip
// keeps a fixed red so it reads as the corporate mark in light and dark.
export function BrandMark({ compact }: { compact?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.row} testID="brand-mark">
      <Text style={[styles.word, compact && styles.wordCompact]}>Coca‑Cola</Text>
      <View style={[styles.chip, compact && styles.chipCompact]}>
        <Text style={[styles.chipText, compact && styles.chipTextCompact]}>HBC</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2 },
  word: {
    fontSize: 16,
    fontWeight: "800",
    fontStyle: "italic",
    color: colors.brandPrimary,
    letterSpacing: -0.3,
  },
  wordCompact: { fontSize: 13 },
  chip: {
    backgroundColor: "#E61A27",
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  chipCompact: { paddingHorizontal: 4 },
  chipText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12, letterSpacing: 0.5 },
  chipTextCompact: { fontSize: 10 },
}));
