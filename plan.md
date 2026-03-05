# Feature Implementation Plan

**Overall Progress:** `60%`

## TLDR
Design and implement an inline, per-segment script editing + audio regeneration experience on the job detail page, so users can tweak small parts of the script and re-generate only the affected audio clips without leaving the app or touching curl.

## Done (this session)
- **Dashboard:** Drag-and-drop video upload to `/input` via `/api/upload`; scan supports `.mov` and `.mp4`.
- **Job detail:** Segment model `{ index, start, end, text, audioUrl }`, draft state per segment, inline textarea + Save + Regenerate audio per segment; PATCH `/api/jobs/[id]/script/segment` and per-segment POST to `/api/jobs/[id]/audio?offset=&limit=1` with cache-bust after regenerate.

## Critical Decisions
Key architectural/implementation choices made during exploration:
- Decision 1: **Inline per-segment editor** instead of a single big textarea – aligns script editing directly with each timestamp and audio clip.
- Decision 2: **Per-segment “Regenerate audio” actions** that call the existing offset/limit API instead of bulk re-generation – faster and cheaper.
- Decision 3: **Keep script.md as the source of truth**, editing it on disk and treating ElevenLabs audio as a derived artifact that can always be re-generated.
- Decision 4: **No in-UI waveform or heavy preview in V1** – just compact text + small audio controls to keep the UI simple and fast.

## Tasks:

- [x] 🟩 **Step 1: UX and interaction design**
  - [x] 🟩 Define how each row looks: timestamp label, inline script text, mini audio player, and action buttons.
  - [x] 🟩 Decide when rows are editable (always vs “Edit mode” toggle) and how we show unsaved vs saved changes.
  - [x] 🟩 Specify error/success feedback for per-segment regeneration (toasts, inline status text).

- [x] 🟩 **Step 2: Segment metadata model on the client**
  - [x] 🟩 Parse `script.md` into a client-side array of `{ index, start, end, text, audioUrl }`.
  - [x] 🟩 Derive audio URL from job id and segment times; cache-bust after regenerate.
  - [x] 🟩 Keep a parallel `draftText` state per segment for inline edits (separate from the persisted script).

- [x] 🟩 **Step 3: Inline script editing UX**
  - [x] 🟩 Render each segment’s text inline (small multiline textarea) with a subtle border.
  - [x] 🟩 Support “Edit → Save” per segment (Save shown when draft differs from saved).
  - [x] 🟩 On save, PATCH `/api/jobs/[id]/script/segment` to patch that segment’s text in `script.md`, then refetch segments.

- [x] 🟩 **Step 4: Per-segment audio regeneration from the UI**
  - [x] 🟩 Add a “Regenerate audio” button next to each segment, disabled while a regeneration is in flight.
  - [x] 🟩 Wire the button to call the existing `/api/jobs/[id]/audio` API using `offset=index` and `limit=1`.
  - [x] 🟩 After success, refresh that segment’s audio URL (cache-bust query param) so the player picks up the new file.

- [ ] 🟥 **Step 5: Batch regeneration quality-of-life**
  - [ ] 🟥 Allow multi-select (checkboxes) and a “Regenerate selected” action that calls the API with `offset` and `limit` spanning the selected range.
  - [ ] 🟥 Indicate progress when multiple segments are being regenerated (e.g., simple “3 of 5 regenerated…” status).
  - [ ] 🟥 Handle mixed success/failure and surface which specific segments failed to regenerate.

- [ ] 🟥 **Step 6: Script view and navigation helpers**
  - [ ] 🟥 Add a compact “View full script.md” link that opens the raw file path in the editor (for power users).
  - [ ] 🟥 Provide quick-jump controls (e.g., dropdown of timestamps) to scroll to a given segment in the UI.
  - [ ] 🟥 Ensure the inline list stays readable for long scripts (virtualization or paging later if needed).

- [ ] 🟥 **Step 7: Validation and polish**
  - [ ] 🟥 Confirm that editing + regenerating a segment updates only that segment’s audio file on disk.
  - [ ] 🟥 Verify that timestamps remain in sync with edited text (or clearly document that timing isn’t auto-adjusted yet).
  - [ ] 🟥 Do a light UX pass: spacing, typography, and responsive behavior for smaller viewports.
