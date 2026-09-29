import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PaperPlaneTilt, SignOut, UsersThree } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import { WebView } from "react-native-webview";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchRenderedEmail, fetchRenderedHtml, useDraft, useMarkSent, useUpdateDraft } from "@/src/api";
import { createOutlookDraft, useMicrosoftAuth } from "@/src/msauth";
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
  const ms = useMicrosoftAuth();
  const [productTeam, setProductTeam] = useState("");
  const [sre, setSre] = useState("");
  const [webHeight, setWebHeight] = useState(420);
  const [sending, setSending] = useState(false);

  const { data: email, isLoading } = useQuery({
    queryKey: ["render", id],
    queryFn: () => fetchRenderedEmail(id),
    enabled: !!id,
  });

  const { data: htmlData } = useQuery({
    queryKey: ["render-html", id],
    queryFn: () => fetchRenderedHtml(id),
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
    qc.invalidateQueries({ queryKey: ["render-html", id] });
  };

  const afterDraftCreated = async () => {
    if (!draft) return;
    const incidentId = draft.incident_id;
    if (!incidentId) return;
    try {
      await markSent.mutateAsync(draft.id);
    } catch {}
    const title = draft.values?.title || email?.subject || "Incident";
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
  };

  const createDraftInOutlook = async () => {
    if (!draft) return;
    if (!ms.configured) {
      toast("Outlook isn't set up yet — your IT needs to finish the Azure app registration.", "error");
      return;
    }
    setSending(true);
    haptics.heavy();
    try {
      // persist any manual recipients first so they're in the draft body/recipients
      await updateDraft.mutateAsync({ values: { ...draft.values, product_team: productTeam, sre } });

      let session = await ms.ensureSession();
      try {
        await createOutlookDraft(id, session);
      } catch (e: any) {
        // session may have expired — sign in again once and retry
        if (e?.status === 401) {
          await ms.signOut();
          session = await ms.signIn();
          await createOutlookDraft(id, session);
        } else {
          throw e;
        }
      }
      haptics.success();
      toast(`Draft created in ${ms.sharedMailbox || "the shared mailbox"} — open Outlook on your laptop and press Send`);
      await afterDraftCreated();
    } catch (e: any) {
      toast(e?.message || "Could not create the Outlook draft", "error");
    } finally {
      setSending(false);
    }
  };

  const footerHeight = 140;
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

          <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Formatted email preview</Text>
          <View style={styles.emailCard} testID="email-preview-card">
            <Text style={styles.subjectLabel}>SUBJECT</Text>
            <Text style={styles.subject} testID="preview-subject">
              {email.subject}
            </Text>
            <View style={styles.divider} />
            {htmlData?.html ? (
              <WebView
                testID="preview-html"
                originWhitelist={["*"]}
                source={{ html: htmlData.html }}
                style={{ height: webHeight, backgroundColor: "transparent", opacity: 0.99 }}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                injectedJavaScript={
                  "window.ReactNativeWebView && window.ReactNativeWebView.postMessage(String(document.body.scrollHeight));true;"
                }
                onMessage={(e) => {
                  const h = Number(e.nativeEvent.data);
                  if (h && Math.abs(h - webHeight) > 4) setWebHeight(h + (Platform.OS === "web" ? 0 : 8));
                }}
              />
            ) : (
              <ActivityIndicator color={colors.onSurface} style={{ marginVertical: spacing.xl }} />
            )}
          </View>
        </KeyboardAwareScrollView>
      )}

      <View style={[styles.footer, { height: footerHeight + insets.bottom, paddingBottom: insets.bottom + spacing.sm }]}>
        {ms.signedIn ? (
          <View style={styles.acctRow}>
            <Text style={styles.acctText} numberOfLines={1}>
              {ms.account?.upn ? `Signed in as ${ms.account.upn}` : "Signed in to Microsoft 365"}
            </Text>
            <Pressable testID="ms-signout" hitSlop={8} onPress={ms.signOut} style={styles.signOutBtn}>
              <SignOut size={14} color={colors.muted} />
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.acctHint} numberOfLines={1}>
            {ms.configured
              ? `Creates a ready-to-send draft in ${ms.sharedMailbox}`
              : "Outlook 365 not configured yet — ask IT to finish Azure setup"}
          </Text>
        )}
        <Pressable
          testID="create-draft-btn"
          style={[styles.sendBtn, (!email || sending || !ms.configured) && { opacity: 0.5 }]}
          onPress={createDraftInOutlook}
          disabled={!email || sending || !ms.configured}
        >
          {sending ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <PaperPlaneTilt size={18} weight="fill" color={colors.onBrandPrimary} />
              <Text style={styles.sendText}>
                {ms.signedIn ? "Create draft in Outlook" : "Sign in & create Outlook draft"}
              </Text>
            </>
          )}
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
  acctRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  acctText: { flex: 1, fontSize: 12, color: colors.onSurfaceSecondary, marginRight: spacing.sm },
  acctHint: { fontSize: 12, color: colors.muted, marginBottom: spacing.sm },
  signOutBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  signOutText: { fontSize: 12, fontWeight: "600", color: colors.muted },
}));
