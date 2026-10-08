import { useFocusEffect, useRouter } from "expo-router";
import { CheckCircle, Plus, TrashSimple, Wrench } from "phosphor-react-native";
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

import {
  Maintenance,
  useCreateMaintenance,
  useDeleteMaintenance,
  useMaintenanceList,
} from "@/src/api";
import { BrandMark } from "@/src/components/BrandMark";
import { useToast } from "@/src/components/Toast";
import { haptics } from "@/src/haptics";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useTabBottomPadding } from "@/src/useTabBottomPadding";

export default function MaintenanceScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const bottomPad = useTabBottomPadding(spacing.xl);

  const { data: list, isLoading, refetch, isRefetching } = useMaintenanceList();
  const createMaintenance = useCreateMaintenance();
  const deleteMaintenance = useDeleteMaintenance();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const onNew = async () => {
    haptics.medium();
    try {
      const m = await createMaintenance.mutateAsync({});
      router.push(`/maintenance/${m.id}`);
    } catch (e: any) {
      toast(e?.message ?? "Could not create", "error");
    }
  };

  const onDelete = async (m: Maintenance) => {
    haptics.warning();
    try {
      await deleteMaintenance.mutateAsync(m.id);
      toast("Maintenance deleted");
    } catch (e: any) {
      toast(e?.message ?? "Could not delete", "error");
    }
  };

  const rows = list ?? [];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BrandMark compact />
        <Text style={styles.title} testID="maintenance-title">
          Maintenance
        </Text>
        <Text style={styles.subtitle}>Planned maintenance schedule emails</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.onSurface} />
        </View>
      ) : rows.length === 0 ? (
        <ScrollView
          contentContainerStyle={[styles.center, { paddingBottom: bottomPad }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          <View style={styles.emptyIcon}>
            <Wrench size={40} color={colors.brandPrimary} weight="fill" />
          </View>
          <Text style={styles.emptyTitle}>No maintenance comms yet</Text>
          <Text style={styles.emptyText}>Build a planned-maintenance schedule email in minutes.</Text>
          <Pressable style={styles.cta} testID="maintenance-empty-cta" onPress={onNew}>
            <Plus size={18} weight="bold" color={colors.onBrandPrimary} />
            <Text style={styles.ctaText}>New maintenance</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          <Pressable style={styles.newRow} testID="maintenance-new" onPress={onNew}>
            <Plus size={18} weight="bold" color={colors.onBrandPrimary} />
            <Text style={styles.ctaText}>New maintenance</Text>
          </Pressable>

          {rows.map((m) => (
            <Pressable
              key={m.id}
              testID={`maintenance-card-${m.id}`}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
              onPress={() => {
                haptics.selection();
                router.push(`/maintenance/${m.id}`);
              }}
            >
              <Text style={styles.cardTitle} numberOfLines={2}>
                {m.heading || "Untitled maintenance"}
              </Text>
              <View style={styles.cardBottom}>
                <Text style={styles.meta}>
                  {m.windows?.length ?? 0} window{(m.windows?.length ?? 0) === 1 ? "" : "s"}
                </Text>
                <Text style={styles.dot}>·</Text>
                {m.sent_at ? (
                  <View style={styles.resolvedRow}>
                    <CheckCircle size={14} weight="fill" color={colors.success} />
                    <Text style={[styles.meta, { color: colors.success }]}>Sent</Text>
                  </View>
                ) : (
                  <Text style={[styles.meta, { flex: 1 }]}>Draft</Text>
                )}
                <Pressable
                  testID={`maintenance-delete-${m.id}`}
                  hitSlop={10}
                  style={styles.deleteBtn}
                  onPress={() => onDelete(m)}
                >
                  <TrashSimple size={18} color={colors.muted} />
                </Pressable>
              </View>
            </Pressable>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  subtitle: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  emptyIcon: {
    width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brandTertiary,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  emptyText: { fontSize: fontSize.base, color: colors.muted, textAlign: "center" },
  cta: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm,
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  newRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  ctaText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: fontSize.base },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  meta: { fontSize: 12, color: colors.muted, fontWeight: "500" },
  dot: { color: colors.muted },
  resolvedRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 },
  deleteBtn: { padding: spacing.xs },
}));
