import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as AuthSession from "expo-auth-session";
import { makeRedirectUri, ResponseType } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { useQuery } from "@tanstack/react-query";

WebBrowser.maybeCompleteAuthSession();

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
const SESSION_KEY = "ms_session_token";
const SCOPES = ["openid", "profile", "offline_access", "User.Read", "Mail.ReadWrite.Shared", "Mail.Send.Shared"];

let webSession: string | null = null;

async function saveSession(token: string) {
  if (Platform.OS === "web") {
    webSession = token;
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, token);
}

async function loadSession(): Promise<string | null> {
  if (Platform.OS === "web") return webSession;
  return SecureStore.getItemAsync(SESSION_KEY);
}

async function clearSession() {
  if (Platform.OS === "web") {
    webSession = null;
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export interface OutlookConfig {
  configured: boolean;
  client_id: string;
  tenant_id: string;
  shared_mailbox: string;
}

export interface MsAccount {
  upn?: string;
  name?: string;
}

export function useOutlookConfig() {
  return useQuery({
    queryKey: ["outlook-config"],
    queryFn: () => fetch(`${BASE}/outlook/config`).then((r) => r.json() as Promise<OutlookConfig>),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMicrosoftAuth() {
  const { data: config } = useOutlookConfig();
  const tenant = config?.tenant_id || "";
  const clientId = config?.client_id || "";
  const configured = !!config?.configured;

  const redirectUri = makeRedirectUri({ scheme: "frontend", path: "oauth/callback" });

  const discovery = {
    authorizationEndpoint: tenant
      ? `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`
      : "",
    tokenEndpoint: tenant ? `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token` : "",
  };

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: clientId || "unconfigured",
      redirectUri,
      responseType: ResponseType.Code,
      scopes: SCOPES,
      usePKCE: true,
      extraParams: { prompt: "select_account" },
    },
    discovery,
  );

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [account, setAccount] = useState<MsAccount | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadSession().then((t) => {
      if (t) setSessionToken(t);
    });
  }, []);

  const signIn = useCallback(async (): Promise<string> => {
    if (!configured) throw new Error("Outlook is not configured yet — ask IT to finish the Azure setup.");
    if (!request) throw new Error("Sign-in is not ready yet, please try again.");
    setBusy(true);
    try {
      const res = await promptAsync();
      if (res.type !== "success" || !res.params?.code) {
        throw new Error("Microsoft sign-in was cancelled.");
      }
      const r = await fetch(`${BASE}/auth/microsoft/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: res.params.code,
          code_verifier: request.codeVerifier,
          redirect_uri: redirectUri,
        }),
      });
      if (!r.ok) {
        let detail = "Microsoft sign-in failed.";
        try {
          const b = await r.json();
          if (b?.detail) detail = typeof b.detail === "string" ? b.detail : JSON.stringify(b.detail);
        } catch {}
        throw new Error(detail);
      }
      const data = await r.json();
      await saveSession(data.session_token);
      setSessionToken(data.session_token);
      setAccount(data.account ?? null);
      return data.session_token as string;
    } finally {
      setBusy(false);
    }
  }, [configured, request, promptAsync, redirectUri]);

  const signOut = useCallback(async () => {
    await clearSession();
    setSessionToken(null);
    setAccount(null);
  }, []);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionToken) return sessionToken;
    return signIn();
  }, [sessionToken, signIn]);

  return {
    configured,
    sharedMailbox: config?.shared_mailbox ?? "",
    ready: !!request,
    signedIn: !!sessionToken,
    account,
    busy,
    signIn,
    signOut,
    ensureSession,
  };
}

export interface OutlookDraftResult {
  subject: string;
  to: string[];
  draft_id: string;
  mailbox: string;
  web_link?: string;
}

export async function createOutlookDraft(draftId: string, sessionToken: string): Promise<OutlookDraftResult> {
  const r = await fetch(`${BASE}/outlook/drafts/${draftId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
  });
  if (!r.ok) {
    let detail = "Could not create the Outlook draft.";
    try {
      const b = await r.json();
      if (b?.detail) detail = typeof b.detail === "string" ? b.detail : JSON.stringify(b.detail);
    } catch {}
    const err = new Error(detail) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  return r.json();
}
