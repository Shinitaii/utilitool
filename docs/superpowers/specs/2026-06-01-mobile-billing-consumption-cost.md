# Spec: Mobile Billing Consumption & Cost Display

**Date**: June 1, 2026  
**Status**: Design Complete  
**Scope**: Add consumption details and cost calculation breakdown to mobile billing screen

---

## Overview

Currently, the mobile billing screen shows only the total cost (as `current_reading_amount`). This spec adds:
1. **Consumption breakdown** — shows how much was consumed (current reading − previous reading)
2. **Cost calculation** — displays the rate-based calculation (consumption × billing_rate = total cost)
3. **Due date** — shows when the bill is due (from billing cycle's `overdue_date`)
4. **Confirmation on payment** — prevents accidental "Mark as Paid" actions

---

## User Experience

### Collapsed View (Initial List)
Each billing card displays:
- Property name (e.g., "Room 101")
- **Total cost** in bold (e.g., "₱450")
- Payment status badge (⚠ Overdue, ⏳ Pending, ✓ Paid)
- Date created (e.g., "Created: May 1, 2026")

### Expanded View (On Click)
When user taps a billing to expand:
- **Header**: Property name, status badge, due date (e.g., "Room 101 · ⚠ Overdue · Due: May 15, 2026")
- **Consumption Breakdown**:
  - Previous reading: `100 units`
  - Current reading: `145 units`
  - Consumption: `45 units`
- **Cost Calculation**:
  - `45 units × ₱10/unit = ₱450`
- **Mark as Paid Button** (if status is pending/overdue)
  - On click: Show confirmation dialog
  - Confirmation: "Mark as Paid? Room 101 · ₱450"
  - On confirm: Update status to paid, refresh local state
  - On cancel: Dismiss dialog, no action

### Error Handling
- If previous reading fetch fails: Show "Unable to load cost details"
- If billing cycle fetch fails: Show "Unable to load cost details"
- Graceful degradation — show basic billing info even if details fail to load

---

## Data Model

### Existing Types
**Billing** (`mobile/src/lib/api/billings.ts`):
```typescript
export interface Billing {
  id: string;
  property_id: string;
  previous_reading_id: string;
  current_reading_id: string;
  current_reading_amount: number;  // The reading value, not the cost
  payment_status: 'pending' | 'paid' | 'overdue';
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}
```

**Reading** (`mobile/src/lib/api/readings.ts`):
```typescript
export interface Reading {
  id: string;
  meter_group_id: string;
  reading_amount: number;
  reading_date: string;
  // ... other fields
}
```

**BillingCycle** (`mobile/src/lib/api/billing-cycles.ts`):
```typescript
export interface BillingCycle {
  id: string;
  meter_group_id: string;
  billing_ids: Record<string, number>;  // billingId → consumption
  billing_rate: number;
  billing_consumption: number;
  billing_start_date: string;
  billing_end_date: string;
  overdue_date?: string;
  // ... other fields
}
```

### No New Types Needed
- All data already exists in API responses
- Calculations are done client-side

---

## API Calls

### Initial Load (Existing)
```typescript
const billings = await listBillings();  // Returns { data: Billing[], ... }
```

### On Expand (New)
When user expands a billing:

1. **Fetch previous reading**:
   ```typescript
   const prevReading = await getReading(billing.previous_reading_id);
   ```

2. **Fetch all billing cycles** (to find the one containing this billing):
   ```typescript
   const cyclesResult = await listBillingCycles({ limit: 100 });
   const cycles = cyclesResult.data;
   ```

3. **Find the cycle** containing this billing:
   ```typescript
   const cycle = cycles.find(c => billing.id in c.billing_ids);
   ```

4. **Extract data**:
   - Consumption: `cycle.billing_ids[billing.id]`
   - Rate: `cycle.billing_rate`
   - Due date: `cycle.overdue_date`

5. **Calculate cost**:
   ```typescript
   const totalCost = consumption * cycle.billing_rate;
   ```

### On Mark as Paid (Existing, Add Confirmation)
```typescript
await updateBillingStatus(billingId, 'paid');
```

---

## Implementation Files

### 1. `mobile/src/lib/api/readings.ts`
- ✅ Already has `getReading(id)` (verify it's exported and works)
- No changes needed

### 2. `mobile/src/lib/api/billing-cycles.ts`
- ✅ Already has `listBillingCycles()` (verify it's exported)
- No changes needed

### 3. `mobile/src/screens/Billings.svelte`
**Changes**:
- Update state to track expanded billing details (consumption, rate, due date, previous reading)
- Add `getExpandedBillingDetails(billingId)` function to fetch and calculate
- Update collapsed card to show total cost in header
- Update expanded view to show consumption breakdown + calculation
- Add confirmation dialog on "Mark as Paid" button click
- Handle errors gracefully with fallback UI

**State additions**:
```typescript
let expandedBillingDetails: Record<string, {
  consumption: number;
  rate: number;
  dueDate?: string;
  prevReadingAmount: number;
  totalCost: number;
  isLoading: boolean;
  error?: string;
}> = $state({});
```

**New function**:
```typescript
async function getExpandedBillingDetails(billing: Billing) {
  try {
    const [prevReading, cyclesResult] = await Promise.all([
      getReading(billing.previous_reading_id),
      listBillingCycles({ limit: 100 })
    ]);
    
    const cycle = cyclesResult.data.find(c => billing.id in c.billing_ids);
    const consumption = cycle?.billing_ids[billing.id] ?? 0;
    const rate = cycle?.billing_rate ?? 0;
    const totalCost = consumption * rate;
    
    expandedBillingDetails[billing.id] = {
      consumption,
      rate,
      dueDate: cycle?.overdue_date,
      prevReadingAmount: prevReading.reading_amount,
      totalCost,
      isLoading: false
    };
  } catch (error) {
    expandedBillingDetails[billing.id].error = 'Unable to load cost details';
    expandedBillingDetails[billing.id].isLoading = false;
  }
}
```

**Mark as Paid with confirmation**:
```typescript
async function markAsPaidWithConfirm(billing: Billing) {
  if (!confirm(`Mark as Paid?\n${propertyNames[billing.property_id]} · ₱${expandedBillingDetails[billing.id]?.totalCost || 'X'}`)) {
    return;
  }
  await markAsPaid(billing.id);
}
```

---

## Performance Considerations

### Lazy Loading
- Fetch billing cycle + reading **only on expand**, not on initial list render
- Reduces initial load time and API calls
- Details fetched in parallel (`Promise.all`)

### Caching
- Consider caching fetched cycles per session (optional optimization)
- Reuse cycle data if user expands multiple bills from same cycle
- Clear cache on sign-out

### Mobile Considerations
- Show loading state while fetching details ("Loading...")
- Ensure touch targets are large enough for "Mark as Paid" button
- Confirmation dialog prevents accidental taps

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Previous reading not found | Show "Unable to load cost details" in expanded view |
| Billing cycle not found | Show "Unable to load cost details" in expanded view |
| Reading fetch fails | Show "Unable to load cost details" with retry option |
| Cycle fetch fails | Show "Unable to load cost details" with retry option |
| Mark as Paid fails | Show error message, keep status unchanged |

---

## Testing Checklist

### Manual Testing (Before Commit)
- [ ] Collapsed view shows property name, total cost, status, date
- [ ] Expanded view fetches and displays consumption breakdown
- [ ] Cost calculation is correct: `consumption × rate = total`
- [ ] Due date displays when available
- [ ] Mark as Paid shows confirmation dialog
- [ ] Confirming mark as paid updates status immediately
- [ ] Error states display fallback messages
- [ ] Billings in different statuses (pending/overdue/paid) render correctly

### Edge Cases
- [ ] No previous reading found → show error gracefully
- [ ] Billing not in any cycle → show error gracefully
- [ ] Cycle with zero rate → show calculation correctly
- [ ] Very large consumption numbers → display without UI break

---

## Implementation Order

1. Update `Billings.svelte` to calculate and display total cost in collapsed view
2. Add `getExpandedBillingDetails()` function to fetch cycle + reading
3. Update expanded view UI to show consumption breakdown
4. Add confirmation dialog to "Mark as Paid" button
5. Test error cases and edge cases
6. Review and refine

---

## Future Enhancements

- Cache billing cycles in session to reduce repeated fetches
- Show "View Cycle" link to jump to billing cycle details (if cycle detail screen added)
- Add consumption unit display (kWh, m³) based on meter group utility type
- Show payment history in expanded view

---

## Related Documents

- [UI Billings Page](../../../ui/src/routes/%28app%29/billings/%2Bpage.svelte) — Reference implementation (cycle-centric view)
- [API Billing Cycle Endpoint](../../../api/functions/CLAUDE.md#billing-cycles) — billing_rate, billing_ids, overdue_date
- [Mobile CLAUDE.md](../../../mobile/CLAUDE.md) — Mobile architecture + API modules
