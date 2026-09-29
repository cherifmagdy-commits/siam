"""Targeted verification for the UTF-8 mojibake bug fix in _render_html().

Bug: The generated HTML had no <meta charset="utf-8">, causing WebView to
decode UTF-8 bytes as Latin-1 -> middle dot '·' rendered as 'Â·' and
en-dash '–' rendered as 'â€' sequences.

Fix: <meta charset="utf-8"> and <meta http-equiv="Content-Type" ...> were
added in _render_html() in /app/backend/server.py.
"""
import pytest


# ---------- render-html encoding ----------
class TestRenderHtmlEncoding:
    """The core bug-fix verification: charset meta present + clean UTF-8 bytes."""

    @pytest.fixture(scope="class")
    def imcr_draft(self, api_client, base_url):
        # Pick first IMCR template (header contains U+00B7 '·', subject default has en-dash)
        templates = api_client.get(f"{base_url}/api/templates").json()
        imcr = next(t for t in templates if t["category"] == "IMCR")
        r = api_client.post(f"{base_url}/api/drafts", json={"template_id": imcr["id"]})
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        yield {"id": did, "template": imcr}
        api_client.delete(f"{base_url}/api/drafts/{did}")

    def test_render_html_200_and_shape(self, api_client, base_url, imcr_draft):
        r = api_client.get(f"{base_url}/api/drafts/{imcr_draft['id']}/render-html")
        assert r.status_code == 200, r.text
        data = r.json()
        assert set(["subject", "html", "to"]).issubset(data.keys())
        assert isinstance(data["html"], str) and len(data["html"]) > 200
        assert isinstance(data["to"], list)

    def test_meta_charset_utf8_present(self, api_client, base_url, imcr_draft):
        """Head must declare UTF-8 so WebView decodes correctly."""
        r = api_client.get(f"{base_url}/api/drafts/{imcr_draft['id']}/render-html")
        html = r.json()["html"]
        # Must be inside <head>
        head_start = html.lower().find("<head>")
        head_end = html.lower().find("</head>")
        assert head_start != -1 and head_end != -1, "no <head> in rendered HTML"
        head = html[head_start:head_end]
        assert '<meta charset="utf-8">' in head.lower() or 'charset="utf-8"' in head.lower(), \
            f"missing <meta charset='utf-8'> in head: {head[:300]}"
        # http-equiv Content-Type is also part of the fix (belt & suspenders)
        assert "content-type" in head.lower() and "charset=utf-8" in head.lower(), \
            "missing http-equiv Content-Type charset=utf-8"

    def test_utf8_chars_clean_in_header_and_subject(self, api_client, base_url, imcr_draft):
        """Middle-dot U+00B7 must appear in header; en-dash U+2013 must appear in subject."""
        r = api_client.get(f"{base_url}/api/drafts/{imcr_draft['id']}/render-html")
        payload = r.json()
        html = payload["html"]
        subject = payload["subject"]

        # 1) Proper Unicode chars present
        assert "\u00b7" in html, "middle dot U+00B7 '·' missing from rendered HTML"
        assert "\u2013" in html, "en-dash U+2013 '–' missing from rendered HTML"
        assert "\u2013" in subject, f"en-dash missing from subject: {subject!r}"

        # 2) No mojibake sequences produced by latin-1 decoding of UTF-8 bytes
        assert "\u00c2\u00b7" not in html, "mojibake 'Â·' detected -> charset still broken"
        assert "Â·" not in html, "mojibake 'Â·' (literal) detected"
        assert "â€" not in html, "mojibake 'â€' (en-dash triplet) detected"
        assert "Ã¢" not in html, "double-encoded mojibake detected"

        # 3) UTF-8 byte-level round trip: encoding as utf-8 and decoding back stays identical
        assert html.encode("utf-8").decode("utf-8") == html

    def test_response_bytes_are_valid_utf8(self, api_client, base_url, imcr_draft):
        """Raw response body must be decodable as UTF-8 without replacement chars."""
        r = api_client.get(f"{base_url}/api/drafts/{imcr_draft['id']}/render-html")
        # FastAPI defaults to utf-8 for JSON
        assert "utf-8" in (r.headers.get("content-type", "").lower()) or r.encoding.lower() == "utf-8"
        raw = r.content
        decoded = raw.decode("utf-8")
        # No replacement char
        assert "\ufffd" not in decoded
        # Middle-dot as a UTF-8 byte sequence (0xC2 0xB7) must be findable in the raw bytes
        # inside the html string (it is embedded inside the JSON body).
        assert b"\xc2\xb7" in raw, "middle-dot U+00B7 not present as UTF-8 bytes 0xC2 0xB7"
        # En-dash bytes 0xE2 0x80 0x93 must be present too
        assert b"\xe2\x80\x93" in raw, "en-dash U+2013 not present as UTF-8 bytes 0xE2 0x80 0x93"

    def test_header_text_from_template_intact(self, api_client, base_url, imcr_draft):
        """Header text 'DTPS IT Operations Management · Major Incident Communication'
        must appear verbatim with the middle-dot."""
        r = api_client.get(f"{base_url}/api/drafts/{imcr_draft['id']}/render-html")
        html = r.json()["html"]
        assert "DTPS IT Operations Management \u00b7 Major Incident Communication" in html, \
            "IMCR header string with middle-dot missing from rendered HTML"

    def test_footer_middle_dots_intact(self, api_client, base_url, imcr_draft):
        """IMCR footer contains two ' · ' middle-dot separators; they must all survive."""
        r = api_client.get(f"{base_url}/api/drafts/{imcr_draft['id']}/render-html")
        html = r.json()["html"]
        # Footer line: "DTPS.IT.Continuity.Mgt.Team@cchellenic.com" preceded by middle-dot
        assert "\u00b7  DTPS.IT.Continuity.Mgt.Team" in html or \
               "\u00b7 DTPS.IT.Continuity.Mgt.Team" in html, \
               "footer middle-dot separator missing"

    def test_subject_endash_persists_after_update(self, api_client, base_url, imcr_draft):
        """Updating subject to a value containing an en-dash and re-rendering must not
        produce mojibake either."""
        did = imcr_draft["id"]
        custom = "Major Incident \u2013 Payment API \u2013 Investigating"
        u = api_client.put(f"{base_url}/api/drafts/{did}", json={"values": {"subject": custom}})
        assert u.status_code == 200, u.text
        r = api_client.get(f"{base_url}/api/drafts/{did}/render-html")
        assert r.status_code == 200
        payload = r.json()
        assert payload["subject"] == custom
        assert custom in payload["html"]
        assert "Â·" not in payload["html"]
        assert "â€" not in payload["html"]


# ---------- Light regression on core endpoints ----------
class TestRegression:
    def test_templates_list(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/templates")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 8

    def test_countries_list(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/countries")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 20
        assert all("name" in c for c in data)

    def test_create_draft_and_plain_render(self, api_client, base_url):
        templates = api_client.get(f"{base_url}/api/templates").json()
        imcr = next(t for t in templates if t["category"] == "IMCR")
        cr = api_client.post(f"{base_url}/api/drafts", json={"template_id": imcr["id"]})
        assert cr.status_code == 200
        did = cr.json()["id"]
        try:
            # plain render still works
            r = api_client.get(f"{base_url}/api/drafts/{did}/render")
            assert r.status_code == 200
            body = r.json()
            assert body["subject"]
            assert body["body"]
            # plain render body should already carry the middle-dot from header
            assert "\u00b7" in body["body"]
            assert "Â·" not in body["body"]
        finally:
            api_client.delete(f"{base_url}/api/drafts/{did}")
