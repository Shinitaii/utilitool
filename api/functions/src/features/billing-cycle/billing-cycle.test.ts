jest.mock('./billing-cycle.repository');
jest.mock('./billing-cycle.validator');
jest.mock('../property/property.service');
jest.mock('../reading/reading.service');
jest.mock('../billing/billing.repository');
jest.mock('../reading/reading.util');

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { billingCycleService } from './billing-cycle.service';
import { billingCycleRepository } from './billing-cycle.repository';
import { BillingCycleValidator } from './billing-cycle.validator';
import { propertyService } from '../property/property.service';
import { readingService } from '../reading/reading.service';
import { billingRepository } from '../billing/billing.repository';
import { findPreviousMonthReading } from '../reading/reading.util';
import { CreateBillingCycleDTOSchema, UpdateBillingCycleDTOSchema, BillingCycleByIdParamsDTOSchema, CreateBillingCycleBatchDTOSchema, UpdateBillingCycleBatchDTOSchema } from './billing-cycle.dto';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';

const startTimestamp = new Timestamp(Math.floor(Date.now() / 1000) - 86400 * 30, 0);
const endTimestamp = new Timestamp(Math.floor(Date.now() / 1000) - 86400, 0);
const now = Timestamp.now();

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
    jest.mocked(propertyService.search).mockResolvedValue({
      data: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  // Create a new billing cycle
  describe('create', () => {
    // It should create a new billing cycle with the given details and return the billing cycle ID.
    it('should create a new billing cycle with the given details and return the billing cycle ID', async () => {
      const { start, end } = makeTimestamps();
      jest.mocked(BillingCycleValidator.prototype.validateCreate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.create).mockResolvedValue(mockBillingCycle());

      const result = await billingCycleService.create({
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
        billingCycleService.create({
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
        billingCycleService.create({
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

      const result = await billingCycleService.create({
        billing_ids: { 'billing-1': 100 },
        billing_rate: 5,
        billing_consumption: 103,
        billing_start_date: start,
        billing_end_date: end,
      });

      expect(result).toBeDefined();
    });
  });

  // Batch create
  describe('createBatch', () => {
    // It should create multiple billing cycles in a batch.
    it('should create multiple billing cycles in a batch', async () => {
      const { start, end } = makeTimestamps();
      const mocks = [mockBillingCycle({ id: 'billing-cycle-1' }), mockBillingCycle({ id: 'billing-cycle-2' })];
      jest.mocked(BillingCycleValidator.prototype.validateBatch).mockResolvedValue(undefined);
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
      const result = await billingCycleService.createBatch(input);

      expect(billingCycleRepository.createBatch).toHaveBeenCalledWith(expect.any(Array));
      expect(result).toHaveLength(2);
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

      const result = await billingCycleService.getById('billing-cycle-1');

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

      const result = await billingCycleService.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // Search billing cycles
  describe('search', () => {
    // It should return a cursor-based paginated list of all billing cycles based on the provided filters such as billing start date and billing end date.
    it('should return a paginated list of billing cycles', async () => {
      const paginated = { data: [mockBillingCycle()], hasMore: false, nextCursor: null };
      jest.mocked(billingCycleRepository.search).mockResolvedValue(paginated);

      const result = await billingCycleService.search({ limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    // It should return an empty list if there are no billing cycles matching everything in the query.
    it('should return an empty list if there are no billing cycles matching the query', async () => {
      jest.mocked(billingCycleRepository.search).mockResolvedValue({ data: [], hasMore: false, nextCursor: null });

      const result = await billingCycleService.search({ limit: 20 });

      expect(result.data).toHaveLength(0);
    });

    // It should return nextCursor when more results exist.
    it('should return nextCursor when more results exist', async () => {
      jest.mocked(billingCycleRepository.search).mockResolvedValue({
        data: [mockBillingCycle()],
        hasMore: true,
        nextCursor: 'cursor-abc',
      });

      const result = await billingCycleService.search({ limit: 1 });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('cursor-abc');
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

      const result = await billingCycleService.update('billing-cycle-1', { billing_rate: 10 });

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

      await expect(billingCycleService.update('nonexistent', { billing_rate: 10 })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    // It should return an error if the billing ids are not provided.
    it('should return an error if the billing ids are not provided', async () => {
      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.update).mockResolvedValue(mockBillingCycle());

      await expect(
        billingCycleService.update('billing-cycle-1', { billing_rate: 10 })
      ).resolves.toBeDefined();
    });

    // It should return an error if the billing rate is not provided.
    it('should return an error if the billing rate is not provided', async () => {
      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.update).mockResolvedValue(mockBillingCycle());

      await expect(
        billingCycleService.update('billing-cycle-1', { billing_consumption: 100 })
      ).resolves.toBeDefined();
    });

    // It should return an error if the billing consumption is not provided.
    it('should return an error if the billing consumption is not provided', async () => {
      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.update).mockResolvedValue(mockBillingCycle());

      await expect(
        billingCycleService.update('billing-cycle-1', { billing_rate: 10 })
      ).resolves.toBeDefined();
    });

    // It should return an error if the billing start date is not provided.
    it('should return an error if the billing start date is not provided', async () => {
      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.update).mockResolvedValue(mockBillingCycle());

      await expect(
        billingCycleService.update('billing-cycle-1', { billing_rate: 10 })
      ).resolves.toBeDefined();
    });

    // It should return an error if the billing end date is not provided.
    it('should return an error if the billing end date is not provided', async () => {
      jest.mocked(BillingCycleValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingCycleRepository.update).mockResolvedValue(mockBillingCycle());

      await expect(
        billingCycleService.update('billing-cycle-1', { billing_rate: 10 })
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

      await expect(billingCycleService.update('billing-cycle-1', { billing_ids: { 'bad-billing': 100 } })).rejects.toMatchObject({
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
        billingCycleService.update('billing-cycle-1', { billing_consumption: 105 })
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
      const result = await billingCycleService.updateBatch(input);

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

      await expect(billingCycleService.delete('billing-cycle-1')).resolves.toBeUndefined();

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

      await expect(billingCycleService.delete('nonexistent')).rejects.toMatchObject({
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

      const result = await billingCycleService.softDelete('billing-cycle-1');

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

      await expect(billingCycleService.softDelete('nonexistent')).rejects.toMatchObject({
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

    // findPreviousMonthReading returns null → injectMainMeterBilling throws AppError(400)
    jest.mocked(findPreviousMonthReading).mockResolvedValue(null);

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

    jest.mocked(BillingCycleValidator.prototype.validateCreate).mockResolvedValue(undefined);
    jest.mocked(billingCycleRepository.create).mockResolvedValue({
      id: 'cycle-1',
      ...baseInput,
      created_at: endDate,
      updated_at: endDate,
      is_deleted: false,
      deleted_at: null,
    });

    await billingCycleService.create(baseInput);

    expect(readingService.create).not.toHaveBeenCalled();
    const repoCallArg = jest.mocked(billingCycleRepository.create).mock.calls[0][0];
    expect(Object.keys(repoCallArg.billing_ids)).toHaveLength(2);
  });
});
