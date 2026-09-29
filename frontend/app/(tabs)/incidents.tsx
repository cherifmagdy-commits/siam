import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { BellRinging, CheckCircle, TrashSimple } from "phosphor-react-native";
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

import { Incident, useDeleteIncident, useIncidents } from "@/src/api";
import { BrandMark } from "@/src/components/BrandMark";
import { StatusPill } from "@/src/components/StatusPill";
import { useToast } from "@/src/components/Toast";
import { cancelIncidentReminders } from "@/src/notifications";
import { haptics } from "@/src/haptics";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useTabBottomPadding } from "@/src/useTabBottomPadding";

const EMPTY_IMG =
  "https://images.unsplash.com/photo-1518655048521-f130df041f66?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NjZ8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGNoZWNrbGlzdCUyMGRlc2slMjBtaW5pbWFsaXN0fGVufDB8fHx8MTc5MDY4MzY0MHww&ixlib=rb-4.1.0&q=85";

function timeAgo(iso: string | null): string {
  if (!iso) return "not sent yet";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "sent just now";
  if (mins < 60) return `sent ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `sent ${hrs}h ago`;
  return `sent ${Math.floor(hrs / 24)}d ago`;
}

export default function IncidentsScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const bottomPad = useTabBottomPadding(spacing.xl);

  const { data: incidents, isLoading, refetch, isRefetching } = useIncidents();
  const deleteIncident = useDeleteIncident();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const onDelete = async (inc: Incident) => {
    haptics.warning();
    try {
      await deleteIncident.mutateAsync(inc.id);
      cancelIncidentReminders(inc.id);
      toast("Incident deleted");
    } catch (e: any) {
      toast(e?.message ?? "Could not delete", "error");
    }
  };

  const list = incidents ?? [];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BrandMark compact />
        <Text style={styles.title} testID="incidents-title">
          Incidents
        </Text>
        <Text style={styles.subtitle}>Live threads from detection to resolution</Text>
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
          <Text style={styles.emptyTitle}>No active incidents</Text>
          <Text style={styles.emptyText}>Start one from a template to open a thread.</Text>
          <Pressable style={styles.cta} testID="incidents-empty-cta" onPress={() => router.push("/(tabs)")}>
            <Text style={styles.ctaText}>Browse templates</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          {list.map((inc) => {
            const resolved = inc.status === "RESOLVED";
            return (
              <Pressable
                key={inc.id}
                testID={`incident-card-${inc.id}`}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => {
                  haptics.selection();
                  router.push(`/incident/${inc.id}`);
                }}
              >
                <View style={styles.cardTop}>
                  <StatusPill stage={inc.current_stage} small />
                  <Text style={styles.category}>{inc.category === "IMCR" ? "IMCR" : "Non-IMCR"}</Text>
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {inc.title}
                </Text>
                <View style={styles.cardBottom}>
                  <Text style={styles.meta}>
                    {inc.update_count ?? 0} update{(inc.update_count ?? 0) === 1 ? "" : "s"}
                  </Text>
                  <Text style={styles.dot}>·</Text>
                  {resolved ? (
                    <View style={styles.resolvedRow}>
                      <CheckCircle size={14} weight="fill" color={colors.success} />
                      <Text style={[styles.meta, { color: colors.success }]}>Resolved</Text>
                    </View>
                  ) : (
                    <View style={styles.resolvedRow}>
                      <BellRinging size={13} color={colors.brandPrimary} />
                      <Text style={styles.meta}>{timeAgo(inc.last_sent_at)}</Text>
                    </View>
                  )}
                  <Pressable
                    testID={`incident-delete-${inc.id}`}
                    hitSlop={10}
                    style={styles.deleteBtn}
                    onPress={() => onDelete(inc)}
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
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
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
  cardBottom: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  meta: { fontSize: 12, color: colors.muted, fontWeight: "500" },
  dot: { color: colors.muted },
  resolvedRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 },
  deleteBtn: { padding: spacing.xs },
}));
