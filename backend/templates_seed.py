# Incident communication templates, derived from the uploaded .oft Outlook
# templates (IMCR = Major Incident Communication, Non-IMCR = Service Notification).
#
# Each template has ordered `sections`. Every section is one validatable card:
# the user fills its fields, then taps "Validate & Lock". The `subject` section
# is always first. Field types: text | textarea | dropdown (dropdown has a
# `source` of "products" or "processes").

STAGES = ["INVESTIGATING", "IDENTIFIED", "RECOVERING", "MONITORING", "RESOLVED"]

STAGE_LABEL = {
    "INVESTIGATING": "Investigating",
    "IDENTIFIED": "Identified",
    "RECOVERING": "Recovering",
    "MONITORING": "Monitoring",
    "RESOLVED": "Resolved",
}

IMCR_HEADLINE = {
    "INVESTIGATING": "We are aware of an issue and are actively investigating.",
    "IDENTIFIED": "The root cause has been identified. A fix is being prepared.",
    "RECOVERING": "A fix has been applied and services are recovering.",
    "MONITORING": "The fix is in place and we are monitoring the results closely.",
    "RESOLVED": "Services have been fully restored and confirmed stable.",
}

NONIMCR_HEADLINE = {
    "INVESTIGATING": "We are experiencing technical difficulties with the affected service. Our teams are aware and are actively investigating.",
    "IDENTIFIED": "We are experiencing technical difficulties with the affected service. Our teams are aware of the issue and are working to restore normal service.",
    "RESOLVED": "The technical issue affecting the service has been resolved and the service is operating normally.",
}

ADVISORY_NOTE = (
    "This communication is provided for proactive leadership awareness. This "
    "situation is being actively managed through the standard Incident "
    "Management process and does not currently meet the criteria for "
    "declaration as an IMCR / Major Incident."
)

ADVISORY_NOTE_CLOSED = (
    "This communication is provided for proactive leadership awareness. This "
    "situation was managed to closure through the standard Incident Management "
    "process and did not meet the criteria for declaration as an IMCR / Major "
    "Incident. No further updates will follow."
)

IMCR_FOOTER = (
    "DTPS IT Operations Management · Major Incident Communication\n"
    "24/7 Global On-Duty hotline for severe IT operational disruptions\n"
    "+359 2446 2666  ·  DTPS.IT.Continuity.Mgt.Team@cchellenic.com"
)

NONIMCR_FOOTER = (
    "DTPS IT Operations · Service Notification\n"
    "Need further information? Contact DTPS SIAM."
)


def _subject_section(default):
    return {
        "key": "subject",
        "title": "Subject",
        "fields": [
            {"key": "subject", "label": "Email subject", "type": "text", "default": default,
             "placeholder": "Email subject line"},
        ],
    }


def _imcr_template(stage):
    resolved = stage == "RESOLVED"
    label = STAGE_LABEL[stage]
    subject_default = f"Major Incident Communication – Customer Portal Performance Degradation – {label}"

    sections = [
        _subject_section(subject_default),
        {
            "key": "status",
            "title": "Status Update",
            "fields": [
                {"key": "headline", "label": "Status headline", "type": "textarea",
                 "default": IMCR_HEADLINE[stage], "placeholder": "Current status headline"},
            ],
        },
        {
            "key": "incident",
            "title": "Incident",
            "fields": [
                {"key": "title", "label": "Incident title", "type": "text",
                 "default": "Customer Portal - Performance Degradation",
                 "placeholder": "e.g. Customer Portal - Performance Degradation"},
            ],
        },
        {
            "key": "timing",
            "title": "Timing",
            "fields": [
                {"key": "issue_started", "label": "Issue started", "type": "text",
                 "default": "05:23 CET, 22 May 2026", "placeholder": "HH:MM CET, DD Mon YYYY"},
                ({"key": "resolved_at", "label": "Resolved", "type": "text",
                  "default": "10:30 CET, 22 May 2026", "placeholder": "HH:MM CET, DD Mon YYYY"}
                 if resolved else
                 {"key": "next_update", "label": "Next update by", "type": "text",
                  "default": "10:30 CET, 22 May 2026", "placeholder": "HH:MM CET, DD Mon YYYY"}),
            ],
        },
        {
            "key": "description",
            "title": "Resolution Summary" if resolved else "Description",
            "fields": [
                {"key": "body", "label": "Details", "type": "textarea",
                 "default": (
                     "D365 order taking has returned to normal operations, confirmed by users "
                     "across all impacted markets. Additional hotfixes will be deployed. RCA "
                     "underway; preventive measures to follow."
                 ) if resolved else (
                     "Users may experience slow performance and intermittent timeouts when "
                     "accessing the Customer Portal. Our teams are investigating the root cause "
                     "as a priority and will share an update shortly."
                 ),
                 "placeholder": "Describe the impact / resolution"},
            ],
        },
        {
            "key": "business_impact",
            "title": "Business Impact",
            "fields": [
                {"key": "business_application", "label": "Business Application", "type": "dropdown",
                 "source": "products", "default": "CCH Customer Portal",
                 "placeholder": "Select business application"},
                {"key": "business_process", "label": "Business Process", "type": "dropdown",
                 "source": "processes", "default": "Order-to-Cash",
                 "placeholder": "Select business process"},
                {"key": "countries", "label": "Countries impacted", "type": "text",
                 "default": "AT, BG, GR, PL, IT", "placeholder": "e.g. AT, BG, GR"},
                {"key": "incident_ref", "label": "Incident reference", "type": "text",
                 "default": "INC87324 (CCH), 87234/250626 (SAP)", "placeholder": "INC number(s)"},
                {"key": "contingency", "label": "Contingency procedure used" if resolved else "Contingency procedure",
                 "type": "textarea",
                 "default": "CP-MyID-01 User Access Governance Contingency\nCP-FTD-02 Production Execution",
                 "placeholder": "Contingency procedure(s)"},
                {"key": "workaround", "label": "Workaround", "type": "text",
                 "default": "Workaround 1", "placeholder": "Workaround details"},
            ],
        },
        {
            "key": "contacts",
            "title": "Contacts",
            "fields": [
                {"key": "crisis_lead", "label": "Crisis lead", "type": "text",
                 "default": "Ibrahim Bayomi", "placeholder": "Crisis lead name"},
                {"key": "vendors", "label": "SIAM / Vendors", "type": "text",
                 "default": "OTE, NTT, Atos", "placeholder": "Vendors involved"},
            ],
        },
    ]

    return {
        "key": f"imcr_{stage.lower()}",
        "category": "IMCR",
        "stage": stage,
        "name": f"Major Incident – {label}",
        "header": "DTPS IT Operations Management · Major Incident Communication",
        "footer": IMCR_FOOTER,
        "sections": sections,
    }


def _nonimcr_template(stage):
    resolved = stage == "RESOLVED"
    label = STAGE_LABEL[stage]
    subject_default = (
        f"Service Notification – Expense Reporting (SAP Concur) – {label}"
    )

    sections = [
        _subject_section(subject_default),
        {
            "key": "advisory",
            "title": "Advisory Note",
            "fields": [
                {"key": "note", "label": "Advisory note", "type": "textarea",
                 "default": ADVISORY_NOTE_CLOSED if resolved else ADVISORY_NOTE,
                 "placeholder": "Advisory context"},
            ],
        },
        {
            "key": "notification",
            "title": "Service Notification",
            "fields": [
                {"key": "headline", "label": "Notification headline", "type": "textarea",
                 "default": NONIMCR_HEADLINE[stage], "placeholder": "Notification headline"},
                {"key": "no_action", "label": "Action required", "type": "text",
                 "default": "No action is required from you.",
                 "placeholder": "Action required from recipients"},
            ],
        },
        {
            "key": "details",
            "title": "Details",
            "fields": [
                {"key": "affected_service", "label": "Affected service", "type": "dropdown",
                 "source": "products", "default": "Payroll",
                 "placeholder": "Select affected service"},
                {"key": "business_process", "label": "Business process", "type": "dropdown",
                 "source": "processes", "default": "Purchase-to-Pay",
                 "placeholder": "Select business process"},
                {"key": "issue_started", "label": "Issue since" if resolved else "Issue started",
                 "type": "text", "default": "09:10 CET, 22 May 2026",
                 "placeholder": "HH:MM CET, DD Mon YYYY"},
            ] + ([
                {"key": "restored_at", "label": "Restored at", "type": "text",
                 "default": "12:45 CET, 22 May 2026", "placeholder": "HH:MM CET, DD Mon YYYY"},
            ] if resolved else []) + [
                {"key": "countries", "label": "Affected countries", "type": "text",
                 "default": "AT, BG, GR", "placeholder": "e.g. AT, BG, GR"},
                {"key": "incident_ref", "label": "Incident reference", "type": "text",
                 "default": "INC91422 (CCH)", "placeholder": "INC number"},
            ],
        },
        {
            "key": "contact",
            "title": "Contact",
            "fields": [
                {"key": "siam_contact", "label": "SIAM incident contact", "type": "text",
                 "default": "Ibrahim Bayomi · SIAM Incident Contact",
                 "placeholder": "SIAM contact name"},
            ],
        },
    ]

    return {
        "key": f"nonimcr_{stage.lower()}",
        "category": "NON_IMCR",
        "stage": stage,
        "name": f"Service Notification – {label}",
        "header": "DTPS IT Operations · Service Notification",
        "footer": NONIMCR_FOOTER,
        "sections": sections,
    }


def build_templates():
    templates = []
    for stage in STAGES:
        templates.append(_imcr_template(stage))
    for stage in ["INVESTIGATING", "IDENTIFIED", "RESOLVED"]:
        templates.append(_nonimcr_template(stage))
    return templates
