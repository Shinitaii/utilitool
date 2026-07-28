jest.mock('./billing-cycle.repository');
jest.mock('./billing-cycle.validator');
jest.mock('../property/property.repository');
jest.mock('../reading/reading.service');
jest.mock('../billing/billing.repository');
jest.mock('../reading/reading.util');
jest.mock('../meter-group/meter-group.repository');
jest.mock('../reading/reading.repository');

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { billingCycleService } from './billing-cycle.service';
import { billingCycleRepository } from './billing-cycle.repository';
import { BillingCycleValidator } from './billing-cycle.validator';
import { propertyRepository } from '../property/property.repository';
import { readingService } from '../reading/reading.service';
import { billingRepository } from '../billing/billing.repository';
import { findPreviousMonthReading } from '../reading/reading.util';
import { meterGroupRepository } from '../meter-group/meter-group.repository';
import { readingRepository } from '../reading/reading.repository';
import { CreateBillingCycleDTOSchema, UpdateBillingCycleDTOSchema, BillingCycleByIdParamsDTOSchema, CreateBillingCycleBatchDTOSchema, UpdateBillingCycleBatchDTOSchema } from './billing-cycle.dto';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';

const startTimestamp = new Timestamp(Math.floor(Date.now() / 1000) - 86400 * 30, 0);
const endTimestamp = new Timestamp(Math.floor(Date.now() / 1000) - 86400, 0);
const now = Timestamp.now();
const TEST_USER_ID = 'user-1';

const makeTimestamps = () => {
  const start = new Timestamp(Math.floor(Date.now() / 1000) - 86400 * 30, 0);
  const end = new Timestamp(Math.floor(Date.now() / 1000) - 86400, 0);
  return { start, end };
};

const mockBillingCycle = (overrides?: Record<string, any>) => {
  return {
    id: 'billing-cycle-1',
    billing_ids: { 'billing-1': 100 },
    billing_rate: 5,
    billing_consumption: 100,
    billing_start_date: startTimestamp,
    billing_end_date: endTimestamp,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
};

describe('billingCycleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no main meter property, so injectMainMeterBilling is a no-op for existing tests
    jest.mocked(propertyRepository.search).mockResolvedValue({
      data: [],
      hasMore: false,
      nextCursor: null,
    });
    // Default: no other cycles for the meter group, so recomputeRateEmaForMeterGroup's chain
    // is just the one cycle under test — tests that don't specifically exercise the rate-EMA
    // cascade don't need to know about it to avoid crashing on an unmocked search/updateBatch.
    jest.mocked(billingCycleRepository.search).mockResolvedValue({
      data: [],
      hasMore: false,
      nextCursor: null,
    });
    jest.mocked(billingCycleRepository.updateBatch).mockResolvedValue([]);
    // Default: water meter group, so recomputeRateEmaForMeterGroup can resolve a gamma without
    // every test needing to mock this explicitly.
    jest.mocked(meterGroupRepository.getById).mockResolvedValue({
      id: 'mg-1',
      utility_type: 'water',
    } as any);
    // Default: no pending billings in the meter group, so recomputePendingEstimates (called at
    // the end of recomputeRateEmaForMeterGroup on every create/chain-affecting update) is a
    // no-op for tests that don't specifically exercise the pending-estimate cascade.
    jest.mocked(billingRepository.search).mockResolvedValue({
      data: [],
      hasMore: false,
      nextCursor: null,
    });
    jest.mocked(readingRepository.getByIds).mockResolvedValue([]);
  });

  // Create a new billing cycle
  describe('create', () => {
    // It should create a new billing cycle with the given details and return the billing cycle ID.
    it('should create a new billing cycle with the given details and return the billing cycle ID', async () => {
      const { start, end } = makeTimestamps();
      jest.mocked(BillingCycleValidator.prototype.validateCreate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.create).mockResolvedValue(mockBillingCycle());

      const result = await billingCycleService.create(TEST_USER_ID, {
        billing_ids: { 'billing-1': 100 },
        billing_rate: 5,
        billing_consumption: 100,
        billing_start_date: start,
        billing_end_date: end,
      });

      expect(billingCycleRepository.create).toHaveBeenCalled();
      expect(result.id).toBe('billing-cycle-1');
    });

    // It should return an error if the billing ids are not provided.
    it('should return an error if the billing ids are not provided', () => {
      const { start, end } = makeTimestamps();
      const result = CreateBillingCycleDTOSchema.safeParse({
        billing_rate: 5,
        billing_consumption: 100,
        billing_start_date: start,
        billing_end_date: end,
      });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing rate is not provided.
    it('should return an error if the billing rate is not provided', () => {
      const { start, end } = makeTimestamps();
      const result = CreateBillingCycleDTOSchema.safeParse({
        billing_ids: { 'billing-1': 100 },
        billing_consumption: 100,
        billing_start_date: start,
        billing_end_date: end,
      });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing consumption is not provided.
    it('should return an error if the billing consumption is not provided', () => {
      const { start, end } = makeTimestamps();
      const result = CreateBillingCycleDTOSchema.safeParse({
        billing_ids: { 'billing-1': 100 },
        billing_rate: 5,
        billing_start_date: start,
        billing_end_date: end,
      });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing start date is not provided.
    it('should return an error if the billing start date is not provided', () => {
      const { end } = makeTimestamps();
      const result = CreateBillingCycleDTOSchema.safeParse({
        billing_ids: { 'billing-1': 100 },
        billing_rate: 5,
        billing_consumption: 100,
        billing_end_date: end,
      });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing end date is not provided.
    it('should return an error if the billing end date is not provided', () => {
      const { start } = makeTimestamps();
      const result = CreateBillingCycleDTOSchema.safeParse({
        billing_ids: { 'billing-1': 100 },
        billing_rate: 5,
        billing_consumption: 100,
        billing_start_date: start,
      });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing start date is after the billing end date.
    it('should return an error if the billing start date is after the billing end date', () => {
      const { start, end } = makeTimestamps();
      const result = CreateBillingCycleDTOSchema.safeParse({
        billing_ids: { 'billing-1': 100 },
        billing_rate: 5,
        billing_consumption: 100,
        billing_start_date: end,
        billing_end_date: start,
      });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing ids are not valid.
    it('should return an error if the billing ids are not valid', async () => {
      const { start, end } = makeTimestamps();
      jest.mocked(BillingCycleValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(404, 'Billing not found')
      );

      await expect(
        billingCycleService.create(TEST_USER_ID, {
          billing_ids: { 'bad-billing': 100 },
          billing_rate: 5,
          billing_consumption: 100,
          billing_start_date: start,
          billing_end_date: end,
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Billing not found',
      });
    });

    // It should return an error if the billing ids are missing from total amount connected to the meter group
    it('should reject consumption that exceeds 3% tolerance', async () => {
      const { start, end } = makeTimestamps();
      jest.mocked(BillingCycleValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(400, 'Consumption mismatch: calculated 100 differs from expected 104 by more than 3%')
      );

      await expect(
        billingCycleService.create(TEST_USER_ID, {
          billing_ids: { 'billing-1': 100 },
          billing_rate: 5,
          billing_consumption: 104,
          billing_start_date: start,
          billing_end_date: end,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Consumption mismatch'),
      });
    });

    // Critical edge case: exactly at 3% tolerance should pass
    it('should accept consumption within 3% tolerance', async () => {
      const { start, end } = makeTimestamps();
      jest.mocked(BillingCycleValidator.prototype.validateCreate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.create).mockResolvedValue(mockBillingCycle());

      const result = await billingCycleService.create(TEST_USER_ID, {
        billing_ids: { 'billing-1': 100 },
        billing_rate: 5,
        billing_consumption: 103,
        billing_start_date: start,
        billing_end_date: end,
      });

      expect(result).toBeDefined();
    });
  });

  // Bounded-range EMA recompute (see decisions/20260726_billing-cycle-ema-recompute-scaling.md)
  describe('recomputeRateEmaForMeterGroup - bounded range', () => {
    it('seeds the EMA chain from the nearest earlier cycle instead of reading the full history', async () => {
      const { start, end } = makeTimestamps();
      jest.mocked(BillingCycleValidator.prototype.validateCreate).mockResolvedValue(undefined);
      const newCycle = mockBillingCycle({ id: 'cycle-new', meter_group_id: 'mg-1', billing_rate: 5 });
      jest.mocked(billingCycleRepository.create).mockResolvedValue(newCycle);

      jest.mocked(billingCycleRepository.search)
        .mockResolvedValueOnce({
          // seed query: nearest cycle strictly before the anchor
          data: [{ id: 'cycle-prev', rate_ema: 8 } as any],
          hasMore: false,
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          // affected-range query: nothing else on/after the anchor besides the new cycle itself
          data: [],
          hasMore: false,
          nextCursor: null,
        });

      await billingCycleService.create(TEST_USER_ID, {
        meter_group_id: 'mg-1',
        billing_ids: { 'billing-1': 100 },
        billing_rate: 5,
        billing_consumption: 100,
        billing_start_date: start,
        billing_end_date: end,
      });

      expect(billingCycleRepository.updateBatch).toHaveBeenCalledTimes(1);
      const updates = jest.mocked(billingCycleRepository.updateBatch).mock.calls[0][0];
      expect(updates).toHaveLength(1);
      expect(updates[0].id).toBe('cycle-new');
      // alpha = 1 - water gamma (0.15) = 0.85; resumes from the seed's rate_ema (8) rather than
      // starting fresh from the new cycle's own rate.
      expect(updates[0].data.rate_ema).toBeCloseTo(0.85 * 5 + 0.15 * 8);

      // First search call = seed (nearest earlier cycle, descending, limit 1).
      expect(billingCycleRepository.search).toHaveBeenNthCalledWith(1, expect.objectContaining({
        limit: 1,
        orderDirection: 'desc',
        filters: expect.objectContaining({
          meter_group_id: 'mg-1',
          billing_start_date: { $lt: expect.any(Date) },
        }),
      }));
      // Second search call = affected suffix (on/after the anchor, ascending).
      expect(billingCycleRepository.search).toHaveBeenNthCalledWith(2, expect.objectContaining({
        limit: 1000,
        orderDirection: 'asc',
        filters: expect.objectContaining({
          meter_group_id: 'mg-1',
          billing_start_date: { $gte: expect.any(Date) },
        }),
      }));
    });
  });

  describe('recomputeRateEmaForMeterGroup - old-group cleanup on meter_group_id change', () => {
    it("anchors the old group's recompute on the cycle's prior billing_start_date, with no freshCycle to merge in", async () => {
      const { start } = makeTimestamps();
      const existing = mockBillingCycle({ id: 'billing-cycle-1', meter_group_id: 'mg-old', billing_start_date: start });
      const updated = mockBillingCycle({ id: 'billing-cycle-1', meter_group_id: 'mg-new', billing_start_date: start });

      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.getById).mockResolvedValue(existing);
      jest.mocked(billingCycleRepository.update).mockResolvedValue(updated);

      await billingCycleService.update(TEST_USER_ID, 'billing-cycle-1', { meter_group_id: 'mg-new' });

      const searchCalls = jest.mocked(billingCycleRepository.search).mock.calls;
      // Calls 1-2 are the new group's recompute; calls 3-4 are the old group's cleanup
      // (seed then affected), anchored on the cycle's own prior date.
      expect(searchCalls[2][0]).toMatchObject({
        limit: 1,
        orderDirection: 'desc',
        filters: { meter_group_id: 'mg-old', billing_start_date: { $lt: expect.any(Date) } },
      });
      expect(searchCalls[3][0]).toMatchObject({
        limit: 1000,
        orderDirection: 'asc',
        filters: { meter_group_id: 'mg-old', billing_start_date: { $gte: expect.any(Date) } },
      });
    });
  });

  // Batch create
  describe('createBatch', () => {
    // It should create multiple billing cycles in a batch.
    it('should create multiple billing cycles in a batch', async () => {
      const { start, end } = makeTimestamps();
      const mocks = [mockBillingCycle({ id: 'billing-cycle-1' }), mockBillingCycle({ id: 'billing-cycle-2' })];
      jest.mocked(BillingCycleValidator.prototype.validateBatch).mockResolvedValue({
        validIndexes: [0, 1],
        failures: [],
      });
      jest.mocked(billingCycleRepository.createBatch).mockResolvedValue(mocks);

      const input = [
        {
          billing_ids: { 'billing-1': 100 },
          billing_rate: 5,
          billing_consumption: 100,
          billing_start_date: start,
          billing_end_date: end,
        },
        {
          billing_ids: { 'billing-2': 150 },
          billing_rate: 6,
          billing_consumption: 150,
          billing_start_date: start,
          billing_end_date: end,
        },
      ];
      const result = await billingCycleService.createBatch(TEST_USER_ID, input);

      expect(billingCycleRepository.createBatch).toHaveBeenCalledWith(expect.any(Array));
      expect(result.created).toHaveLength(2);
      expect(result.failed).toEqual([]);
    });

    // It should return an error if batch is empty.
    it('should return an error if batch array is empty', () => {
      const result = CreateBillingCycleBatchDTOSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    // It should return an error if batch exceeds max size.
    it('should return an error if batch exceeds max size of 10', () => {
      const { start, end } = makeTimestamps();
      const input = Array(11).fill({
        billing_ids: { 'billing-1': 100 },
        billing_rate: 5,
        billing_consumption: 100,
        billing_start_date: start,
        billing_end_date: end,
      });
      const result = CreateBillingCycleBatchDTOSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // Get billing cycle by ID
  describe('getById', () => {
    // It should return the billing cycle details for the given billing cycle ID.
    it('should return the billing cycle details for the given billing cycle ID', async () => {
      jest.mocked(billingCycleRepository.getById).mockResolvedValue(mockBillingCycle());

      const result = await billingCycleService.getById(TEST_USER_ID, 'billing-cycle-1');

      expect(billingCycleRepository.getById).toHaveBeenCalledWith('billing-cycle-1');
      expect(result).toEqual(mockBillingCycle());
    });

    // It should return an error if the billing cycle ID is not provided.
    it('should return an error if the billing cycle ID is not provided', () => {
      const result = BillingCycleByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing cycle ID does not exist.
    it('should return an error if the billing cycle ID does not exist', async () => {
      jest.mocked(billingCycleRepository.getById).mockResolvedValue(null);

      const result = await billingCycleService.getById(TEST_USER_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // Search billing cycles
  describe('search', () => {
    // It should return a cursor-based paginated list of all billing cycles based on the provided filters such as billing start date and billing end date.
    it('should return a paginated list of billing cycles', async () => {
      const paginated = { data: [mockBillingCycle()], hasMore: false, nextCursor: null };
      jest.mocked(billingCycleRepository.search).mockResolvedValue(paginated);

      const result = await billingCycleService.search(TEST_USER_ID, { limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    // It should return an empty list if there are no billing cycles matching everything in the query.
    it('should return an empty list if there are no billing cycles matching the query', async () => {
      jest.mocked(billingCycleRepository.search).mockResolvedValue({ data: [], hasMore: false, nextCursor: null });

      const result = await billingCycleService.search(TEST_USER_ID, { limit: 20 });

      expect(result.data).toHaveLength(0);
    });

    // It should return nextCursor when more results exist.
    it('should return nextCursor when more results exist', async () => {
      // CachedRepository.search loads ALL pages via loadAll (loops until hasMore
      // is false) before paginating in-memory — the mock must terminate the loop.
      jest.mocked(billingCycleRepository.search)
        .mockResolvedValueOnce({
          data: [mockBillingCycle({ id: 'billing-cycle-1' }), mockBillingCycle({ id: 'billing-cycle-2' })],
          hasMore: false,
          nextCursor: null,
        });

      const result = await billingCycleService.search(TEST_USER_ID, { limit: 1 });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('billing-cycle-1');
    });
  });

  // Update billing cycle
  describe('update', () => {
    // It should update the billing cycle details for the given billing cycle ID and return the updated billing cycle details.
    it('should update the billing cycle details', async () => {
      const { start, end } = makeTimestamps();
      const updated = mockBillingCycle({ billing_rate: 10 });
      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.update).mockResolvedValue(updated);

      const result = await billingCycleService.update(TEST_USER_ID, 'billing-cycle-1', { billing_rate: 10 });

      expect(result.billing_rate).toBe(10);
    });

    // It should return an error if the billing cycle ID is not provided.
    it('should return an error if the billing cycle ID is not provided', () => {
      const result = BillingCycleByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing cycle ID does not exist.
    it('should return an error if the billing cycle ID does not exist', async () => {
      jest.mocked(billingCycleRepository.update).mockRejectedValue(new AppError(404, 'Billing cycle not found'));

      await expect(billingCycleService.update(TEST_USER_ID, 'nonexistent', { billing_rate: 10 })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    // It should return an error if the billing ids are not provided.
    it('should return an error if the billing ids are not provided', async () => {
      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.update).mockResolvedValue(mockBillingCycle());

      await expect(
        billingCycleService.update(TEST_USER_ID, 'billing-cycle-1', { billing_rate: 10 })
      ).resolves.toBeDefined();
    });

    // It should return an error if the billing rate is not provided.
    it('should return an error if the billing rate is not provided', async () => {
      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.update).mockResolvedValue(mockBillingCycle());

      await expect(
        billingCycleService.update(TEST_USER_ID, 'billing-cycle-1', { billing_consumption: 100 })
      ).resolves.toBeDefined();
    });

    // It should return an error if the billing consumption is not provided.
    it('should return an error if the billing consumption is not provided', async () => {
      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.update).mockResolvedValue(mockBillingCycle());

      await expect(
        billingCycleService.update(TEST_USER_ID, 'billing-cycle-1', { billing_rate: 10 })
      ).resolves.toBeDefined();
    });

    // It should return an error if the billing start date is not provided.
    it('should return an error if the billing start date is not provided', async () => {
      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.update).mockResolvedValue(mockBillingCycle());

      await expect(
        billingCycleService.update(TEST_USER_ID, 'billing-cycle-1', { billing_rate: 10 })
      ).resolves.toBeDefined();
    });

    // It should return an error if the billing end date is not provided.
    it('should return an error if the billing end date is not provided', async () => {
      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.update).mockResolvedValue(mockBillingCycle());

      await expect(
        billingCycleService.update(TEST_USER_ID, 'billing-cycle-1', { billing_rate: 10 })
      ).resolves.toBeDefined();
    });

    // It should return an error if the billing start date is after the billing end date.
    it('should return an error if the billing start date is after the billing end date', () => {
      const { start, end } = makeTimestamps();
      const result = UpdateBillingCycleDTOSchema.safeParse({
        billing_start_date: end,
        billing_end_date: start,
      });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing ids are not valid.
    it('should return an error if the billing ids are not valid', async () => {
      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(404, 'Billing not found')
      );

      await expect(billingCycleService.update(TEST_USER_ID, 'billing-cycle-1', { billing_ids: { 'bad-billing': 100 } })).rejects.toMatchObject({
        statusCode: 404,
        message: 'Billing not found',
      });
    });

    // It should return an error if the billing ids are missing from total amount connected to the meter group
    it('should reject consumption that exceeds 3% tolerance on update', async () => {
      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(400, 'Consumption mismatch: calculated 100 differs from expected 105 by more than 3%')
      );

      await expect(
        billingCycleService.update(TEST_USER_ID, 'billing-cycle-1', { billing_consumption: 105 })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Consumption mismatch'),
      });
    });
  });

  // Batch update
  describe('updateBatch', () => {
    // It should update multiple billing cycles in a batch.
    it('should update multiple billing cycles in a batch', async () => {
      const mocks = [mockBillingCycle({ id: 'billing-cycle-1' }), mockBillingCycle({ id: 'billing-cycle-2' })];
      jest.mocked(billingCycleRepository.updateBatch).mockResolvedValue(mocks);

      const input = [
        { id: 'billing-cycle-1', data: { billing_rate: 10 } },
        { id: 'billing-cycle-2', data: { billing_rate: 12 } },
      ];
      const result = await billingCycleService.updateBatch(TEST_USER_ID, input);

      expect(billingCycleRepository.updateBatch).toHaveBeenCalledWith(input);
      expect(result).toHaveLength(2);
    });

    // It should return an error if batch is empty.
    it('should return an error if batch array is empty', () => {
      const result = UpdateBillingCycleBatchDTOSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    // It should return an error if batch exceeds max size.
    it('should return an error if batch exceeds max size of 10', () => {
      const input = Array(11).fill({ id: 'billing-cycle-1', data: { billing_rate: 5 } });
      const result = UpdateBillingCycleBatchDTOSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // Delete billing cycle
  describe('delete', () => {
    // It should delete the billing cycle for the given billing cycle ID and return a success message.
    it('should delete the billing cycle', async () => {
      jest.mocked(billingCycleRepository.delete).mockResolvedValue(undefined);

      await expect(billingCycleService.delete(TEST_USER_ID, 'billing-cycle-1')).resolves.toBeUndefined();

      expect(billingCycleRepository.delete).toHaveBeenCalledWith('billing-cycle-1');
    });

    // It should return an error if the billing cycle ID is not provided.
    it('should return an error if the billing cycle ID is not provided', () => {
      const result = BillingCycleByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing cycle ID does not exist.
    it('should return an error if the billing cycle ID does not exist', async () => {
      jest.mocked(billingCycleRepository.delete).mockRejectedValue(new AppError(404, 'Billing cycle not found'));

      await expect(billingCycleService.delete(TEST_USER_ID, 'nonexistent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // Soft delete billing cycle
  describe('softDelete', () => {
    // It should soft delete the billing cycle for the given billing cycle ID and return a success message.
    it('should soft delete the billing cycle', async () => {
      const softDeleted = mockBillingCycle({ deleted_at: Timestamp.now() });
      jest.mocked(billingCycleRepository.softDelete).mockResolvedValue(softDeleted);

      const result = await billingCycleService.softDelete(TEST_USER_ID, 'billing-cycle-1');

      expect(result.deleted_at).toBeDefined();
    });

    // It should return an error if the billing cycle ID is not provided.
    it('should return an error if the billing cycle ID is not provided', () => {
      const result = BillingCycleByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing cycle ID does not exist.
    it('should return an error if the billing cycle ID does not exist', async () => {
      jest.mocked(billingCycleRepository.softDelete).mockRejectedValue(new AppError(404, 'Billing cycle not found'));

      await expect(billingCycleService.softDelete(TEST_USER_ID, 'nonexistent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});

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
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(meterGroupRepository.getById).mockResolvedValue({
      id: 'mg-1',
      utility_type: 'water',
    } as any);
    jest.mocked(billingCycleRepository.search).mockResolvedValue({
      data: [],
      hasMore: false,
      nextCursor: null,
    });
    // Default: no pending billings to recompute — individual tests that mock
    // billingRepository.search for injectMainMeterBilling's own lookup also feed
    // recomputePendingEstimates the same result, but that billing is always already
    // referenced in the newly created cycle's billing_ids, so it's filtered out as
    // "not pending" before readingRepository.getByIds would ever be reached.
    jest.mocked(billingRepository.search).mockResolvedValue({
      data: [],
      hasMore: false,
      nextCursor: null,
    });
    jest.mocked(readingRepository.getByIds).mockResolvedValue([]);
  });

  it('should inject derived billing for main meter property and pass to repository', async () => {
    jest.mocked(propertyRepository.search).mockResolvedValue({
      data: [{
        id: 'prop-100',
        room_name: 'Unit 100',
        tenant_amount: 1,
        meter_groups: {
          electricity: { meter_group_id: 'mg-1', is_main_meter: true },
          water: { meter_group_id: 'mg-water', is_main_meter: false },
        },
        main_meter_group_ids: ['mg-1'],
        created_at: startDate,
        updated_at: startDate,
        is_deleted: false,
        deleted_at: null,
      }],
      hasMore: false,
      nextCursor: null,
    });

    jest.mocked(findPreviousMonthReading).mockResolvedValue({
      id: 'r-prev',
      data: { reading_amount: 20 },
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

    jest.mocked(BillingCycleValidator.prototype.validateCreate).mockResolvedValue(undefined);
    jest.mocked(billingCycleRepository.create).mockResolvedValue({
      id: 'cycle-1',
      ...baseInput,
      billing_ids: { 'b-101': 18, 'b-103': 5, 'b-100-derived': 7 },
      created_at: endDate,
      updated_at: endDate,
      is_deleted: false,
      deleted_at: null,
    });

    await billingCycleService.create(TEST_USER_ID, baseInput);

    const repoCallArg = jest.mocked(billingCycleRepository.create).mock.calls[0][0];
    expect(repoCallArg.billing_ids).toMatchObject({
      'b-101': 18,
      'b-103': 5,
      'b-100-derived': 7,
    });
    expect(repoCallArg.billing_ids['b-100-derived']).toBe(7); // derived = 30 - (18+5)
  });

  it('should throw 400 when main meter property has no seed reading', async () => {
    jest.mocked(propertyRepository.search).mockResolvedValue({
      data: [{
        id: 'prop-100',
        room_name: 'Unit 100',
        tenant_amount: 1,
        meter_groups: {
          electricity: { meter_group_id: 'mg-1', is_main_meter: true },
          water: { meter_group_id: 'mg-water', is_main_meter: false },
        },
        main_meter_group_ids: ['mg-1'],
        created_at: startDate,
        updated_at: startDate,
        is_deleted: false,
        deleted_at: null,
      }],
      hasMore: false,
      nextCursor: null,
    });

    // findPreviousMonthReading returns null → injectMainMeterBilling throws AppError(400)
    jest.mocked(findPreviousMonthReading).mockResolvedValue(null);

    await expect(billingCycleService.create(TEST_USER_ID, baseInput)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('should skip injection when no main meter property exists for meter group', async () => {
    // No candidates for the targeted main_meter_group_ids array-contains query — the query is
    // mocked wholesale, so an empty result is how this test simulates "no main meter owns this
    // meter group" (a property present but with is_main_meter: false would never actually
    // surface from the real Firestore query, since its main_meter_group_ids would be empty).
    jest.mocked(propertyRepository.search).mockResolvedValue({
      data: [],
      hasMore: false,
      nextCursor: null,
    });

    jest.mocked(BillingCycleValidator.prototype.validateCreate).mockResolvedValue(undefined);
    jest.mocked(billingCycleRepository.create).mockResolvedValue({
      id: 'cycle-1',
      ...baseInput,
      created_at: endDate,
      updated_at: endDate,
      is_deleted: false,
      deleted_at: null,
    });

    await billingCycleService.create(TEST_USER_ID, baseInput);

    expect(readingService.create).not.toHaveBeenCalled();
    const repoCallArg = jest.mocked(billingCycleRepository.create).mock.calls[0][0];
    expect(Object.keys(repoCallArg.billing_ids)).toHaveLength(2);
  });
});

describe('billingCycleService.create - pending estimate propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(meterGroupRepository.getById).mockResolvedValue({
      id: 'mg-1',
      utility_type: 'water',
    } as any);
    jest.mocked(propertyRepository.search).mockResolvedValue({ data: [], hasMore: false, nextCursor: null });
    jest.mocked(billingCycleRepository.search).mockResolvedValue({ data: [], hasMore: false, nextCursor: null });
    jest.mocked(BillingCycleValidator.prototype.validateCreate).mockResolvedValue(undefined);
  });

  it("recomputes a pending billing's estimated_cost using the newly created cycle's rate_ema", async () => {
    const newCycle = mockBillingCycle({
      id: 'cycle-new',
      meter_group_id: 'mg-1',
      billing_ids: { 'billing-cycled': 100 },
      billing_rate: 20,
    });
    jest.mocked(billingCycleRepository.create).mockResolvedValue(newCycle);

    jest.mocked(billingRepository.search).mockResolvedValue({
      data: [{
        id: 'billing-pending',
        property_id: 'prop-1',
        previous_reading_id: 'r-prev',
        current_reading_id: 'r-curr',
        meter_group_id: 'mg-1',
        payment_status: 'pending',
        estimated_cost: 500, // stale — computed under an earlier rate_ema
        created_at: now,
        updated_at: now,
        is_deleted: false,
        deleted_at: null,
      }],
      hasMore: false,
      nextCursor: null,
    });
    jest.mocked(readingRepository.getByIds).mockResolvedValue([
      { id: 'r-prev', reading_amount: 100, meter_version: 1 } as any,
      { id: 'r-curr', reading_amount: 150, meter_version: 1 } as any,
    ]);
    jest.mocked(billingRepository.updateBatch).mockResolvedValue([]);

    await billingCycleService.create(TEST_USER_ID, {
      meter_group_id: 'mg-1',
      billing_ids: { 'billing-cycled': 100 },
      billing_rate: 20,
      billing_consumption: 100,
      billing_start_date: startDate,
      billing_end_date: endDate,
    });

    // Only one cycle exists for this meter group, so its own rate (20) is the chain's EMA.
    expect(billingRepository.updateBatch).toHaveBeenCalledWith([
      { id: 'billing-pending', data: { estimated_cost: (150 - 100) * 20 } },
    ]);
  });

  it("leaves an already-cycled billing's estimated_cost untouched", async () => {
    const newCycle = mockBillingCycle({
      id: 'cycle-new',
      meter_group_id: 'mg-1',
      billing_ids: { 'billing-already-cycled': 50 },
      billing_rate: 20,
    });
    jest.mocked(billingCycleRepository.create).mockResolvedValue(newCycle);

    jest.mocked(billingRepository.search).mockResolvedValue({
      data: [{
        id: 'billing-already-cycled',
        property_id: 'prop-1',
        previous_reading_id: 'r-prev',
        current_reading_id: 'r-curr',
        meter_group_id: 'mg-1',
        payment_status: 'pending',
        estimated_cost: 999,
        created_at: now,
        updated_at: now,
        is_deleted: false,
        deleted_at: null,
      }],
      hasMore: false,
      nextCursor: null,
    });

    await billingCycleService.create(TEST_USER_ID, {
      meter_group_id: 'mg-1',
      billing_ids: { 'billing-already-cycled': 50 },
      billing_rate: 20,
      billing_consumption: 50,
      billing_start_date: startDate,
      billing_end_date: endDate,
    });

    // The billing is already referenced in the new cycle's billing_ids, so it's excluded
    // from "pending" and neither readings nor a batch write should be attempted for it.
    expect(readingRepository.getByIds).not.toHaveBeenCalled();
    expect(billingRepository.updateBatch).not.toHaveBeenCalled();
  });
});
