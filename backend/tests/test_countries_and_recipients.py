"""Tests for new features: countries CRUD, recipient auto-assembly, body formatting."""
import json
import pytest


# ---------- Countries ----------
class TestCountries:
    def test_list_countries_seeded(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/countries")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 21, f"expected >=21 seeded countries, got {len(data)}"
        # every country has required arrays
        for c in data:
            assert "name" in c
            for k in ("country_dtps", "country_dl", "dwt_leader", "platform_directors"):
                assert k in c, f"country {c.get('name')} missing {k}"
                assert isinstance(c[k], list)

    def test_italy_seed_content(self, api_client, base_url):
        data = api_client.get(f"{base_url}/api/countries").json()
        italy = next((c for c in data if c["name"] == "Italy"), None)
        assert italy, "Italy not seeded"
        assert "CCHBC.Italy.All@CCHellenic.com" in italy["country_dl"]
        assert "vito.alcibiade@cchellenic.com" in italy["platform_directors"]
        assert any("dtps.italy" in e.lower() or "it.crises" in e.lower() for e in italy["country_dtps"])

    def test_create_country_dedupe_and_delete(self, api_client, base_url):
        name = "TEST_Country_Z9"
        r = api_client.post(f"{base_url}/api/countries", json={"name": name})
        assert r.status_code == 200
        cid = r.json()["id"]
        # reflect in list
        listing = api_client.get(f"{base_url}/api/countries").json()
        assert any(c["id"] == cid for c in listing)
        # dedupe
        r2 = api_client.post(f"{base_url}/api/countries", json={"name": name})
        assert r2.status_code == 200
        assert r2.json()["id"] == cid
        # delete soft
        d = api_client.delete(f"{base_url}/api/countries/{cid}")
        assert d.status_code == 200
        listing2 = api_client.get(f"{base_url}/api/countries").json()
        assert not any(c["id"] == cid for c in listing2)

    def test_create_country_empty_400(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/countries", json={"name": "  "})
        assert r.status_code == 400


# ---------- Recipient auto-assembly ----------
def _get_template(api_client, base_url, key_substr, category):
    templates = api_client.get(f"{base_url}/api/templates").json()
    match = next((t for t in templates if t["category"] == category and key_substr in t["key"]), None)
    if not match:
        match = next(t for t in templates if t["category"] == category)
    return match


class TestRecipientLogicNonIMCR:
    @pytest.fixture(scope="class")
    def draft_id(self, api_client, base_url):
        tmpl = _get_template(api_client, base_url, "nonimcr_identified", "NON_IMCR")
        r = api_client.post(f"{base_url}/api/drafts", json={"template_id": tmpl["id"]})
        assert r.status_code == 200
        did = r.json()["id"]
        # set values
        payload = {
            "values": {
                "subject": "TEST NON-IMCR",
                "countries": json.dumps(["Italy", "Austria"]),
                "product_team": "pt-owner@example.com",
                "sre": "sre-oncall@example.com",
            }
        }
        api_client.put(f"{base_url}/api/drafts/{did}", json=payload)
        yield did
        api_client.delete(f"{base_url}/api/drafts/{did}")

    def test_recipients_non_imcr(self, api_client, base_url, draft_id):
        r = api_client.get(f"{base_url}/api/drafts/{draft_id}/render")
        assert r.status_code == 200
        to = [e.lower() for e in r.json()["to"]]
        # required
        assert "dtps.siam@cchellenic.com" in to
        assert "dtps.country.platform.directors@cchellenic.com" in to
        assert "daniela.kaiser@cchellenic.com" in to  # Austria platform director
        assert "vito.alcibiade@cchellenic.com" in to  # Italy platform director
        assert "pt-owner@example.com" in to
        assert "sre-oncall@example.com" in to
        # MUST NOT contain country_dl / country_dtps / dwt_leader for non-IMCR
        assert "cchbc.italy.all@cchellenic.com" not in to  # Italy country_dl
        assert not any("dtps.italy" in e for e in to)  # Italy country_dtps
        assert "paolo.cacopardi@cchellenic.com" not in to  # Italy dwt_leader
        assert "manuel.strauch@cchellenic.com" not in to  # Austria dwt_leader

    def test_body_countries_readable(self, api_client, base_url, draft_id):
        r = api_client.get(f"{base_url}/api/drafts/{draft_id}/render")
        body = r.json()["body"]
        # should not contain raw JSON array
        assert '["Italy"' not in body
        assert "[\"Italy\", \"Austria\"]" not in body
        # should contain readable comma-joined
        assert "Italy, Austria" in body or "Italy" in body
        # ensure both names present as text
        assert "Italy" in body and "Austria" in body

    def test_no_duplicates(self, api_client, base_url, draft_id):
        r = api_client.get(f"{base_url}/api/drafts/{draft_id}/render")
        to = r.json()["to"]
        assert len(to) == len(set(e.lower() for e in to))


class TestRecipientLogicIMCR:
    @pytest.fixture(scope="class")
    def draft_id(self, api_client, base_url):
        tmpl = _get_template(api_client, base_url, "imcr_identified", "IMCR")
        r = api_client.post(f"{base_url}/api/drafts", json={"template_id": tmpl["id"]})
        assert r.status_code == 200
        did = r.json()["id"]
        payload = {
            "values": {
                "subject": "TEST IMCR",
                "countries": json.dumps(["Italy", "Austria"]),
                "product_team": "pt-owner@example.com",
                "sre": "sre-oncall@example.com",
            }
        }
        api_client.put(f"{base_url}/api/drafts/{did}", json=payload)
        yield did
        api_client.delete(f"{base_url}/api/drafts/{did}")

    def test_recipients_imcr_includes_all(self, api_client, base_url, draft_id):
        r = api_client.get(f"{base_url}/api/drafts/{draft_id}/render")
        assert r.status_code == 200
        to = [e.lower() for e in r.json()["to"]]
        # non-imcr baseline
        assert "dtps.siam@cchellenic.com" in to
        assert "dtps.country.platform.directors@cchellenic.com" in to
        assert "daniela.kaiser@cchellenic.com" in to
        assert "vito.alcibiade@cchellenic.com" in to
        # PLUS country DL, DTPS, DWT leader for each selected country
        # Italy country_dl
        assert "cchbc.italy.all@cchellenic.com" in to
        # Italy country_dtps
        assert any("dtps.italy" in e or "it.crises.approvers" in e for e in to)
        # Italy dwt_leader
        assert "paolo.cacopardi@cchellenic.com" in to
        # Austria country_dl
        assert "at.cchbc@cchellenic.com" in to
        # Austria country_dtps
        assert "dtps.austria.team@cchellenic.com" in to
        # Austria dwt_leader
        assert "manuel.strauch@cchellenic.com" in to
        # manual
        assert "pt-owner@example.com" in to
        assert "sre-oncall@example.com" in to

    def test_dedup(self, api_client, base_url, draft_id):
        r = api_client.get(f"{base_url}/api/drafts/{draft_id}/render")
        to = r.json()["to"]
        assert len(to) == len(set(e.lower() for e in to))

    def test_recipients_string_semicolon(self, api_client, base_url, draft_id):
        r = api_client.get(f"{base_url}/api/drafts/{draft_id}/render")
        rendered = r.json()
        assert "; " in rendered["recipients"]
        # matches "to" join
        assert rendered["recipients"] == "; ".join(rendered["to"])
