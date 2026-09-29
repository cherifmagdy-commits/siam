import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type FieldType = "text" | "textarea" | "dropdown";

export interface TemplateField {
  key: string;
  label: string;
  type: FieldType;
  source?: "products" | "processes";
  default?: string;
  placeholder?: string;
}

export interface TemplateSection {
  key: string;
  title: string;
  fields: TemplateField[];
}

export interface Template {
  id: string;
  key: string;
  category: "IMCR" | "NON_IMCR";
  stage: "INVESTIGATING" | "IDENTIFIED" | "RECOVERING" | "MONITORING" | "RESOLVED";
  name: string;
  header: string;
  footer: string;
  sections: TemplateSection[];
}

export interface Product {
  id: string;
  name: string;
  platform: string;
  custom: boolean;
}

export interface Process {
  id: string;
  name: string;
  custom: boolean;
}

export interface Draft {
  id: string;
  template_id: string;
  template_name: string;
  category: "IMCR" | "NON_IMCR";
  stage: Template["stage"];
  values: Record<string, string>;
  validations: Record<string, boolean>;
  recipients: string;
  updated_at: string;
  progress?: { validated: number; total: number };
  template?: Template;
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: () => api<Template[]>("/templates"),
  });
}

// ---------------------------------------------------------------------------
// Products & processes
// ---------------------------------------------------------------------------
export function useProducts() {
  return useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
}

export function useProcesses() {
  return useQuery({
    queryKey: ["processes"],
    queryFn: () => api<Process[]>("/business-processes"),
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; platform?: string }) =>
      api<Product>("/products", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/products/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useCreateProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string }) =>
      api<Process>("/business-processes", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes"] }),
  });
}

export function useDeleteProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/business-processes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes"] }),
  });
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------
export function useDrafts() {
  return useQuery({ queryKey: ["drafts"], queryFn: () => api<Draft[]>("/drafts") });
}

export function useDraft(id: string) {
  return useQuery({
    queryKey: ["draft", id],
    queryFn: () => api<Draft>(`/drafts/${id}`),
    enabled: !!id,
  });
}

export function useCreateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      api<Draft>("/drafts", {
        method: "POST",
        body: JSON.stringify({ template_id: templateId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drafts"] }),
  });
}

export function useUpdateDraft(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Pick<Draft, "values" | "validations" | "recipients">>) =>
      api<Draft>(`/drafts/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
    },
  });
}

export function useDeleteDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/drafts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drafts"] }),
  });
}

export interface RenderedEmail {
  subject: string;
  body: string;
  recipients: string;
}

export async function fetchRenderedEmail(id: string): Promise<RenderedEmail> {
  return api<RenderedEmail>(`/drafts/${id}/render`);
}

// ---------------------------------------------------------------------------
// Excel import
// ---------------------------------------------------------------------------
export async function importExcel(uri: string, name: string): Promise<{
  added_products: number;
  added_processes: number;
}> {
  const form = new FormData();
  form.append("file", {
    // @ts-ignore React Native FormData file shape
    uri,
    name,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const res = await fetch(`${BASE}/import/excel`, { method: "POST", body: form });
  if (!res.ok) {
    let detail = "Import failed";
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}
