"""IT Maintenance Builder — Planned Maintenance schedule emails.

Ported faithfully from IT_Maintenance_Builder.html (same Outlook markup/colours).
CRUD for saved schedules + HTML/plain-text renderers + recipient resolution.
"""
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from maintenance_assets import CAL, CCHBC_LOGO, DTPS_LOGO, ONDUTY, STD_HEADING, STD_INTRO, TRANSLATE

router = APIRouter(prefix="/api")

# ---- colour palette (verbatim from the HTML) ----
C = {
    "BG": "#EEF2F6", "BORDER": "#D9E1EA", "PANEL": "#EDF2F7", "HAIR": "#E3E9F0",
    "ACC": "#48678A", "INK": "#343B44", "SUB": "#69737F", "LBL": "#8893A0",
    "BAR": "#8FA9C4", "BAR_SOFT": "#DCE6F0", "BTN_B": "#C3D0DE", "BTN_BG": "#F1F5F9",
    "HEAD": "#F4F7FA",
}
HI = {"BAR": "#C99A96", "HEAD": "#FBF4F3", "BORDER": "#EBDAD8", "ACC": "#9B514D"}
F = "font-family: 'Aptos', 'Segoe UI', Arial, Helvetica, sans-serif;"
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
IMPACT = {"na": ("SERVICE NOT AVAILABLE", True), "partial": ("PARTIAL IMPACT", True), "noprod": ("NO PRODUCTION IMPACT", False)}
FIELDS = [("it", "IT service"), ("bp", "Business process"), ("co", "Countries"), ("cp", "Contingency"), ("note", "Note")]


# ---------- models ----------
class MaintWindow(BaseModel):
    start: str = ""
    end: str = ""
    tz: str = "CET"
    whenText: str = ""
    title: str = ""
    impact: str = "na"
    it: str = ""
    bp: str = ""
    co: str = ""
    cp: str = ""
    note: str = ""
    high: bool = False


class Maintenance(BaseModel):
    heading: str = STD_HEADING
    intro: str = STD_INTRO
    fromDate: str = ""
    toDate: str = ""
    fzOn: bool = False
    fzFrom: str = ""
    fzTo: str = ""
    fzTitle: str = ""
    fzDesc: str = ""
    dist: str = ""
    countries: List[str] = Field(default_factory=list)
    windows: List[MaintWindow] = Field(default_factory=list)


# ---------- date helpers ----------
def _pd(s: str):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?", str(s or ""))
    if not m:
        return None
    return {"y": int(m[1]), "mo": int(m[2]), "d": int(m[3]), "h": m[4], "mi": m[5], "key": m[1] + m[2] + m[3]}


def _day(p, with_year=False):
    return f"{str(p['d']).zfill(2)} {MON[p['mo'] - 1]}" + (f" {p['y']}" if with_year else "")


def _when_of(w: Dict[str, Any]) -> str:
    if w.get("whenText", "").strip():
        return w["whenText"].strip()
    s = _pd(w.get("start")); e = _pd(w.get("end")); tz = w.get("tz") or "CET"
    if not s:
        return ""
    st = f"{s['h']}:{s['mi']}"
    if not e:
        return f"{_day(s)}, {st} {tz}"
    et = f"{e['h']}:{e['mi']}"
    if s["key"] == e["key"]:
        return f"{_day(s)}, {st} \u2013 {et} {tz}"
    return f"{_day(s)}, {st} \u2013 {_day(e)}, {et} {tz}"


def _range(a: str, b: str, year_on_end: bool) -> str:
    s = _pd(a); e = _pd(b)
    if not s and not e:
        return ""
    if not e:
        return _day(s, year_on_end)
    if not s:
        return _day(e, year_on_end)
    return f"{_day(s, s['y'] != e['y'])} \u2013 {_day(e, year_on_end)}"


# ---------- text helpers ----------
def _esc(s: Any) -> str:
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;"))


def _rich(s: Any) -> str:
    return re.sub(r"\*\*(.+?)\*\*", r'<span style="font-weight: bold;">\1</span>', _esc(s))


def _lines(s: Any) -> List[str]:
    return [x.strip() for x in str(s or "").split("\n") if x.strip()]


def _nb(s: Any) -> str:
    return _esc(s).replace(" ", "&nbsp;")


def _value_html(key: str, text: str) -> str:
    out = []
    for l in _lines(text):
        if key == "cp":
            m = re.match(r"^(.*?)\s*\|\s*(https?://\S+)$", l)
            if m:
                out.append(f'<a href="{_esc(m[2])}" target="_blank" style="color: {C["ACC"]}; text-decoration: underline;">{_rich(m[1])}</a>')
                continue
        out.append(_rich(l))
    return "<br />".join(out)


def _caps(t: str, color: str = None, pad: str = None) -> str:
    return f'<div style="{F} font-size: 14px; line-height: 130%; letter-spacing: 0.7px; color: {color or C["LBL"]}; font-weight: bold; padding: {pad or "0 0 6px 0"};">{t}</div>'


def _hi_chip() -> str:
    return f'<td style="padding: 0 0 0 6px;"><table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate;"><tr><td bgcolor="{HI["HEAD"]}" style="background-color: {HI["HEAD"]}; border: 1px solid {HI["BAR"]}; border-radius: 4px; padding: 3px 8px;"><div style="{F} font-size: 12px; line-height: 130%; letter-spacing: 0.5px; color: {HI["ACC"]}; font-weight: bold;">HIGH&nbsp;IMPORTANCE</div></td></tr></table></td>'


def _chip(key: str) -> str:
    t, strong = IMPACT.get(key, IMPACT["na"])
    color = C["ACC"] if strong else C["SUB"]
    return f'<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate;"><tr><td bgcolor="#FFFFFF" style="background-color: #FFFFFF; border: 1px solid {C["BORDER"]}; border-radius: 4px; padding: 3px 8px;"><div style="{F} font-size: 12px; line-height: 130%; letter-spacing: 0.5px; color: {color}; font-weight: bold;">{t}</div></td></tr></table>'


def _row(label: str, val: str, last: bool) -> str:
    bb = "" if last else f' border-bottom: 1px solid {C["HAIR"]};'
    return (f'<tr><td class="m-lab" width="34%" valign="top" style="width: 34%; padding: 9px 8px 9px 0;{bb}">'
            f'<div class="dm-sub m-labt" style="{F} font-size: 15.5px; line-height: 140%; color: {C["SUB"]};">{label}</div></td>'
            f'<td class="m-val" valign="top" style="padding: 9px 0;{bb}">'
            f'<div class="dm-ink m-valt" style="{F} font-size: 15.5px; line-height: 145%; color: {C["INK"]};">{val}</div></td></tr>')


def _card(w: Dict[str, Any]) -> str:
    K = {**C, **HI} if w.get("high") else C
    rows = [(l, _value_html(k, w.get(k, ""))) for k, l in FIELDS]
    rows = [r for r in rows if r[1]]
    body = "\n".join(_row(r[0], r[1], i == len(rows) - 1) for i, r in enumerate(rows))
    if w.get("high"):
        chips = f'<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate;"><tr><td>{_chip(w.get("impact", "na"))}</td>{_hi_chip()}</tr></table>'
    else:
        chips = _chip(w.get("impact", "na"))
    body_block = (f'<tr><td class="m-wbody" style="padding: 4px 20px 10px 20px;"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width: 100%;">{body}</table></td></tr>') if rows else ""
    return f"""
     <tr><td style="padding: 0 0 16px 0;">
       <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: separate;"><tr>
         <td class="dm-panel" bgcolor="#FFFFFF" style="background-color: #FFFFFF; border: 1px solid {K["BORDER"]}; border-top: 4px solid {K["BAR"]}; border-radius: 10px;">
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
           <tr><td class="m-whead" bgcolor="{K["HEAD"]}" style="background-color: {K["HEAD"]}; padding: 14px 20px 12px 20px; border-bottom: 1px solid {K["BORDER"]};">
             <div style="{F} font-size: 14.5px; line-height: 140%; color: {K["ACC"]}; font-weight: bold;">{_esc(_when_of(w))}</div>
             <div class="dm-ink m-wtitle" style="{F} font-size: 19px; line-height: 132%; color: {C["INK"]}; font-weight: bold; padding: 2px 0 8px 0;">{_esc(w.get("title"))}</div>
             {chips}
           </td></tr>
           {body_block}
          </table>
         </td></tr></table>
     </td></tr>"""


def _intro_html(t: str) -> str:
    return (_rich(t)
            .replace('<span style="font-weight: bold;">', f'<span class="dm-ink" style="color: {C["INK"]}; font-weight: bold;">')
            .replace("\n", "<br />"))


def render_email(s: Dict[str, Any]) -> str:
    fz_range = _range(s.get("fzFrom"), s.get("fzTo"), False)
    freeze = ""
    if s.get("fzOn"):
        freeze = f"""
        <tr><td style="padding: 0 0 24px 0;">
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width: 100%;"><tr>
            <td class="m-fz" bgcolor="{C["PANEL"]}" style="background-color: {C["PANEL"]}; border-left: 4px solid {C["BAR"]}; border-radius: 8px; padding: 14px 16px;">
             {_caps('CHANGE&nbsp;FREEZE' + (' &#183; ' + _esc(fz_range.upper()) if fz_range else ''), C["ACC"], '0 0 4px 0')}
             <div class="dm-ink m-fzt" style="{F} font-size: 16.5px; line-height: 140%; color: {C["INK"]}; font-weight: bold; padding-bottom: 3px;">{_esc(s.get("fzTitle"))}</div>
             <div class="dm-sub m-valt" style="{F} font-size: 15.5px; line-height: 150%; color: {C["SUB"]};">{_rich(s.get("fzDesc")).replace(chr(10), '<br />')}</div>
            </td></tr></table>
        </td></tr>"""
    period = _range(s.get("fromDate"), s.get("toDate"), True)
    wins = "".join(_card(w) for w in s.get("windows", []))
    heading = s.get("heading") or STD_HEADING
    intro = s.get("intro") or ""
    intro_block = (f'<tr><td style="padding: 0 0 18px 0;"><div class="dm-sub m-intro" style="{F} font-size: 16.5px; line-height: 150%; color: {C["SUB"]};">{_intro_html(intro)}</div></td></tr>') if intro.strip() else ""
    wins_head = (f'<tr><td style="padding: 22px 4px 0 4px;">{_caps("MAINTENANCE&nbsp;WINDOWS", C["LBL"], "0 0 10px 0")}</td></tr>') if s.get("windows") else ""
    dist_block = (f'<div class="dm-sub" style="{F} font-size: 12.5px; line-height: 150%; color: {C["LBL"]}; padding-top: 10px;">Distribution: {_esc(s.get("dist"))}</div>') if s.get("dist") else ""
    return f"""<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
 <meta charset="UTF-8" />
 <meta name="viewport" content="width=device-width, initial-scale=1.0" />
 <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
 <meta http-equiv="X-UA-Compatible" content="IE=edge" />
 <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
 <meta name="x-apple-disable-message-reformatting" />
 <meta name="color-scheme" content="light dark" />
 <meta name="supported-color-schemes" content="light dark" />
 <title>IT Maintenance Schedule</title>
 <!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
 <style>
  html, body {{ margin: 0 !important; padding: 0 !important; width: 100% !important; }}
  table, td {{ mso-table-lspace: 0 !important; mso-table-rspace: 0 !important; border-collapse: collapse; }}
  img {{ border: 0; outline: 0; line-height: 100%; text-decoration: none; -ms-interpolation-mode: bicubic; }}
  a[x-apple-data-detectors] {{ color: inherit !important; text-decoration: none !important; }}
  @media only screen and (max-width: 520px) {{
   .m-outer {{ padding: 12px 8px !important; }}
   .m-card {{ padding: 20px 18px 6px 18px !important; }}
   .m-h1 {{ font-size: 22px !important; line-height: 125% !important; }}
   .m-intro {{ font-size: 15.5px !important; line-height: 148% !important; }}
   .m-whead {{ padding: 12px 16px 10px 16px !important; }}
   .m-wbody {{ padding: 2px 16px 8px 16px !important; }}
   .m-wtitle {{ font-size: 17.5px !important; }}
   .m-lab, .m-val {{ display: block !important; width: 100% !important; box-sizing: border-box; }}
   .m-lab {{ padding: 10px 0 2px 0 !important; border-bottom: 0 !important; }}
   .m-val {{ padding: 0 0 10px 0 !important; }}
   .m-labt {{ font-size: 12.5px !important; letter-spacing: 0.6px !important; text-transform: uppercase; font-weight: bold !important; }}
   .m-valt {{ font-size: 15px !important; line-height: 145% !important; }}
  }}
  @media (prefers-color-scheme: dark) {{
   .dm-panel {{ background-color: #2b2b2b !important; }}
   .dm-ink, .dm-ink span, .dm-ink a {{ color: #ececec !important; }}
   .dm-sub, .dm-sub span {{ color: #b9b9b9 !important; }}
  }}
 </style>
</head>
<body style="margin: 0 !important; padding: 0 !important; background-color: {C["BG"]};" bgcolor="{C["BG"]}">
 <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width: 100%; background-color: {C["BG"]};" bgcolor="{C["BG"]}">
  <tr><td class="m-outer" align="center" valign="top" style="padding: 24px 12px;">
    <!--[if mso]><table role="presentation" width="640" align="center" border="0" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
    <table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 640px; margin: 0 auto;">
     <tr><td style="padding: 0 4px 14px 4px;">
       <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width: 100%; table-layout: fixed;"><tr valign="middle">
         <td align="left" valign="middle" width="84" style="width: 84px;"><img src="{DTPS_LOGO}" width="84" style="display: block; width: 84px; max-width: 84px; height: auto; border: 0;" alt="Digital &amp; Technology Platforms" /></td>
         <td align="left" valign="middle" style="padding: 0 8px 0 10px;">
          <div class="dm-ink" style="{F} font-size: 15px; line-height: 138%; color: {C["INK"]}; font-weight: bold; letter-spacing: 0.2px;">DTPS&nbsp;IT&nbsp;OPERATIONS</div>
          <div class="dm-sub" style="{F} font-size: 14.5px; line-height: 138%; color: {C["SUB"]};">IT Maintenance</div>
         </td>
         <td align="right" valign="middle" width="70" style="width: 70px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="right" style="border-collapse: collapse;"><tr>
            <td align="center" bgcolor="{C["BTN_BG"]}" style="background-color: {C["BTN_BG"]}; border: 1px solid {C["BTN_B"]}; border-radius: 6px; padding: 4px 7px;">
             <a href="{TRANSLATE}" target="_blank" style="{F} font-size: 12px; line-height: 14px; color: {C["ACC"]}; text-decoration: none; display: block; text-align: center; font-weight: bold;">How&nbsp;to<br />Translate</a>
            </td></tr></table>
         </td></tr></table>
     </td></tr>
     <tr><td class="dm-panel m-card" style="background-color: #FFFFFF; border: 1px solid {C["BORDER"]}; border-radius: 12px; padding: 26px 26px 8px 26px;" bgcolor="#FFFFFF">
       <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
        <tr><td style="padding: 0 0 8px 0;">{_caps('PLANNED&nbsp;MAINTENANCE', C["ACC"], '0')}</td></tr>
        <tr><td style="padding: 0 0 6px 0;"><div class="dm-ink m-h1" style="{F} font-size: 25px; line-height: 126%; color: {C["INK"]}; font-weight: bold; letter-spacing: -0.2px;">{_esc(heading)}{'<br />' + _nb(period) if period else ''}</div></td></tr>
        {intro_block}
        <tr><td style="padding: 0 0 24px 0;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate;"><tr>
            <td bgcolor="{C["BAR_SOFT"]}" style="background-color: {C["BAR_SOFT"]}; border: 1px solid {C["BAR"]}; border-radius: 6px; padding: 9px 16px;"><a href="{CAL}" target="_blank" style="{F} font-size: 15px; line-height: 18px; color: {C["INK"]}; text-decoration: none; font-weight: bold; display: block;">Open IT Maintenance Calendar &#8250;</a></td>
          </tr></table>
        </td></tr>{freeze}
       </table>
     </td></tr>
     {wins_head}{wins}
     <tr><td align="center" style="padding: 18px 10px 6px 10px;">
       <div class="dm-ink" style="{F} font-size: 15.5px; line-height: 150%; color: {C["INK"]}; font-weight: bold;">Severe IT operational disruption?</div>
       <div style="{F} font-size: 15.5px; line-height: 160%;">
        <a href="tel:+35924462666" style="color: {C["ACC"]}; text-decoration: none; font-weight: bold; white-space: nowrap;">+359&nbsp;2446&nbsp;2666</a>
        <span class="dm-sub" style="color: {C["SUB"]};">&nbsp;&#183;&nbsp;</span>
        <a href="{ONDUTY}" target="_blank" style="color: {C["ACC"]}; text-decoration: none; font-weight: bold; white-space: nowrap;">24/7 On-Duty Schedule</a>
       </div>
       {dist_block}
     </td></tr>
     <tr><td align="center" style="padding: 8px 0 4px 0;"><img src="{CCHBC_LOGO}" width="108" style="display: block; width: 108px; max-width: 108px; height: auto; border: 0; margin: 0 auto;" alt="Coca-Cola HBC" /></td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
 </table>
</body>
</html>"""


def render_plain(s: Dict[str, Any]) -> str:
    heading = (s.get("heading") or STD_HEADING).upper()
    t = f"{heading} {_range(s.get('fromDate'), s.get('toDate'), True)}\n\n{str(s.get('intro') or '').replace('**', '')}\n"
    if s.get("fzOn"):
        t += f"\nCHANGE FREEZE {_range(s.get('fzFrom'), s.get('fzTo'), False)}: {s.get('fzTitle')}\n{s.get('fzDesc')}\n"
    for w in s.get("windows", []):
        hi = "[HIGH IMPORTANCE] " if w.get("high") else ""
        imp = IMPACT.get(w.get("impact", "na"), IMPACT["na"])[0]
        t += f"\n{hi}{_when_of(w)} | {w.get('title')} ({imp})\n"
        for k, l in FIELDS:
            vals = [x.replace("**", "") for x in _lines(w.get(k, ""))]
            if vals:
                t += f"{l}: {'; '.join(vals)}\n"
    return t + "\nSevere IT operational disruption: +359 2446 2666"


def subject_of(s: Dict[str, Any]) -> str:
    period = _range(s.get("fromDate"), s.get("toDate"), True)
    base = s.get("heading") or STD_HEADING
    return f"Planned Maintenance \u2013 {base}" + (f" ({period})" if period else "")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def register_maintenance_routes(app_router: APIRouter, db, compute_recipients) -> None:
    """compute_recipients: async fn(doc)->List[str] reused from the incident side
    (resolves emails from the saved countries list)."""

    def _clean(doc: Dict[str, Any]) -> Dict[str, Any]:
        doc.pop("_id", None)
        return doc

    @app_router.get("/maintenance")
    async def list_maintenance():
        rows = await db.maintenance.find({"deleted_at": None}, {"_id": 0}).sort("updated_at", -1).to_list(500)
        return rows

    @app_router.post("/maintenance")
    async def create_maintenance(body: Maintenance):
        doc = body.model_dump()
        doc.update({"id": str(uuid.uuid4()), "deleted_at": None, "sent_at": None,
                    "created_at": now_iso(), "updated_at": now_iso()})
        await db.maintenance.insert_one(dict(doc))
        return _clean(doc)

    @app_router.get("/maintenance/{mid}")
    async def get_maintenance(mid: str):
        doc = await db.maintenance.find_one({"id": mid, "deleted_at": None}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Maintenance not found")
        return doc

    @app_router.put("/maintenance/{mid}")
    async def update_maintenance(mid: str, body: Maintenance):
        patch = body.model_dump()
        patch["updated_at"] = now_iso()
        res = await db.maintenance.update_one({"id": mid, "deleted_at": None}, {"$set": patch})
        if not res.matched_count:
            raise HTTPException(404, "Maintenance not found")
        return await db.maintenance.find_one({"id": mid}, {"_id": 0})

    @app_router.delete("/maintenance/{mid}")
    async def delete_maintenance(mid: str):
        await db.maintenance.update_one({"id": mid}, {"$set": {"deleted_at": now_iso()}})
        return {"ok": True}

    @app_router.get("/maintenance/{mid}/render-html")
    async def render_maintenance_html(mid: str):
        doc = await db.maintenance.find_one({"id": mid, "deleted_at": None}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Maintenance not found")
        return {"html": render_email(doc)}

    @app_router.get("/maintenance/{mid}/render")
    async def render_maintenance(mid: str):
        doc = await db.maintenance.find_one({"id": mid, "deleted_at": None}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Maintenance not found")
        to = await compute_recipients({"values": {"countries": _as_json(doc.get("countries", []))}})
        return {"subject": subject_of(doc), "to": to, "body": render_plain(doc)}

    @app_router.post("/maintenance/{mid}/mark-sent")
    async def mark_sent_maintenance(mid: str):
        await db.maintenance.update_one({"id": mid}, {"$set": {"sent_at": now_iso()}})
        return {"ok": True}


def _as_json(lst: List[str]) -> str:
    import json
    return json.dumps(lst)
