"""Regression tests for the 3 reported Compose bugs:
1) Business Application / Business Process create-on-type flow (POST /api/business/{type}).
2) Business Process manual creation and reflection in options list.
3) countries rendered one-per-line (<br>-separated) in /render-html.

Also: full compose-flow smoke — create draft → PUT values → render/render-html — still works.
"""

import json
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def draft_id():
    """Create a fresh IMCR draft, yield its id, then clean up."""
    r = requests.post(f"{API}/drafts", json={
        "template_id": "imcr_identified",
        "category": "IMCR",
        "template_name": "Major Incident – Identified",
    })
    assert r.status_code == 200, f"POST /drafts failed: {r.status_code} {r.text}"
    did = r.json()["id"]
    yield did
    requests.delete(f"{API}/drafts/{did}")


# ---------------------------------------------------------------------------
# Bug #1 + #2 — Business Application / Business Process dropdown backing endpoints
# ---------------------------------------------------------------------------
class TestBusinessDropdowns:
    """The SelectSheet dropdown reads/writes /api/products (Business Application)
    and /api/business-processes (Business Process). Verifies the endpoints
    backing the mobile 'type-to-add' path work as expected."""

    def test_list_products(self):
        r = requests.get(f"{API}/products")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for item in data:
            assert "name" in item

    def test_list_business_processes(self):
        r = requests.get(f"{API}/business-processes")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_business_process_manual(self):
        """Simulates the mobile 'Add "x"' create row for a Business Process."""
        new_name = f"TEST_BP_{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{API}/business-processes",
            json={"name": new_name},
        )
        assert r.status_code == 200, f"POST business-processes failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("name") == new_name

        # Verify the newly-created value is now returned in the list
        r2 = requests.get(f"{API}/business-processes")
        assert r2.status_code == 200
        names = [i["name"] for i in r2.json()]
        assert new_name in names, "Newly created Business Process not returned by GET list"

        # cleanup
        item_id = body.get("id")
        if item_id:
            requests.delete(f"{API}/business-processes/{item_id}")

    def test_create_product_manual(self):
        """Simulates the mobile 'Add "x"' create row for a Business Application."""
        new_name = f"TEST_APP_{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{API}/products",
            json={"name": new_name, "platform": "Custom"},
        )
        assert r.status_code == 200, f"POST products failed: {r.status_code} {r.text}"
        assert r.json().get("name") == new_name
        item_id = r.json().get("id")
        if item_id:
            requests.delete(f"{API}/products/{item_id}")


# ---------------------------------------------------------------------------
# Bug #3 — Countries one-per-line in generated HTML email
# ---------------------------------------------------------------------------
class TestCountriesOnePerLine:
    def test_countries_rendered_with_br_separator(self, draft_id):
        countries = ["Austria", "Greece", "Poland"]
        put_payload = {
            "values": {
                "countries": json.dumps(countries),
                "subject": "TEST countries newline",
                "headline": "TEST headline",
            },
        }
        r = requests.put(f"{API}/drafts/{draft_id}", json=put_payload)
        assert r.status_code == 200, f"PUT draft failed: {r.status_code} {r.text}"

        # HTML render
        r_html = requests.get(f"{API}/drafts/{draft_id}/render-html")
        assert r_html.status_code == 200
        html = r_html.text

        # The 3 countries should be joined by <br>, NOT by ", "
        assert "Austria<br>Greece<br>Poland" in html, (
            "Expected 'Austria<br>Greece<br>Poland' in HTML — "
            "countries are not rendered one-per-line. "
            f"HTML snippet: {html[html.find('Austria'):html.find('Austria')+200] if 'Austria' in html else 'Austria not found'}"
        )
        # And should NOT contain a comma-joined variant
        assert "Austria, Greece, Poland" not in html, (
            "Regression: countries still comma-joined in HTML"
        )

    def test_countries_plain_text_render_newline_separated(self, draft_id):
        countries = ["Austria", "Greece", "Poland"]
        r = requests.put(f"{API}/drafts/{draft_id}", json={
            "values": {"countries": json.dumps(countries), "subject": "t"},
        })
        assert r.status_code == 200
        r_txt = requests.get(f"{API}/drafts/{draft_id}/render")
        assert r_txt.status_code == 200
        body = r_txt.json()["body"]
        # plain-text render uses raw \n between country names
        assert "Austria\nGreece\nPoland" in body


# ---------------------------------------------------------------------------
# Regression — full compose flow smoke
# ---------------------------------------------------------------------------
class TestComposeFlowRegression:
    def test_templates_list_has_imcr(self):
        r = requests.get(f"{API}/templates")
        assert r.status_code == 200
        cats = {t.get("category") for t in r.json()}
        assert "IMCR" in cats

    def test_create_update_render_delete(self):
        r = requests.post(f"{API}/drafts", json={
            "template_id": "imcr_identified",
            "category": "IMCR",
            "template_name": "Major Incident – Identified",
        })
        assert r.status_code == 200
        did = r.json()["id"]
        try:
            r_put = requests.put(f"{API}/drafts/{did}", json={
                "values": {
                    "subject": "TEST subject",
                    "headline": "TEST headline",
                    "business_application": "SAP",
                    "business_process": "Order Management",
                    "countries": json.dumps(["Austria"]),
                },
                "locked_sections": ["overview"],
            })
            assert r_put.status_code == 200
            r_html = requests.get(f"{API}/drafts/{did}/render-html")
            assert r_html.status_code == 200
            assert "TEST subject" in r_html.text
            assert "Austria" in r_html.text
        finally:
            requests.delete(f"{API}/drafts/{did}")
