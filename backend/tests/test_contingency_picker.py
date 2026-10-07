"""Regression tests for the Contingency picker feature.

Covers: product -> contingency map lookup behavior that drives the Compose
screen's ContingencyPickerSheet (single-process auto-fill, multi-process
picker, no-mapping no-op).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestContingencyLookup:
    """Validates /api/contingency returns the expected row shape and counts."""

    def test_sfa_returns_two_processes(self, api_client):
        # SFA maps to 2 processes -> picker must appear.
        r = api_client.get(f"{BASE_URL}/api/contingency", params={"product": "SFA"})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 2, f"Expected 2 rows for SFA, got {len(rows)}"
        processes = sorted(row["process"] for row in rows)
        assert processes == [
            "BDs place orders via Call Center",
            "Business Developers take orders offline",
        ]
        for row in rows:
            assert row["product"] == "SFA"
            assert row["failed_system"] == "SFA"
            assert row["owner"] == "Svetlana Lada"

    def test_master_data_platform_four_rows(self, api_client):
        # Master Data Platform has 4 rows: 1 vendor + 3 customer (different
        # failed systems) -> picker subtitle must disambiguate.
        r = api_client.get(
            f"{BASE_URL}/api/contingency",
            params={"product": "Master Data Platform - Customer and Vendor"},
        )
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 4
        customer = [row for row in rows if row["process"] == "Customer management"]
        assert len(customer) == 3
        failed_systems = sorted(row["failed_system"] for row in customer)
        assert failed_systems == ["CDC, Winshuttle", "CDC_MDG", "Winshuttle, Fiori"]

    def test_single_process_app_dynamic_routing(self, api_client):
        # Single-process app -> no picker, direct auto-fill.
        r = api_client.get(f"{BASE_URL}/api/contingency", params={"product": "Dynamic Routing"})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 1
        assert rows[0]["process"] == "Dynamic transportation planning (dispatching)"
        assert rows[0]["failed_system"] == "LEO"
        assert rows[0]["owner"] == "Cvetanka Ilkova"

    def test_single_process_app_contact_center(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/contingency", params={"product": "Contact Center"})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 1
        assert rows[0]["process"] == "Manage inbound & outbound calls"
        assert rows[0]["failed_system"] == "CTI"

    def test_payroll_no_mapping(self, api_client):
        # No contingency row -> empty list -> frontend does nothing.
        r = api_client.get(f"{BASE_URL}/api/contingency", params={"product": "Payroll"})
        assert r.status_code == 200
        assert r.json() == []

    def test_intranet_no_mapping(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/contingency", params={"product": "Intranet"})
        assert r.status_code == 200
        assert r.json() == []

    def test_empty_query_returns_empty(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/contingency")
        assert r.status_code == 200
        assert r.json() == []

    def test_iom_multi_process(self, api_client):
        # IOM also maps to multiple processes (regression check).
        r = api_client.get(
            f"{BASE_URL}/api/contingency",
            params={"product": "Integrated Order Management (IOM)"},
        )
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 2


class TestComposeRegressionBackend:
    """Smoke-tests the endpoints the Compose screen depends on."""

    def test_products_include_sfa_and_payroll(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/products")
        assert r.status_code == 200
        names = {p["name"] for p in r.json()}
        for required in ("SFA", "Payroll", "Dynamic Routing", "Contact Center", "Intranet"):
            assert required in names, f"missing seeded product: {required}"

    def test_imcr_template_available_for_draft(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/templates", params={"category": "IMCR"})
        assert r.status_code == 200
        tpls = r.json()
        assert len(tpls) >= 1
        # Pick identified-stage template for drafting.
        identified = [t for t in tpls if t.get("stage") == "IDENTIFIED"]
        assert identified, "no IMCR IDENTIFIED template seeded"

    def test_draft_create_and_render_html_countries_newline(self, api_client):
        # Create draft -> set countries list -> render-html -> verify countries
        # are rendered one per line (regression requested).
        tpls = api_client.get(f"{BASE_URL}/api/templates", params={"category": "IMCR"}).json()
        tpl = next(t for t in tpls if t.get("stage") == "IDENTIFIED")
        d = api_client.post(f"{BASE_URL}/api/drafts", json={"template_id": tpl["id"]})
        assert d.status_code == 200
        draft_id = d.json()["id"]

        payload = {
            "values": {
                **d.json()["values"],
                "subject": "TEST_contingency picker regression",
                "business_application": "SFA",
                "business_process": "Business Developers take orders offline",
                "crisis_lead": "Svetlana Lada",
                "contingency": "Failed system: SFA",
                "countries": '["Austria","Italy","Poland"]',
            }
        }
        upd = api_client.put(f"{BASE_URL}/api/drafts/{draft_id}", json=payload)
        assert upd.status_code == 200

        r = api_client.get(f"{BASE_URL}/api/drafts/{draft_id}/render-html")
        assert r.status_code == 200
        body = r.json()
        html = body["html"]
        # Countries must appear on separate lines (joined by <br>).
        assert "Austria<br>Italy<br>Poland" in html, "countries not rendered one-per-line"
        # Contingency box must contain the failed-system marker.
        assert "Failed system: SFA" in html

        # Cleanup
        api_client.delete(f"{BASE_URL}/api/drafts/{draft_id}")
