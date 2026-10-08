"""Backend tests for the IT Maintenance Builder module.

Covers:
- Maintenance CRUD (list/create/get/update/delete-soft)
- /render-html: PLANNED MAINTENANCE caps, heading, window titles, HIGH IMPORTANCE
  chip, 'Name | https://url' contingency link rendering, CCHBC/DTPS logo data URIs
- /render: subject starts with 'Planned Maintenance –', 'to' resolves from saved
  countries, body is plain text containing window titles
- /mark-sent sets sent_at
- Regressions: master mapping contingency returns rich fields + gap apps blank,
  export has 6 columns with 150 distinct apps + master app rows + 'No' flag,
  products count == 150, dropdowns endpoints still work
"""
import os
import re
import io
from pathlib import Path

import openpyxl
import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


# ---------- Maintenance CRUD ----------
class TestMaintenanceCRUD:
    def _cleanup(self, mid):
        try:
            requests.delete(f"{API}/maintenance/{mid}", timeout=15)
        except Exception:
            pass

    def test_list_returns_200(self):
        r = requests.get(f"{API}/maintenance", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_with_defaults(self):
        r = requests.post(f"{API}/maintenance", json={}, timeout=15)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["id"]
        assert doc.get("heading")  # default STD_HEADING present
        assert doc.get("intro")    # default STD_INTRO present
        assert doc.get("deleted_at") is None
        assert doc.get("sent_at") is None
        assert isinstance(doc.get("windows"), list)
        assert isinstance(doc.get("countries"), list)
        self._cleanup(doc["id"])

    def test_get_by_id(self):
        created = requests.post(f"{API}/maintenance", json={}, timeout=15).json()
        try:
            r = requests.get(f"{API}/maintenance/{created['id']}", timeout=15)
            assert r.status_code == 200
            assert r.json()["id"] == created["id"]
        finally:
            self._cleanup(created["id"])

    def test_get_404(self):
        r = requests.get(f"{API}/maintenance/does-not-exist-xyz", timeout=15)
        assert r.status_code == 404

    def test_update_patches_fields(self):
        created = requests.post(f"{API}/maintenance", json={}, timeout=15).json()
        try:
            body = {
                "heading": "TEST Maintenance Window Q1",
                "intro": "Routine **patching** of core systems.",
                "fromDate": "2026-02-01",
                "toDate": "2026-02-02",
                "fzOn": False,
                "fzFrom": "", "fzTo": "", "fzTitle": "", "fzDesc": "", "dist": "",
                "countries": ["Bulgaria"],
                "windows": [
                    {
                        "start": "2026-02-01T22:00", "end": "2026-02-02T02:00",
                        "tz": "CET", "whenText": "", "title": "SAP ECC patching",
                        "impact": "na", "it": "SAP ECC", "bp": "Order to Cash",
                        "co": "Bulgaria", "cp": "Runbook | https://example.com/runbook",
                        "note": "", "high": True,
                    }
                ],
            }
            r = requests.put(f"{API}/maintenance/{created['id']}", json=body, timeout=15)
            assert r.status_code == 200, r.text
            got = r.json()
            assert got["heading"] == "TEST Maintenance Window Q1"
            assert got["countries"] == ["Bulgaria"]
            assert len(got["windows"]) == 1
            assert got["windows"][0]["high"] is True
            # verify persistence via GET
            fetched = requests.get(f"{API}/maintenance/{created['id']}", timeout=15).json()
            assert fetched["heading"] == "TEST Maintenance Window Q1"
            assert fetched["windows"][0]["title"] == "SAP ECC patching"
        finally:
            self._cleanup(created["id"])

    def test_update_404(self):
        r = requests.put(f"{API}/maintenance/nope-123", json={}, timeout=15)
        assert r.status_code == 404

    def test_delete_soft(self):
        created = requests.post(f"{API}/maintenance", json={}, timeout=15).json()
        r = requests.delete(f"{API}/maintenance/{created['id']}", timeout=15)
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        # soft-deleted: list excludes it, get returns 404
        g = requests.get(f"{API}/maintenance/{created['id']}", timeout=15)
        assert g.status_code == 404
        rows = requests.get(f"{API}/maintenance", timeout=15).json()
        assert all(x["id"] != created["id"] for x in rows)


# ---------- Render HTML ----------
class TestMaintenanceRenderHtml:
    def test_render_html_contains_expected(self):
        created = requests.post(f"{API}/maintenance", json={}, timeout=15).json()
        try:
            body = {
                "heading": "Weekend Maintenance",
                "intro": "Routine **patching**.",
                "fromDate": "2026-02-01", "toDate": "2026-02-02",
                "fzOn": False, "fzFrom": "", "fzTo": "", "fzTitle": "", "fzDesc": "",
                "dist": "DTPS IT Ops",
                "countries": ["Bulgaria"],
                "windows": [
                    {
                        "start": "2026-02-01T22:00", "end": "2026-02-02T02:00",
                        "tz": "CET", "whenText": "", "title": "SAP ECC patching",
                        "impact": "na", "it": "SAP ECC", "bp": "Order to Cash",
                        "co": "Bulgaria",
                        "cp": "Runbook | https://example.com/runbook",
                        "note": "", "high": True,
                    }
                ],
            }
            requests.put(f"{API}/maintenance/{created['id']}", json=body, timeout=15)
            r = requests.get(f"{API}/maintenance/{created['id']}/render-html", timeout=15)
            assert r.status_code == 200
            html = r.json()["html"]
            # Caps label
            assert "PLANNED" in html and "MAINTENANCE" in html
            # Heading
            assert "Weekend Maintenance" in html
            # Window title
            assert "SAP ECC patching" in html
            # HIGH IMPORTANCE chip (uses &nbsp;)
            assert "HIGH" in html and "IMPORTANCE" in html
            # Contingency link rendering: 'Name | https://url' -> <a href="...">Name</a>
            assert 'href="https://example.com/runbook"' in html
            assert ">Runbook</a>" in html
            # Logo data URIs present
            assert "data:image/png;base64," in html
            # Both logos (DTPS and CCHBC) — just confirm at least two occurrences
            assert html.count("data:image/png;base64,") >= 2
        finally:
            requests.delete(f"{API}/maintenance/{created['id']}", timeout=15)

    def test_render_html_no_high_importance_when_false(self):
        created = requests.post(f"{API}/maintenance", json={}, timeout=15).json()
        try:
            body = {
                "heading": "Routine", "intro": "", "fromDate": "", "toDate": "",
                "fzOn": False, "fzFrom": "", "fzTo": "", "fzTitle": "", "fzDesc": "",
                "dist": "", "countries": [],
                "windows": [{
                    "start": "", "end": "", "tz": "CET", "whenText": "Sat 02:00 CET",
                    "title": "Minor patch", "impact": "noprod",
                    "it": "", "bp": "", "co": "", "cp": "", "note": "", "high": False,
                }],
            }
            requests.put(f"{API}/maintenance/{created['id']}", json=body, timeout=15)
            html = requests.get(f"{API}/maintenance/{created['id']}/render-html", timeout=15).json()["html"]
            # HIGH IMPORTANCE chip markup only exists when high=true
            # (very specific marker is "HIGH&nbsp;IMPORTANCE")
            assert "HIGH&nbsp;IMPORTANCE" not in html
        finally:
            requests.delete(f"{API}/maintenance/{created['id']}", timeout=15)

    def test_render_html_404(self):
        r = requests.get(f"{API}/maintenance/bogus/render-html", timeout=15)
        assert r.status_code == 404


# ---------- Render (plain + subject + recipients) ----------
class TestMaintenanceRender:
    def test_render_subject_and_recipients(self):
        created = requests.post(f"{API}/maintenance", json={}, timeout=15).json()
        try:
            body = {
                "heading": "Weekend Maintenance", "intro": "x",
                "fromDate": "2026-02-01", "toDate": "2026-02-02",
                "fzOn": False, "fzFrom": "", "fzTo": "", "fzTitle": "", "fzDesc": "",
                "dist": "", "countries": ["Bulgaria"],
                "windows": [{
                    "start": "2026-02-01T22:00", "end": "2026-02-02T02:00", "tz": "CET",
                    "whenText": "", "title": "SAP ECC patching", "impact": "na",
                    "it": "SAP ECC", "bp": "Order to Cash", "co": "Bulgaria",
                    "cp": "", "note": "", "high": False,
                }],
            }
            requests.put(f"{API}/maintenance/{created['id']}", json=body, timeout=15)
            r = requests.get(f"{API}/maintenance/{created['id']}/render", timeout=15)
            assert r.status_code == 200, r.text
            data = r.json()
            # Subject starts with 'Planned Maintenance –'
            assert data["subject"].startswith("Planned Maintenance \u2013"), data["subject"]
            assert "Weekend Maintenance" in data["subject"]
            # To is list of resolved emails
            assert isinstance(data["to"], list)
            assert len(data["to"]) >= 1
            assert all("@" in r for r in data["to"])
            # Body plain text contains window title
            assert "SAP ECC patching" in data["body"]
        finally:
            requests.delete(f"{API}/maintenance/{created['id']}", timeout=15)

    def test_render_404(self):
        r = requests.get(f"{API}/maintenance/missing/render", timeout=15)
        assert r.status_code == 404


# ---------- mark-sent ----------
class TestMaintenanceMarkSent:
    def test_mark_sent_sets_sent_at(self):
        created = requests.post(f"{API}/maintenance", json={}, timeout=15).json()
        try:
            assert created.get("sent_at") is None
            r = requests.post(f"{API}/maintenance/{created['id']}/mark-sent", timeout=15)
            assert r.status_code == 200
            assert r.json() == {"ok": True}
            got = requests.get(f"{API}/maintenance/{created['id']}", timeout=15).json()
            assert got.get("sent_at")
            # ISO-ish timestamp
            assert re.match(r"^\d{4}-\d{2}-\d{2}T", got["sent_at"])
        finally:
            requests.delete(f"{API}/maintenance/{created['id']}", timeout=15)


# ---------- Regression: master mapping + catalog counts ----------
class TestRegressionMasterMapping:
    def test_contingency_genesys_rich_fields(self):
        r = requests.get(f"{API}/contingency", params={"product": "Genesys"}, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1, "No Genesys row returned"
        # At least one row must carry the rich master fields
        rich = [row for row in rows if row.get("cp_id") or row.get("mapping_status")]
        assert rich, f"No rich Genesys row with cp_id/mapping_status: {rows}"
        sample = rich[0]
        assert "contingency_text" in sample
        assert "owner" in sample
        assert "mapping_status" in sample

    def test_contingency_sirvis_blank_contingency_text(self):
        r = requests.get(f"{API}/contingency", params={"product": "SIRVIS"}, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert any((row.get("contingency_text") or "") == "" for row in rows), (
            f"Expected at least one SIRVIS row with blank contingency_text, got {rows}"
        )

    def test_products_count_baseline_no_test_pollution(self):
        """After master-mapping seed, catalog = 150 base + 12 new master apps
        (1 overlap with existing) = 162 distinct apps. Also assert no TEST_/QA_
        pollution and all master apps are present."""
        rows = requests.get(f"{API}/products", timeout=20).json()
        names = [p["name"] for p in rows]
        polluters = [n for n in names if n.startswith("TEST_") or n.startswith("QA_")]
        assert not polluters, f"Catalog polluted with: {polluters}"
        # Baseline from seed (150) + master net-new (12) = 162
        assert len(rows) == 162, f"Expected 162 products, got {len(rows)}"
        # Spot-check: a few master apps are present
        for required in ("Genesys", "SIRVIS", "SAP S/4 HANA ERP Cluster 1 (P02) / MES"):
            assert required in names, f"Missing master app in catalog: {required}"

    def test_dropdown_endpoints_work(self):
        for path in ("/products", "/business-processes", "/countries", "/templates"):
            r = requests.get(f"{API}{path}", timeout=20)
            assert r.status_code == 200, f"{path} -> {r.status_code}"
            assert isinstance(r.json(), list)
            assert len(r.json()) > 0, f"{path} returned empty list"


# ---------- Regression: export has master apps + gap flag ----------
class TestRegressionExport:
    def test_export_xlsx_has_6_cols_150_apps_master_and_gaps(self):
        r = requests.get(f"{API}/contingency/export", timeout=30)
        assert r.status_code == 200
        assert "spreadsheetml" in r.headers.get("content-type", "")
        wb = openpyxl.load_workbook(io.BytesIO(r.content))
        ws = wb.active
        header = [c.value for c in ws[1]]
        assert len(header) == 6
        assert header[0] == "Platform"
        assert header[1] == "Business Application"
        assert header[5] == "Has Contingency Plan"
        # distinct apps count
        app_names = set()
        rows_with_sap = False
        sirvis_no = False
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row:
                continue
            platform, app, process, plan, owner, flag = row[:6]
            if app:
                app_names.add(str(app).strip())
            if app and "SAP S/4 HANA ERP Cluster 1" in str(app):
                rows_with_sap = True
            if app and str(app).strip() == "SIRVIS" and flag == "No":
                sirvis_no = True
        assert len(app_names) == 162, f"Expected 162 distinct apps (150 base + 12 master net-new), got {len(app_names)}"
        assert rows_with_sap, "Expected a master app row for 'SAP S/4 HANA ERP Cluster 1 (P02) / MES'"
        assert sirvis_no, "Expected SIRVIS to appear as a gap app flagged 'No'"
