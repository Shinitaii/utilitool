# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Layout

- `api/functions/` — Firebase Cloud Functions backend (Express, TypeScript, Firestore)
- `ui/` — SvelteKit frontend (TypeScript, Tailwind CSS v4, Vite, Playwright)

Read `api/functions/CLAUDE.md` for backend architecture. Read `ui/CLAUDE.md` for Svelte MCP tools.

## API Commands

Run from `api/functions/`:

| Task | Command |
|---|---|
| Build | `npm run build` |
| Build (watch) | `npm run build:watch` |
| Lint | `npm run lint` |
| Test (all) | `npm test` |
| Test (watch) | `npm run test:watch` |
| Test (single file) | `npx jest src/features/meter-group/meter-group.test.ts` |
| Local emulator | `npm run serve` |

## UI Commands

Run from `ui/`:

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Lint + format check | `npm run lint` |
| Format | `npm run format` |
| Type check | `npm run check` |
| Unit tests | `npm run test:unit` |
| E2E tests | `npm run test:e2e` |

# Utilitool: Business Overview

## What is Utilitool?

Utilitool is a **utility meter reading and billing management system** designed to streamline how utility providers (electricity, water) track consumption and generate accurate bills for multiple tenants or properties.

Think of it as a centralized hub for managing all meter-related operations—from recording readings to validating bills before they're sent to customers.

---

## The Core Problem It Solves

Utility billing is inherently complex:
- **Multiple properties** need individual readings
- **Manual errors** in reading transcription corrupt billing data
- **Consumption calculations** must be accurate for financial integrity
- **Billing discrepancies** lead to customer disputes and lost revenue
- **No single source of truth** for who owes what

Utilitool automates and validates this entire workflow.

---

## Key Business Concepts

### 1. **Meter Groups**
A meter group is a logical container for a specific utility type (electricity or water). 

**Why it matters:** 
- A property might have *both* electricity and water meters
- Each utility has different rates, billing cycles, and regulations
- By grouping meters by utility, you can manage rates and cycles independently

*Example:* Building A has "Electricity Meter Group" and "Water Meter Group"

---

### 2. **Tenants**
Tenants are individual units or properties that consume utilities and receive bills.

**Why it matters:**
- One building might house 20 units—each gets its own bill
- Each tenant's consumption is tracked separately
- Tenants belong to a meter group (linked by the building's meter infrastructure)

*Example:* Unit 101, Unit 102, Unit 103 are all tenants under "Building A's Electricity Meter Group"

---

### 3. **Meter Readings**
A meter reading is a snapshot of consumption at a specific point in time.

**Why it matters:**
- Readings are the *raw data* for billing
- Each reading must be recorded with: tenant ID, utility type, reading value, and date
- The system prevents duplicate readings in the same month (data quality)

*Example:* Unit 101's electricity meter on June 1st shows 5,432 kWh

---

### 4. **Billing Cycles**
A billing cycle groups all tenants' readings within a time period and calculates charges.

**How it works:**
1. Define the billing period (e.g., June 1 – June 30)
2. Specify total consumption and total charges for the meter group
3. The system validates that:
   - All readings are present and valid
   - Consumption calculations match (within 3% tolerance for rounding errors)
   - Present reading is always greater than previous reading (meter didn't roll back)
   - No tenant appears twice in the cycle

4. Once validated, the system automatically breaks down charges per tenant based on their consumption

**Why it matters:**
- Prevents billing fraud and accidental overcharges
- Creates an audit trail of every billing decision
- Warns about unusual patterns (e.g., one tenant using 10x the average)

*Example:* June billing cycle for Building A electricity: 500 kWh total, ₱5,000 total charge = ₱10/kWh rate

---

### 5. **Individual Bills**
Bills are the end product—each tenant gets a line item showing their share of the cycle's charges.

**Components of a bill:**
- Previous meter reading
- Current meter reading
- Consumption (current − previous)
- Charge (consumption × rate)

**Why it matters:**
- Bills are what customers see and pay
- Must be accurate or customers dispute them
- Part of the payment/collections workflow

*Example:* Unit 101 used 45 kWh in June → charged ₱450 (45 × ₱10)

---

### 6. **Payments**
Records of when and how tenants paid their bills.

**Why it matters:**
- Tracks which bills are paid, partial, or pending
- Enables collections management
- Provides cash flow visibility

*Example:* Unit 101's June bill (₱450) marked as "paid" on June 28th

---

## The Happy Path: A Complete Billing Workflow

### Step 1: Capture Readings
- Meter readers record consumption from physical meters
- Readings can be entered manually or extracted from photos using AI
- System rejects duplicates (same tenant, same utility, same month)

### Step 2: Create Billing Cycle
- Admin defines: start date, end date, total expected consumption, total charges
- Provides list of tenant readings to include

### Step 3: System Validates
The system checks:
- ✅ Do all readings exist in the database?
- ✅ Do they belong to the correct tenants?
- ✅ Is present reading > previous reading?
- ✅ Is total calculated consumption within 3% of provided total?
- ✅ Is the billing rate reasonable (not suspiciously high/low)?
- ✅ No duplicate tenants in this cycle?

If any check fails → billing is rejected with specific error details

### Step 4: Bills Are Generated
Once validated, the system:
- Calculates per-tenant consumption
- Applies the rate to generate individual charges
- Creates a bill record for each tenant

### Step 5: Bills Are Tracked
- Admin marks cycle as "printed" (ready to send to customers)
- Bills are sent to tenants
- Payments are recorded as they arrive

---

## Key Business Rules & Safeguards

### Consumption Accuracy (3% Tolerance)
Billing is calculated twice: once from individual readings, once from the cycle's totals. If they differ by more than 3%, the system blocks billing to prevent bad data propagating.

*Why:* Small rounding differences are normal, but large gaps indicate data corruption.

### No Meter Rollback
The system rejects any situation where a present reading is less than or equal to the previous reading.

*Why:* Meters don't go backwards (unless replaced). If they do, it's a data error that must be investigated.

### Duplicate Detection
You can't record two readings for the same tenant, utility type, and month.

*Why:* Duplicate readings corrupt consumption calculations and hide real problems.

### Admin-Only Access
Only administrators can create meter groups, run billing cycles, and manage the system.

*Why:* Billing data directly affects revenue and customer trust.

---

## The Value Proposition

**For Utility Providers:**
- ⚡ **Speed**: Automate the most error-prone part of billing
- 🛡️ **Accuracy**: Multi-layer validation catches mistakes before they reach customers
- 📊 **Visibility**: See consumption trends, identify top users, spot anomalies
- 📋 **Compliance**: Audit trail for every reading and bill for regulatory/dispute resolution
- 💰 **Revenue**: Prevent undercharging due to calculation errors

**For Customers:**
- 📱 Access to their own readings and bills
- 🔍 Transparency in how charges are calculated
- 🚨 Early warning if consumption spikes (leak detection)

---

## Typical Use Case: Multi-Unit Building

**Scenario:** A 50-unit condominium with centralized electricity and water meters.

1. **Monthly**: Meter readers visit and capture readings from the central meter and any sub-meters
2. **Mid-month**: Readings are entered into Utilitool (some via phone camera, AI extracts the numbers)
3. **Month-end**: 
   - Admin inputs the billing cycle details (dates, total expected consumption, total charges from the utility)
   - System validates all 50 tenants have readings
   - System calculates each unit's share and charge
   - Cycle marked as valid
4. **Billing day**: System generates 50 individual bills, printed and distributed
5. **Tracking**: Payment status is recorded as checks/transfers arrive

---

## Success Metrics

- **Billing accuracy**: Zero discrepancies between system-calculated and manually-verified totals
- **Cycle completion time**: From readings captured → bills ready to send (target: < 2 days)
- **Dispute rate**: Customer complaints about billing errors (target: < 1% of bills)
- **System uptime**: Billing cycles never fail mid-process
- **Audit readiness**: Any bill can be traced back to original readings in seconds

---

## Conclusion

Utilitool transforms utility billing from a manual, error-prone spreadsheet nightmare into a validated, auditable, and transparent system. By catching errors early and automating calculations, it protects both the utility provider's revenue and the customer's trust.
