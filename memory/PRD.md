# OpsComm — Major Incident Communication App

## Original Problem Statement
Build a mobile app to fulfil incident-communication templates where every paragraph
and subject must be validated. Products and business processes come from an uploaded
Excel file as dropdown menus; the user can also add any product/process. The finished
communication is opened in the device email app (Outlook/Mail) to send.

## Architecture
- **Frontend:** Expo Router (React Native), bottom tabs, @tanstack/react-query,
  @gorhom/bottom-sheet, phosphor icons, react-native-keyboard-controller.
- **Backend:** FastAPI + MongoDB (motor). Data seeded from the uploaded workbooks.
- **Email:** device mail app via `mailto:` (Linking) — user sends manually.

## Source data (from user's uploaded files)
- 4 IMCR (.oft) "Major Incident Communication" templates + 2 Non-IMCR "Service
  Notification" templates → modelled as structured templates with validatable sections.
- `Products_by_Platform.xlsx` and `Contingency_Business_Processes_vs_Products.xlsx`:
  150 Business Applications (grouped by platform), 36 Business Processes, and a
  contingency map (product → process → failed system → owner).

## Data model
- `products` {id,name,platform,custom,deleted_at}
- `business_processes` {id,name,custom,deleted_at}
- `contingency_map` {id,product,process,failed_system,owner}
- `templates` {id,key,category(IMCR/NON_IMCR),stage,name,header,footer,sections[]}
  sections → validatable cards; fields type text|textarea|dropdown(source products/processes)
- `drafts` {id,template_id,category,stage,values,validations,recipients,deleted_at,updated_at}

## Key API (all /api)
- GET/POST/DELETE products, business-processes
- GET templates, templates/{id}
- POST/GET/PUT/DELETE drafts, GET drafts/{id}/render
- POST import/excel (multipart .xlsx)
- GET contingency?product=&process=

## Implemented (2026-06)
- Templates tab: IMCR / Non-IMCR segmented, grouped by status stage, status pills.
- Compose: per-section "Validate & Lock" (locks inputs, green border, edit to unlock),
  searchable Business Application / Business Process dropdowns with add-new, progress
  footer, Send disabled until all sections validated.
- Email preview + recipients, "Open in Outlook" via mailto.
- Drafts tab: resume/delete, progress pill.
- Library tab: manage applications & processes (add/delete), Import from Excel.

## Backlog / Next
- P1: Auto-suggest Business Process, Contingency Procedure & Crisis Lead (owner) from the
  contingency_map when a Business Application is selected.
- P2: Duplicate a resolved draft to start a follow-up update; recipient groups/distribution lists.
- P2: Rich HTML email export matching the original .oft styling.

## Iteration 3 (2026-06) — Incident lifecycle, countries, branding, reminders
- Coca-Cola HBC branding (brand red in theme.ts, BrandMark wordmark in headers).
- Countries multi-select (from Crisis_Distribution_List.xlsx) drives body line + recipients.
- Recipient rules: Non-IMCR = dtps.siam + DTPS.Country.Platform.Directors + per-country platform_directors + manual product_team/sre. IMCR = same + per-country country_dl + country_dtps + dwt_leader.
- Incident lifecycle: linked thread; start template => incident + first draft; "Post next update" picks next stage, prefills from previous update, validations RESET. Timeline view, mark-sent, resolve.
- On-device scheduled reminders 1h after send + optional "Next update by" time; deep-links to incident; cancelled on resolve. Device/build only.
- Emergent server-push plumbing (POST /register-push, send_push) — deploy-ready, needs google-services.json + build. EMERGENT_PUSH_KEY=placeholder in backend/.env (never edit; deployer sets it).
- Compose validation race FIXED: local state + debounced autosave; useUpdateDraft invalidates only ['drafts'].
- New collections: incidents, countries, contingency_map. drafts gain incident_id/sequence/sent_at.
- New API: /incidents (+updates,/mark-sent), /countries CRUD, /register-push, /contingency.
- Tabs: Templates, Incidents (replaced Drafts), Library (Applications/Processes/Countries + Excel import).
- Backend tests: 43/43 passing (test_countries_and_recipients.py, test_incidents_and_push.py).

## Backlog / Next
- P1: Auto-suggest Business Process / Contingency Procedure / Crisis Lead (owner) from contingency_map on Business Application select.
- P2: Branded HTML email export matching original .oft styling.
- P2: Editable country DLs in Library (custom countries currently name-only).

## Iteration 4 (2026-06) — Snooze, auto-fill, country picker, stage fix
- Snooze: reminder notifications carry "incident-reminder" category with Snooze 15m/30m action buttons; incident detail banner also has 15m/30m snooze chips (snoozeIncidentReminder reschedules). Device/build only.
- Auto-fill contingency: selecting a Business Application in compose calls GET /contingency?product= and fills business_process (=process), crisis_lead (=owner), contingency (=failed system) — only for UNLOCKED sections; shows a toast.
- Country picker rebuilt as header→BottomSheetScrollView→footer (no overlap); each country is an individual tick row.
- Stage order/content corrected per user: order is now IDENTIFIED → INVESTIGATING → RECOVERING → MONITORING → RESOLVED, and the Identified/Investigating headline messages were swapped (Identified = "We are aware of an issue and are actively investigating."; Investigating = "The root cause has been identified…"). Applied to STAGES + both frontend STAGE_ORDER arrays + IMCR/NONIMCR headline seeds.
