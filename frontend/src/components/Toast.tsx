import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle, Warning } from "phosphor-react-native";

import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type ToastKind = "success" | "error";
type ToastCtx = (message: string, kind?: ToastKind) => void;

const ToastContext = createContext<ToastCtx>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ message: string; kind: ToastKind } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ToastCtx>(
    (message, kind = "success") => {
      setState({ message, kind });
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
          () => setState(null),
        );
      }, 2600);
    },
    [opacity],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {state ? (
        <Animated.View
          pointerEvents="none"
          testID="toast"
          style={[
            styles.wrap,
            { top: insets.top + spacing.sm, opacity },
          ]}
        >
          <View style={styles.toast}>
            {state.kind === "success" ? (
              <CheckCircle size={20} weight="fill" color={colors.success} />
            ) : (
              <Warning size={20} weight="fill" color={colors.error} />
            )}
            <Text style={styles.text} numberOfLines={2}>
              {state.message}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
    zIndex: 1000,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceInverse,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    maxWidth: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: {
    color: colors.onSurfaceInverse,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
}));
