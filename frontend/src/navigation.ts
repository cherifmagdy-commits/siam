import { Platform } from "react-native";

// iOS 26+ gets real NativeTabs (liquid glass); everything else uses the
// classic JS <Tabs> bar. Defined once and imported by the tabs layout and
// every tab screen so bottom-inset math stays consistent.
export const usesNativeTabs =
  Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;
