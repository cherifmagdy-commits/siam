import * as DocumentPicker from "expo-document-picker";
import { FileXls, MagnifyingGlass, Plus, TrashSimple } from "phosphor-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  importExcel,
  useCreateCountry,
  useCreateProcess,
  useCreateProduct,
  useCountries,
  useDeleteCountry,
  useDeleteProcess,
  useDeleteProduct,
  useProcesses,
  useProducts,
} from "@/src/api";
import { BrandMark } from "@/src/components/BrandMark";
import { useToast } from "@/src/components/Toast";
import { haptics } from "@/src/haptics";
import { queryClient } from "@/src/query-client";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useTabBottomPadding } from "@/src/useTabBottomPadding";

type Tab = "products" | "processes" | "countries";

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const bottomPad = useTabBottomPadding(spacing.xl);

  const [tab, setTab] = useState<Tab>("products");
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);

  const { data: products, isLoading: pLoading } = useProducts();
  const { data: processes, isLoading: prLoading } = useProcesses();
  const { data: countries, isLoading: cLoading } = useCountries();
  const createProduct = useCreateProduct();
  const createProcess = useCreateProcess();
  const createCountry = useCreateCountry();
  const deleteProduct = useDeleteProduct();
  const deleteProcess = useDeleteProcess();
  const deleteCountry = useDeleteCountry();

  const items = tab === "products" ? products ?? [] : tab === "processes" ? processes ?? [] : countries ?? [];
  const loading = tab === "products" ? pLoading : tab === "processes" ? prLoading : cLoading;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  const exact = useMemo(
    () => items.some((i) => i.name.toLowerCase() === query.trim().toLowerCase()),
    [items, query],
  );

  const onAdd = async () => {
    const name = query.trim();
    if (!name) return;
    haptics.medium();
    try {
      if (tab === "products") await createProduct.mutateAsync({ name, platform: "Custom" });
      else if (tab === "processes") await createProcess.mutateAsync({ name });
      else await createCountry.mutateAsync({ name });
      setQuery("");
      toast(`Added “${name}”`);
    } catch (e: any) {
      toast(e?.message ?? "Could not add", "error");
    }
  };

  const onDelete = async (id: string, name: string) => {
    haptics.warning();
    try {
      if (tab === "products") await deleteProduct.mutateAsync(id);
      else if (tab === "processes") await deleteProcess.mutateAsync(id);
      else await deleteCountry.mutateAsync(id);
      toast(`Removed “${name}”`);
    } catch (e: any) {
      toast(e?.message ?? "Could not remove", "error");
    }
  };

  const onImport = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setImporting(true);
      haptics.selection();
      const result = await importExcel(asset.uri, asset.name);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["processes"] });
      toast(
        `Imported ${result.added_products} applications, ${result.added_processes} processes`,
      );
    } catch (e: any) {
      toast(e?.message ?? "Import failed", "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BrandMark compact />
        <Text style={styles.title} testID="library-title">
          Library
        </Text>
        <Text style={styles.subtitle}>Applications, processes & countries</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: bottomPad }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            {/* Import card */}
            <Pressable
              testID="import-excel-btn"
              style={styles.importCard}
              onPress={onImport}
              disabled={importing}
            >
              <View style={styles.importIcon}>
                {importing ? (
                  <ActivityIndicator color={colors.onSurface} />
                ) : (
                  <FileXls size={22} weight="fill" color={colors.success} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.importTitle}>
                  {importing ? "Importing…" : "Import from Excel"}
                </Text>
                <Text style={styles.importSub}>
                  Adds applications & processes from an .xlsx sheet
                </Text>
              </View>
            </Pressable>

            {/* Segmented */}
            <View style={styles.segment}>
              {(["products", "processes", "countries"] as const).map((t) => {
                const active = tab === t;
                const label = t === "products" ? "Applications" : t === "processes" ? "Processes" : "Countries";
                return (
                  <Pressable
                    key={t}
                    testID={`library-segment-${t}`}
                    style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                    onPress={() => {
                      haptics.light();
                      setTab(t);
                      setQuery("");
                    }}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Search + add */}
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <MagnifyingGlass size={18} color={colors.muted} />
                <TextInput
                  testID="library-search-input"
                  value={query}
                  onChangeText={setQuery}
                  placeholder={
                    tab === "products"
                      ? "Search or add application…"
                      : tab === "processes"
                        ? "Search or add process…"
                        : "Search or add country…"
                  }
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={onAdd}
                />
              </View>
              {query.trim() && !exact ? (
                <Pressable style={styles.addBtn} onPress={onAdd} testID="library-add-btn">
                  <Plus size={18} weight="bold" color={colors.onBrandPrimary} />
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.count}>{filtered.length} items</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row} testID={`library-item-${item.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>{item.name}</Text>
              {"platform" in item && (item as any).platform ? (
                <Text style={styles.rowSub}>{(item as any).platform}</Text>
              ) : "cluster" in item && (item as any).cluster ? (
                <Text style={styles.rowSub}>Cluster {(item as any).cluster}</Text>
              ) : null}
            </View>
            <Pressable
              hitSlop={10}
              testID={`library-delete-${item.id}`}
              onPress={() => onDelete(item.id, item.name)}
              style={styles.deleteBtn}
            >
              <TrashSimple size={18} color={colors.muted} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.onSurface} style={{ marginTop: spacing.xl }} />
          ) : (
            <Text style={styles.empty}>No items. Type above to add one.</Text>
          )
        }
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  importCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.brandSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  importIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  importTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onBrandSecondary },
  importSub: { fontSize: fontSize.sm, color: colors.onBrandSecondary, opacity: 0.7, marginTop: 2 },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: 3,
  },
  segmentBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm + 2, alignItems: "center" },
  segmentBtnActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, fontWeight: "600", color: colors.muted },
  segmentTextActive: { color: colors.onSurface, fontWeight: "700" },
  searchRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.onSurface, paddingVertical: 0 },
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  count: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  rowText: { fontSize: 15, color: colors.onSurface, fontWeight: "500" },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  deleteBtn: { padding: spacing.xs },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xl, fontSize: 14 },
}));
