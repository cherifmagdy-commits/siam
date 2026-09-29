import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, EnvelopeSimple, PaperPlaneTilt } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchRenderedEmail, useDraft, useUpdateDraft } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { haptics } from "@/src/haptics";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function PreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();

  const { data: draft } = useDraft(id);
  const updateDraft = useUpdateDraft(id);
  const [recipients, setRecipients] = useState("");

  const { data: email, isLoading } = useQuery({
    queryKey: ["render", id],
    queryFn: () => fetchRenderedEmail(id),
    enabled: !!id,
  });

  useEffect(() => {
    if (draft) setRecipients(draft.recipients ?? "");
  }, [draft]);

  const openInOutlook = async () => {
    if (!email) return;
    haptics.heavy();
    updateDraft.mutate({ recipients });
    const to = recipients.trim();
    const url =
      `mailto:${encodeURIComponent(to)}` +
      `?subject=${encodeURIComponent(email.subject)}` +
      `&body=${encodeURIComponent(email.body)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        toast("No email app found on this device", "error");
        return;
      }
      await Linking.openURL(url);
    } catch {
      toast("Could not open email app", "error");
    }
  };

  const footerHeight = 84;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="preview-back" hitSlop={10} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Email Preview</Text>
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
          <Text style={styles.fieldLabel}>To</Text>
          <View style={styles.toBox}>
            <EnvelopeSimple size={18} color={colors.muted} />
            <TextInput
              testID="recipients-input"
              value={recipients}
              onChangeText={setRecipients}
              placeholder="recipient@cchellenic.com; …"
              placeholderTextColor={colors.muted}
              style={styles.toInput}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

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
  headerTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary, marginBottom: spacing.xs + 2 },
  toBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    marginBottom: spacing.lg,
  },
  toInput: { flex: 1, fontSize: 15, color: colors.onSurface, paddingVertical: 0 },
  emailCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  subjectLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: colors.muted },
  subject: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.onSurfaceSecondary,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
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
