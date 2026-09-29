import io
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import openpyxl
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, UploadFile, File
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from seed_data import BUSINESS_PROCESSES, CONTINGENCY_MAP, PRODUCTS
from templates_seed import build_templates

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class ProductCreate(BaseModel):
    name: str
    platform: str = "Custom"


class ProcessCreate(BaseModel):
    name: str


class DraftCreate(BaseModel):
    template_id: str


class DraftUpdate(BaseModel):
    values: Optional[Dict[str, Any]] = None
    validations: Optional[Dict[str, bool]] = None
    recipients: Optional[str] = None


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------
async def seed_database():
    if await db.products.count_documents({}) == 0:
        docs = [
            {"id": new_id(), "name": p["name"], "platform": p["platform"],
             "custom": False, "deleted_at": None, "created_at": now_iso()}
            for p in PRODUCTS
        ]
        if docs:
            await db.products.insert_many(docs)
        logger.info("Seeded %d products", len(docs))

    if await db.business_processes.count_documents({}) == 0:
        docs = [
            {"id": new_id(), "name": name, "custom": False,
             "deleted_at": None, "created_at": now_iso()}
            for name in BUSINESS_PROCESSES
        ]
        if docs:
            await db.business_processes.insert_many(docs)
        logger.info("Seeded %d business processes", len(docs))

    if await db.contingency_map.count_documents({}) == 0:
        docs = [
            {"id": new_id(), "product": m["product"], "process": m["process"],
             "failed_system": m["failed_system"], "owner": m["owner"]}
            for m in CONTINGENCY_MAP
        ]
        if docs:
            await db.contingency_map.insert_many(docs)
        logger.info("Seeded %d contingency map rows", len(docs))

    # Templates: reseed every startup so structure changes propagate.
    templates = build_templates()
    for t in templates:
        t["id"] = t["key"]
        await db.templates.replace_one({"key": t["key"]}, t, upsert=True)
    logger.info("Seeded %d templates", len(templates))


@app.on_event("startup")
async def on_startup():
    await seed_database()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
@api_router.get("/products")
async def list_products():
    cursor = db.products.find({"deleted_at": None}, {"_id": 0}).sort("name", 1)
    items = await cursor.to_list(2000)
    return items


@api_router.post("/products")
async def create_product(payload: ProductCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    existing = await db.products.find_one({"name": name, "deleted_at": None})
    if existing:
        existing.pop("_id", None)
        return existing
    doc = {"id": new_id(), "name": name, "platform": payload.platform.strip() or "Custom",
           "custom": True, "deleted_at": None, "created_at": now_iso()}
    await db.products.insert_one(dict(doc))
    return doc


@api_router.delete("/products/{item_id}")
async def delete_product(item_id: str):
    res = await db.products.update_one({"id": item_id}, {"$set": {"deleted_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Business processes
# ---------------------------------------------------------------------------
@api_router.get("/business-processes")
async def list_processes():
    cursor = db.business_processes.find({"deleted_at": None}, {"_id": 0}).sort("name", 1)
    return await cursor.to_list(2000)


@api_router.post("/business-processes")
async def create_process(payload: ProcessCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    existing = await db.business_processes.find_one({"name": name, "deleted_at": None})
    if existing:
        existing.pop("_id", None)
        return existing
    doc = {"id": new_id(), "name": name, "custom": True,
           "deleted_at": None, "created_at": now_iso()}
    await db.business_processes.insert_one(dict(doc))
    return doc


@api_router.delete("/business-processes/{item_id}")
async def delete_process(item_id: str):
    res = await db.business_processes.update_one({"id": item_id}, {"$set": {"deleted_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Process not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------
@api_router.get("/templates")
async def list_templates(category: Optional[str] = None):
    query: Dict[str, Any] = {}
    if category:
        query["category"] = category
    cursor = db.templates.find(query, {"_id": 0})
    return await cursor.to_list(100)


@api_router.get("/templates/{template_id}")
async def get_template(template_id: str):
    doc = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    return doc


# ---------------------------------------------------------------------------
# Drafts
# ---------------------------------------------------------------------------
def _default_values(template: Dict[str, Any]) -> Dict[str, Any]:
    values: Dict[str, Any] = {}
    for section in template["sections"]:
        for field in section["fields"]:
            values[field["key"]] = field.get("default", "")
    return values


@api_router.post("/drafts")
async def create_draft(payload: DraftCreate):
    template = await db.templates.find_one({"id": payload.template_id}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    doc = {
        "id": new_id(),
        "template_id": template["id"],
        "template_name": template["name"],
        "category": template["category"],
        "stage": template["stage"],
        "values": _default_values(template),
        "validations": {},
        "recipients": "",
        "deleted_at": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.drafts.insert_one(dict(doc))
    return doc


@api_router.get("/drafts")
async def list_drafts():
    cursor = db.drafts.find({"deleted_at": None}, {"_id": 0}).sort("updated_at", -1)
    drafts = await cursor.to_list(500)
    # attach validation progress
    for d in drafts:
        template = await db.templates.find_one({"id": d["template_id"]}, {"_id": 0})
        total = len(template["sections"]) if template else 0
        validated = sum(1 for v in d.get("validations", {}).values() if v)
        d["progress"] = {"validated": validated, "total": total}
    return drafts


@api_router.get("/drafts/{draft_id}")
async def get_draft(draft_id: str):
    doc = await db.drafts.find_one({"id": draft_id, "deleted_at": None}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Draft not found")
    template = await db.templates.find_one({"id": doc["template_id"]}, {"_id": 0})
    doc["template"] = template
    return doc


@api_router.put("/drafts/{draft_id}")
async def update_draft(draft_id: str, payload: DraftUpdate):
    doc = await db.drafts.find_one({"id": draft_id, "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Draft not found")
    update: Dict[str, Any] = {"updated_at": now_iso()}
    if payload.values is not None:
        update["values"] = payload.values
    if payload.validations is not None:
        update["validations"] = payload.validations
    if payload.recipients is not None:
        update["recipients"] = payload.recipients
    await db.drafts.update_one({"id": draft_id}, {"$set": update})
    updated = await db.drafts.find_one({"id": draft_id}, {"_id": 0})
    return updated


@api_router.delete("/drafts/{draft_id}")
async def delete_draft(draft_id: str):
    res = await db.drafts.update_one({"id": draft_id}, {"$set": {"deleted_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Draft not found")
    return {"ok": True}


def _render_body(template: Dict[str, Any], values: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append(template.get("header", ""))
    lines.append("")
    for section in template["sections"]:
        if section["key"] == "subject":
            continue
        section_lines: List[str] = []
        single_field = len(section["fields"]) == 1
        for field in section["fields"]:
            val = str(values.get(field["key"], "") or "").strip()
            if not val:
                continue
            if single_field and field["type"] == "textarea":
                section_lines.append(val)
            else:
                section_lines.append(f"{field['label']}: {val}")
        if section_lines:
            lines.append(f"── {section['title'].upper()} ──")
            lines.extend(section_lines)
            lines.append("")
    lines.append("—")
    lines.append(template.get("footer", ""))
    return "\n".join(lines).strip()


@api_router.get("/drafts/{draft_id}/render")
async def render_draft(draft_id: str):
    doc = await db.drafts.find_one({"id": draft_id, "deleted_at": None}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Draft not found")
    template = await db.templates.find_one({"id": doc["template_id"]}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    values = doc.get("values", {})
    subject = str(values.get("subject", "") or doc.get("template_name", "")).strip()
    body = _render_body(template, values)
    return {"subject": subject, "body": body, "recipients": doc.get("recipients", "")}


# ---------------------------------------------------------------------------
# Excel import
# ---------------------------------------------------------------------------
@api_router.post("/import/excel")
async def import_excel(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Please upload an .xlsx file")
    content = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read spreadsheet: {exc}")

    added_products = 0
    added_processes = 0

    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue
        header = [str(c).strip().lower() if c is not None else "" for c in rows[0]]

        def col_index(*names):
            for n in names:
                if n in header:
                    return header.index(n)
            return None

        product_col = col_index("product", "products", "business application",
                                "application", "affected service", "service",
                                "catalog product")
        platform_col = col_index("platform", "category", "group")
        process_col = col_index("business process", "process", "processes")

        for row in rows[1:]:
            if not row:
                continue
            if product_col is not None and product_col < len(row):
                name = row[product_col]
                if name and str(name).strip() and str(name).strip().lower() not in ("not in catalog", "none", "n/a"):
                    name = str(name).strip()
                    platform = "Imported"
                    if platform_col is not None and platform_col < len(row) and row[platform_col]:
                        platform = str(row[platform_col]).strip()
                    exists = await db.products.find_one({"name": name, "deleted_at": None})
                    if not exists:
                        await db.products.insert_one({
                            "id": new_id(), "name": name, "platform": platform,
                            "custom": True, "deleted_at": None, "created_at": now_iso(),
                        })
                        added_products += 1
            if process_col is not None and process_col < len(row):
                pname = row[process_col]
                if pname and str(pname).strip():
                    pname = str(pname).strip()
                    exists = await db.business_processes.find_one({"name": pname, "deleted_at": None})
                    if not exists:
                        await db.business_processes.insert_one({
                            "id": new_id(), "name": pname, "custom": True,
                            "deleted_at": None, "created_at": now_iso(),
                        })
                        added_processes += 1

    return {"added_products": added_products, "added_processes": added_processes}


@api_router.get("/contingency")
async def contingency_lookup(product: Optional[str] = None, process: Optional[str] = None):
    query: Dict[str, Any] = {}
    if product:
        query["product"] = product
    if process:
        query["process"] = process
    if not query:
        return []
    cursor = db.contingency_map.find(query, {"_id": 0})
    return await cursor.to_list(50)


@api_router.get("/")
async def root():
    return {"message": "OpsComm API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
