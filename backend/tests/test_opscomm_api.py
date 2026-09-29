"""Full backend regression tests for OpsComm API."""
import pytest


# ---------- Templates ----------
class TestTemplates:
    def test_list_templates_returns_8(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/templates")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 8
        imcr = [t for t in data if t["category"] == "IMCR"]
        nonimcr = [t for t in data if t["category"] == "NON_IMCR"]
        assert len(imcr) == 5
        assert len(nonimcr) == 3
        # each template has sections and subject is first
        for t in data:
            assert "sections" in t and len(t["sections"]) >= 2
            assert t["sections"][0]["key"] == "subject"
            assert "header" in t and "footer" in t

    def test_filter_category(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/templates?category=IMCR")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 5
        assert all(t["category"] == "IMCR" for t in data)

    def test_get_template_by_id(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/templates")
        tid = r.json()[0]["id"]
        r2 = api_client.get(f"{base_url}/api/templates/{tid}")
        assert r2.status_code == 200
        assert r2.json()["id"] == tid

    def test_get_template_404(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/templates/nope")
        assert r.status_code == 404


# ---------- Products ----------
class TestProducts:
    def test_list_products_seeded(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/products")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 150
        assert all("name" in p and "platform" in p and "id" in p for p in data)

    def test_create_dedupe_and_delete(self, api_client, base_url):
        name = "TEST_Product_Alpha_9x"
        # create
        r = api_client.post(f"{base_url}/api/products", json={"name": name, "platform": "TEST"})
        assert r.status_code == 200
        pid = r.json()["id"]
        # dedupe -> returns existing (same id)
        r2 = api_client.post(f"{base_url}/api/products", json={"name": name})
        assert r2.status_code == 200
        assert r2.json()["id"] == pid
        # persisted in list
        listing = api_client.get(f"{base_url}/api/products").json()
        assert any(p["id"] == pid for p in listing)
        # delete (soft)
        d = api_client.delete(f"{base_url}/api/products/{pid}")
        assert d.status_code == 200
        # verify not in list
        listing2 = api_client.get(f"{base_url}/api/products").json()
        assert not any(p["id"] == pid for p in listing2)

    def test_create_empty_400(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/products", json={"name": "  "})
        assert r.status_code == 400

    def test_delete_missing_404(self, api_client, base_url):
        r = api_client.delete(f"{base_url}/api/products/nonexistent-id")
        assert r.status_code == 404


# ---------- Business processes ----------
class TestProcesses:
    def test_list_processes_seeded(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/business-processes")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 36

    def test_create_dedupe_delete(self, api_client, base_url):
        name = "TEST_Process_Zeta_9x"
        r = api_client.post(f"{base_url}/api/business-processes", json={"name": name})
        assert r.status_code == 200
        pid = r.json()["id"]
        r2 = api_client.post(f"{base_url}/api/business-processes", json={"name": name})
        assert r2.json()["id"] == pid
        d = api_client.delete(f"{base_url}/api/business-processes/{pid}")
        assert d.status_code == 200
        listing = api_client.get(f"{base_url}/api/business-processes").json()
        assert not any(p["id"] == pid for p in listing)


# ---------- Drafts ----------
class TestDrafts:
    @pytest.fixture(scope="class")
    def draft_id(self, api_client, base_url):
        templates = api_client.get(f"{base_url}/api/templates").json()
        imcr = next(t for t in templates if t["category"] == "IMCR")
        r = api_client.post(f"{base_url}/api/drafts", json={"template_id": imcr["id"]})
        assert r.status_code == 200
        did = r.json()["id"]
        yield did
        api_client.delete(f"{base_url}/api/drafts/{did}")

    def test_create_default_values(self, api_client, base_url, draft_id):
        r = api_client.get(f"{base_url}/api/drafts/{draft_id}")
        assert r.status_code == 200
        d = r.json()
        assert d["template"] is not None
        assert "subject" in d["values"]
        assert d["values"]["subject"]  # populated by default
        assert d["validations"] == {}

    def test_list_drafts_with_progress(self, api_client, base_url, draft_id):
        r = api_client.get(f"{base_url}/api/drafts")
        assert r.status_code == 200
        found = [d for d in r.json() if d["id"] == draft_id]
        assert found
        assert "progress" in found[0]
        assert "validated" in found[0]["progress"]
        assert "total" in found[0]["progress"]

    def test_update_values_validations_recipients(self, api_client, base_url, draft_id):
        payload = {
            "values": {"subject": "TEST subject", "extra": "x"},
            "validations": {"subject": True, "status": True},
            "recipients": "a@b.com;c@d.com",
        }
        r = api_client.put(f"{base_url}/api/drafts/{draft_id}", json=payload)
        assert r.status_code == 200
        # verify persistence
        g = api_client.get(f"{base_url}/api/drafts/{draft_id}").json()
        assert g["values"]["subject"] == "TEST subject"
        assert g["validations"]["subject"] is True
        assert g["recipients"] == "a@b.com;c@d.com"
        # verify progress counts validated
        lst = api_client.get(f"{base_url}/api/drafts").json()
        me = next(d for d in lst if d["id"] == draft_id)
        assert me["progress"]["validated"] == 2

    def test_render_returns_subject_and_body(self, api_client, base_url, draft_id):
        r = api_client.get(f"{base_url}/api/drafts/{draft_id}/render")
        assert r.status_code == 200
        rendered = r.json()
        assert "subject" in rendered and rendered["subject"]
        assert "body" in rendered and rendered["body"]
        assert "recipients" in rendered
        # body should include header text
        assert "DTPS" in rendered["body"] or "Major Incident" in rendered["body"]

    def test_get_missing_draft_404(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/drafts/nope")
        assert r.status_code == 404

    def test_create_draft_bad_template_404(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/drafts", json={"template_id": "no-such"})
        assert r.status_code == 404


# ---------- Contingency ----------
class TestContingency:
    def test_lookup_by_product(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/contingency", params={"product": "SFA"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert all(row["product"] == "SFA" for row in data)
        assert all("failed_system" in row and "owner" in row for row in data)

    def test_empty_query_returns_empty(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/contingency")
        assert r.status_code == 200
        assert r.json() == []
