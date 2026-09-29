import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { NotePencil, TrashSimple } from "phosphor-react-native";
import { useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Draft, useDeleteDraft, useDrafts } from "@/src/api";
import { StatusPill } from "@/src/components/StatusPill";
import { useToast } from "@/src/components/Toast";
import { haptics } from "@/src/haptics";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useTabBottomPadding } from "@/src/useTabBottomPadding";

const EMPTY_IMG =
  "https://images.unsplash.com/photo-1518655048521-f130df041f66?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NjZ8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGNoZWNrbGlzdCUyMGRlc2slMjBtaW5pbWFsaXN0fGVufDB8fHx8MTc5MDY4MzY0MHww&ixlib=rb-4.1.0&q=85";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DraftsScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const bottomPad = useTabBottomPadding(spacing.xl);

  const { data: drafts, isLoading, refetch, isRefetching } = useDrafts();
  const deleteDraft = useDeleteDraft();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const onDelete = async (d: Draft) => {
    haptics.warning();
    try {
      await deleteDraft.mutateAsync(d.id);
      toast("Draft deleted");
    } catch (e: any) {
      toast(e?.message ?? "Could not delete", "error");
    }
  };

  const list = drafts ?? [];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title} testID="drafts-title">
          Drafts
        </Text>
        <Text style={styles.subtitle}>Resume in-progress communications</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.onSurface} />
        </View>
      ) : list.length === 0 ? (
        <ScrollView
          contentContainerStyle={[styles.center, { paddingBottom: bottomPad }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          <Image source={{ uri: EMPTY_IMG }} style={styles.emptyImg} contentFit="cover" />
          <Text style={styles.emptyTitle}>No active drafts</Text>
          <Text style={styles.emptyText}>Pick a template to start a communication.</Text>
          <Pressable
            style={styles.cta}
            testID="drafts-empty-cta"
            onPress={() => router.push("/(tabs)")}
          >
            <Text style={styles.ctaText}>Browse templates</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          {list.map((d) => {
            const subject = d.values?.subject || d.template_name;
            const prog = d.progress ?? { validated: 0, total: 0 };
            const complete = prog.total > 0 && prog.validated >= prog.total;
            return (
              <Pressable
                key={d.id}
                testID={`draft-card-${d.id}`}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => {
                  haptics.selection();
                  router.push(`/compose/${d.id}`);
                }}
              >
                <View style={styles.cardTop}>
                  <StatusPill stage={d.stage} small />
                  <Text style={styles.category}>{d.category === "IMCR" ? "IMCR" : "Non-IMCR"}</Text>
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {subject}
                </Text>
                <View style={styles.cardBottom}>
                  <View
                    style={[
                      styles.progressPill,
                      complete && { backgroundColor: colors.success },
                    ]}
                  >
                    <Text style={[styles.progressText, complete && { color: colors.onSuccess }]}>
                      {complete ? "Ready to send" : `${prog.validated}/${prog.total} validated`}
                    </Text>
                  </View>
                  <Text style={styles.time}>{timeAgo(d.updated_at)}</Text>
                  <Pressable
                    testID={`draft-delete-${d.id}`}
                    hitSlop={10}
                    style={styles.deleteBtn}
                    onPress={() => onDelete(d)}
                  >
                    <TrashSimple size={18} color={colors.muted} />
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
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
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  emptyImg: { width: 140, height: 140, borderRadius: radius.lg, marginBottom: spacing.sm },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  emptyText: { fontSize: fontSize.base, color: colors.muted, textAlign: "center" },
  cta: {
    marginTop: spacing.sm,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  ctaText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: fontSize.base },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardPressed: { opacity: 0.7 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  category: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: colors.muted },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  progressPill: {
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
  },
  progressText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  time: { fontSize: 12, color: colors.muted, flex: 1 },
  deleteBtn: { padding: spacing.xs },
}));
