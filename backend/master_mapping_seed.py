"""IT Contingency Master Mapping (authoritative) — from
IT_Contingency_Master_Mapping.xlsx → 'Master Mapping' + 'CP Reference' tabs.

These 13 applications are ADDED on top of the existing contingency_map (kept).
Each row carries the rich fields the app needs: business process, formal
Contingency Procedure (CP ID / name / SharePoint link / status), owner and
countries scope. Gap apps (no formal CP) have blank contingency_text.
"""

# owner by CP ID (from the 'CP Reference' tab)
_CP_OWNER = {
    "CP-FTD-01": "Ioannis Manolopoulos",
    "CP-FTD-02": "Ioannis Manolopoulos",
    "CP-MTC-24": "Ahmed Awad Mohamed",
    "CP-MTC-14": "Lachezar Gavrilov",
    "CP-FTD-04": "Janet Markova",
    "CP-PTP-01": "Nikos Machlas",
}

# raw master rows: (application, business_process, cp_id, procedure_name,
#                    procedure_link, cp_status, mapping_status, countries_scope, platform)
_RAW = [
    (
        "SAP S/4 HANA ERP Cluster 1 (P02) / MES",
        "Production Execution",
        "CP-FTD-01",
        "Production Execution (MES, ERP, P66 failure)",
        "https://cchellenic.sharepoint.com/sites/skydoxx-bss-bssskydoxx/GovernanceDocuments/CP-FTD-01%20Production%20Execution%20(MES%2C%20ERP%2C%20P66%20failure).pptx?d=w877aaf41121e43538d3d57405a3e2405",
        "AVAILABLE",
        "VALIDATED",
        "P02 service scope",
        "Forecast to Deploy",
    ),
    (
        "SAP S/4 HANA ERP Cluster 1 (P02) / LTS",
        "Production Execution",
        "CP-FTD-02",
        "Production Execution (LTS, ERP, P66 failure)",
        "https://cchellenic.sharepoint.com/sites/skydoxx-bss-bssskydoxx/GovernanceDocuments/CP-FTD-02%20Production%20Execution%20(LTS%2C%20ERP%2C%20P66%20failure).pptx?d=wbdac99f059334cb4b5d108bef7948f33",
        "AVAILABLE",
        "VALIDATED",
        "P02 service scope",
        "Forecast to Deploy",
    ),
    (
        "SalesBuzz",
        "Market to Cash | Settlement & Billing, Credit Mgmt. & AR | Settlement | Check-in",
        "CP-MTC-24",
        "Delivery Execution on Paper (SBz failure)",
        "https://cchellenic.sharepoint.com/:p:/r/sites/skydoxx-bss-bssskydoxx/GovernanceDocuments/CP-MTC-24-Delivery%20Execution%20on%20Paper%20(SBz%20failure).pptx?d=w410a1ffe0015464ba80598da05c37276&csf=1&web=1",
        "AVAILABLE",
        "VALIDATED",
        "Egypt",
        "Market to Cash",
    ),
    (
        "Genesys",
        "Integration Order Management \u2013 Genesys",
        "CP-MTC-14",
        "Manage Inbound & Outbound Calls (CTI failure)",
        "https://cchellenic.sharepoint.com/sites/skydoxx-bss-bssskydoxx/GovernanceDocuments/CP-MTC-14%20Manage%20Inbound%20%26%20Outbound%20Calls%20(CTI%20failure).pptx?d=w40e099afdd234e86a956c59766fdd6ce",
        "AVAILABLE",
        "STRONG CANDIDATE",
        "AT, CY, CZ, SK, IT, PO, RO, Baltics, ROI, NI",
        "Market to Cash",
    ),
    (
        "BlueYonder",
        "Integrated Weekly Demand and Supply Management (D360)",
        "CP-FTD-04",
        "Create Production, Purchase and Stock Transport Orders in ERP (BlueYonder failure)",
        "https://cchellenic.sharepoint.com/:p:/r/sites/skydoxx-bss-bssskydoxx/GovernanceDocuments/CP-FTD-04%20Create%20Production%20Purchase%20and%20Stock%20Transport%20Orders%20in%20S4%20Hana%20(BlueYonder%20failure).pptx?d=wc916b05f0c9e4fbfae802f124b7914c0&csf=1&web=1",
        "AVAILABLE",
        "NEEDS APPLICABILITY VALIDATION",
        "All Countries",
        "Forecast to Deploy",
    ),
    (
        "AP Invoice Process Management",
        "Accounts Payable",
        "CP-PTP-01",
        "Post Accounts Payable Invoices in ERP (FIP failure)",
        "",
        "AVAILABLE",
        "NEEDS APPLICABILITY VALIDATION",
        "Bulgaria, Greece",
        "Procure to Pay",
    ),
    # ----- Gap apps (no formal CP → blank contingency_text) -----
    (
        "TMS / INFORM Automated Yard Management (AYM)",
        "Warehouse Management",
        "",
        "",
        "",
        "NOT IDENTIFIED",
        "GAP / VALIDATE",
        "Italy, Romania, Czech Republic, Austria",
        "Contingency \u2013 Gap",
    ),
    (
        "SIRVIS",
        "Order-to-Cash",
        "",
        "",
        "",
        "NOT IDENTIFIED",
        "GAP / VALIDATE",
        "Italy",
        "Contingency \u2013 Gap",
    ),
    (
        "Customer Portal",
        "Market-to-Cash",
        "",
        "",
        "",
        "WORKAROUND ONLY",
        "GAP / VALIDATE",
        "All Countries",
        "Contingency \u2013 Gap",
    ),
    (
        "Plant Network Connectivity",
        "Warehouse Operations - Distribution & Logistics; SAP Printing; Vision Picking",
        "",
        "Network Traffic Prioritization",
        "",
        "WORKAROUND ONLY",
        "VALID INCIDENT EVIDENCE",
        "Greece - Schimatari",
        "Contingency \u2013 Gap",
    ),
    (
        "Azure Contract Management System (CMS) \u2013 Commercial",
        "Creation, approval and archiving of contracts in Commercial",
        "",
        "",
        "",
        "WORKAROUND ONLY",
        "NEEDS VALIDATION",
        "Romania, Bulgaria, Croatia, Slovenia, Bosnia and Herzegovina",
        "Contingency \u2013 Gap",
    ),
    (
        "Network Connectivity (Azure Firewalls)",
        "Connectivity to listed Azure-hosted services",
        "",
        "",
        "",
        "NOT AVAILABLE",
        "VALID INCIDENT EVIDENCE",
        "Multi-country / All Countries",
        "Contingency \u2013 Gap",
    ),
    (
        "Supply Chain Planning SCP",
        "Business Process not identified",
        "",
        "",
        "",
        "NEEDS VALIDATION",
        "EXCLUDED FROM CLEAN MASTER",
        "AT, BG, RO, HU",
        "Contingency \u2013 Gap",
    ),
]


def _contingency_text(cp_id: str, procedure_name: str, mapping_status: str) -> str:
    """Compose the auto-fill contingency string. Blank for gap apps (no CP ID)."""
    if cp_id:
        return f"{cp_id} \u00b7 {procedure_name} \u00b7 {mapping_status}"
    return ""


MASTER_CONTINGENCY = []
for (app, bp, cp_id, pname, plink, cp_status, map_status, scope, _platform) in _RAW:
    MASTER_CONTINGENCY.append({
        "product": app,
        "process": bp,
        "failed_system": "",
        "owner": _CP_OWNER.get(cp_id, ""),
        "cp_id": cp_id,
        "procedure_name": pname,
        "procedure_link": plink,
        "cp_status": cp_status,
        "mapping_status": map_status,
        "countries_scope": scope,
        "contingency_text": _contingency_text(cp_id, pname, map_status),
        "source": "master",
    })

# distinct applications (name + platform) to ensure in the product catalog
MASTER_PRODUCTS = []
_seen_p = set()
for (app, _bp, _cp, _pn, _pl, _cs, _ms, _sc, platform) in _RAW:
    if app not in _seen_p:
        _seen_p.add(app)
        MASTER_PRODUCTS.append({"name": app, "platform": platform})

# distinct business processes to ensure in the process catalog
MASTER_PROCESSES = []
_seen_bp = set()
for row in MASTER_CONTINGENCY:
    bp = row["process"]
    if bp and bp not in _seen_bp:
        _seen_bp.add(bp)
        MASTER_PROCESSES.append(bp)
