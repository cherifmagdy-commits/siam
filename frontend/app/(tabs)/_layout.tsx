import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Books, FileText, Warning } from "phosphor-react-native";
import { Platform, StyleSheet } from "react-native";

import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { colors, scheme } = useTheme();

  if (usesNativeTabs) {
    // Lazy require so non-iOS bundles never touch the native module.
    const { NativeTabs } = require("expo-router/unstable-native-tabs");
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="doc.text" />
          <NativeTabs.Trigger.Label>Templates</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="incidents">
          <NativeTabs.Trigger.Icon sf="exclamationmark.triangle" />
          <NativeTabs.Trigger.Label>Incidents</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="library">
          <NativeTabs.Trigger.Icon sf="books.vertical" />
          <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.onSurface,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          position: "absolute",
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          backgroundColor:
            Platform.OS === "android" ? colors.surface : "transparent",
          elevation: 0,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarBackground:
          Platform.OS === "ios"
            ? () => (
                <BlurView
                  tint={scheme === "dark" ? "dark" : "light"}
                  intensity={70}
                  style={StyleSheet.absoluteFill}
                />
              )
            : undefined,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Templates",
          tabBarIcon: ({ color, focused }) => (
            <FileText size={24} color={color} weight={focused ? "fill" : "regular"} />
          ),
        }}
      />
      <Tabs.Screen
        name="incidents"
        options={{
          title: "Incidents",
          tabBarIcon: ({ color, focused }) => (
            <Warning size={24} color={color} weight={focused ? "fill" : "regular"} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color, focused }) => (
            <Books size={24} color={color} weight={focused ? "fill" : "regular"} />
          ),
        }}
      />
    </Tabs>
  );
}
