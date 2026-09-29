import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PaperPlaneTilt, UsersThree } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchRenderedEmail, useDraft, useMarkSent, useUpdateDraft } from "@/src/api";
import { BrandMark } from "@/src/components/BrandMark";
import { useToast } from "@/src/components/Toast";
import { haptics } from "@/src/haptics";
import {
  cancelIncidentReminders,
  ensureNotificationPermission,
  parseNextUpdate,
  scheduleIncidentReminders,
} from "@/src/notifications";
import { fontSize, makeStyles, radius, spacing, STAGE_LABEL, useTheme } from "@/src/theme";

export default function PreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: draft } = useDraft(id);
  const updateDraft = useUpdateDraft(id);
  const markSent = useMarkSent(draft?.incident_id ?? "");
  const [productTeam, setProductTeam] = useState("");
  const [sre, setSre] = useState("");

  const { data: email, isLoading } = useQuery({
    queryKey: ["render", id],
    queryFn: () => fetchRenderedEmail(id),
    enabled: !!id,
  });

  useEffect(() => {
    if (draft) {
      setProductTeam(draft.values?.product_team ?? "");
      setSre(draft.values?.sre ?? "");
    }
  }, [draft]);

  const persistManual = async () => {
    if (!draft) return;
    await updateDraft.mutateAsync({
      values: { ...draft.values, product_team: productTeam, sre },
    });
    qc.invalidateQueries({ queryKey: ["render", id] });
  };

  const openInOutlook = async () => {
    if (!email || !draft) return;
    haptics.heavy();
    await updateDraft.mutateAsync({
      values: { ...draft.values, product_team: productTeam, sre },
    });
    const fresh = await fetchRenderedEmail(id);
    qc.setQueryData(["render", id], fresh);
    const to = fresh.to.join(";");
    const url =
      `mailto:${encodeURIComponent(to)}` +
      `?subject=${encodeURIComponent(fresh.subject)}` +
      `&body=${encodeURIComponent(fresh.body)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        toast("No email app found on this device", "error");
        return;
      }
      await Linking.openURL(url);
    } catch {
      toast("Could not open email app", "error");
      return;
    }

    // Mark the incident update as sent and schedule the follow-up reminder.
    const incidentId = draft.incident_id;
    if (incidentId) {
      try {
        await markSent.mutateAsync(draft.id);
      } catch {}
      const title = draft.values?.title || fresh.subject || "Incident";
      const stageLabel = STAGE_LABEL[draft.stage];
      if (draft.stage === "RESOLVED") {
        await cancelIncidentReminders(incidentId);
      } else {
        await ensureNotificationPermission();
        await scheduleIncidentReminders(
          incidentId,
          title,
          stageLabel,
          parseNextUpdate(draft.values?.next_update),
        );
      }
      router.replace(`/incident/${incidentId}`);
    }
  };

  const footerHeight = 84;
  const to = email?.to ?? [];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="preview-back" hitSlop={10} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <BrandMark compact />
          <Text style={styles.headerTitle}>Email Preview</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {isLoading || !email ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.onSurface} />
        </View>
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: footerHeight + insets.bottom + spacing.lg,
          }}
          bottomOffset={20}
          showsVerticalScrollIndicator={false}
        >
          {/* Recipients */}
          <View style={styles.recipientsCard}>
            <View style={styles.recipientsHead}>
              <UsersThree size={18} weight="fill" color={colors.brandPrimary} />
              <Text style={styles.recipientsTitle}>Distribution ({to.length})</Text>
            </View>
            <Text style={styles.recipientsHint}>
              Auto-built from {draft?.category === "IMCR" ? "IMCR" : "Non-IMCR"} rules & selected countries
            </Text>
            <View style={styles.chips}>
              {to.map((r) => (
                <View key={r} style={styles.chip} testID={`recipient-${r}`}>
                  <Text style={styles.chipText}>{r}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.fieldLabel}>Product team (manual)</Text>
          <TextInput
            testID="product-team-input"
            value={productTeam}
            onChangeText={setProductTeam}
            onBlur={persistManual}
            placeholder="product.team@cchellenic.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>SRE (manual)</Text>
          <TextInput
            testID="sre-input"
            value={sre}
            onChangeText={setSre}
            onBlur={persistManual}
            placeholder="sre@cchellenic.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <View style={styles.emailCard} testID="email-preview-card">
            <Text style={styles.subjectLabel}>SUBJECT</Text>
            <Text style={styles.subject} testID="preview-subject">
              {email.subject}
            </Text>
            <View style={styles.divider} />
            <Text style={styles.body} testID="preview-body">
              {email.body}
            </Text>
          </View>
        </KeyboardAwareScrollView>
      )}

      <View style={[styles.footer, { height: footerHeight + insets.bottom, paddingBottom: insets.bottom + spacing.sm }]}>
        <Pressable testID="open-outlook-btn" style={styles.sendBtn} onPress={openInOutlook} disabled={!email}>
          <PaperPlaneTilt size={18} weight="fill" color={colors.onBrandPrimary} />
          <Text style={styles.sendText}>Open in Outlook</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerTitle: { fontSize: 12, fontWeight: "600", color: colors.muted, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  recipientsCard: {
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  recipientsHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  recipientsTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onBrandTertiary },
  recipientsHint: { fontSize: 12, color: colors.onBrandTertiary, opacity: 0.8, marginTop: 2, marginBottom: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { fontSize: 12, color: colors.onSurfaceSecondary, fontWeight: "500" },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary, marginBottom: spacing.xs + 2 },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    fontSize: 15,
    color: colors.onSurface,
  },
  emailCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  subjectLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: colors.muted },
  subject: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  body: { fontSize: 14, lineHeight: 21, color: colors.onSurfaceSecondary },
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
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  sendText: { fontSize: 16, fontWeight: "700", color: colors.onBrandPrimary },
}));
