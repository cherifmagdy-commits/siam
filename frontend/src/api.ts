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

export interface Country {
  id: string;
  name: string;
  cluster: string;
  country_dtps: string[];
  country_dl: string[];
  dwt_leader: string[];
  platform_directors: string[];
  custom: boolean;
}

export interface Draft {
  id: string;
  template_id: string;
  template_name: string;
  category: "IMCR" | "NON_IMCR";
  stage: Template["stage"];
  incident_id?: string;
  sequence?: number;
  sent_at?: string | null;
  values: Record<string, string>;
  validations: Record<string, boolean>;
  recipients: string;
  updated_at: string;
  progress?: { validated: number; total: number };
  template?: Template;
}

export interface Incident {
  id: string;
  title: string;
  category: "IMCR" | "NON_IMCR";
  current_stage: Template["stage"];
  status: "OPEN" | "RESOLVED";
  last_sent_at: string | null;
  next_update_at: string | null;
  updated_at: string;
  created_at: string;
  update_count?: number;
  updates?: Draft[];
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
// Countries (crisis distribution list)
// ---------------------------------------------------------------------------
export function useCountries() {
  return useQuery({ queryKey: ["countries"], queryFn: () => api<Country[]>("/countries") });
}

export function useCreateCountry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string }) =>
      api<Country>("/countries", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["countries"] }),
  });
}

export function useDeleteCountry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/countries/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["countries"] }),
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
  to: string[];
  recipients: string;
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------
export function useIncidents() {
  return useQuery({ queryKey: ["incidents"], queryFn: () => api<Incident[]>("/incidents") });
}

export function useIncident(id: string) {
  return useQuery({
    queryKey: ["incident", id],
    queryFn: () => api<Incident>(`/incidents/${id}`),
    enabled: !!id,
  });
}

export function useCreateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      api<{ incident: Incident; draft: Draft }>("/incidents", {
        method: "POST",
        body: JSON.stringify({ template_id: templateId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  });
}

export function useCreateUpdate(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      api<Draft>(`/incidents/${incidentId}/updates`, {
        method: "POST",
        body: JSON.stringify({ template_id: templateId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["incident", incidentId] });
    },
  });
}

export function useMarkSent(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) =>
      api<Incident>(`/incidents/${incidentId}/mark-sent`, {
        method: "POST",
        body: JSON.stringify({ draft_id: draftId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["incident", incidentId] });
    },
  });
}

export function useDeleteIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/incidents/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  });
}

export async function fetchRenderedEmail(id: string): Promise<RenderedEmail> {
  return api<RenderedEmail>(`/drafts/${id}/render`);
}

export interface RenderedHtml {
  subject: string;
  html: string;
  to: string[];
}

export async function fetchRenderedHtml(id: string): Promise<RenderedHtml> {
  return api<RenderedHtml>(`/drafts/${id}/render-html`);
}

export interface Contingency {
  product: string;
  process: string;
  failed_system: string;
  owner: string;
}

export async function fetchContingency(product: string): Promise<Contingency[]> {
  return api<Contingency[]>(`/contingency?product=${encodeURIComponent(product)}`);
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

export const contingencyExportUrl = `${BASE}/contingency/export`;
