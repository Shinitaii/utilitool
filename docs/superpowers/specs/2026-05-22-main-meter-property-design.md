# Main Meter Property Design

**Date:** 2026-05-22
**Status:** Approved for implementation

## Problem

Some properties in a meter group do not have a physical submeter — they consume whatever the utility company's main meter records minus the sum of all submeter readings. Currently the system forces users to manually calculate and enter this residual value as a reading. This is error-prone and defeats the purpose of automation.

## Business Rule

Within a meter group, one property may be designated as the **main meter property**. Its consumption is always derived:

```
main_meter_consumption = billing_consumption - sum(all submeter consumptions in that meter group)
```

This designation is per-meter-group, not per-property. A property can be the main meter for electricity but a regular submeter for water.

There is at most one main meter property per meter group. The system enforces this at the service layer.

---

## Data Model Changes

### 1. Property — `meter_groups` value type

**Before:**
```typescript
meter_groups: Record<string, string>
```

**After:**
```typescript
meter_groups: Record<string, { is_main_meter: boolean }>
```

The key is `meter_group_id`. The value carries the `is_main_meter` flag for that specific meter group relationship.

**Migration:** All existing Firestore documents in the `properties` collection must have their `meter_groups` values converted from `string` → `{ is_main_meter: false }`.

### 2. BillingCycle — add `meter_group_id`

**Add field:**
```typescript
meter_group_id: string
```

A billing cycle is scoped to one meter group. This field makes that explicit and enables direct lookup of the main meter property without deriving it from nested billing → reading → meter_group chains.

---

## Behavioral Changes

### Batch Reading Creation — exclusion

When the API selects all properties for a meter group to offer as batch reading targets, filter out any property where `meter_groups[meterGroupId].is_main_meter === true`.

Main meter properties are never shown in the reading capture flow.

### Batch Billing Creation — exclusion

Same filter applies when selecting properties to generate billings for. Main meter properties are excluded from manual billing batch creation.

### Billing Cycle Creation — new side effect

After the existing billing IDs are submitted but before the 3% tolerance validation runs, the service executes the following:

1. Use `meter_group_id` on the incoming billing cycle DTO to find any property with `is_main_meter: true` for that meter group.
2. If no main meter property exists → skip, proceed as before.
3. If found:
   a. Calculate `derived_consumption = billing_consumption - sum(all submitted billing consumptions in billing_ids)`.
   b. Fetch the most recent reading for the main meter property scoped to this `meter_group_id` (same lookup as `findPreviousMonthReading`).
   c. **If no seed reading exists:** Throw a 400 error directing the user to record a seed reading for the main meter property first (via the seed reading flow below). The billing cycle cannot be created until a baseline exists.
   d. **If a seed/previous reading exists:** Compute `current_reading_amount = previous_reading.reading_amount + derived_consumption`. Call `readingService.create()` — the same rules apply as a manual reading (anomaly guard, meter rollback prevention). The auto-billing side effect creates a billing record. Append that billing ID → `derived_consumption` into `billing_ids`.
4. Proceed with normal billing cycle creation and validation (including the 3% tolerance check, which now includes the main meter billing and serves as the cross-check safeguard).

---

## Validation & Guards

| Rule | Where enforced |
|------|---------------|
| At most one main meter property per meter group | Property service, on create and update |
| Main meter property excluded from reading/billing batch | Reading service batch, Billing service batch |
| Seed reading only accepted when no prior reading exists | Reading service, seed endpoint |
| Manual reading rejected after seed exists | Reading service, seed endpoint |
| Billing cycle creation blocked if no seed reading exists | Billing cycle service, before side effect step |
| Derived reading follows all existing reading rules | `readingService.create()` — no special path |
| Derived billing follows all existing billing rules | Auto-billing side effect of reading creation |
| Sum of all billings (including derived) ≈ billing_consumption ±3% | Existing billing cycle validator |

---

## Seed Reading Flow (First-Time Setup)

Because main meter properties are excluded from batch reading creation, there must be a dedicated path for recording their baseline reading before the first billing cycle.

### API

A new endpoint (or a flag on the existing reading endpoint) that allows creating a single reading for a main meter property. The reading is accepted only if no prior reading exists for that property + meter group combination. Subsequent manual submissions for the same property + meter group are rejected — all future readings are auto-derived.

The record created is structurally identical to any other reading (same model, same validation rules).

### UI Flow

A dedicated UI flow, similar in structure to the manual billing creation flow:

1. Select meter group
2. Select the main meter property within that group
3. Input reading amount manually or upload a meter photo (OCR autofill, same as the existing capture flow)
4. Submit — creates the seed reading

This flow is only accessible for properties flagged `is_main_meter: true` that have no existing reading for the selected meter group. Once a seed exists, the option disappears.

---

## What Does Not Change

- The `Reading` and `Billing` models are unchanged.
- Synthetic records are structurally identical to manual ones — no `is_synthetic` flag, no special fields.
- The 3% tolerance check is the cross-check; no separate validation step is added.
- Single reading creation (non-batch) for a non-main-meter property is unchanged.

---

## Out of Scope

- UI changes for marking/unmarking a property as main meter on the property settings page (separate task).
- Reports or dashboards showing derived vs. manual readings.
- Backfilling historical billing cycles with derived readings.
