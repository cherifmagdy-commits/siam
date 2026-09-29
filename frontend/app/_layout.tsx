import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { LogBox, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/Toast";
import { registerForPush, ensureReminderCategory, snoozeIncidentReminder } from "@/src/notifications";
import { queryClient } from "@/src/query-client";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

// Foreground display behaviour — module scope, before any component.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Android notification channel — module scope.
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Incident reminders",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

export default function RootLayout() {
  const { scheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL as string;

    registerForPush(backendUrl);
    ensureReminderCategory();

    const openFromData = (data: any) => {
      const url = data?.deeplink || data?.action_url;
      if (!url) return;
      url.startsWith("http") ? Linking.openURL(url) : router.push(url);
    };

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      const action = response.actionIdentifier;
      if (action === "snooze_15" || action === "snooze_30") {
        const mins = action === "snooze_15" ? 15 : 30;
        snoozeIncidentReminder(data.incidentId, data.incidentTitle, data.stageLabel, mins);
        return;
      }
      openFromData(data);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openFromData(response.notification.request.content.data || {});
    });

    // Weekly nudge for users who denied notifications.
    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "denied" || canAskAgain) return;
      const lastNudge = await storage.getItem<number>("pushNudgeAt", 0);
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
      await storage.setItem("pushNudgeAt", Date.now());
      Linking.openSettings();
    })();

    return () => {
      tapSub.remove();
    };
  }, [router]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <BottomSheetModalProvider>
                <ToastProvider>
                  <StatusBar style={scheme === "dark" ? "light" : "dark"} />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="incident/[id]" options={{ presentation: "card" }} />
                    <Stack.Screen name="compose/[id]" options={{ presentation: "card" }} />
                    <Stack.Screen name="preview/[id]" options={{ presentation: "card" }} />
                  </Stack>
                </ToastProvider>
              </BottomSheetModalProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
