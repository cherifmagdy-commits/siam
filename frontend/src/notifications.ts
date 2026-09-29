import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

const USER_ID_KEY = "opscomm_device_user_id";
const REMINDER_MAP_KEY = "opscomm_incident_reminders";
const REMINDER_HOURS = 1;

const isWeb = Platform.OS === "web";

// Stable per-device id used for push registration (no auth in this app).
export async function getDeviceUserId(): Promise<string> {
  let id = await storage.getItem<string>(USER_ID_KEY, "");
  if (!id) {
    id = `device-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    await storage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export async function ensureNotificationPermission(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  if (isWeb) return { granted: false, canAskAgain: false };
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return { granted: true, canAskAgain: true };
  if (!current.canAskAgain) return { granted: false, canAskAgain: false };
  const req = await Notifications.requestPermissionsAsync();
  return { granted: req.status === "granted", canAskAgain: req.canAskAgain };
}

// Best-effort parse of a free-text "Next update by" value e.g. "10:30 CET, 22 May 2026".
export function parseNextUpdate(raw?: string): Date | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\b(CET|CEST|UTC|GMT|EET|EEST)\b/gi, "").trim();
  const ts = Date.parse(cleaned);
  if (Number.isNaN(ts)) return null;
  const d = new Date(ts);
  return d.getTime() > Date.now() ? d : null;
}

async function readMap(): Promise<Record<string, string[]>> {
  return (await storage.getItem<Record<string, string[]>>(REMINDER_MAP_KEY, {})) ?? {};
}

export async function cancelIncidentReminders(incidentId: string): Promise<void> {
  if (isWeb) return;
  const map = await readMap();
  const ids = map[incidentId] ?? [];
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
  );
  delete map[incidentId];
  await storage.setItem(REMINDER_MAP_KEY, map);
}

// Notification action buttons for snoozing straight from the reminder.
export async function ensureReminderCategory(): Promise<void> {
  if (isWeb) return;
  await Notifications.setNotificationCategoryAsync("incident-reminder", [
    { identifier: "snooze_15", buttonTitle: "Snooze 15m", options: { opensAppToForeground: false } },
    { identifier: "snooze_30", buttonTitle: "Snooze 30m", options: { opensAppToForeground: false } },
  ]).catch(() => {});
}

async function scheduleReminderIn(
  incidentId: string,
  incidentTitle: string,
  stageLabel: string,
  seconds: number,
  body: string,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: incidentTitle,
      body,
      categoryIdentifier: "incident-reminder",
      data: { deeplink: `/incident/${incidentId}`, incidentId, incidentTitle, stageLabel },
      ...(Platform.OS === "android" ? { channelId: "default" } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.round(seconds)),
      repeats: false,
    },
  });
}

// Schedules the "you sent the last update an hour ago" reminder, plus an
// optional reminder at the entered "Next update by" time. Deep-links to the
// incident so the user can post the next update.
export async function scheduleIncidentReminders(
  incidentId: string,
  incidentTitle: string,
  stageLabel: string,
  nextUpdate?: Date | null,
): Promise<void> {
  if (isWeb) return;
  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== "granted") return;

  await cancelIncidentReminders(incidentId);
  const scheduled: string[] = [];

  scheduled.push(
    await scheduleReminderIn(
      incidentId,
      incidentTitle,
      stageLabel,
      REMINDER_HOURS * 60 * 60,
      `You sent the last ${stageLabel} update an hour ago. Tap to post the next update.`,
    ),
  );

  if (nextUpdate) {
    const dueId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Update due · ${incidentTitle}`,
        body: `The next update for this incident is due now. Tap to post it.`,
        categoryIdentifier: "incident-reminder",
        data: { deeplink: `/incident/${incidentId}`, incidentId, incidentTitle, stageLabel },
        ...(Platform.OS === "android" ? { channelId: "default" } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextUpdate },
    });
    scheduled.push(dueId);
  }

  const map = await readMap();
  map[incidentId] = scheduled;
  await storage.setItem(REMINDER_MAP_KEY, map);
}

// Reschedule a single reminder N minutes from now (used by snooze).
export async function snoozeIncidentReminder(
  incidentId: string,
  incidentTitle: string,
  stageLabel: string,
  minutes: number,
): Promise<void> {
  if (isWeb || !incidentId) return;
  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    if (req.status !== "granted") return;
  }
  await cancelIncidentReminders(incidentId);
  const id = await scheduleReminderIn(
    incidentId,
    incidentTitle || "Incident",
    stageLabel || "last",
    minutes * 60,
    `Snoozed reminder — time to post the next update.`,
  );
  const map = await readMap();
  map[incidentId] = [id];
  await storage.setItem(REMINDER_MAP_KEY, map);
}

// Registers this device for Emergent-managed server push. No-op on web / Expo
// Go / simulators where a native device token is unavailable.
export async function registerForPush(backendUrl: string): Promise<void> {
  if (isWeb || !Device.isDevice) return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const userId = await getDeviceUserId();
    await fetch(`${backendUrl}/api/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, platform: Platform.OS, device_token: tokenResp.data }),
    });
  } catch {
    // Push token only available on real builds; ignore elsewhere.
  }
}
