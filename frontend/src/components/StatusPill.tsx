import { Text, View } from "react-native";

import { makeStyles, radius, spacing, Stage, STAGE_LABEL, stageColors, useTheme } from "@/src/theme";

export function StatusPill({ stage, small }: { stage: Stage; small?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const c = stageColors(colors, stage);
  return (
    <View
      testID={`status-pill-${stage.toLowerCase()}`}
      style={[styles.pill, small && styles.pillSmall, { backgroundColor: c.bg }]}
    >
      <View style={[styles.dot, { backgroundColor: c.on }]} />
      <Text style={[styles.label, small && styles.labelSmall, { color: c.on }]}>
        {STAGE_LABEL[stage]}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  pillSmall: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.9,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  labelSmall: {
    fontSize: 11,
    fontWeight: "700",
  },
}));
