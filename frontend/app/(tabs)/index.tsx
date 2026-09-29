import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { CaretRight, WarningOctagon } from "phosphor-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Template, useCreateDraft, useTemplates } from "@/src/api";
import { StatusPill } from "@/src/components/StatusPill";
import { useToast } from "@/src/components/Toast";
import { haptics } from "@/src/haptics";
import { fontSize, makeStyles, radius, spacing, Stage, useTheme } from "@/src/theme";
import { useTabBottomPadding } from "@/src/useTabBottomPadding";

const STAGE_ORDER: Stage[] = [
  "INVESTIGATING",
  "IDENTIFIED",
  "RECOVERING",
  "MONITORING",
  "RESOLVED",
];

const HERO =
  "https://images.unsplash.com/photo-1680992046626-418f7e910589?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzV8MHwxfHNlYXJjaHwxfHxzZXJ2ZXIlMjByb29tJTIwYWJzdHJhY3QlMjBjbGVhbiUyMGFyY2hpdGVjdHVyZXxlbnwwfHx8fDE3OTA2ODM2NDB8MA&ixlib=rb-4.1.0&q=85";

export default function TemplatesScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const bottomPad = useTabBottomPadding(spacing.xl);

  const [category, setCategory] = useState<"IMCR" | "NON_IMCR">("IMCR");
  const { data: templates, isLoading, isError, refetch } = useTemplates();
  const createDraft = useCreateDraft();

  const grouped = useMemo(() => {
    const list = (templates ?? []).filter((t) => t.category === category);
    const byStage: Record<string, Template[]> = {};
    list.forEach((t) => {
      byStage[t.stage] = byStage[t.stage] || [];
      byStage[t.stage].push(t);
    });
    return STAGE_ORDER.map((s) => ({ stage: s, items: byStage[s] || [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [templates, category]);

  const startDraft = async (template: Template) => {
    haptics.selection();
    try {
      const draft = await createDraft.mutateAsync(template.id);
      router.push(`/compose/${draft.id}`);
    } catch (e: any) {
      toast(e?.message ?? "Could not start draft", "error");
    }
  };

  return (
    <View style={styles.container}>
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>DTPS IT OPERATIONS</Text>
            <Text style={styles.title} testID="templates-title">
              Incident Templates
            </Text>
          </View>
          <Image source={{ uri: HERO }} style={styles.heroImg} contentFit="cover" transition={200} />
        </View>

        <View style={styles.segment} testID="category-segment">
          {(["IMCR", "NON_IMCR"] as const).map((c) => {
            const active = category === c;
            return (
              <Pressable
                key={c}
                testID={`segment-${c}`}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => {
                  haptics.light();
                  setCategory(c);
                }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {c === "IMCR" ? "IMCR" : "Non-IMCR"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.onSurface} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <WarningOctagon size={40} color={colors.muted} />
          <Text style={styles.emptyText}>Could not load templates.</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()} testID="templates-retry">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
        >
          {grouped.map((group) => (
            <View key={group.stage} style={styles.group}>
              <Text style={styles.groupTitle}>{group.stage}</Text>
              {group.items.map((t) => (
                <Pressable
                  key={t.id}
                  testID={`template-card-${t.id}`}
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  onPress={() => startDraft(t)}
                  disabled={createDraft.isPending}
                >
                  <View style={styles.cardBody}>
                    <StatusPill stage={t.stage} small />
                    <Text style={styles.cardTitle}>{t.name}</Text>
                    <Text style={styles.cardSub}>{t.sections.length} sections to validate</Text>
                  </View>
                  <CaretRight size={18} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.muted,
  },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  heroImg: { width: 56, height: 56, borderRadius: radius.md },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm + 2,
    alignItems: "center",
  },
  segmentBtnActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, fontWeight: "600", color: colors.muted },
  segmentTextActive: { color: colors.onSurface, fontWeight: "700" },
  group: { marginBottom: spacing.xl },
  groupTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { opacity: 0.7 },
  cardBody: { flex: 1, gap: spacing.xs + 2 },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  cardSub: { fontSize: fontSize.sm, color: colors.muted },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyText: { color: colors.muted, fontSize: 15 },
  retryBtn: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  retryText: { color: colors.onBrandPrimary, fontWeight: "700" },
}));
