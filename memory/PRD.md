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

## Iteration 5 (2026-06) — Formatted (HTML) email matching the corporate template
- Backend GET /drafts/{id}/render-html builds a styled HTML email mirroring the uploaded .oft templates: font stack Aptos/Calibri/Helvetica, status pipeline row (active stage coloured), status headline band, ISSUE STARTED box (dark-red border) + NEXT UPDATE/RESOLVED box (grey border), tinted description block, Business Impact bordered table, cream contingency box, bordered Crisis Lead/Vendors boxes, footer. Colours taken from the templates (#f9f9f9 page, #E8ECF0 pipeline, #8E0B0B, #FDF2D7/#FCFBF7, #515151). STAGE_COLOR map per stage.
- Preview now renders the HTML in a react-native-webview (dynamic height via injected scrollHeight); web preview shows a "not supported" placeholder (WebView is native-only).
- Sending: mailto cannot carry HTML, so "Open in Outlook & paste" copies the formatted HTML to the clipboard as rich text (expo-clipboard StringFormat.HTML) and opens Outlook with To + Subject prefilled; user pastes the styled template into the body. Also a standalone "Copy formatted email" button.
- New dep: react-native-webview, expo-clipboard.

## Iteration 6 (2026-06) — Template encoding fix
- Fixed UTF-8 mojibake in rendered template: header middle-dot '·' showed as 'Â·' and subject en-dash '–' as 'â€"'. Root cause: generated HTML had no charset declaration so WebView decoded UTF-8 as Latin-1. Added <meta charset="utf-8"> + Content-Type meta to _render_html() head in server.py. Verified 53/53 backend tests, byte-level clean.

## Iteration 7 (2026-06) — Outlook 365 / Microsoft Graph "Create draft" flow
- Replaced the copy-to-clipboard + mailto flow ENTIRELY with a true Outlook integration: the app creates a fully-formatted DRAFT in the shared mailbox dtps.it.continuity.mgt.team@cchellenic.com; user opens Outlook desktop and presses Send (no paste, no format loss). Target = Outlook desktop on laptop.
- Auth: expo-auth-session PKCE (frontend/src/msauth.ts) → backend exchanges code (backend/outlook.py), stores refresh/access tokens encrypted (Fernet) in db.ms_tokens keyed by sha256(session). Scopes: openid profile offline_access User.Read Mail.ReadWrite.Shared Mail.Send.Shared.
- Graph: POST /users/{shared-mailbox}/messages with HTML body + fixed from = shared mailbox (never client-supplied). 401/403 → clear error telling user IT must grant Full Access + Send As + admin consent.
- Backend endpoints (all /api): GET /outlook/config, POST /auth/microsoft/exchange, GET /auth/microsoft/me, POST /outlook/drafts/{draft_id}.
- Config via backend/.env: ENTRA_TENANT_ID, ENTRA_CLIENT_ID (BOTH EMPTY — user's IT must fill), SHARED_MAILBOX, TOKEN_ENCRYPTION_KEY (generated). Frontend fetches /outlook/config; button disabled + "not configured" until IDs present.
- Redirect URI to register in Azure: native = frontend://oauth/callback ; web SPA = https://<deployed-domain>/oauth/callback.
- HARD LIMITS: corporate OAuth does NOT work in Expo Go / web preview — needs a native build. Only creates a DRAFT (never sendMail).
- New deps: expo-auth-session, expo-crypto. cryptography (backend, already present).
- PENDING FROM USER/IT: tenant ID + client ID GUIDs, admin consent, then build. Send As on the shared mailbox already confirmed granted.

## Iteration 8 (2026-06) — Compose dropdown + countries fixes
- Fixed unreachable search bar in Business Application / Business Process dropdown: rebuilt SelectSheet to mirror the working CountrySheet (single BottomSheetView flex → fixed header with search on top → BottomSheetScrollView list; was BottomSheetView + BottomSheetFlatList siblings which pushed the search off-screen). snapPoint 85%. This also restores type-to-add so business processes (and products) can be entered manually.
- Countries now render one-per-line in the email: _format_countries joins with "\n" (→ <br> in HTML via _esc); compose locked-value also shows one-per-line. Verified render-html contains Austria<br>Greece<br>Poland.
- Verified: 71/71 backend tests + frontend flows (search reachable, manual add, filter, Validate & Lock).

## Iteration 9 (2026-06) — Primary "Open in Outlook app" (mobile, no Azure)
- User dropped Azure as the primary path; wants the already-signed-in Outlook MOBILE app. Added PRIMARY button "Open in Outlook app" (preview/[id].tsx, testID open-outlook-app-btn) that opens ms-outlook://compose?to&subject&body (plain-text body via /render), falls back to mailto:. No paste, no Azure. After open → afterDraftCreated (markSent + schedule reminders + navigate).
- HARD LIMIT explained to user: Outlook mobile compose deep link is plain-text only (cannot carry HTML formatting). User accepted plain formatting for the one-tap flow.
- Kept the Azure/Graph "Create formatted draft in Outlook 365" as SECONDARY button (create-draft-btn), shows "setup pending" until ENTRA IDs configured.
- Added LSApplicationQueriesSchemes ["ms-outlook","mailto"] to app.json ios.infoPlist for canOpenURL.
- Native-only: deep link works only on a real device with Outlook installed (no-ops on web preview). Verified 79/79 backend + both buttons render, no regressions.

## Iteration 10 (2026-06) — Contingency: multi-process picker + relationship review
- Reviewed Application↔Business Process relationship: contingency_map = 37 rows / 28 apps. 7 apps map to MULTIPLE processes (Master Data Platform ×4 [3 "Customer management" distinguished by failed_system], IOM, SFA, SalesBuzz Egypt, Big Data Platform-BW, Production Operations, Tax & Compliance). 21 apps map to a single process. Data integrity clean: all contingency products/processes exist in catalogs, no orphans/typos. Note: product catalog has 150 apps but only 28 have contingency mappings — the other 122 (reporting, HR, security, etc.) have no mapped process by design; selecting them auto-fills nothing and the user types the process manually.
- NEW: ContingencyPickerSheet (frontend/src/components/ContingencyPickerSheet.tsx) — when a selected Business Application maps to >1 contingency process, a bottom sheet "Choose business process" lists each process with a Failed system / Owner subtitle; choosing one fills business_process + crisis_lead (owner) + contingency (failed system) for THAT specific row. Single-process apps auto-fill directly; apps with no mapping do nothing. Refactored autofillFromContingency + extracted applyContingencyRow in compose/[id].tsx.
- Bug fixed during build: phosphor 'Path' icon is exported as 'PathIcon' (undefined as Path → "Element type is invalid" red screen); swapped to 'GitBranch'.
- Verified: 11/11 backend + 4/4 frontend flows; no regressions.

## Iteration 11 (2026-06) — Export Application↔Process↔Contingency mapping (.xlsx)
- Added GET /api/contingency/export (server.py) → styled .xlsx via openpyxl + StreamingResponse. Library tab "Export contingency mapping" card (library.tsx, testID export-contingency-btn): web → Linking.openURL; native → expo-file-system/legacy downloadAsync to cache + expo-sharing share sheet. New deps: expo-file-system, expo-sharing. api.ts exports contingencyExportUrl.
- IMPORTANT data note: an application is linked to a business process ONLY via contingency_map; products carry just name+platform (no process field). BUSINESS_PROCESSES (36) ARE the contingency processes. So no app→process mapping exists outside contingency.
- Per user request ("confirm mapping even if there is no contingency plan"), export now LEFT-JOINS all applications: EVERY app (150) is a row. Columns: Platform | Business Application | Business Process | Contingency Plan (Failed System) | Owner | Has Contingency Plan. Apps with a plan → 'Yes' (one row per process, 37 rows); apps without → 'No' with blank process/plan/owner (122 rows); total 159 data rows. Contingency products not in the catalog are appended so none are lost.
- Cleaned Mongo of testing-agent pollution (TEST_/QA_/E2E named products/processes/countries) and restored legit product 'E2E Connected Enterprise Planning' → products back to exactly 150.
- Verified: 9/9 backend tests (new export spec + regressions), product count 150.

## Iteration 12 (2026-06) — IT Contingency Master Mapping integrated
- Parsed uploaded IT_Contingency_Master_Mapping.xlsx (Master Mapping + CP Reference tabs). Added 13 authoritative apps ON TOP of existing 37 (user: keep both). New backend/master_mapping_seed.py (MASTER_CONTINGENCY/PRODUCTS/PROCESSES) + idempotent seed_master_mapping() in server.py (runs every startup; upserts products/processes/contingency keyed by product+cp_id+source=master).
- Rich contingency fields now flow through GET /contingency: cp_id, procedure_name, procedure_link, cp_status, mapping_status, countries_scope, contingency_text, owner. Compose auto-fill (applyContingencyRow) uses contingency_text ("CP-ID · Procedure · Status") when present, else legacy "Failed system: X"; GAP apps (no CP) leave Contingency blank (user decision). ContingencyPickerSheet subtitle shows CP-ID/status/owner/scope. api.ts Contingency type extended.
- Export updated: plan column uses contingency_text/procedure_name/failed_system; "Has Contingency Plan" flag now = Yes only if an actual plan exists (gap apps → No). Products catalog now 162 (150 base + 12 net-new master apps; 'Customer Portal' overlapped).

## Iteration 13 (2026-06) — NEW MODULE: IT Maintenance Builder (Planned Maintenance)
- Second email type alongside incidents. New "Maintenance" tab. Ported verbatim from uploaded IT_Maintenance_Builder.html (same Outlook markup, colours, DTPS/CCHBC logos, fixed links Calendar/On-Duty/Translate) → backend/maintenance_assets.py + backend/maintenance.py (render_email/render_plain/subject_of + CRUD).
- Backend endpoints (/api): GET/POST /maintenance, GET/PUT/DELETE /maintenance/{id}, GET /maintenance/{id}/render-html, GET /maintenance/{id}/render (subject/to/body), POST /maintenance/{id}/mark-sent. Mongo collection `maintenance`. Recipients reuse _compute_recipients via saved countries.
- Frontend: app/(tabs)/maintenance.tsx (list + New), app/maintenance/[id].tsx (builder: Message heading/period/intro, Distribution countries+line, repeatable windows with title, start/end text + tz pills, impact pills, high-importance switch, IT service + Business process dropdowns reusing products/processes with free-text add + contingency auto-fill, per-window countries/contingency/note), app/maintenance/preview/[id].tsx (WebView + 'Open in Outlook app' deep link + 'Copy formatted email'). Debounced autosave.
- api.ts: Maintenance types + hooks (useMaintenanceList/useMaintenance/useCreate/useUpdate/useDelete/useMarkMaintenanceSent, fetchMaintenanceRender/Html, blankWindow).
- NOT in v1 (future): Change-freeze editor UI (backend supports it), reusable Service-template presets, datetime pickers (plain text YYYY-MM-DD[THH:MM] for now).
- Verified: 18/18 backend tests + frontend smoke (tab, list, create→builder, add window, dropdowns, preview). ms-outlook deep link + WebView are native-only (web shows placeholder).
- PENDING USER UPLOAD follow-up: none outstanding.
