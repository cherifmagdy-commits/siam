"""Tests for the Outlook / Microsoft Graph integration in UNCONFIGURED state.

ENTRA_TENANT_ID and ENTRA_CLIENT_ID are intentionally empty in backend/.env.
No real Microsoft OAuth is exercised — we only verify endpoint contracts, status
codes, and error-message correctness, plus regression on the previously passing
core endpoints (templates, countries, drafts, render, render-html/UTF-8).
"""
import os
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

SHARED_MAILBOX = "dtps.it.continuity.mgt.team@cchellenic.com"


# --------------------------------------------------------------------------
# Outlook / Microsoft Graph endpoint contracts (unconfigured state)
# --------------------------------------------------------------------------
class TestOutlookConfig:
    """GET /api/outlook/config must advertise the unconfigured state."""

    def test_config_returns_unconfigured(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/outlook/config")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("configured") is False, data
        assert data.get("client_id") == "", data
        assert data.get("tenant_id") == "", data
        assert data.get("shared_mailbox") == SHARED_MAILBOX, data


class TestMicrosoftExchange:
    """POST /api/auth/microsoft/exchange must fast-fail 503 when unconfigured."""

    def test_exchange_returns_503_when_unconfigured(self, api_client):
        payload = {
            "code": "dummy",
            "code_verifier": "dummy_verifier",
            "redirect_uri": "https://example.com/cb",
        }
        r = api_client.post(f"{BASE_URL}/api/auth/microsoft/exchange", json=payload)
        assert r.status_code == 503, r.text
        detail = (r.json() or {}).get("detail", "")
        assert "not configured" in detail.lower(), detail


class TestMicrosoftMe:
    """GET /api/auth/microsoft/me must reject unauthenticated or bogus tokens."""

    def test_me_without_bearer_returns_401(self, api_client):
        # Use a fresh session so the fixture's default Content-Type header does
        # not carry over — we want to be sure NO Authorization is set.
        r = requests.get(f"{BASE_URL}/api/auth/microsoft/me")
        assert r.status_code == 401, r.text
        detail = (r.json() or {}).get("detail", "")
        assert "bearer" in detail.lower() or "not signed in" in detail.lower(), detail

    def test_me_with_bogus_bearer_returns_401(self, api_client):
        r = requests.get(
            f"{BASE_URL}/api/auth/microsoft/me",
            headers={"Authorization": "Bearer faketoken"},
        )
        assert r.status_code == 401, r.text
        detail = (r.json() or {}).get("detail", "")
        assert "not signed in" in detail.lower(), detail


class TestOutlookCreateDraft:
    """POST /api/outlook/drafts/{draft_id} must reject unauthenticated / bogus."""

    @pytest.fixture(scope="class")
    def any_draft_id(self, api_client):
        # Pick any template and create a draft; if none, skip.
        tr = api_client.get(f"{BASE_URL}/api/templates")
        assert tr.status_code == 200
        templates = tr.json()
        if not templates:
            pytest.skip("No templates seeded")
        tid = templates[0]["id"]
        cr = api_client.post(f"{BASE_URL}/api/drafts", json={"template_id": tid})
        assert cr.status_code == 200, cr.text
        draft_id = cr.json()["id"]
        yield draft_id
        # cleanup
        api_client.delete(f"{BASE_URL}/api/drafts/{draft_id}")

    def test_no_auth_header_returns_401_sign_in_first(self, any_draft_id):
        # Bypass session default headers to be absolutely sure no Authorization
        r = requests.post(f"{BASE_URL}/api/outlook/drafts/{any_draft_id}")
        assert r.status_code == 401, r.text
        detail = (r.json() or {}).get("detail", "")
        assert "sign in to microsoft first" in detail.lower(), detail

    def test_bogus_bearer_returns_401_not_signed_in(self, any_draft_id):
        r = requests.post(
            f"{BASE_URL}/api/outlook/drafts/{any_draft_id}",
            headers={"Authorization": "Bearer faketoken"},
        )
        assert r.status_code == 401, r.text
        detail = (r.json() or {}).get("detail", "")
        assert "not signed in to microsoft" in detail.lower(), detail

    def test_no_auth_on_unknown_draft_returns_401_before_lookup(self):
        """The 'Bearer ' prefix check runs first — with NO Authorization header
        the endpoint must return 401 regardless of draft existence."""
        r = requests.post(f"{BASE_URL}/api/outlook/drafts/does-not-exist")
        assert r.status_code == 401, r.text
        detail = (r.json() or {}).get("detail", "")
        assert "sign in to microsoft first" in detail.lower(), detail


# --------------------------------------------------------------------------
# Regression: previously-passing critical endpoints
# --------------------------------------------------------------------------
class TestRegression:
    def test_templates_returns_eight(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/templates")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 8, f"expected 8 templates, got {len(data)}"

    def test_countries_endpoint(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/countries")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) > 0

    def test_create_draft_then_render_and_render_html(self, api_client):
        # Pick an IMCR template so header/subject unicode ('·', '–') is present
        tr = api_client.get(f"{BASE_URL}/api/templates")
        templates = tr.json()
        imcr = next((t for t in templates if t.get("category") == "IMCR"), templates[0])
        cr = api_client.post(f"{BASE_URL}/api/drafts", json={"template_id": imcr["id"]})
        assert cr.status_code == 200, cr.text
        draft_id = cr.json()["id"]
        try:
            # text render
            rr = api_client.get(f"{BASE_URL}/api/drafts/{draft_id}/render")
            assert rr.status_code == 200, rr.text
            rjson = rr.json()
            assert "subject" in rjson and "body" in rjson and "to" in rjson

            # html render — encoding sanity
            hr = api_client.get(f"{BASE_URL}/api/drafts/{draft_id}/render-html")
            assert hr.status_code == 200, hr.text
            hjson = hr.json()
            html = hjson.get("html", "")
            assert '<meta charset="utf-8">' in html, "charset meta missing"
            # No Latin-1 mojibake artifacts
            for bad in ("Â·", "â€", "Ã¢", "\ufffd"):
                assert bad not in html, f"mojibake {bad!r} present in html"
            # Raw response bytes should contain the middle-dot UTF-8 sequence
            raw = hr.content
            assert b"\xc2\xb7" in raw or "·".encode("utf-8") in raw
        finally:
            api_client.delete(f"{BASE_URL}/api/drafts/{draft_id}")
