"""Tests for iteration 7 review request:
- /api/drafts/{id}/render returns plain-text body with countries one-per-line
- /api/outlook/config still unconfigured
- POST /api/auth/microsoft/exchange short-circuits with 503
- POST /api/outlook/drafts/{id} returns 401 without Bearer
- /api/drafts/{id}/render-html still joins countries with <br>
- Full compose flow: Templates → IMCR template → POST /drafts → PUT values → /render(-html)
"""
import json
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


# --- fixture: create an IMCR draft with Austria + Greece ---------------------
@pytest.fixture(scope="module")
def imcr_draft():
    # find IMCR IDENTIFIED template
    r = requests.get(f"{BASE}/templates?category=IMCR", timeout=15)
    assert r.status_code == 200, r.text
    templates = r.json()
    assert isinstance(templates, list) and len(templates) > 0
    # pick the first IMCR template (IDENTIFIED stage typically)
    tpl = next((t for t in templates if t.get("stage") == "IDENTIFIED"), templates[0])

    r = requests.post(f"{BASE}/drafts", json={"template_id": tpl["id"]}, timeout=15)
    assert r.status_code == 200, r.text
    draft = r.json()
    draft_id = draft["id"]

    # PUT values with countries
    new_values = dict(draft.get("values", {}))
    new_values["subject"] = "TEST_IMCR_deeplink"
    new_values["countries"] = json.dumps(["Austria", "Greece"])
    r = requests.put(f"{BASE}/drafts/{draft_id}", json={"values": new_values}, timeout=15)
    assert r.status_code == 200, r.text

    yield draft_id

    # cleanup
    try:
        requests.delete(f"{BASE}/drafts/{draft_id}", timeout=10)
    except Exception:
        pass


# --- /render (plain-text) body used for the ms-outlook:// deep link ----------
class TestRenderPlainText:
    def test_render_returns_plain_text_body_and_recipients(self, imcr_draft):
        r = requests.get(f"{BASE}/drafts/{imcr_draft}/render", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "subject" in data and isinstance(data["subject"], str)
        assert "body" in data and isinstance(data["body"], str)
        assert "to" in data and isinstance(data["to"], list)
        # Plain text — no HTML tags
        assert "<br>" not in data["body"]
        assert "<html" not in data["body"].lower()
        assert "<div" not in data["body"].lower()

    def test_render_body_has_countries_one_per_line(self, imcr_draft):
        r = requests.get(f"{BASE}/drafts/{imcr_draft}/render", timeout=15)
        assert r.status_code == 200
        body = r.json()["body"]
        # Countries listed one per line (\n), not comma-joined
        assert "Austria\nGreece" in body or "Austria\nGreece\n" in body, (
            f"Expected 'Austria\\nGreece' in body, got:\n{body}"
        )
        # Ensure not comma-joined regression
        assert "Austria, Greece" not in body
        assert "Austria,Greece" not in body

    def test_render_to_list_not_empty(self, imcr_draft):
        r = requests.get(f"{BASE}/drafts/{imcr_draft}/render", timeout=15)
        to = r.json()["to"]
        assert len(to) > 0
        # Central DL always present
        assert any("@" in x for x in to)


# --- /render-html regression: countries still joined with <br> ---------------
class TestRenderHtmlCountries:
    def test_render_html_countries_use_br(self, imcr_draft):
        r = requests.get(f"{BASE}/drafts/{imcr_draft}/render-html", timeout=15)
        assert r.status_code == 200, r.text
        html = r.json()["html"]
        assert "Austria<br>Greece" in html, (
            f"Expected 'Austria<br>Greece' in html, got snippet:\n{html[:500]}"
        )


# --- Outlook 365 endpoint regressions ---------------------------------------
class TestOutlookEndpointsRegression:
    def test_outlook_config_unconfigured(self):
        r = requests.get(f"{BASE}/outlook/config", timeout=15)
        assert r.status_code == 200
        cfg = r.json()
        assert cfg["configured"] is False
        assert "shared_mailbox" in cfg

    def test_auth_microsoft_exchange_503_when_unconfigured(self):
        r = requests.post(
            f"{BASE}/auth/microsoft/exchange",
            json={"code": "x", "code_verifier": "y", "redirect_uri": "z"},
            timeout=15,
        )
        assert r.status_code == 503, r.text
        assert "not configured" in r.text.lower()

    def test_outlook_drafts_401_without_bearer(self, imcr_draft):
        # no Authorization header at all
        r = requests.post(f"{BASE}/outlook/drafts/{imcr_draft}", timeout=15)
        assert r.status_code == 401, r.text


# --- Full compose flow smoke -------------------------------------------------
class TestComposeFlow:
    def test_full_compose_flow(self):
        # Templates → IMCR
        r = requests.get(f"{BASE}/templates?category=IMCR", timeout=15)
        assert r.status_code == 200
        tpls = r.json()
        assert len(tpls) > 0
        tpl = tpls[0]

        # Create draft
        r = requests.post(f"{BASE}/drafts", json={"template_id": tpl["id"]}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        did = d["id"]
        try:
            # PUT some values (dropdown search + validate lock analogue via values)
            vals = dict(d.get("values", {}))
            vals["subject"] = "TEST_flow"
            vals["countries"] = json.dumps(["Austria", "Greece"])
            r = requests.put(f"{BASE}/drafts/{did}", json={"values": vals}, timeout=15)
            assert r.status_code == 200

            # Also PUT validations (Validate & Lock)
            r = requests.put(
                f"{BASE}/drafts/{did}", json={"validations": {"subject": True}}, timeout=15
            )
            assert r.status_code == 200
            assert r.json()["validations"]["subject"] is True

            # /render + /render-html reachable (Preview screen data)
            r = requests.get(f"{BASE}/drafts/{did}/render", timeout=15)
            assert r.status_code == 200
            assert "TEST_flow" in r.json()["subject"]

            r = requests.get(f"{BASE}/drafts/{did}/render-html", timeout=15)
            assert r.status_code == 200
            assert "Austria<br>Greece" in r.json()["html"]
        finally:
            requests.delete(f"{BASE}/drafts/{did}", timeout=10)
