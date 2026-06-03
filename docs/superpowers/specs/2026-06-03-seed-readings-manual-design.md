# Seed Readings Implementation — Manual Setup in Settings

**Date**: 2026-06-03  
**Status**: Design (ready for implementation)

---

## Overview

Add seed reading functionality to Settings pages on both mobile and website. Seed readings are baseline readings for main meter properties — required before creating billing cycles. Users manually access the seed form from Settings (not auto-detected on readings page).

### Key Constraint
**Seed form in Settings only**: Mobile CaptureReadings focuses on regular readings. Seed functionality is a separate, manual operation in Settings. When user selects a meter group, the form auto-detects and displays main meter properties (already-seeded ones hidden).

---

## Backend Context

- `POST /readings/seed` endpoint exists, enforces one seed per property+meter_group+current_version
- Returns 409 Conflict if attempting to seed a property that already has a reading for that version
- Backend validates: property must be `is_main_meter: true`
- Readings batch endpoint rejects main meter properties entirely
- `validateSeedCreate()` checks current meter version only (allows re-seeding after meter reset)

---

## Mobile Implementation

### CaptureReadings Screen (No Changes to Seed)
Keep as-is: simple 3-step wizard for regular readings only
- Step 1: Select meter group + reading date
- Step 2: Enter readings for properties in meter group
- Step 3: Review and submit via `POST /readings/batch`

Properties filtered by meter group association (existing logic).

### Settings Page (Reorganized)

**4-Tier Structure:**
1. **Account** — User profile info, sign out
2. **Reading Operations** — Seed Readings form
3. **System** — Clear Cache button
4. **Configuration** — (reserved for future)

### Seed Readings Form (in Reading Operations)

**Workflow:**
1. User opens Settings → Reading Operations → Seed Readings
2. User selects meter group dropdown
3. Form auto-fetches readings for that meter group
4. Form displays all main meter properties EXCEPT those already seeded for current version
5. User enters reading amount + optional Capacitor Camera photo for each unseeded main meter
6. Submit via `POST /readings/seed` for each property (parallel calls via Promise.all)

**Error Handling:**
- Show message "All main meters for this meter group have been seeded" if no unseeded main meters exist
- Catch 409 from backend (if UI state drifts): "This property was seeded elsewhere. Refresh to update."

---

## Website Implementation

### Readings Page
- **Remove** seed form/button completely
- Keep only batch readings form for regular readings

### Settings Page (Reorganized)

**Same 4-Tier Structure as Mobile:**
1. **Account** — User profile, sign out (if applicable)
2. **Reading Operations** — Seed Readings form
3. **System** — Cache Management
4. **Configuration** — Payment QR Code, User Management

### Seed Readings Form (in Reading Operations)

**Workflow:**
1. User opens Settings → Reading Operations → Seed Readings
2. User selects meter group dropdown
3. Form auto-fetches readings for that meter group
4. Property dropdown shows only main meters that have NOT been seeded for current version
5. User enters reading amount + upload image file for each unseeded main meter
6. Submit via `POST /readings/seed`

**Error Handling:**
- Show message "All main meter properties for this meter group have been seeded" if none available
- Catch 409 from backend: "This property has already been seeded. Refresh to see updated list."

---

## Data Model & Types

### Existing (No Changes)
```typescript
interface CreateSeedReadingRequest {
  meter_group_id: string;
  property_id: string;
  reading_amount: number;
  reading_date: string | Timestamp;
  image_url?: string;
}
```

### New Settings Structure
**Mobile:**
```typescript
interface SettingsSection {
  title: string;  // "Account", "Reading Operations", etc.
  description: string;
  items: SettingsItem[];
}

interface SettingsItem {
  label: string;  // "Seed Readings", "Clear Cache", etc.
  action: () => void;  // navigate or open form
}
```

**Website:**
Same structure, with forms embedded inline in sections.

---

## Testing Checklist

### Mobile
- [ ] CaptureReadings works as before (regular readings only)
- [ ] Settings displays 4 sections in correct order
- [ ] Seed Readings form accessible from Reading Operations
- [ ] Meter group dropdown loads
- [ ] Auto-detection hides already-seeded properties
- [ ] Entering readings + photo works
- [ ] Submit calls `POST /readings/seed` for each property
- [ ] Success message on completion
- [ ] Already-seeded message shows when no unseeded main meters exist

### Website
- [ ] Seed form removed from readings page
- [ ] Settings displays 4 sections in correct order
- [ ] Seed Readings form in Reading Operations section
- [ ] Same auto-detection and property filtering behavior
- [ ] Form submission works via `POST /readings/seed`
- [ ] Already-seeded message displays correctly

### Backend Integration
- [ ] Both platforms call `POST /readings/seed` correctly
- [ ] Main meter readings rejected by batch endpoint (expected error)
- [ ] Seed readings appear in reading list after creation
- [ ] 409 Conflict returned for duplicate seed attempts

---

## Implementation Order

1. **Mobile Settings page structure** — Reorganize with 4 tiers, add Section component
2. **Mobile Seed Readings form** — Add to Reading Operations section
3. **Mobile form logic** — Auto-detect main meters, fetch existing readings, filter properties
4. **Website Settings page structure** — Same 4-tier reorganization
5. **Website Seed Readings form** — Add to Reading Operations, same logic as mobile
6. **Website readings page** — Remove seed form/button
7. **Testing** — E2E test both platforms

---

## Constraints & Assumptions

- Main meter properties identified by `meter_groups[utility_type].is_main_meter === true`
- Readings have `property_id` (can fetch and filter by it)
- Meter group has `current_version` field (seed validator checks this)
- Backend enforces 409 on duplicate seed attempts (frontend doesn't need to re-validate)
- Settings page can be navigated to from main UI (mobile hash-based, website route)

---

## UX Notes

**Consistency**: Mobile and website Settings have identical organization, making the experience predictable for users who use both.

**Auto-detection**: When user selects a meter group in seed form, main meters appear automatically (no extra button clicks). Already-seeded properties are silently hidden — no "disabled" state, just absent from the list.

**One manual workflow**: Seeding is deliberate (must navigate to Settings) rather than automatic, giving users full control. Avoids confusion from auto-detection.

---

## Open Questions / Deferred

- Mobile Home screen badge for "X main meters need seeding" — deferred to future UX iteration
- Settings search/filter — can add if Settings grows large
- Batch seed UI polish (progress indication) — can add if time permits

