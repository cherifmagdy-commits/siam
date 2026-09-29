"""Microsoft Graph / Outlook 365 integration.

Signs the user in once (PKCE, handled client-side), exchanges the code here,
stores the refresh token encrypted, and creates a *draft* message in the shared
mailbox. It never calls sendMail — the user opens Outlook desktop and presses Send.
"""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
from cryptography.fernet import Fernet
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

GRAPH = "https://graph.microsoft.com/v1.0"
SCOPES = "openid profile offline_access User.Read Mail.ReadWrite.Shared Mail.Send.Shared"

router = APIRouter(prefix="/api")


def _cfg() -> Dict[str, str]:
    return {
        "tenant": os.environ.get("ENTRA_TENANT_ID", "").strip(),
        "client": os.environ.get("ENTRA_CLIENT_ID", "").strip(),
        "mailbox": os.environ.get("SHARED_MAILBOX", "").strip(),
        "enc": os.environ.get("TOKEN_ENCRYPTION_KEY", "").strip(),
    }


def _token_url(tenant: str) -> str:
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"


def _fernet(cfg: Dict[str, str]) -> Fernet:
    return Fernet(cfg["enc"].encode())


def _hash(session: str) -> str:
    return hashlib.sha256(session.encode()).hexdigest()


class Exchange(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str


def register_outlook_routes(app_router: APIRouter, db) -> None:
    """Attach the Outlook endpoints, closing over the shared Mongo handle."""

    @app_router.get("/outlook/config")
    async def outlook_config():
        cfg = _cfg()
        configured = bool(cfg["tenant"] and cfg["client"] and cfg["enc"])
        return {
            "configured": configured,
            "client_id": cfg["client"],
            "tenant_id": cfg["tenant"],
            "shared_mailbox": cfg["mailbox"],
        }

    @app_router.post("/auth/microsoft/exchange")
    async def exchange(body: Exchange):
        cfg = _cfg()
        if not (cfg["tenant"] and cfg["client"] and cfg["enc"]):
            raise HTTPException(503, "Outlook integration is not configured yet")
        form = {
            "client_id": cfg["client"],
            "grant_type": "authorization_code",
            "code": body.code,
            "redirect_uri": body.redirect_uri,
            "code_verifier": body.code_verifier,
            "scope": SCOPES,
        }
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(_token_url(cfg["tenant"]), data=form)
        if r.status_code != 200:
            raise HTTPException(401, "Microsoft sign-in failed. Check the app registration / redirect URI.")
        t = r.json()
        async with httpx.AsyncClient(timeout=20) as c:
            me = await c.get(f"{GRAPH}/me", headers={"Authorization": f"Bearer {t['access_token']}"})
        if me.status_code != 200:
            raise HTTPException(401, "Could not read your Microsoft profile")
        user = me.json()
        f = _fernet(cfg)
        session = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        await db.ms_tokens.update_one(
            {"oid": user["id"]},
            {"$set": {
                "oid": user["id"],
                "session_hash": _hash(session),
                "refresh_token": f.encrypt(t["refresh_token"].encode()).decode(),
                "access_token": f.encrypt(t["access_token"].encode()).decode(),
                "expires_at": (now + timedelta(seconds=t.get("expires_in", 3600))).isoformat(),
                "upn": user.get("userPrincipalName"),
                "name": user.get("displayName"),
            }},
            upsert=True,
        )
        return {"session_token": session, "account": {"upn": user.get("userPrincipalName"), "name": user.get("displayName")}}

    async def _access_token(session: str) -> str:
        cfg = _cfg()
        f = _fernet(cfg)
        row = await db.ms_tokens.find_one({"session_hash": _hash(session)})
        if not row:
            raise HTTPException(401, "Not signed in to Microsoft")
        now = datetime.now(timezone.utc)
        expires_at = datetime.fromisoformat(row["expires_at"])
        if row.get("access_token") and expires_at > now + timedelta(minutes=2):
            return f.decrypt(row["access_token"].encode()).decode()
        # refresh
        refresh = f.decrypt(row["refresh_token"].encode()).decode()
        form = {
            "client_id": cfg["client"],
            "grant_type": "refresh_token",
            "refresh_token": refresh,
            "scope": SCOPES,
        }
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(_token_url(cfg["tenant"]), data=form)
        if r.status_code != 200:
            raise HTTPException(401, "Microsoft session expired. Please sign in again.")
        t = r.json()
        await db.ms_tokens.update_one(
            {"_id": row["_id"]},
            {"$set": {
                "refresh_token": f.encrypt(t.get("refresh_token", refresh).encode()).decode(),
                "access_token": f.encrypt(t["access_token"].encode()).decode(),
                "expires_at": (now + timedelta(seconds=t.get("expires_in", 3600))).isoformat(),
            }},
        )
        return t["access_token"]

    @app_router.get("/auth/microsoft/me")
    async def whoami(authorization: str = Header(default="")):
        if not authorization.startswith("Bearer "):
            raise HTTPException(401, "Bearer token required")
        row = await db.ms_tokens.find_one({"session_hash": _hash(authorization[7:])})
        if not row:
            raise HTTPException(401, "Not signed in to Microsoft")
        return {"account": {"upn": row.get("upn"), "name": row.get("name")}}

    async def create_shared_draft(session: str, subject: str, to: List[str], html: str) -> Dict[str, Any]:
        cfg = _cfg()
        token = await _access_token(session)
        payload = {
            "subject": subject,
            "body": {"contentType": "HTML", "content": html},
            "toRecipients": [{"emailAddress": {"address": a}} for a in to],
            "from": {"emailAddress": {"address": cfg["mailbox"]}},
        }
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{GRAPH}/users/{cfg['mailbox']}/messages",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=payload,
            )
        if r.status_code in (200, 201):
            m = r.json()
            return {"draft_id": m.get("id"), "mailbox": cfg["mailbox"], "web_link": m.get("webLink")}
        if r.status_code in (401, 403):
            raise HTTPException(
                403,
                f"Microsoft 365 denied access to {cfg['mailbox']}. The signed-in account needs "
                "Full Access + Send As on this shared mailbox, and IT must grant admin consent.",
            )
        try:
            err = r.json().get("error", {})
            msg = err.get("message", "Graph request failed")
        except Exception:
            msg = "Graph request failed"
        raise HTTPException(r.status_code, f"Outlook draft failed: {msg}")

    # expose helper for server.py to call
    router.create_shared_draft = create_shared_draft  # type: ignore[attr-defined]
    _HELPERS["create_shared_draft"] = create_shared_draft


_HELPERS: Dict[str, Any] = {}


async def create_shared_draft(session: str, subject: str, to: List[str], html: str) -> Dict[str, Any]:
    fn = _HELPERS.get("create_shared_draft")
    if fn is None:
        raise HTTPException(503, "Outlook integration not initialised")
    return await fn(session, subject, to, html)
