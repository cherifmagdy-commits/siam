"""Tests for incident lifecycle and push registration endpoints (iteration 3)."""
import pytest


# ---------- Incident lifecycle ----------
class TestIncidentLifecycle:
    def test_create_incident_returns_incident_and_first_draft(self, api_client, base_url):
        # Feature: POST /api/incidents creates incident + first draft
        r = api_client.post(f"{base_url}/api/incidents", json={"template_id": "imcr_investigating"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "incident" in data and "draft" in data
        inc = data["incident"]
        draft = data["draft"]
        assert inc["status"] == "OPEN"
        assert inc["current_stage"] == "INVESTIGATING"
        assert inc["category"] == "IMCR"
        assert inc["last_sent_at"] is None
        assert inc["deleted_at"] is None
        assert draft["sequence"] == 1
        assert draft["incident_id"] == inc["id"]
        assert draft["stage"] == "INVESTIGATING"
        assert draft["template_id"] == "imcr_investigating"
        assert draft["validations"] == {}
        # cleanup
        api_client.delete(f"{base_url}/api/incidents/{inc['id']}")

    def test_create_incident_bad_template_404(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/incidents", json={"template_id": "no-such"})
        assert r.status_code == 404

    def test_update_creates_second_draft_prefilled_with_reset_validations(self, api_client, base_url):
        # Create incident
        r = api_client.post(f"{base_url}/api/incidents", json={"template_id": "imcr_investigating"})
        assert r.status_code == 200
        inc_id = r.json()["incident"]["id"]
        draft1 = r.json()["draft"]
        did1 = draft1["id"]

        # PUT the first draft values, then validate a few
        new_values = dict(draft1["values"])
        new_values["title"] = "TEST Payment Outage EMEA"
        new_values["business_application"] = "SFA"
        new_values["countries"] = '["Italy", "Austria"]'
        new_values["product_team"] = "pt@example.com"
        put = api_client.put(
            f"{base_url}/api/drafts/{did1}",
            json={
                "values": new_values,
                "validations": {"subject": True, "core_facts": True},
            },
        )
        assert put.status_code == 200

        # Create next update (IDENTIFIED)
        upd = api_client.post(
            f"{base_url}/api/incidents/{inc_id}/updates",
            json={"template_id": "imcr_identified"},
        )
        assert upd.status_code == 200, upd.text
        d2 = upd.json()
        assert d2["sequence"] == 2
        assert d2["incident_id"] == inc_id
        assert d2["stage"] == "IDENTIFIED"
        # validations must be reset
        assert d2["validations"] == {}
        # values prefilled from previous where keys exist in new template
        vals = d2["values"]
        assert vals.get("title") == "TEST Payment Outage EMEA"
        assert vals.get("business_application") == "SFA"
        assert vals.get("countries") == '["Italy", "Austria"]'
        assert vals.get("product_team") == "pt@example.com"

        # cleanup
        api_client.delete(f"{base_url}/api/incidents/{inc_id}")

    def test_update_bad_incident_404(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/incidents/nope/updates",
            json={"template_id": "imcr_identified"},
        )
        assert r.status_code == 404

    def test_list_incidents_includes_update_count(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/incidents", json={"template_id": "imcr_investigating"})
        inc_id = r.json()["incident"]["id"]
        api_client.post(
            f"{base_url}/api/incidents/{inc_id}/updates",
            json={"template_id": "imcr_identified"},
        )
        lst = api_client.get(f"{base_url}/api/incidents").json()
        me = next(i for i in lst if i["id"] == inc_id)
        assert me["update_count"] == 2
        api_client.delete(f"{base_url}/api/incidents/{inc_id}")

    def test_get_incident_returns_updates_ordered_with_progress(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/incidents", json={"template_id": "imcr_investigating"})
        inc_id = r.json()["incident"]["id"]
        did1 = r.json()["draft"]["id"]
        # add validations to draft 1
        api_client.put(
            f"{base_url}/api/drafts/{did1}",
            json={"validations": {"subject": True, "core_facts": True}},
        )
        api_client.post(
            f"{base_url}/api/incidents/{inc_id}/updates",
            json={"template_id": "imcr_recovering"},
        )
        g = api_client.get(f"{base_url}/api/incidents/{inc_id}").json()
        assert "updates" in g
        assert len(g["updates"]) == 2
        # ordered by sequence ascending
        assert g["updates"][0]["sequence"] == 1
        assert g["updates"][1]["sequence"] == 2
        assert g["updates"][0]["stage"] == "INVESTIGATING"
        assert g["updates"][1]["stage"] == "RECOVERING"
        # progress present
        assert g["updates"][0]["progress"]["validated"] == 2
        assert g["updates"][0]["progress"]["total"] >= 2
        api_client.delete(f"{base_url}/api/incidents/{inc_id}")

    def test_get_incident_404(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/incidents/nope")
        assert r.status_code == 404

    def test_mark_sent_updates_last_sent_and_stage(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/incidents", json={"template_id": "imcr_investigating"})
        inc_id = r.json()["incident"]["id"]
        did = r.json()["draft"]["id"]
        m = api_client.post(
            f"{base_url}/api/incidents/{inc_id}/mark-sent",
            json={"draft_id": did},
        )
        assert m.status_code == 200
        inc = m.json()
        assert inc["last_sent_at"] is not None
        assert inc["current_stage"] == "INVESTIGATING"
        assert inc["status"] == "OPEN"  # not resolved yet
        api_client.delete(f"{base_url}/api/incidents/{inc_id}")

    def test_mark_sent_resolved_sets_status_resolved(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/incidents", json={"template_id": "imcr_investigating"})
        inc_id = r.json()["incident"]["id"]
        # Create a RESOLVED-stage draft update
        upd = api_client.post(
            f"{base_url}/api/incidents/{inc_id}/updates",
            json={"template_id": "imcr_resolved"},
        )
        assert upd.status_code == 200
        resolved_draft = upd.json()
        assert resolved_draft["stage"] == "RESOLVED"

        m = api_client.post(
            f"{base_url}/api/incidents/{inc_id}/mark-sent",
            json={"draft_id": resolved_draft["id"]},
        )
        assert m.status_code == 200
        inc = m.json()
        assert inc["status"] == "RESOLVED"
        assert inc["current_stage"] == "RESOLVED"
        assert inc.get("resolved_at") is not None
        api_client.delete(f"{base_url}/api/incidents/{inc_id}")

    def test_mark_sent_missing_incident_404(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/incidents/nope/mark-sent",
            json={"draft_id": "also-nope"},
        )
        assert r.status_code == 404

    def test_mark_sent_missing_draft_404(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/incidents", json={"template_id": "imcr_investigating"})
        inc_id = r.json()["incident"]["id"]
        m = api_client.post(
            f"{base_url}/api/incidents/{inc_id}/mark-sent",
            json={"draft_id": "nope"},
        )
        assert m.status_code == 404
        api_client.delete(f"{base_url}/api/incidents/{inc_id}")

    def test_delete_incident_soft_deletes_incident_and_drafts(self, api_client, base_url):
        # Create incident + one update
        r = api_client.post(f"{base_url}/api/incidents", json={"template_id": "imcr_investigating"})
        inc_id = r.json()["incident"]["id"]
        d1_id = r.json()["draft"]["id"]
        upd = api_client.post(
            f"{base_url}/api/incidents/{inc_id}/updates",
            json={"template_id": "imcr_identified"},
        )
        d2_id = upd.json()["id"]

        # Delete incident
        d = api_client.delete(f"{base_url}/api/incidents/{inc_id}")
        assert d.status_code == 200

        # Incident no longer in list
        incs = api_client.get(f"{base_url}/api/incidents").json()
        assert not any(i["id"] == inc_id for i in incs)
        # GET returns 404
        assert api_client.get(f"{base_url}/api/incidents/{inc_id}").status_code == 404

        # Drafts also soft-deleted
        drafts = api_client.get(f"{base_url}/api/drafts").json()
        assert not any(d["id"] == d1_id for d in drafts)
        assert not any(d["id"] == d2_id for d in drafts)

    def test_delete_missing_incident_404(self, api_client, base_url):
        r = api_client.delete(f"{base_url}/api/incidents/nonexistent")
        assert r.status_code == 404


# ---------- Push registration ----------
class TestRegisterPush:
    def test_register_push_endpoint_exists_and_returns_controlled_error(self, api_client, base_url):
        # With placeholder EMERGENT_PUSH_KEY, the upstream call should fail.
        # Endpoint must exist (not 404) and return a controlled error (500/502).
        r = api_client.post(
            f"{base_url}/api/register-push",
            json={"user_id": "TEST_user", "platform": "ios", "device_token": "test-token-123"},
        )
        assert r.status_code != 404, "register-push endpoint should exist"
        # Must not crash — must be a controlled 500 or 502
        assert r.status_code in (500, 502), f"expected controlled error, got {r.status_code}: {r.text}"

    def test_register_push_validation_422(self, api_client, base_url):
        # missing fields
        r = api_client.post(f"{base_url}/api/register-push", json={"user_id": "x"})
        assert r.status_code == 422
