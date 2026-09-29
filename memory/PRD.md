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
