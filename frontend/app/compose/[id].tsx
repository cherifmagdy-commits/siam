import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  CaretDown,
  CheckCircle,
  LockSimple,
  PencilSimple,
  PaperPlaneTilt,
} from "phosphor-react-native";
import { BlurView } from "expo-blur";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  TemplateField,
  TemplateSection,
  fetchContingency,
  useCountries,
  useCreateCountry,
  useCreateProcess,
  useCreateProduct,
  useDraft,
  useProcesses,
  useProducts,
  useUpdateDraft,
} from "@/src/api";
import { CountrySheet, CountrySheetRef } from "@/src/components/CountrySheet";
import { SelectSheet, SelectSheetRef } from "@/src/components/SelectSheet";
import { StatusPill } from "@/src/components/StatusPill";
import { useToast } from "@/src/components/Toast";
import { haptics } from "@/src/haptics";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ComposeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const router = useRouter();
  const toast = useToast();

  const { data: draft, isLoading } = useDraft(id);
  const updateDraft = useUpdateDraft(id);
  const { data: products } = useProducts();
  const { data: processes } = useProcesses();
  const { data: countries } = useCountries();
  const createProduct = useCreateProduct();
  const createProcess = useCreateProcess();
  const createCountry = useCreateCountry();

  const [values, setValues] = useState<Record<string, string>>({});
  const [validations, setValidations] = useState<Record<string, boolean>>({});
  const [activeField, setActiveField] = useState<{ key: string; source: "products" | "processes" } | null>(null);
  const [activeCountryKey, setActiveCountryKey] = useState<string | null>(null);

  const sheetRef = useRef<SelectSheetRef>(null);
  const countrySheetRef = useRef<CountrySheetRef>(null);
  const hydrated = useRef(false);
  const stateRef = useRef({ values, validations });
  stateRef.current = { values, validations };
  const mutateRef = useRef(updateDraft.mutate);
  mutateRef.current = updateDraft.mutate;

  useEffect(() => {
    if (draft && !hydrated.current) {
      setValues(draft.values ?? {});
      setValidations(draft.validations ?? {});
      hydrated.current = true;
    }
  }, [draft]);

  const template = draft?.template;
  const sections: TemplateSection[] = template?.sections ?? [];

  const save = useCallback(
    (next: { values: Record<string, string>; validations: Record<string, boolean> }) => {
      mutateRef.current(next);
    },
    [],
  );

  // Persist latest state when leaving the screen (runs on unmount only).
  useEffect(() => {
    return () => {
      if (hydrated.current) mutateRef.current(stateRef.current);
    };
  }, []);

  // Debounced autosave — decoupled from validate/unlock so rapid taps never
  // trigger a mutate/refetch race that drops a lock.
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => save(stateRef.current), 700);
    return () => clearTimeout(t);
  }, [values, validations, save]);

  const setValue = (key: string, val: string) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const validatedCount = useMemo(
    () => sections.filter((s) => validations[s.key]).length,
    [sections, validations],
  );
  const total = sections.length;
  const allValidated = total > 0 && validatedCount === total;
  const progress = total > 0 ? validatedCount / total : 0;

  const validateSection = (section: TemplateSection) => {
    const current = stateRef.current.values;
    const missing = section.fields.some((f) => !String(current[f.key] ?? "").trim());
    if (missing) {
      haptics.warning();
      toast("Fill in all fields before validating", "error");
      return;
    }
    haptics.success();
    setValidations((prev) => ({ ...prev, [section.key]: true }));
  };

  const unlockSection = (section: TemplateSection) => {
    haptics.light();
    setValidations((prev) => ({ ...prev, [section.key]: false }));
  };

  const openDropdown = (field: TemplateField) => {
    setActiveField({ key: field.key, source: field.source! });
    setTimeout(() => sheetRef.current?.open(), 0);
  };

  // Map each field key to its section key, to skip auto-fill on locked sections.
  const fieldSection = useMemo(() => {
    const m: Record<string, string> = {};
    sections.forEach((s) => s.fields.forEach((f) => (m[f.key] = s.key)));
    return m;
  }, [sections]);

  // When a Business Application is picked, pull its process / contingency owner
  // from the contingency sheet and fill the matching fields (only if unlocked).
  const autofillFromContingency = async (product: string) => {
    try {
      const rows = await fetchContingency(product);
      if (!rows.length) return;
      const row = rows[0];
      const candidates: [string, string][] = [];
      if (row.process) candidates.push(["business_process", row.process]);
      if (row.owner) candidates.push(["crisis_lead", row.owner]);
      if (row.failed_system) candidates.push(["contingency", `Failed system: ${row.failed_system}`]);
      const locks = stateRef.current.validations;
      const apply = candidates.filter(([k]) => fieldSection[k] && !locks[fieldSection[k]]);
      if (!apply.length) return;
      setValues((prev) => {
        const next = { ...prev };
        apply.forEach(([k, v]) => (next[k] = v));
        return next;
      });
      haptics.success();
      toast(`Auto-filled ${apply.length} field${apply.length > 1 ? "s" : ""} from contingency data`);
    } catch {}
  };

  const parseCountries = (raw?: string): string[] => {
    try {
      const arr = JSON.parse(raw || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  const openCountries = (key: string) => {
    setActiveCountryKey(key);
    setTimeout(() => countrySheetRef.current?.open(), 0);
  };

  const toggleCountry = (name: string) => {
    if (!activeCountryKey) return;
    const cur = parseCountries(values[activeCountryKey]);
    const next = cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name];
    setValue(activeCountryKey, JSON.stringify(next));
  };

  const onSend = () => {
    if (!allValidated) return;
    haptics.heavy();
    save({ values: stateRef.current.values, validations: stateRef.current.validations });
    router.push(`/preview/${id}`);
  };

  const dropdownOptions = useMemo(() => {
    if (!activeField) return [];
    const list = activeField.source === "products" ? products ?? [] : processes ?? [];
    return list.map((i) => i.name);
  }, [activeField, products, processes]);

  if (isLoading || !template) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.onSurface} />
      </View>
    );
  }

  const footerHeight = 132;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="compose-back" hitSlop={10} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {template.name}
          </Text>
        </View>
        <StatusPill stage={template.stage} small />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: footerHeight + insets.bottom + spacing.lg,
        }}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section) => {
          const locked = !!validations[section.key];
          return (
            <Animated.View
              key={section.key}
              layout={LinearTransition.duration(200)}
              testID={`section-card-${section.key}`}
              style={[styles.card, locked && styles.cardLocked]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{section.title}</Text>
                {locked ? (
                  <View style={styles.lockedBadge}>
                    <CheckCircle size={16} weight="fill" color={colors.success} />
                    <Text style={styles.lockedText}>Locked</Text>
                  </View>
                ) : null}
              </View>

              {section.fields.map((field) => (
                <View key={field.key} style={styles.field}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  {locked ? (
                    <Text style={styles.lockedValue} testID={`locked-value-${field.key}`}>
                      {field.type === "countries"
                        ? parseCountries(values[field.key]).join("\n") || "—"
                        : String(values[field.key] ?? "") || "—"}
                    </Text>
                  ) : field.type === "countries" ? (
                    <Pressable
                      testID={`countries-${field.key}`}
                      style={styles.dropdown}
                      onPress={() => openCountries(field.key)}
                    >
                      <Text
                        style={[
                          styles.dropdownText,
                          parseCountries(values[field.key]).length === 0 && { color: colors.muted },
                        ]}
                        numberOfLines={1}
                      >
                        {parseCountries(values[field.key]).length
                          ? `${parseCountries(values[field.key]).length} selected · ${parseCountries(values[field.key]).join(", ")}`
                          : field.placeholder || "Select countries"}
                      </Text>
                      <CaretDown size={16} color={colors.muted} />
                    </Pressable>
                  ) : field.type === "dropdown" ? (
                    <Pressable
                      testID={`dropdown-${field.key}`}
                      style={styles.dropdown}
                      onPress={() => openDropdown(field)}
                    >
                      <Text
                        style={[
                          styles.dropdownText,
                          !values[field.key] && { color: colors.muted },
                        ]}
                        numberOfLines={1}
                      >
                        {values[field.key] || field.placeholder || "Select…"}
                      </Text>
                      <CaretDown size={16} color={colors.muted} />
                    </Pressable>
                  ) : (
                    <TextInput
                      testID={`input-${field.key}`}
                      value={values[field.key] ?? ""}
                      onChangeText={(t) => setValue(field.key, t)}
                      placeholder={field.placeholder}
                      placeholderTextColor={colors.muted}
                      multiline={field.type === "textarea"}
                      style={[styles.input, field.type === "textarea" && styles.textarea]}
                    />
                  )}
                </View>
              ))}

              {locked ? (
                <Pressable
                  testID={`edit-${section.key}`}
                  style={styles.editBtn}
                  onPress={() => unlockSection(section)}
                >
                  <PencilSimple size={16} color={colors.onSurface} />
                  <Text style={styles.editText}>Edit</Text>
                </Pressable>
              ) : (
                <Pressable
                  testID={`validate-${section.key}`}
                  style={styles.validateBtn}
                  onPress={() => validateSection(section)}
                >
                  <LockSimple size={16} color={colors.onBrandSecondary} />
                  <Text style={styles.validateText}>Validate & Lock</Text>
                </Pressable>
              )}
            </Animated.View>
          );
        })}
      </KeyboardAwareScrollView>

      {/* Sticky glass footer */}
      <View style={[styles.footerWrap, { height: footerHeight + insets.bottom }]}>
        {Platform.OS === "ios" ? (
          <BlurView tint={scheme === "dark" ? "dark" : "light"} intensity={60} style={styles.footerBg} />
        ) : (
          <View style={[styles.footerBg, styles.footerSolid]} />
        )}
        <View style={[styles.footerContent, { paddingBottom: insets.bottom + spacing.sm }]}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>
              {validatedCount} of {total} validated
            </Text>
            {allValidated ? (
              <Text style={styles.readyLabel}>Ready to send</Text>
            ) : null}
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%` },
                allValidated && { backgroundColor: colors.success },
              ]}
            />
          </View>
          <Pressable
            testID="send-email-btn"
            style={[styles.sendBtn, !allValidated && styles.sendBtnDisabled]}
            onPress={onSend}
            disabled={!allValidated}
          >
            <PaperPlaneTilt size={18} weight="fill" color={colors.onBrandPrimary} />
            <Text style={styles.sendText}>Send via Email</Text>
          </Pressable>
        </View>
      </View>

      <SelectSheet
        ref={sheetRef}
        title={activeField?.source === "processes" ? "Business Process" : "Business Application"}
        options={dropdownOptions}
        selected={activeField ? values[activeField.key] : undefined}
        onSelect={(v) => {
          if (!activeField) return;
          setValue(activeField.key, v);
          if (activeField.source === "products") autofillFromContingency(v);
        }}
        onCreate={async (name) => {
          if (!activeField) return;
          if (activeField.source === "products") await createProduct.mutateAsync({ name, platform: "Custom" });
          else await createProcess.mutateAsync({ name });
        }}
      />

      <CountrySheet
        ref={countrySheetRef}
        options={(countries ?? []).map((c) => c.name)}
        selected={activeCountryKey ? parseCountries(values[activeCountryKey]) : []}
        onToggle={toggleCountry}
        onCreate={async (name) => {
          await createCountry.mutateAsync({ name });
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  cardLocked: { borderColor: colors.success, backgroundColor: colors.surface },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  lockedBadge: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  lockedText: { fontSize: 12, fontWeight: "700", color: colors.success },
  field: { marginBottom: spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary, marginBottom: spacing.xs + 2 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.onSurface,
  },
  textarea: { minHeight: 96, textAlignVertical: "top" },
  lockedValue: { fontSize: 15, color: colors.onSurfaceSecondary, lineHeight: 21 },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dropdownText: { fontSize: 15, color: colors.onSurface, flex: 1, marginRight: spacing.sm },
  validateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandSecondary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  validateText: { fontSize: 15, fontWeight: "700", color: colors.onBrandSecondary },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  editText: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  footerWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
  footerBg: { ...StyleSheetAbsolute() },
  footerSolid: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  footerContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  readyLabel: { fontSize: 13, fontWeight: "700", color: colors.success },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.onSurface },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { fontSize: 16, fontWeight: "700", color: colors.onBrandPrimary },
}));

function StyleSheetAbsolute() {
  return { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };
}
