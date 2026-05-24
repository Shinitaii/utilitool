# Main Meter Property Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `is_main_meter` per meter group on properties so that one property per meter group can have its reading auto-derived at billing cycle creation instead of being manually captured.

**Architecture:** The `meter_groups` value on `Property` changes from a bare `meter_group_id` string to a `{ meter_group_id, is_main_meter }` object (key stays utility type). `findPreviousMonthReading` gets a `propertyId` filter to prevent cross-property reading inheritance. The billing cycle service gains a pre-validation step that derives and inserts the main meter reading+billing before the 3% tolerance check runs. A new `POST /readings/seed` endpoint handles the one-time baseline reading for a main meter property.

**Tech Stack:** TypeScript, Express, Firestore (Firebase Admin SDK), Zod, Jest

---

## File Map

| File | Change |
|------|--------|
| `api/functions/src/features/reading/reading.util.ts` | Add `propertyId` param to `findPreviousMonthReading` |
| `api/functions/src/features/reading/reading.service.ts` | Pass `property_id` to lookup in `create` + `createBatch`; reject main meter in `createBatch`; add `createSeed` |
| `api/functions/src/features/reading/reading.dto.ts` | Add `CreateSeedReadingDTOSchema` |
| `api/functions/src/features/reading/reading.validator.ts` | Add `validateSeedCreate` |
| `api/functions/src/features/reading/reading.controller.ts` | Add `createSeedReading` handler |
| `api/functions/src/features/reading/reading.route.ts` | Add `POST /seed` route |
| `api/functions/src/features/property/property.model.ts` | Add `MeterGroupEntry` type; update `meter_groups` field |
| `api/functions/src/features/property/property.dto.ts` | Update Zod schema for `meter_groups` value |
| `api/functions/src/features/property/property.validator.ts` | Update `ensureMeterGroupsExist`; add `ensureMainMeterUniqueness` |
| `api/functions/src/features/property/property.service.ts` | Update `search` meterGroupId filter |
| `api/functions/src/features/billing/billing.validator.ts` | Add main meter guard to `validateCreate` + `validateBatch` |
| `api/functions/src/features/billing-cycle/billing-cycle.model.ts` | Add `meter_group_id` field |
| `api/functions/src/features/billing-cycle/billing-cycle.dto.ts` | Add `meter_group_id` to create/update schemas |
| `api/functions/src/features/billing-cycle/billing-cycle.service.ts` | Add `injectMainMeterBilling` side effect |
| `api/functions/src/migrations/migrate-meter-groups.ts` | One-time migration: string → object values |

---

## Task 1: Fix `findPreviousMonthReading` to be property-scoped

**Files:**
- Modify: `api/functions/src/features/reading/reading.util.ts`
- Modify: `api/functions/src/features/reading/reading.service.ts`

- [ ] **Step 1.1: Write failing test**

Add to `api/functions/src/features/reading/reading.service.test.ts`:

```typescript
describe('findPreviousMonthReading - property scoping', () => {
  it('should not return a previous-month reading from a sibling property', async () => {
    // Sibling property has a reading last month; target property has none
    jest.mocked(readingRepository.search).mockResolvedValue({
      data: [],
      hasMore: false,
      nextCursor: null,
    });
    // readingService.create with no prev reading should just create without billing
    const mockReading = {
      id: 'r-new',
      meter_group_id: 'mg-1',
      property_id: 'prop-100',
      reading_amount: 50,
      reading_date: Timestamp.now(),
      meter_version: 1,
    };
    jest.mocked(readingRepository.create).mockResolvedValue(mockReading as any);

    const result = await readingService.create({
      meter_group_id: 'mg-1',
      property_id: 'prop-100',
      reading_amount: 50,
      reading_date: Timestamp.now(),
    });

    expect(result.id).toBe('r-new');
    // billingService.createFromReadings must NOT have been called
    const { billingService } = await import('../billing/billing.service');
    expect(billingService.createFromReadings).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 1.2: Run test to confirm it passes already (or reveals current behaviour)**

```bash
cd api/functions && npx jest reading.service.test.ts --testNamePattern="property scoping" --no-coverage
```

- [ ] **Step 1.3: Update `findPreviousMonthReading` signature in `reading.util.ts`**

Replace the existing function:

```typescript
export async function findPreviousMonthReading(
  meterGroupId: string,
  propertyId: string,
  readingDate: Timestamp
): Promise<{id: string; data: any} | null> {
  const prevWindow = getPreviousMonthWindow(readingDate);
  const prevReadingSnap = await firestore
    .collection(COLLECTIONS.READINGS)
    .where("meter_group_id", "==", meterGroupId)
    .where("property_id", "==", propertyId)
    .where("is_deleted", "==", false)
    .where("reading_date", ">=", prevWindow.start)
    .where("reading_date", "<", prevWindow.end)
    .orderBy("reading_date", "desc")
    .limit(1)
    .get();

  if (prevReadingSnap.empty) return null;

  const doc = prevReadingSnap.docs[0];
  return {
    id: doc.id,
    data: doc.data(),
  };
}
```

- [ ] **Step 1.4: Update both callers in `reading.service.ts`**

In `create()`, change:
```typescript
const prevReading = await findPreviousMonthReading(data.meter_group_id, data.reading_date);
```
to:
```typescript
const prevReading = await findPreviousMonthReading(data.meter_group_id, data.property_id, data.reading_date);
```

In `createBatch()` (inside the `readingPromises.map` callback), change:
```typescript
const prevReading = await findPreviousMonthReading(readingData.meter_group_id, readingData.reading_date);
```
to:
```typescript
const prevReading = await findPreviousMonthReading(readingData.meter_group_id, readingData.property_id, readingData.reading_date);
```

- [ ] **Step 1.5: Run full reading tests**

```bash
cd api/functions && npx jest reading --no-coverage
```

Expected: all pass.

- [ ] **Step 1.6: Commit**

```bash
git add api/functions/src/features/reading/reading.util.ts api/functions/src/features/reading/reading.service.ts api/functions/src/features/reading/reading.service.test.ts
git commit -m "fix(reading): scope findPreviousMonthReading to property_id"
```

---

## Task 2: Update Property model, DTO, validator, and service

**Files:**
- Modify: `api/functions/src/features/property/property.model.ts`
- Modify: `api/functions/src/features/property/property.dto.ts`
- Modify: `api/functions/src/features/property/property.validator.ts`
- Modify: `api/functions/src/features/property/property.service.ts`

- [ ] **Step 2.1: Write failing tests**

Add to `api/functions/src/features/property/property.test.ts`:

```typescript
describe('Property main meter uniqueness', () => {
  it('should reject creating a second main meter for the same meter group', async () => {
    // Suppose mg-elec already has a main meter on prop-101
    // Attempting to create prop-200 with is_main_meter: true for mg-elec should 409
    await expect(
      propertyService.create({
        room_name: 'Unit 200',
        tenant_amount: 1,
        meter_groups: {
          electricity: { meter_group_id: 'mg-elec', is_main_meter: true },
          water: { meter_group_id: 'mg-water', is_main_meter: false },
        },
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('should allow creating a property as main meter when none exists for that meter group', async () => {
    // No existing main meter for mg-elec
    const result = await propertyService.create({
      room_name: 'Unit 300',
      tenant_amount: 1,
      meter_groups: {
        electricity: { meter_group_id: 'mg-elec', is_main_meter: true },
        water: { meter_group_id: 'mg-water', is_main_meter: false },
      },
    });
    expect(result.room_name).toBe('Unit 300');
  });
});
```

- [ ] **Step 2.2: Update `property.model.ts`**

```typescript
import {BaseModel} from "../../utils/model.util";

export interface MeterGroupEntry {
  meter_group_id: string;
  is_main_meter: boolean;
}

export interface Property extends BaseModel {
  room_name: string;
  tenant_amount: number;
  meter_groups: Record<string, MeterGroupEntry>;
}
```

- [ ] **Step 2.3: Update `property.dto.ts`**

Add the entry schema and update all `meter_groups` fields. The full updated schema section (replace the relevant parts):

```typescript
import {z} from "zod";
import {stripHtml} from "../../utils/sanitize.util";
import {UTILITY_TYPES} from "../../constants/utility.constants";

const MeterGroupEntrySchema = z.object({
  meter_group_id: z.string().trim().min(1),
  is_main_meter: z.boolean(),
});

export const CreatePropertyDTOSchema = z
  .object({
    room_name: z.string().trim().min(1).max(255).transform(stripHtml),
    tenant_amount: z.number().int().min(1),
    meter_groups: z.record(
      z.enum(Object.values(UTILITY_TYPES) as [string, ...string[]]),
      MeterGroupEntrySchema
    ),
  })
  .refine(
    (data) =>
      data.meter_groups[UTILITY_TYPES.ELECTRICITY] &&
      data.meter_groups[UTILITY_TYPES.WATER],
    {
      message: "Property must have both electricity and water meter groups",
      path: ["meter_groups"],
    }
  );
export type CreatePropertyDTO = z.infer<typeof CreatePropertyDTOSchema>;

export const CreatePropertyBatchDTOSchema = z
  .array(CreatePropertyDTOSchema)
  .min(1)
  .max(10);
export type CreatePropertyBatchDTO = z.infer<typeof CreatePropertyBatchDTOSchema>;

export const PropertyByIdParamsDTOSchema = z.object({
  id: z.string().trim().min(1),
});
export type PropertyByIdParamsDTO = z.infer<typeof PropertyByIdParamsDTOSchema>;

const UpdatePropertyBaseDTOSchema = z.object({
  room_name: z.string().trim().min(1).max(255).transform(stripHtml).optional(),
  tenant_amount: z.number().int().min(1).optional(),
  meter_groups: z.record(
    z.enum(Object.values(UTILITY_TYPES) as [string, ...string[]]),
    MeterGroupEntrySchema
  ).optional(),
});

export const UpdatePropertyDTOSchema = UpdatePropertyBaseDTOSchema;
export type UpdatePropertyDTO = z.infer<typeof UpdatePropertyDTOSchema>;

export const UpdatePropertyBatchItemSchema = z.object({
  id: z.string().min(1),
  data: UpdatePropertyDTOSchema,
});

export const UpdatePropertyBatchDTOSchema = z
  .array(UpdatePropertyBatchItemSchema)
  .min(1)
  .max(10);
export type UpdatePropertyBatchDTO = z.infer<typeof UpdatePropertyBatchDTOSchema>;

export const GetPropertiesQueryDTOSchema = z.object({
  roomName: z.string().trim().min(1).max(255).optional(),
  meterGroupId: z.string().trim().min(1).optional(),
  sortBy: z.enum(["created_at", "room_name"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().min(1).optional(),
  archived: z.enum(["true", "false"]).optional().transform(
    (val) => val === "true"
  ),
});
export type GetPropertiesQueryDTO = z.infer<typeof GetPropertiesQueryDTOSchema>;
```

- [ ] **Step 2.4: Update `property.validator.ts`**

Replace the full file content:

```typescript
import {AppError} from "../../utils/error.util";
import {logger} from "../../utils/logger.util";
import {meterGroupRepository} from "../meter-group/meter-group.repository";
import {tenantRepository} from "../tenant/tenant.repository";
import {propertyRepository} from "./property.repository";
import {CreatePropertyDTO, UpdatePropertyDTO} from "./property.dto";
import {Property, MeterGroupEntry} from "./property.model";

const normalizeRoomName = (roomName: string) =>
  roomName.trim().toLowerCase();

export class PropertyValidator {
  private async findDuplicateProperty(
    roomName: string,
    excludeId?: string
  ): Promise<Property | undefined> {
    const {data: candidates} = await propertyRepository.search({
      limit: 100,
      orderBy: "created_at",
      filters: {room_name: roomName},
    });

    const normalizedRoomName = normalizeRoomName(roomName);

    return candidates.find((property) => {
      if (excludeId && property.id === excludeId) return false;
      return normalizeRoomName(property.room_name) === normalizedRoomName;
    });
  }

  private async countTenantsForProperty(propertyId: string): Promise<number> {
    let cursor: string | null = null;
    let total = 0;

    do {
      const {data, hasMore, nextCursor} = await tenantRepository.search({
        limit: 1000,
        orderBy: "created_at",
        cursor,
        filters: {property_id: propertyId},
      });
      total += data.length;
      cursor = hasMore ? nextCursor : null;
    } while (cursor);

    return total;
  }

  private async ensureMeterGroupsExist(meterGroupIds: string[]): Promise<void> {
    for (const meterGroupId of meterGroupIds) {
      const meterGroup = await meterGroupRepository.getById(meterGroupId);
      if (!meterGroup) {
        throw new AppError(404, "Meter group not found");
      }
    }
  }

  private async ensureMainMeterUniqueness(
    meterGroups: Record<string, MeterGroupEntry>,
    excludePropertyId?: string
  ): Promise<void> {
    for (const entry of Object.values(meterGroups)) {
      if (!entry.is_main_meter) continue;

      const {data: allProperties} = await propertyRepository.search({
        limit: 100,
        orderBy: "created_at",
      });

      const conflict = allProperties.find((p) => {
        if (excludePropertyId && p.id === excludePropertyId) return false;
        return Object.values(p.meter_groups).some(
          (pv) => pv.meter_group_id === entry.meter_group_id && pv.is_main_meter
        );
      });

      if (conflict) {
        throw new AppError(
          409,
          `Meter group ${entry.meter_group_id} already has a main meter property`
        );
      }
    }
  }

  async validateCreate(data: CreatePropertyDTO): Promise<void> {
    const meterGroupIds = Object.values(data.meter_groups).map((e) => e.meter_group_id);
    await this.ensureMeterGroupsExist(meterGroupIds);
    await this.ensureMainMeterUniqueness(data.meter_groups);

    const duplicate = await this.findDuplicateProperty(data.room_name);
    if (duplicate) {
      logger.warn({room_name: data.room_name}, "Duplicate property creation attempt");
      throw new AppError(409, "Room name already exists");
    }
  }

  async validateBatchCreate(data: CreatePropertyDTO[]): Promise<void> {
    const seenRoomNames = new Set<string>();
    const allMeterGroupIds = new Set<string>();

    for (const item of data) {
      const normalizedRoomName = normalizeRoomName(item.room_name);
      if (seenRoomNames.has(normalizedRoomName)) {
        logger.warn({room_name: item.room_name}, "Duplicate property in batch");
        throw new AppError(409, "Room name already exists");
      }
      seenRoomNames.add(normalizedRoomName);
      Object.values(item.meter_groups).forEach((e) => allMeterGroupIds.add(e.meter_group_id));
    }

    await this.ensureMeterGroupsExist(Array.from(allMeterGroupIds));

    for (const item of data) {
      await this.ensureMainMeterUniqueness(item.meter_groups);
      const duplicate = await this.findDuplicateProperty(item.room_name);
      if (duplicate) {
        logger.warn({room_name: item.room_name}, "Duplicate property batch creation attempt");
        throw new AppError(409, "Room name already exists");
      }
    }
  }

  async validateUpdate(property: Property, data: UpdatePropertyDTO): Promise<void> {
    if (data.meter_groups) {
      const meterGroupIds = Object.values(data.meter_groups).map((e) => e.meter_group_id);
      await this.ensureMeterGroupsExist(meterGroupIds);
      await this.ensureMainMeterUniqueness(data.meter_groups, property.id);
    }

    if (data.room_name) {
      const duplicate = await this.findDuplicateProperty(data.room_name, property.id);
      if (duplicate) {
        logger.warn({room_name: data.room_name}, "Duplicate property update attempt");
        throw new AppError(409, "Room name already exists");
      }
    }

    if (data.tenant_amount !== undefined) {
      const tenantCount = await this.countTenantsForProperty(property.id);
      if (data.tenant_amount < tenantCount) {
        throw new AppError(409, "Tenant amount cannot be less than current tenant count");
      }
    }
  }

  async validateBatchUpdate(
    updates: {id: string; data: UpdatePropertyDTO}[]
  ): Promise<void> {
    for (const update of updates) {
      const property = await propertyRepository.getById(update.id);
      if (!property) {
        throw new AppError(404, "Property not found");
      }
      await this.validateUpdate(property, update.data);
    }
  }
}
```

- [ ] **Step 2.5: Update `property.service.ts` meterGroupId filter**

Replace the `if (options.meterGroupId)` block in `search()`:

```typescript
if (options.meterGroupId) {
  result.data = result.data.filter((property) =>
    Object.values(property.meter_groups).some(
      (entry) => entry.meter_group_id === options.meterGroupId
    )
  );
}
```

- [ ] **Step 2.6: Run property tests**

```bash
cd api/functions && npx jest property --no-coverage
```

Expected: all pass.

- [ ] **Step 2.7: Type-check**

```bash
cd api/functions && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2.8: Commit**

```bash
git add api/functions/src/features/property/
git commit -m "feat(property): add is_main_meter per meter group entry"
```

---

## Task 3: Exclude main meter from batch reading + guard billing validator

**Files:**
- Modify: `api/functions/src/features/reading/reading.service.ts`
- Modify: `api/functions/src/features/billing/billing.validator.ts`

- [ ] **Step 3.1: Write failing test for batch exclusion**

Add to `api/functions/src/features/reading/reading.service.test.ts`:

```typescript
describe('createBatch - main meter exclusion', () => {
  it('should reject a batch that includes a main meter property', async () => {
    // Mock property with is_main_meter: true for mg-1
    jest.mocked(readingRepository.search).mockResolvedValue({
      data: [],
      hasMore: false,
      nextCursor: null,
    });

    await expect(
      readingService.createBatch([
        {
          meter_group_id: 'mg-1',
          property_id: 'main-prop',
          reading_amount: 100,
          reading_date: Timestamp.now(),
        },
      ])
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
```

- [ ] **Step 3.2: Add main meter check to `readingService.createBatch()`**

Import `propertyRepository` at the top of `reading.service.ts`:

```typescript
import {propertyRepository} from "../property/property.repository";
```

At the start of `createBatch()`, after `await validator.validateBatch(data)`, add:

```typescript
// Reject if any reading targets a main meter property — those are derived automatically
for (const r of data) {
  const property = await propertyRepository.getById(r.property_id);
  if (!property) continue;
  const entry = Object.values(property.meter_groups).find(
    (e) => e.meter_group_id === r.meter_group_id
  );
  if (entry?.is_main_meter) {
    throw new AppError(
      400,
      `Property ${r.property_id} is the main meter for meter group ${r.meter_group_id}. ` +
      `Its readings are derived automatically. Use POST /readings/seed for the first-time baseline.`
    );
  }
}
```

- [ ] **Step 3.3: Add main meter guard to `billing.validator.ts` and `billing.service.ts`**

**billing.validator.ts** — `billingService.createBatch()` calls `validator.validateBatch()`. Guard that here.

Import `propertyRepository` at the top of `billing.validator.ts`:

```typescript
import {propertyRepository} from "../property/property.repository";
```

Add a private method:

```typescript
private async ensurePropertyIsNotMainMeter(
  propertyId: string,
  meterGroupId: string
): Promise<void> {
  const property = await propertyRepository.getById(propertyId);
  if (!property) return; // existence checked elsewhere
  const entry = Object.values(property.meter_groups).find(
    (e) => e.meter_group_id === meterGroupId
  );
  if (entry?.is_main_meter) {
    throw new AppError(
      400,
      `Property ${propertyId} is the main meter for meter group ${meterGroupId}. ` +
      `Its billings are generated automatically at billing cycle creation.`
    );
  }
}
```

In `validateCreate(data: CreateBillingDTO)`, add the guard after `validateReadingsBelongToProperty`:

```typescript
async validateCreate(data: CreateBillingDTO): Promise<void> {
  await this.validatePropertyExists(data.property_id);
  await this.validateReadingExists(data.previous_reading_id);
  await this.validateReadingExists(data.current_reading_id);
  await this.validateReadingsBelongToProperty(
    data.property_id,
    data.previous_reading_id,
    data.current_reading_id
  );
  const currReading = await readingRepository.getById(data.current_reading_id);
  if (currReading) {
    await this.ensurePropertyIsNotMainMeter(data.property_id, currReading.meter_group_id);
  }
}
```

In `validateBatch(data: CreateBillingDTO[])`, add inside the per-item loop at the end:

```typescript
for (const item of data) {
  await this.validateReadingsBelongToProperty(
    item.property_id,
    item.previous_reading_id,
    item.current_reading_id
  );
  const currReading = await readingRepository.getById(item.current_reading_id);
  if (currReading) {
    await this.ensurePropertyIsNotMainMeter(item.property_id, currReading.meter_group_id);
  }
}
```

**billing.service.ts** — `billingService.create()` (single) does NOT call the validator; it validates inline inside the Firestore transaction. Add the guard there too, after the existing property/reading checks and before `txn.set(...)`:

```typescript
// Inside the runTransaction callback, after the existing rollback check:
const property = await propertyRepository.getById(data.property_id);
if (property) {
  const entry = Object.values(property.meter_groups as Record<string, any>).find(
    (e: any) => e.meter_group_id === currReading.meter_group_id
  );
  if (entry?.is_main_meter) {
    throw new AppError(
      400,
      `Property ${data.property_id} is the main meter for meter group ` +
      `${currReading.meter_group_id}. Its billings are generated automatically ` +
      `at billing cycle creation.`
    );
  }
}
```

Import `propertyRepository` at the top of `billing.service.ts`:

```typescript
import {propertyRepository} from "../property/property.repository";
```

- [ ] **Step 3.4: Run reading and billing tests**

```bash
cd api/functions && npx jest reading billing --no-coverage
```

Expected: all pass.

- [ ] **Step 3.5: Commit**

```bash
git add api/functions/src/features/reading/reading.service.ts api/functions/src/features/reading/reading.service.test.ts api/functions/src/features/billing/billing.validator.ts api/functions/src/features/billing/billing.service.ts
git commit -m "feat(reading,billing): reject main meter properties from manual create and batch"
```

---

## Task 4: Update BillingCycle model and DTO

**Files:**
- Modify: `api/functions/src/features/billing-cycle/billing-cycle.model.ts`
- Modify: `api/functions/src/features/billing-cycle/billing-cycle.dto.ts`

- [ ] **Step 4.1: Write failing test**

Add to `api/functions/src/features/billing-cycle/billing-cycle.validator.test.ts`:

```typescript
it('should reject create when meter_group_id is missing', async () => {
  await expect(
    billingCycleService.create({
      billing_ids: { 'b-1': 100 },
      billing_rate: 10,
      billing_consumption: 100,
      billing_start_date: Timestamp.fromDate(new Date('2026-04-01')),
      billing_end_date: Timestamp.fromDate(new Date('2026-04-30')),
      // meter_group_id intentionally omitted
    } as any)
  ).rejects.toBeDefined();
});
```

- [ ] **Step 4.2: Update `billing-cycle.model.ts`**

```typescript
import {Timestamp} from "firebase-admin/firestore";
import {BaseModel} from "../../utils/model.util";

export interface BillingCycle extends BaseModel {
    meter_group_id: string;
    billing_ids: Record<string, number>;
    billing_rate: number;
    billing_consumption: number;
    billing_start_date: Timestamp;
    billing_end_date: Timestamp;
}
```

- [ ] **Step 4.3: Update `billing-cycle.dto.ts`**

Add `meter_group_id` to `BillingCycleBaseSchema`:

```typescript
const BillingCycleBaseSchema = z.object({
  meter_group_id: z.string().trim().min(1),
  billing_ids: z
    .record(z.string(), z.number().nonnegative())
    .refine(
      (obj) => Object.keys(obj).length > 0,
      "billing_ids must not be empty"
    ),
  billing_rate: z.number().nonnegative(),
  billing_consumption: z.number().nonnegative(),
  billing_start_date: z.unknown().transform((val) => parseTimestamp(val)),
  billing_end_date: z.unknown().transform((val) => parseTimestamp(val)),
});
```

Add `meter_group_id` as optional to the update schema:

```typescript
const UpdateBillingCycleBaseSchema = z.object({
  meter_group_id: z.string().trim().min(1).optional(),
  billing_ids: z
    .record(z.string(), z.number().nonnegative())
    .optional(),
  billing_rate: z.number().nonnegative().optional(),
  billing_consumption: z.number().nonnegative().optional(),
  billing_start_date: z.unknown().transform((val) => val ? parseTimestamp(val) : undefined).optional(),
  billing_end_date: z.unknown().transform((val) => val ? parseTimestamp(val) : undefined).optional(),
});
```

- [ ] **Step 4.4: Run billing-cycle tests + type-check**

```bash
cd api/functions && npx jest billing-cycle --no-coverage && npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 4.5: Commit**

```bash
git add api/functions/src/features/billing-cycle/billing-cycle.model.ts api/functions/src/features/billing-cycle/billing-cycle.dto.ts api/functions/src/features/billing-cycle/billing-cycle.validator.test.ts
git commit -m "feat(billing-cycle): add meter_group_id field"
```

---

## Task 5: Billing cycle service — inject main meter billing

**Files:**
- Modify: `api/functions/src/features/billing-cycle/billing-cycle.service.ts`

- [ ] **Step 5.1: Write failing tests**

Add at the top of `api/functions/src/features/billing-cycle/billing-cycle.test.ts` (or create if missing):

```typescript
jest.mock('../property/property.service');
jest.mock('../reading/reading.service');
jest.mock('../billing/billing.repository');
jest.mock('./billing-cycle.repository');
jest.mock('./billing-cycle.validator');

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { billingCycleService } from './billing-cycle.service';
import { propertyService } from '../property/property.service';
import { readingService } from '../reading/reading.service';
import { billingRepository } from '../billing/billing.repository';
import { billingCycleRepository } from './billing-cycle.repository';
import { Timestamp } from 'firebase-admin/firestore';

const startDate = Timestamp.fromDate(new Date('2026-04-01'));
const endDate = Timestamp.fromDate(new Date('2026-04-30'));

const baseInput = {
  meter_group_id: 'mg-1',
  billing_ids: { 'b-101': 18, 'b-103': 5 },
  billing_rate: 12,
  billing_consumption: 30,
  billing_start_date: startDate,
  billing_end_date: endDate,
};

describe('billingCycleService.create - main meter injection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should inject derived billing for main meter property and pass to repository', async () => {
    jest.mocked(propertyService.search).mockResolvedValue({
      data: [{
        id: 'prop-100',
        room_name: 'Unit 100',
        tenant_amount: 1,
        meter_groups: {
          electricity: { meter_group_id: 'mg-1', is_main_meter: true },
          water: { meter_group_id: 'mg-water', is_main_meter: false },
        },
        created_at: startDate,
        updated_at: startDate,
        is_deleted: false,
        deleted_at: null,
      }],
      hasMore: false,
      nextCursor: null,
    });

    jest.mocked(readingService.create).mockResolvedValue({
      id: 'r-derived',
      meter_group_id: 'mg-1',
      property_id: 'prop-100',
      reading_amount: 27,
      reading_date: endDate,
      meter_version: 1,
      created_at: endDate,
      updated_at: endDate,
      is_deleted: false,
      deleted_at: null,
    });

    jest.mocked(billingRepository.search).mockResolvedValue({
      data: [{
        id: 'b-100-derived',
        property_id: 'prop-100',
        previous_reading_id: 'r-prev',
        current_reading_id: 'r-derived',
        payment_status: 'pending',
        created_at: endDate,
        updated_at: endDate,
        is_deleted: false,
        deleted_at: null,
      }],
      hasMore: false,
      nextCursor: null,
    });

    jest.mocked(billingCycleRepository.create).mockResolvedValue({
      id: 'cycle-1',
      ...baseInput,
      billing_ids: { 'b-101': 18, 'b-103': 5, 'b-100-derived': 7 },
      created_at: endDate,
      updated_at: endDate,
      is_deleted: false,
      deleted_at: null,
    });

    await billingCycleService.create(baseInput);

    const repoCallArg = jest.mocked(billingCycleRepository.create).mock.calls[0][0];
    expect(repoCallArg.billing_ids).toMatchObject({
      'b-101': 18,
      'b-103': 5,
      'b-100-derived': 7,
    });
    expect(repoCallArg.billing_ids['b-100-derived']).toBe(7); // derived = 30 - (18+5)
  });

  it('should throw 400 when main meter property has no seed reading', async () => {
    jest.mocked(propertyService.search).mockResolvedValue({
      data: [{
        id: 'prop-100',
        room_name: 'Unit 100',
        tenant_amount: 1,
        meter_groups: {
          electricity: { meter_group_id: 'mg-1', is_main_meter: true },
          water: { meter_group_id: 'mg-water', is_main_meter: false },
        },
        created_at: startDate,
        updated_at: startDate,
        is_deleted: false,
        deleted_at: null,
      }],
      hasMore: false,
      nextCursor: null,
    });

    // readingService.create throws because findPreviousMonthReading returns null
    jest.mocked(readingService.create).mockRejectedValue(
      Object.assign(new Error('No seed reading'), { statusCode: 400 })
    );

    await expect(billingCycleService.create(baseInput)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('should skip injection when no main meter property exists for meter group', async () => {
    jest.mocked(propertyService.search).mockResolvedValue({
      data: [{
        id: 'prop-101',
        room_name: 'Unit 101',
        tenant_amount: 1,
        meter_groups: {
          electricity: { meter_group_id: 'mg-1', is_main_meter: false },
          water: { meter_group_id: 'mg-water', is_main_meter: false },
        },
        created_at: startDate,
        updated_at: startDate,
        is_deleted: false,
        deleted_at: null,
      }],
      hasMore: false,
      nextCursor: null,
    });

    jest.mocked(billingCycleRepository.create).mockResolvedValue({
      id: 'cycle-1',
      ...baseInput,
      created_at: endDate,
      updated_at: endDate,
      is_deleted: false,
      deleted_at: null,
    });

    await billingCycleService.create(baseInput);

    // readingService.create must NOT have been called
    expect(readingService.create).not.toHaveBeenCalled();
    // billing_ids must be unchanged
    const repoCallArg = jest.mocked(billingCycleRepository.create).mock.calls[0][0];
    expect(Object.keys(repoCallArg.billing_ids)).toHaveLength(2);
  });
});
```

- [ ] **Step 5.2: Add imports to `billing-cycle.service.ts`**

Add at top of file:

```typescript
import {propertyService} from "../property/property.service";
import {readingService} from "../reading/reading.service";
import {billingRepository} from "../billing/billing.repository";
import {findPreviousMonthReading} from "../reading/reading.util";
import {AppError} from "../../utils/error.util";
```

- [ ] **Step 5.3: Add `injectMainMeterBilling` method to `billingCycleService`**

Add as a standalone async function at the top of the file (above the exported service object):

```typescript
async function injectMainMeterBilling(
  data: CreateBillingCycleDTO
): Promise<CreateBillingCycleDTO> {
  const allProperties = await propertyService.search({
    meterGroupId: data.meter_group_id,
    limit: 100,
  });

  const mainMeterProperty = allProperties.data.find((p) =>
    Object.values(p.meter_groups).some(
      (e) => e.meter_group_id === data.meter_group_id && e.is_main_meter
    )
  );

  if (!mainMeterProperty) return data;

  const submeterTotal = Object.values(data.billing_ids).reduce(
    (sum, c) => sum + c,
    0
  );
  const derivedConsumption = data.billing_consumption - submeterTotal;

  const prevReading = await findPreviousMonthReading(
    data.meter_group_id,
    mainMeterProperty.id,
    data.billing_end_date
  );

  if (!prevReading) {
    throw new AppError(
      400,
      `Main meter property "${mainMeterProperty.id}" has no seed reading. ` +
        `Record a baseline reading via POST /readings/seed before creating this billing cycle.`
    );
  }

  const derivedReadingAmount =
    prevReading.data.reading_amount + derivedConsumption;

  const derivedReading = await readingService.create({
    meter_group_id: data.meter_group_id,
    property_id: mainMeterProperty.id,
    reading_amount: derivedReadingAmount,
    reading_date: data.billing_end_date,
  });

  const {data: billings} = await billingRepository.search({
    limit: 1,
    orderBy: "created_at",
    filters: {current_reading_id: derivedReading.id},
  });

  if (!billings.length) {
    throw new AppError(
      500,
      "Failed to auto-create billing for main meter property. " +
        "Ensure the main meter property has a seed reading from a prior month."
    );
  }

  return {
    ...data,
    billing_ids: {
      ...data.billing_ids,
      [billings[0].id]: derivedConsumption,
    },
  };
}
```

- [ ] **Step 5.4: Call `injectMainMeterBilling` in `create()` and `createBatch()`**

Update `create()`:

```typescript
async create(data: CreateBillingCycleDTO): Promise<BillingCycle> {
  const enrichedData = await injectMainMeterBilling(data);
  await validator.validateCreate(enrichedData);
  return billingCycleRepository.create(enrichedData);
},
```

Update `createBatch()`:

```typescript
async createBatch(data: CreateBillingCycleDTO[]): Promise<BillingCycle[]> {
  const enriched = await Promise.all(data.map(injectMainMeterBilling));
  await validator.validateBatch(enriched);
  return billingCycleRepository.createBatch(enriched);
},
```

- [ ] **Step 5.5: Run billing-cycle tests + type-check**

```bash
cd api/functions && npx jest billing-cycle --no-coverage && npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 5.6: Commit**

```bash
git add api/functions/src/features/billing-cycle/billing-cycle.service.ts api/functions/src/features/billing-cycle/billing-cycle.test.ts
git commit -m "feat(billing-cycle): auto-derive main meter reading+billing on cycle create"
```

---

## Task 6: Seed reading endpoint

**Files:**
- Modify: `api/functions/src/features/reading/reading.dto.ts`
- Modify: `api/functions/src/features/reading/reading.validator.ts`
- Modify: `api/functions/src/features/reading/reading.service.ts`
- Modify: `api/functions/src/features/reading/reading.controller.ts`
- Modify: `api/functions/src/features/reading/reading.route.ts`

- [ ] **Step 6.1: Write failing test**

Add to `api/functions/src/features/reading/reading.service.test.ts`:

```typescript
describe('readingService.createSeed', () => {
  it('should reject if property is not main meter for the meter group', async () => {
    // Property has is_main_meter: false for mg-1
    await expect(
      readingService.createSeed({
        meter_group_id: 'mg-1',
        property_id: 'regular-prop',
        reading_amount: 100,
        reading_date: Timestamp.now(),
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should reject if a reading already exists for this property + meter group', async () => {
    // Property is main meter, but a reading already exists
    await expect(
      readingService.createSeed({
        meter_group_id: 'mg-1',
        property_id: 'main-prop',
        reading_amount: 100,
        reading_date: Timestamp.now(),
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('should create a reading when property is main meter and no prior reading exists', async () => {
    // Property is main meter, no existing reading
    const result = await readingService.createSeed({
      meter_group_id: 'mg-1',
      property_id: 'main-prop',
      reading_amount: 100,
      reading_date: Timestamp.now(),
    });
    expect(result.property_id).toBe('main-prop');
  });
});
```

- [ ] **Step 6.2: Add `CreateSeedReadingDTOSchema` to `reading.dto.ts`**

Add after the existing `CreateReadingDTOSchema`:

```typescript
export const CreateSeedReadingDTOSchema = CreateReadingDTOSchema;
export type CreateSeedReadingDTO = z.infer<typeof CreateSeedReadingDTOSchema>;
```

- [ ] **Step 6.3: Add `validateSeedCreate` to `reading.validator.ts`**

Import `propertyRepository` at the top:

```typescript
import {propertyRepository} from "../property/property.repository";
```

Add method to `ReadingValidator`:

```typescript
async validateSeedCreate(data: CreateReadingDTO): Promise<void> {
  await this.validateMeterGroupExists(data.meter_group_id);
  this.validateReadingAmount(data.reading_amount);
  this.validateReadingDate(data.reading_date);

  const property = await propertyRepository.getById(data.property_id);
  if (!property) {
    throw new AppError(404, "Property not found");
  }

  const entry = Object.values(property.meter_groups).find(
    (e) => e.meter_group_id === data.meter_group_id
  );
  if (!entry?.is_main_meter) {
    throw new AppError(
      400,
      `Property ${data.property_id} is not the main meter for meter group ${data.meter_group_id}`
    );
  }

  const existing = await readingRepository.search({
    limit: 1,
    orderBy: "created_at",
    filters: {
      property_id: data.property_id,
      meter_group_id: data.meter_group_id,
    },
  });

  if (existing.data.length > 0) {
    throw new AppError(
      409,
      "A seed reading already exists for this property and meter group. " +
        "All subsequent readings are auto-derived at billing cycle creation."
    );
  }
}
```

- [ ] **Step 6.4: Add `createSeed` to `readingService` in `reading.service.ts`**

Add after the `create` method:

```typescript
async createSeed(data: CreateReadingDTO): Promise<Reading> {
  await validator.validateSeedCreate(data);
  const meterGroup = await meterGroupRepository.getById(data.meter_group_id);
  const meter_version = meterGroup!.current_version ?? 1;
  const payload: ReadingCreatePayload = { ...data, meter_version };
  return readingRepository.create(payload);
},
```

- [ ] **Step 6.5: Add `createSeedReading` handler to `reading.controller.ts`**

Import the new DTO type at the top (add to existing import block):

```typescript
import {
  CreateReadingDTO,
  CreateSeedReadingDTO,
  ReadingByIdParamsDTO,
  GetReadingsQueryDTO,
  UpdateReadingDTO,
  OcrReadingDTO,
} from "./reading.dto";
```

Add the handler:

```typescript
export const createSeedReading = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreateSeedReadingDTO;
  const result = await readingService.createSeed(data);
  res.status(201).json(result);
};
```

- [ ] **Step 6.6: Add `POST /seed` route to `reading.route.ts`**

Import `createSeedReading` in the imports block:

```typescript
import {
  createReading,
  createSeedReading,
  getReadingById,
  getReadings,
  updateReading,
  deleteReading,
  softDeleteReading,
  restoreReading,
  createBatchReadings,
  updateBatchReadings,
  ocrReading,
} from "./reading.controller";
```

Import the seed schema:

```typescript
import {
  CreateReadingBatchDTOSchema,
  CreateReadingDTOSchema,
  CreateSeedReadingDTOSchema,
  ReadingByIdParamsDTOSchema,
  GetReadingsQueryDTOSchema,
  UpdateReadingBatchDTOSchema,
  UpdateReadingDTOSchema,
  OcrReadingDTOSchema,
} from "./reading.dto";
```

Add the route before `router.post("/", ...)`:

```typescript
router.post(
  "/seed",
  validateRequest({body: CreateSeedReadingDTOSchema}),
  requireRole('admin', 'landlord', 'assistant'),
  createSeedReading
);
```

- [ ] **Step 6.7: Run all reading tests + type-check**

```bash
cd api/functions && npx jest reading --no-coverage && npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 6.8: Commit**

```bash
git add api/functions/src/features/reading/
git commit -m "feat(reading): add POST /readings/seed for main meter property baseline"
```

---

## Task 7: Migration script

**Files:**
- Create: `api/functions/src/migrations/migrate-meter-groups.ts`

- [ ] **Step 7.1: Create the migrations directory and script**

```bash
mkdir -p api/functions/src/migrations
```

Create `api/functions/src/migrations/migrate-meter-groups.ts`:

```typescript
/**
 * One-time migration: converts Property.meter_groups values from bare
 * meter_group_id strings to { meter_group_id, is_main_meter: false } objects.
 *
 * Run once against the target environment:
 *   APP_ENV=dev npx tsx src/migrations/migrate-meter-groups.ts
 *
 * Safe to re-run — skips documents already in the new format.
 */
import {initializeApp, cert} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import * as path from "path";

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credentialsPath) {
  throw new Error("GOOGLE_APPLICATION_CREDENTIALS env var is required");
}

initializeApp({
  credential: cert(path.resolve(credentialsPath)),
});

const db = getFirestore();
const PROPERTIES_COLLECTION = "properties";

async function migrate(): Promise<void> {
  const snapshot = await db.collection(PROPERTIES_COLLECTION).get();
  let migrated = 0;
  let skipped = 0;

  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const meterGroups = data.meter_groups as Record<string, any>;

    if (!meterGroups) {
      skipped++;
      continue;
    }

    let needsMigration = false;
    const updated: Record<string, any> = {};

    for (const [utilityType, value] of Object.entries(meterGroups)) {
      if (typeof value === "string") {
        updated[utilityType] = { meter_group_id: value, is_main_meter: false };
        needsMigration = true;
      } else {
        // Already in new format — preserve as-is
        updated[utilityType] = value;
      }
    }

    if (!needsMigration) {
      skipped++;
      continue;
    }

    batch.update(doc.ref, { meter_groups: updated });
    migrated++;
  }

  await batch.commit();
  console.log(`Migration complete. Migrated: ${migrated}, Skipped: ${skipped}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

- [ ] **Step 7.2: Verify the script compiles**

```bash
cd api/functions && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7.3: Run migration against local/staging (manual step)**

```bash
cd api/functions
export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/secrets/utilitool-staging-firebase-adminsdk-fbsvc-1fe128504a.json
npx tsx src/migrations/migrate-meter-groups.ts
```

Expected output: `Migration complete. Migrated: N, Skipped: 0`

- [ ] **Step 7.4: Commit**

```bash
git add api/functions/src/migrations/migrate-meter-groups.ts
git commit -m "chore(migration): convert property meter_groups strings to MeterGroupEntry objects"
```

---

## Task 8: Full test suite + type-check

- [ ] **Step 8.1: Run all tests**

```bash
cd api/functions && npx jest --no-coverage
```

Expected: all tests pass with no failures.

- [ ] **Step 8.2: Full type-check**

```bash
cd api/functions && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 8.3: Lint**

```bash
cd api/functions && npm run lint
```

Expected: no errors.

- [ ] **Step 8.4: Final commit if any lint fixes were needed**

```bash
git add -p
git commit -m "chore: lint fixes for main meter property feature"
```
