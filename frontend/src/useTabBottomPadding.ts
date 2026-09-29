import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";

import { usesNativeTabs } from "@/src/navigation";

// Bottom clearance for a tab screen's scroll content so the last item is not
// hidden behind the tab bar. NativeTabs float over content (inset already
// accounts for them); the classic bar is absolute + glass, so reserve its
// height (49 iOS / 56 Android) plus the safe-area inset.
export function useTabBottomPadding(extra = 0): number {
  const insets = useSafeAreaInsets();
  const barHeight = Platform.OS === "android" ? 56 : 49;
  const base = usesNativeTabs ? insets.bottom : barHeight + insets.bottom;
  return base + extra;
}
