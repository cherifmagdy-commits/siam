import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { CheckSquare, MagnifyingGlass, Plus, Square } from "phosphor-react-native";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptics } from "@/src/haptics";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export interface CountrySheetRef {
  open: () => void;
  close: () => void;
}

interface Props {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onCreate: (value: string) => Promise<void> | void;
}

export const CountrySheet = forwardRef<CountrySheetRef, Props>(function CountrySheet(
  { options, selected, onToggle, onCreate },
  ref,
) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();

  useImperativeHandle(ref, () => ({
    open: () => {
      setQuery("");
      sheetRef.current?.present();
      haptics.selection();
    },
    close: () => sheetRef.current?.dismiss(),
  }));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const exactMatch = useMemo(
    () => options.some((o) => o.toLowerCase() === query.trim().toLowerCase()),
    [options, query],
  );

  const handleCreate = useCallback(async () => {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreate(name);
      haptics.medium();
      onToggle(name);
      setQuery("");
    } finally {
      setCreating(false);
    }
  }, [query, onCreate, onToggle]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    [],
  );

  const SearchInput: any = Platform.OS === "web" ? TextInput : BottomSheetTextInput;

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={["85%"]}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      backgroundStyle={{ backgroundColor: colors.surface }}
    >
      <BottomSheetView style={styles.sheet}>
        {/* Fixed header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Countries impacted</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{selected.length}</Text>
            </View>
          </View>
          <View style={styles.searchBox}>
            <MagnifyingGlass size={18} color={colors.muted} />
            <SearchInput
              testID="country-sheet-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Search or add a country…"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />
          </View>
        </View>

        {/* Scrollable list — one row per country, ticked individually */}
        <BottomSheetScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          {query.trim() && !exactMatch ? (
            <Pressable testID="country-sheet-create" style={styles.createRow} disabled={creating} onPress={handleCreate}>
              <View style={styles.createIcon}>
                <Plus size={16} weight="bold" color={colors.onBrandPrimary} />
              </View>
              <Text style={styles.createText}>{creating ? "Adding…" : `Add “${query.trim()}”`}</Text>
            </Pressable>
          ) : null}

          {filtered.map((item) => {
            const isSelected = selected.includes(item);
            return (
              <Pressable
                key={item}
                testID={`country-option-${item}`}
                style={styles.row}
                onPress={() => {
                  haptics.selection();
                  onToggle(item);
                }}
              >
                {isSelected ? (
                  <CheckSquare size={22} weight="fill" color={colors.brandPrimary} />
                ) : (
                  <Square size={22} color={colors.borderStrong} />
                )}
                <Text style={[styles.rowText, isSelected && styles.rowTextSelected]} numberOfLines={2}>
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </BottomSheetScrollView>

        {/* Fixed footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Pressable testID="country-sheet-done" style={styles.doneBtn} onPress={() => sheetRef.current?.dismiss()}>
            <Text style={styles.doneText}>Done ({selected.length})</Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const useStyles = makeStyles((colors) => ({
  sheet: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surface,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  countBadge: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    minWidth: 24,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignItems: "center",
  },
  countBadgeText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.onSurface, paddingVertical: 0 },
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
  rowText: { fontSize: 15, color: colors.onSurfaceSecondary, flexShrink: 1 },
  rowTextSelected: { color: colors.onSurface, fontWeight: "600" },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  createIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  createText: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  doneBtn: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  doneText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
}));
