import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { ArrowLeft, Copy, PaperPlaneTilt, UsersThree } from "phosphor-react-native";
import { useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  fetchMaintenanceHtml,
  fetchMaintenanceRender,
  useMarkMaintenanceSent,
} from "@/src/api";
import { BrandMark } from "@/src/components/BrandMark";
import { useToast } from "@/src/components/Toast";
import { haptics } from "@/src/haptics";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function MaintenancePreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();

  const markSent = useMarkMaintenanceSent();
  const [opening, setOpening] = useState(false);

  const { data: email, isLoading } = useQuery({
    queryKey: ["maint-render", id],
    queryFn: () => fetchMaintenanceRender(id),
    enabled: !!id,
  });
  const { data: htmlData } = useQuery({
    queryKey: ["maint-html", id],
    queryFn: () => fetchMaintenanceHtml(id),
    enabled: !!id,
  });

  const afterSend = async () => {
    try {
      await markSent.mutateAsync(id);
    } catch {}
    router.replace("/maintenance");
  };

  const openInOutlookApp = async () => {
    if (!email) return;
    setOpening(true);
    haptics.heavy();
    try {
      const to = email.to.join(";");
      const q = `to=${encodeURIComponent(to)}&subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
      const outlookUrl = `ms-outlook://compose?${q}`;
      const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
      let opened = false;
      try {
        if (await Linking.canOpenURL(outlookUrl)) {
          await Linking.openURL(outlookUrl);
          opened = true;
        }
      } catch {}
      if (!opened) {
        try {
          await Linking.openURL(mailtoUrl);
          opened = true;
        } catch {}
      }
      if (!opened) {
        toast("Couldn't open the Outlook app — is it installed?", "error");
        return;
      }
      haptics.success();
      await afterSend();
    } catch (e: any) {
      toast(e?.message ?? "Could not open Outlook", "error");
    } finally {
      setOpening(false);
    }
  };

  const copyFormatted = async () => {
    const data = htmlData ?? (await fetchMaintenanceHtml(id));
    await Clipboard.setStringAsync(data.html, { inputFormat: Clipboard.StringFormat.HTML });
    haptics.success();
    toast("Formatted email copied — paste into Outlook");
  };

  const footerHeight = 150;

  return (
    <View style={styles.container}>
      <View style={[styles.topbar, { paddingTop: insets.top + spacing.xs }]}>
        <Pressable testID="maint-prev-back" hitSlop={10} onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={22} color={colors.onSurface} />
        </Pressable>
        <BrandMark compact />
        <View style={{ width: 30 }} />
      </View>

      {isLoading || !email ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.onSurface} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.metaRow}>
            <Text style={styles.subjectLabel}>Subject</Text>
            <Text style={styles.subject} numberOfLines={3}>
              {email.subject}
            </Text>
            <View style={styles.toRow}>
              <UsersThree size={15} color={colors.muted} />
              <Text style={styles.toText} numberOfLines={1}>
                {email.to.length} recipient{email.to.length === 1 ? "" : "s"}
              </Text>
            </View>
          </View>

          {Platform.OS === "web" ? (
            <View style={[styles.webFallback, { marginBottom: footerHeight }]}>
              <Text style={styles.webFallbackText}>
                Email preview renders on the mobile app. The formatted email is ready to send.
              </Text>
            </View>
          ) : (
            <WebView
              originWhitelist={["*"]}
              source={{ html: htmlData?.html ?? "" }}
              style={{ flex: 1, backgroundColor: colors.surface, marginBottom: footerHeight }}
              scalesPageToFit={false}
            />
          )}
        </View>
      )}

      <View style={[styles.footer, { height: footerHeight + insets.bottom, paddingBottom: insets.bottom + spacing.sm }]}>
        <Pressable
          testID="maint-open-outlook"
          style={[styles.sendBtn, (!email || opening) && { opacity: 0.5 }]}
          onPress={openInOutlookApp}
          disabled={!email || opening}
        >
          {opening ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <PaperPlaneTilt size={18} weight="fill" color={colors.onBrandPrimary} />
              <Text style={styles.sendText}>Open in Outlook app</Text>
            </>
          )}
        </Pressable>
        <Pressable testID="maint-copy" style={styles.copyBtn} onPress={copyFormatted} disabled={!htmlData}>
          <Copy size={18} weight="bold" color={colors.onSurface} />
          <Text style={styles.copyText}>Copy formatted email</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  iconBtn: { padding: spacing.xs },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  metaRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 4,
  },
  subjectLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: colors.muted, textTransform: "uppercase" },
  subject: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  toRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  toText: { fontSize: fontSize.sm, color: colors.muted },
  webFallback: {
    flex: 1, margin: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", padding: spacing.xl,
  },
  webFallbackText: { fontSize: fontSize.base, color: colors.muted, textAlign: "center" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sendBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md,
  },
  sendText: { fontSize: 16, fontWeight: "700", color: colors.onBrandPrimary },
  copyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: spacing.sm + 2, marginTop: spacing.sm,
  },
  copyText: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
}));
