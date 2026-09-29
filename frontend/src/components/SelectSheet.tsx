import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Check, MagnifyingGlass, Plus } from "phosphor-react-native";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptics } from "@/src/haptics";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export interface SelectSheetRef {
  open: () => void;
  close: () => void;
}

interface Props {
  title: string;
  options: string[];
  selected?: string;
  onSelect: (value: string) => void;
  onCreate: (value: string) => Promise<void> | void;
}

export const SelectSheet = forwardRef<SelectSheetRef, Props>(function SelectSheet(
  { title, options, selected, onSelect, onCreate },
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

  const handleSelect = useCallback(
    (value: string) => {
      onSelect(value);
      sheetRef.current?.dismiss();
    },
    [onSelect],
  );

  const handleCreate = useCallback(async () => {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreate(name);
      haptics.medium();
      onSelect(name);
      sheetRef.current?.dismiss();
    } finally {
      setCreating(false);
    }
  }, [query, onCreate, onSelect]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    [],
  );

  // BottomSheetTextInput is not compatible with react-native-web; use a plain
  // TextInput there. Native keeps the sheet-aware input for keyboard handling.
  const SearchInput: any = Platform.OS === "web" ? TextInput : BottomSheetTextInput;

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={["70%"]}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      backgroundStyle={{ backgroundColor: colors.surface }}
    >
      <BottomSheetView style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.searchBox}>
          <MagnifyingGlass size={18} color={colors.muted} />
          <SearchInput
            testID="select-sheet-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Search or type to add…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCapitalize="none"
          />
        </View>
      </BottomSheetView>
      <BottomSheetFlatList
        data={filtered}
        keyExtractor={(item) => item}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          query.trim() && !exactMatch ? (
            <Pressable
              testID="select-sheet-create"
              style={styles.createRow}
              disabled={creating}
              onPress={handleCreate}
            >
              <View style={styles.createIcon}>
                <Plus size={16} weight="bold" color={colors.onBrandPrimary} />
              </View>
              <Text style={styles.createText}>
                {creating ? "Adding…" : `Add “${query.trim()}”`}
              </Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => {
          const isSelected = item === selected;
          return (
            <Pressable
              testID={`select-option-${item}`}
              style={styles.row}
              onPress={() => handleSelect(item)}
            >
              <Text style={[styles.rowText, isSelected && styles.rowTextSelected]} numberOfLines={2}>
                {item}
              </Text>
              {isSelected ? <Check size={18} weight="bold" color={colors.onSurface} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !query.trim() ? (
            <Text style={styles.empty}>No items yet — type above to add one.</Text>
          ) : null
        }
      />
    </BottomSheetModal>
  );
});

const useStyles = makeStyles((colors) => ({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.onSurface,
    paddingVertical: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowText: {
    fontSize: 15,
    color: colors.onSurfaceSecondary,
    flexShrink: 1,
  },
  rowTextSelected: {
    color: colors.onSurface,
    fontWeight: "700",
  },
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
  createText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
  },
  empty: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 14,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
}));
