import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { CaretRight, GitBranch } from "phosphor-react-native";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Contingency } from "@/src/api";
import { haptics } from "@/src/haptics";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export interface ContingencyPickerRef {
  open: () => void;
  close: () => void;
}

interface Props {
  product: string;
  rows: Contingency[];
  onSelect: (row: Contingency) => void;
}

// Build a readable subtitle: CP ID + status for master rows, failed system for
// legacy rows, plus owner and scope where available.
function rowMeta(row: Contingency): string {
  const parts: string[] = [];
  if (row.cp_id) parts.push(`${row.cp_id} · ${row.mapping_status ?? ""}`.trim());
  else if (row.mapping_status) parts.push(row.mapping_status);
  else if (row.failed_system) parts.push(`Failed system: ${row.failed_system}`);
  if (row.owner) parts.push(`Owner: ${row.owner}`);
  if (row.countries_scope) parts.push(`Scope: ${row.countries_scope}`);
  return parts.join("  ·  ");
}

export const ContingencyPickerSheet = forwardRef<ContingencyPickerRef, Props>(
  function ContingencyPickerSheet({ product, rows, onSelect }, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const insets = useSafeAreaInsets();
    const styles = useStyles();
    const { colors } = useTheme();

    useImperativeHandle(ref, () => ({
      open: () => {
        sheetRef.current?.present();
        haptics.selection();
      },
      close: () => sheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={["70%"]}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backgroundStyle={{ backgroundColor: colors.surface }}
      >
        <BottomSheetView style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Choose business process</Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {product} has {rows.length} contingency processes — pick the one impacted.
            </Text>
          </View>

          <BottomSheetScrollView
            style={styles.list}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          >
            {rows.map((row, i) => (
              <Pressable
                key={`${row.process}-${i}`}
                testID={`contingency-option-${i}`}
                style={styles.row}
                onPress={() => {
                  haptics.selection();
                  onSelect(row);
                  sheetRef.current?.dismiss();
                }}
              >
                <View style={styles.iconWrap}>
                  <GitBranch size={18} weight="bold" color={colors.brandPrimary} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.process} numberOfLines={3}>
                    {row.process || "Business process not identified"}
                  </Text>
                  <Text style={styles.meta} numberOfLines={3}>
                    {rowMeta(row)}
                  </Text>
                </View>
                <CaretRight size={18} color={colors.muted} />
              </Pressable>
            ))}
          </BottomSheetScrollView>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const useStyles = makeStyles((colors) => ({
  sheet: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  subtitle: { fontSize: 13, color: colors.onSurfaceTertiary },
  list: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: 2 },
  process: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  meta: { fontSize: 12, color: colors.onSurfaceTertiary },
}));
