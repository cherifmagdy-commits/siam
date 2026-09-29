import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  BellRinging,
  CaretRight,
  CheckCircle,
  Plus,
} from "phosphor-react-native";
import { useCallback, useMemo, useRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Draft, useCreateUpdate, useIncident, useTemplates } from "@/src/api";
import { StatusPill } from "@/src/components/StatusPill";
import { useToast } from "@/src/components/Toast";
import { haptics } from "@/src/haptics";
import { snoozeIncidentReminder } from "@/src/notifications";
import { fontSize, makeStyles, radius, spacing, STAGE_LABEL, useTheme } from "@/src/theme";

const STAGE_ORDER = ["IDENTIFIED", "INVESTIGATING", "RECOVERING", "MONITORING", "RESOLVED"];

export default function IncidentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();

  const { data: incident, isLoading } = useIncident(id);
  const { data: templates } = useTemplates();
  const createUpdate = useCreateUpdate(id);
  const pickerRef = useRef<BottomSheetModal>(null);

  const stageTemplates = useMemo(() => {
    if (!incident || !templates) return [];
    return templates
      .filter((t) => t.category === incident.category)
      .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
  }, [incident, templates]);

  const openPicker = () => {
    haptics.selection();
    pickerRef.current?.present();
  };

  const postUpdate = async (templateId: string) => {
    pickerRef.current?.dismiss();
    try {
      const draft = await createUpdate.mutateAsync(templateId);
      router.push(`/compose/${draft.id}`);
    } catch (e: any) {
      toast(e?.message ?? "Could not create update", "error");
    }
  };

  const onSnooze = async (minutes: number) => {
    if (!incident) return;
    haptics.selection();
    await snoozeIncidentReminder(
      incident.id,
      incident.title,
      STAGE_LABEL[incident.current_stage],
      minutes,
    );
    toast(`Reminder snoozed for ${minutes} minutes`);
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    [],
  );

  if (isLoading || !incident) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.onSurface} />
      </View>
    );
  }

  const resolved = incident.status === "RESOLVED";
  const footerHeight = 76;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="incident-back" hitSlop={10} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {incident.title}
        </Text>
        <StatusPill stage={incident.current_stage} small />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: footerHeight + insets.bottom + spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {resolved ? (
          <View style={[styles.banner, { backgroundColor: colors.surfaceSecondary }]}>
            <CheckCircle size={18} weight="fill" color={colors.success} />
            <Text style={styles.bannerText}>This incident is resolved. No further updates needed.</Text>
          </View>
        ) : incident.last_sent_at ? (
          <View style={styles.banner}>
            <BellRinging size={18} weight="fill" color={colors.brandPrimary} />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Text style={styles.bannerText}>
                Reminder scheduled — you&apos;ll be nudged an hour after your last update to post the next one.
              </Text>
              <View style={styles.snoozeRow}>
                <Text style={styles.snoozeLabel}>Snooze:</Text>
                <Pressable testID="snooze-15" style={styles.snoozeChip} onPress={() => onSnooze(15)}>
                  <Text style={styles.snoozeChipText}>15 min</Text>
                </Pressable>
                <Pressable testID="snooze-30" style={styles.snoozeChip} onPress={() => onSnooze(30)}>
                  <Text style={styles.snoozeChipText}>30 min</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        <Text style={styles.threadLabel}>UPDATE THREAD</Text>
        {(incident.updates ?? []).map((u: Draft, idx: number) => {
          const prog = u.progress ?? { validated: 0, total: 0 };
          const sent = !!u.sent_at;
          const complete = prog.total > 0 && prog.validated >= prog.total;
          const isLast = idx === (incident.updates?.length ?? 0) - 1;
          return (
            <View key={u.id} style={styles.threadRow}>
              <View style={styles.timeline}>
                <View style={[styles.node, sent && { backgroundColor: colors.success, borderColor: colors.success }]} />
                {!isLast ? <View style={styles.line} /> : null}
              </View>
              <Pressable
                testID={`update-card-${u.id}`}
                style={({ pressed }) => [styles.updateCard, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  haptics.selection();
                  router.push(`/compose/${u.id}`);
                }}
              >
                <View style={styles.updateTop}>
                  <StatusPill stage={u.stage} small />
                  {sent ? (
                    <View style={styles.sentBadge}>
                      <CheckCircle size={13} weight="fill" color={colors.success} />
                      <Text style={styles.sentText}>Sent</Text>
                    </View>
                  ) : (
                    <Text style={[styles.statusText, complete && { color: colors.success }]}>
                      {complete ? "Ready" : `${prog.validated}/${prog.total} validated`}
                    </Text>
                  )}
                </View>
                <Text style={styles.updateSubject} numberOfLines={2}>
                  {u.values?.subject || u.template_name}
                </Text>
                <CaretRight size={16} color={colors.muted} style={styles.chevron} />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {!resolved ? (
        <View style={[styles.footer, { height: footerHeight + insets.bottom, paddingBottom: insets.bottom + spacing.sm }]}>
          <Pressable testID="post-update-btn" style={styles.postBtn} onPress={openPicker} disabled={createUpdate.isPending}>
            <Plus size={18} weight="bold" color={colors.onBrandPrimary} />
            <Text style={styles.postText}>Post next update</Text>
          </Pressable>
        </View>
      ) : null}

      <BottomSheetModal
        ref={pickerRef}
        snapPoints={["60%"]}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backgroundStyle={{ backgroundColor: colors.surface }}
      >
        <BottomSheetView style={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
          <Text style={styles.pickerTitle}>Choose the update type</Text>
          <Text style={styles.pickerHint}>Prefilled from your last update — you&apos;ll re-validate each field.</Text>
          {stageTemplates.map((t) => (
            <Pressable
              key={t.id}
              testID={`stage-option-${t.id}`}
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => postUpdate(t.id)}
            >
              <StatusPill stage={t.stage} small />
              <Text style={styles.pickerRowText}>{STAGE_LABEL[t.stage]}</Text>
              <CaretRight size={16} color={colors.muted} />
            </Pressable>
          ))}
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerText: { flex: 1, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 18 },
  snoozeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  snoozeLabel: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  snoozeChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
  },
  snoozeChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  threadLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 1, color: colors.muted, marginBottom: spacing.md },
  threadRow: { flexDirection: "row", gap: spacing.md },
  timeline: { alignItems: "center", width: 16 },
  node: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  line: { flex: 1, width: 2, backgroundColor: colors.divider, marginVertical: 2 },
  updateCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  updateTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusText: { fontSize: 12, fontWeight: "700", color: colors.muted },
  sentBadge: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sentText: { fontSize: 12, fontWeight: "700", color: colors.success },
  updateSubject: { fontSize: 15, fontWeight: "600", color: colors.onSurface, paddingRight: spacing.lg },
  chevron: { position: "absolute", right: spacing.md, bottom: spacing.lg },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  postBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  postText: { fontSize: 16, fontWeight: "700", color: colors.onBrandPrimary },
  pickerTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.xs },
  pickerHint: { fontSize: 13, color: colors.muted, marginBottom: spacing.md },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  pickerRowText: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.onSurface },
}));
