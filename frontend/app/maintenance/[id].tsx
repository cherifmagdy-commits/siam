import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, CaretDown, Eye, Plus, Star, TrashSimple, Copy } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  blankWindow,
  fetchContingency,
  MaintWindow,
  useCountries,
  useCreateCountry,
  useCreateProcess,
  useCreateProduct,
  useMaintenance,
  useProcesses,
  useProducts,
  useUpdateMaintenance,
} from "@/src/api";
import { CountrySheet, CountrySheetRef } from "@/src/components/CountrySheet";
import { SelectSheet, SelectSheetRef } from "@/src/components/SelectSheet";
import { haptics } from "@/src/haptics";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const TZS = ["CET", "CEST", "EET", "EEST", "UTC"];
const IMPACTS: { key: MaintWindow["impact"]; label: string }[] = [
  { key: "na", label: "Service not available" },
  { key: "partial", label: "Partial impact" },
  { key: "noprod", label: "No production impact" },
];

export default function MaintenanceBuilder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { data: m, isLoading } = useMaintenance(id);
  const update = useUpdateMaintenance(id);
  const { data: products } = useProducts();
  const { data: processes } = useProcesses();
  const { data: countries } = useCountries();
  const createProduct = useCreateProduct();
  const createProcess = useCreateProcess();
  const createCountry = useCreateCountry();

  const itSheetRef = useRef<SelectSheetRef>(null);
  const bpSheetRef = useRef<SelectSheetRef>(null);
  const countrySheetRef = useRef<CountrySheetRef>(null);
  const activeWin = useRef<number>(0);

  const [state, setState] = useState<any>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (m && !state) setState(m);
  }, [m, state]);

  // debounced autosave
  useEffect(() => {
    if (!state || !dirty.current) return;
    const t = setTimeout(() => {
      const { id: _id, sent_at, created_at, updated_at, ...payload } = state;
      update.mutate(payload);
      dirty.current = false;
    }, 600);
    return () => clearTimeout(t);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: any) => {
    dirty.current = true;
    setState((s: any) => ({ ...s, ...patch }));
  };

  const setWin = (idx: number, patch: Partial<MaintWindow>) => {
    dirty.current = true;
    setState((s: any) => {
      const windows = s.windows.map((w: MaintWindow, i: number) => (i === idx ? { ...w, ...patch } : w));
      return { ...s, windows };
    });
  };

  const addWindow = () => {
    haptics.medium();
    dirty.current = true;
    setState((s: any) => ({ ...s, windows: [...s.windows, blankWindow()] }));
  };

  const removeWindow = (idx: number) => {
    haptics.warning();
    dirty.current = true;
    setState((s: any) => ({ ...s, windows: s.windows.filter((_: any, i: number) => i !== idx) }));
  };

  const dupWindow = (idx: number) => {
    haptics.selection();
    dirty.current = true;
    setState((s: any) => {
      const copy = { ...s.windows[idx] };
      const windows = [...s.windows];
      windows.splice(idx + 1, 0, copy);
      return { ...s, windows };
    });
  };

  const autofillFromIt = async (idx: number, product: string) => {
    try {
      const rows = await fetchContingency(product);
      if (!rows.length) return;
      const r = rows[0];
      const cp = r.contingency_text || (r.failed_system ? `Failed system: ${r.failed_system}` : "");
      setState((s: any) => {
        const windows = s.windows.map((w: MaintWindow, i: number) =>
          i === idx ? { ...w, bp: w.bp || r.process || "", cp: w.cp || cp } : w,
        );
        return { ...s, windows };
      });
    } catch {}
  };

  const goPreview = async () => {
    const { id: _id, sent_at, created_at, updated_at, ...payload } = state;
    await update.mutateAsync(payload);
    dirty.current = false;
    router.push(`/maintenance/preview/${id}`);
  };

  if (isLoading || !state) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator color={colors.onSurface} />
      </View>
    );
  }

  const selectedCountries: string[] = state.countries ?? [];

  return (
    <View style={styles.container}>
      <View style={[styles.topbar, { paddingTop: insets.top + spacing.xs }]}>
        <Pressable testID="maint-back" hitSlop={10} onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          Maintenance builder
        </Text>
        <Pressable testID="maint-preview-btn" style={styles.previewBtn} onPress={goPreview}>
          <Eye size={16} weight="bold" color={colors.onBrandPrimary} />
          <Text style={styles.previewText}>Preview</Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
      >
        {/* MESSAGE */}
        <Text style={styles.section}>Message</Text>
        <Field label="Heading">
          <TextInput
            testID="maint-heading"
            style={styles.input}
            value={state.heading}
            onChangeText={(t) => set({ heading: t })}
            placeholder="Maintenance Schedule"
            placeholderTextColor={colors.muted}
          />
        </Field>
        <View style={styles.row2}>
          <Field label="Period from" flex>
            <TextInput
              testID="maint-from"
              style={styles.input}
              value={state.fromDate}
              onChangeText={(t) => set({ fromDate: t })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.muted}
            />
          </Field>
          <Field label="Period to" flex>
            <TextInput
              testID="maint-to"
              style={styles.input}
              value={state.toDate}
              onChangeText={(t) => set({ toDate: t })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.muted}
            />
          </Field>
        </View>
        <Field label="Introduction">
          <TextInput
            testID="maint-intro"
            style={[styles.input, styles.multiline]}
            value={state.intro}
            onChangeText={(t) => set({ intro: t })}
            multiline
            placeholder="Intro text (use **bold** for emphasis)"
            placeholderTextColor={colors.muted}
          />
        </Field>

        {/* DISTRIBUTION */}
        <Text style={styles.section}>Distribution</Text>
        <Field label="Recipient countries">
          <Pressable
            testID="maint-countries"
            style={styles.dropdown}
            onPress={() => countrySheetRef.current?.open()}
          >
            <Text style={[styles.dropdownText, !selectedCountries.length && { color: colors.muted }]} numberOfLines={1}>
              {selectedCountries.length ? selectedCountries.join(", ") : "Select countries…"}
            </Text>
            <CaretDown size={18} color={colors.muted} />
          </Pressable>
        </Field>
        <Field label="Distribution line (shown in footer)">
          <TextInput
            testID="maint-dist"
            style={styles.input}
            value={state.dist}
            onChangeText={(t) => set({ dist: t })}
            placeholder="e.g. All Staff — Europe"
            placeholderTextColor={colors.muted}
          />
        </Field>

        {/* WINDOWS */}
        <Text style={styles.section}>Maintenance windows</Text>
        {state.windows.map((w: MaintWindow, idx: number) => (
          <View key={idx} style={styles.winCard}>
            <View style={styles.winHead}>
              <Text style={styles.winIndex}>Window {idx + 1}</Text>
              <View style={styles.winActions}>
                <Pressable hitSlop={8} onPress={() => dupWindow(idx)} testID={`win-dup-${idx}`}>
                  <Copy size={18} color={colors.muted} />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => removeWindow(idx)} testID={`win-del-${idx}`}>
                  <TrashSimple size={18} color={colors.muted} />
                </Pressable>
              </View>
            </View>

            <Field label="Title">
              <TextInput
                testID={`win-title-${idx}`}
                style={styles.input}
                value={w.title}
                onChangeText={(t) => setWin(idx, { title: t })}
                placeholder="e.g. SAP S/4 October Release"
                placeholderTextColor={colors.muted}
              />
            </Field>

            <View style={styles.row2}>
              <Field label="Starts" flex>
                <TextInput
                  testID={`win-start-${idx}`}
                  style={styles.input}
                  value={w.start}
                  onChangeText={(t) => setWin(idx, { start: t })}
                  placeholder="YYYY-MM-DDTHH:MM"
                  placeholderTextColor={colors.muted}
                />
              </Field>
              <Field label="Ends" flex>
                <TextInput
                  testID={`win-end-${idx}`}
                  style={styles.input}
                  value={w.end}
                  onChangeText={(t) => setWin(idx, { end: t })}
                  placeholder="YYYY-MM-DDTHH:MM"
                  placeholderTextColor={colors.muted}
                />
              </Field>
            </View>

            <Field label="Timezone">
              <View style={styles.pillRow}>
                {TZS.map((z) => (
                  <Pressable
                    key={z}
                    testID={`win-tz-${idx}-${z}`}
                    style={[styles.pill, (w.tz || "CET") === z && styles.pillActive]}
                    onPress={() => setWin(idx, { tz: z })}
                  >
                    <Text style={[styles.pillText, (w.tz || "CET") === z && styles.pillTextActive]}>{z}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>

            <Field label="User impact">
              <View style={styles.pillRow}>
                {IMPACTS.map((imp) => (
                  <Pressable
                    key={imp.key}
                    testID={`win-impact-${idx}-${imp.key}`}
                    style={[styles.pill, w.impact === imp.key && styles.pillActive]}
                    onPress={() => setWin(idx, { impact: imp.key })}
                  >
                    <Text style={[styles.pillText, w.impact === imp.key && styles.pillTextActive]}>{imp.label}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>

            <View style={styles.hiRow}>
              <View style={styles.hiLabel}>
                <Star size={16} weight={w.high ? "fill" : "regular"} color={w.high ? colors.brandPrimary : colors.muted} />
                <Text style={styles.hiText}>High importance</Text>
              </View>
              <Switch
                testID={`win-high-${idx}`}
                value={!!w.high}
                onValueChange={(v) => setWin(idx, { high: v })}
                trackColor={{ true: colors.brandPrimary, false: colors.border }}
              />
            </View>

            <Field label="IT service">
              <Pressable
                testID={`win-it-${idx}`}
                style={styles.dropdown}
                onPress={() => {
                  activeWin.current = idx;
                  itSheetRef.current?.open();
                }}
              >
                <Text style={[styles.dropdownText, !w.it && { color: colors.muted }]} numberOfLines={2}>
                  {w.it || "Pick an application or type…"}
                </Text>
                <CaretDown size={18} color={colors.muted} />
              </Pressable>
            </Field>

            <Field label="Business process">
              <Pressable
                testID={`win-bp-${idx}`}
                style={styles.dropdown}
                onPress={() => {
                  activeWin.current = idx;
                  bpSheetRef.current?.open();
                }}
              >
                <Text style={[styles.dropdownText, !w.bp && { color: colors.muted }]} numberOfLines={2}>
                  {w.bp || "Pick a business process or type…"}
                </Text>
                <CaretDown size={18} color={colors.muted} />
              </Pressable>
            </Field>

            <Field label="Countries (for this window)">
              <TextInput
                testID={`win-co-${idx}`}
                style={[styles.input, styles.multiline]}
                value={w.co}
                onChangeText={(t) => setWin(idx, { co: t })}
                multiline
                placeholder="e.g. All countries, or one per line"
                placeholderTextColor={colors.muted}
              />
            </Field>

            <Field label="Contingency">
              <TextInput
                testID={`win-cp-${idx}`}
                style={[styles.input, styles.multiline]}
                value={w.cp}
                onChangeText={(t) => setWin(idx, { cp: t })}
                multiline
                placeholder="Plan text, or 'Name | https://link'"
                placeholderTextColor={colors.muted}
              />
            </Field>

            <Field label="Note (optional)">
              <TextInput
                testID={`win-note-${idx}`}
                style={[styles.input, styles.multiline]}
                value={w.note}
                onChangeText={(t) => setWin(idx, { note: t })}
                multiline
                placeholder="Any extra instructions"
                placeholderTextColor={colors.muted}
              />
            </Field>
          </View>
        ))}

        <Pressable testID="maint-add-window" style={styles.addWin} onPress={addWindow}>
          <Plus size={18} weight="bold" color={colors.brandPrimary} />
          <Text style={styles.addWinText}>Add maintenance window</Text>
        </Pressable>
      </KeyboardAwareScrollView>

      <SelectSheet
        ref={itSheetRef}
        title="IT service / application"
        options={(products ?? []).map((p) => p.name)}
        onSelect={(v) => {
          setWin(activeWin.current, { it: v });
          autofillFromIt(activeWin.current, v);
        }}
        onCreate={async (name) => {
          await createProduct.mutateAsync({ name });
        }}
      />
      <SelectSheet
        ref={bpSheetRef}
        title="Business process"
        options={(processes ?? []).map((p) => p.name)}
        onSelect={(v) => setWin(activeWin.current, { bp: v })}
        onCreate={async (name) => {
          await createProcess.mutateAsync({ name });
        }}
      />
      <CountrySheet
        ref={countrySheetRef}
        options={(countries ?? []).map((c) => c.name)}
        selected={selectedCountries}
        onToggle={(name) => {
          const cur: string[] = state.countries ?? [];
          const next = cur.includes(name) ? cur.filter((c) => c !== name) : [...cur, name];
          set({ countries: next });
        }}
        onCreate={async (name) => {
          await createCountry.mutateAsync({ name });
        }}
      />
    </View>
  );
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.field, flex && { flex: 1 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  iconBtn: { padding: spacing.xs },
  topTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  previewBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  previewText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: fontSize.sm },
  section: {
    fontSize: fontSize.sm, fontWeight: "800", letterSpacing: 0.6, color: colors.brandPrimary,
    textTransform: "uppercase", marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  field: { marginBottom: spacing.md },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: "600", color: colors.onSurfaceSecondary, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    fontSize: fontSize.base, color: colors.onSurface,
  },
  multiline: { minHeight: 68, textAlignVertical: "top" },
  row2: { flexDirection: "row", gap: spacing.md },
  dropdown: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  dropdownText: { flex: 1, fontSize: fontSize.base, color: colors.onSurface },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  pill: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  pillActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  pillText: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceSecondary },
  pillTextActive: { color: colors.onBrandPrimary },
  hiRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: spacing.xs, marginBottom: spacing.sm,
  },
  hiLabel: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  hiText: { fontSize: fontSize.base, color: colors.onSurface, fontWeight: "600" },
  winCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md,
  },
  winHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  winIndex: { fontSize: fontSize.base, fontWeight: "800", color: colors.onSurface },
  winActions: { flexDirection: "row", gap: spacing.md },
  addWin: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.md,
    paddingVertical: spacing.md, marginTop: spacing.xs,
  },
  addWinText: { color: colors.brandPrimary, fontWeight: "700", fontSize: fontSize.base },
}));
