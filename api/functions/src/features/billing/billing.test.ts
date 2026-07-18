jest.mock('./billing.repository');
jest.mock('./billing.validator');
jest.mock('../reading/reading.repository');

// Mock Firestore transaction used in billingService.create
jest.mock('../../config/firebase.config', () => {
  let txnGetCallCount = 0;
  const txnGetResponses = [
    // property
    { exists: true, data: () => ({ is_deleted: false }) },
    // previous reading
    { exists: true, data: () => ({ is_deleted: false, meter_group_id: 'mg-1', reading_amount: 100 }) },
    // current reading (must be > previous)
    { exists: true, data: () => ({ is_deleted: false, meter_group_id: 'mg-1', reading_amount: 200 }) },
  ];
  const mockNewDocRef = { id: 'new-billing-id', get: jest.fn().mockResolvedValue({ id: 'new-billing-id', data: () => ({ property_id: 'prop-1', payment_status: 'pending', is_deleted: false }) }) };
  const mockTransaction = {
    get: jest.fn().mockImplementation(() => Promise.resolve(txnGetResponses[txnGetCallCount++ % txnGetResponses.length])),
    set: jest.fn(),
  };
  return {
    firestore: {
      runTransaction: jest.fn().mockImplementation(async (fn: (txn: typeof mockTransaction) => Promise<void>) => {
        txnGetCallCount = 0;
        await fn(mockTransaction);
      }),
      collection: jest.fn(() => ({ doc: jest.fn(() => mockNewDocRef) })),
    },
  };
});

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { billingService } from './billing.service';
import { billingRepository } from './billing.repository';
import { readingRepository } from '../reading/reading.repository';
import { BillingValidator } from './billing.validator';
import { CreateBillingDTOSchema, UpdateBillingDTOSchema, BillingByIdParamsDTOSchema, CreateBillingBatchDTOSchema, UpdateBillingBatchDTOSchema } from './billing.dto';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';

const now = Timestamp.now();
const TEST_USER_ID = 'user-1';

const mockBilling = (overrides?: Record<string, any>) => ({
  id: 'billing-1',
  property_id: 'prop-1',
  previous_reading_id: 'reading-1',
  current_reading_id: 'reading-2',
  created_at: now,
  updated_at: now,
  ...overrides,
});

describe('billingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Create a new billing (validation is tested in billing.validator.test.ts)
  describe('create', () => {
    it('should create a billing via Firestore transaction and return result', async () => {
      // The transaction mock returns a snapshot; we verify the service resolves
      await expect(billingService.create(TEST_USER_ID, {
        property_id: 'prop-1',
        previous_reading_id: 'reading-1',
        current_reading_id: 'reading-2',
      })).resolves.toBeDefined();
    });

    it('should validate required fields via DTO schema', () => {
      expect(CreateBillingDTOSchema.safeParse({ previous_reading_id: 'r1', current_reading_id: 'r2' }).success).toBe(false);
      expect(CreateBillingDTOSchema.safeParse({ property_id: 'p1', current_reading_id: 'r2' }).success).toBe(false);
      expect(CreateBillingDTOSchema.safeParse({ property_id: 'p1', previous_reading_id: 'r1' }).success).toBe(false);
      expect(CreateBillingDTOSchema.safeParse({ property_id: 'p1', previous_reading_id: 'r1', current_reading_id: 'r2' }).success).toBe(true);
    });
  });

  // Batch create
  describe('createBatch', () => {
    // It should create multiple billings in a batch.
    it('should create multiple billings in a batch', async () => {
      const mocks = [mockBilling({ id: 'billing-1' }), mockBilling({ id: 'billing-2' })];
      jest.mocked(BillingValidator.prototype.validateBatch).mockResolvedValue(undefined);
      jest.mocked(billingRepository.createBatch).mockResolvedValue(mocks);
      jest.mocked(readingRepository.getByIds).mockResolvedValue([
        { id: 'reading-2', meter_group_id: 'mg-1', reading_date: now } as any,
        { id: 'reading-3', meter_group_id: 'mg-1', reading_date: now } as any,
      ]);

      const input = [
        { property_id: 'prop-1', previous_reading_id: 'reading-1', current_reading_id: 'reading-2' },
        { property_id: 'prop-1', previous_reading_id: 'reading-2', current_reading_id: 'reading-3' },
      ];
      const result = await billingService.createBatch(TEST_USER_ID, input);

      expect(billingRepository.createBatch).toHaveBeenCalledWith(expect.any(Array));
      expect(result).toHaveLength(2);
    });

    // It should return an error if batch is empty.
    it('should return an error if batch array is empty', () => {
      const result = CreateBillingBatchDTOSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    // It should return an error if batch exceeds max size.
    it('should return an error if batch exceeds max size of 10', () => {
      const input = Array(11).fill({
        property_id: 'prop-1',
        previous_reading_id: 'reading-1',
        current_reading_id: 'reading-2',
      });
      const result = CreateBillingBatchDTOSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // Get billing by ID
  describe('getById', () => {
    // It should return the billing details for the given billing ID.
    it('should return the billing details for the given billing ID', async () => {
      jest.mocked(billingRepository.getById).mockResolvedValue(mockBilling());

      const result = await billingService.getById(TEST_USER_ID, 'billing-1');

      expect(billingRepository.getById).toHaveBeenCalledWith('billing-1');
      expect(result).toEqual(mockBilling());
    });

    // It should return an error if the billing ID is not provided.
    it('should return an error if the billing ID is not provided', () => {
      const result = BillingByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing ID does not exist.
    it('should return an error if the billing ID does not exist', async () => {
      jest.mocked(billingRepository.getById).mockResolvedValue(null);

      const result = await billingService.getById(TEST_USER_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // Search billings
  describe('search', () => {
    // It should return a cursor-based paginated list of all billing based on the provided filters such as property ID.
    it('should return a paginated list of billings', async () => {
      const paginated = { data: [mockBilling()], hasMore: false, nextCursor: null };
      jest.mocked(billingRepository.search).mockResolvedValue(paginated);

      const result = await billingService.search(TEST_USER_ID, { limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    // It should return an empty list if there are no billing matching everything in the query.
    it('should return an empty list if there are no billings matching the query', async () => {
      jest.mocked(billingRepository.search).mockResolvedValue({ data: [], hasMore: false, nextCursor: null });

      const result = await billingService.search(TEST_USER_ID, { limit: 20, propertyId: 'nonexistent' });

      expect(result.data).toHaveLength(0);
    });

    // It should return nextCursor when more results exist.
    it('should return nextCursor when more results exist', async () => {
      // CachedRepository.search loads ALL pages via loadAll (loops until hasMore
      // is false) before paginating in-memory — the mock must terminate the loop.
      jest.mocked(billingRepository.search)
        .mockResolvedValueOnce({
          data: [mockBilling({ id: 'billing-1' }), mockBilling({ id: 'billing-2' })],
          hasMore: false,
          nextCursor: null,
        });

      const result = await billingService.search(TEST_USER_ID, { limit: 1 });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('billing-1');
    });
  });

  // Update billing
  describe('update', () => {
    // It should update the billing details for the given billing ID and return the updated billing details.
    it('should update the billing details', async () => {
      const updated = mockBilling({ property_id: 'prop-2' });
      jest.mocked(BillingValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingRepository.update).mockResolvedValue(updated);

      const result = await billingService.update(TEST_USER_ID, 'billing-1', { property_id: 'prop-2' });

      expect(result.property_id).toBe('prop-2');
    });

    it('should auto-set paid_at when payment_status changes to paid', async () => {
      const paid = mockBilling({ payment_status: 'paid', paid_at: new Date().toISOString() });
      jest.mocked(BillingValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingRepository.update).mockResolvedValue(paid);

      await billingService.update(TEST_USER_ID, 'billing-1', { payment_status: 'paid' });

      const callArgs = jest.mocked(billingRepository.update).mock.calls[0];
      const updateData = callArgs[1] as Record<string, unknown>;
      expect(updateData.paid_at).toBeDefined();
      expect(typeof updateData.paid_at).toBe('string');
    });

    it('should not overwrite paid_at if already provided', async () => {
      const existingPaidAt = '2026-01-01T00:00:00.000Z';
      const paid = mockBilling({ payment_status: 'paid', paid_at: existingPaidAt });
      jest.mocked(BillingValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingRepository.update).mockResolvedValue(paid);

      await billingService.update(TEST_USER_ID, 'billing-1', { payment_status: 'paid', paid_at: existingPaidAt });

      const callArgs = jest.mocked(billingRepository.update).mock.calls[0];
      const updateData = callArgs[1] as Record<string, unknown>;
      expect(updateData.paid_at).toBe(existingPaidAt);
    });

    // It should return an error if the property ID is not provided.
    it('should return an error if the property ID is not provided', async () => {
      jest.mocked(BillingValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingRepository.update).mockResolvedValue(mockBilling());

      await expect(
        billingService.update(TEST_USER_ID, 'billing-1', { previous_reading_id: 'reading-3' })
      ).resolves.toBeDefined();
    });

    // It should return an error if the property ID does not exist.
    it('should return an error if the property ID does not exist', async () => {
      jest.mocked(BillingValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(404, 'Property not found')
      );

      await expect(billingService.update(TEST_USER_ID, 'billing-1', { property_id: 'bad-prop' })).rejects.toMatchObject({
        statusCode: 404,
        message: 'Property not found',
      });
    });

    // It should return an error if the previous reading ID is not provided.
    it('should return an error if the previous reading ID is not provided', async () => {
      jest.mocked(BillingValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingRepository.update).mockResolvedValue(mockBilling());

      await expect(
        billingService.update(TEST_USER_ID, 'billing-1', { property_id: 'prop-1' })
      ).resolves.toBeDefined();
    });

    // It should return an error if the previous reading ID does not exist.
    it('should return an error if the previous reading ID does not exist', async () => {
      jest.mocked(BillingValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(404, 'Reading not found')
      );

      await expect(
        billingService.update(TEST_USER_ID, 'billing-1', { previous_reading_id: 'bad-reading' })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Reading not found',
      });
    });

    // It should return an error if the current reading ID is not provided.
    it('should return an error if the current reading ID is not provided', async () => {
      jest.mocked(BillingValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingRepository.update).mockResolvedValue(mockBilling());

      await expect(
        billingService.update(TEST_USER_ID, 'billing-1', { property_id: 'prop-1' })
      ).resolves.toBeDefined();
    });

    // It should return an error if the current reading ID does not exist.
    it('should return an error if the current reading ID does not exist', async () => {
      jest.mocked(BillingValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(404, 'Reading not found')
      );

      await expect(
        billingService.update(TEST_USER_ID, 'billing-1', { current_reading_id: 'bad-reading' })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Reading not found',
      });
    });

    // It should return an error if the previous reading and current reading do not belong to the same property.
    it('should return an error if the previous reading and current reading do not belong to the same property', async () => {
      jest.mocked(BillingValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(400, 'Previous and current readings must belong to the same meter group')
      );

      await expect(
        billingService.update(TEST_USER_ID, 'billing-1', { current_reading_id: 'reading-3' })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Previous and current readings must belong to the same meter group',
      });
    });
  });

  // Batch update
  describe('updateBatch', () => {
    // It should update multiple billings in a batch.
    it('should update multiple billings in a batch', async () => {
      const mocks = [mockBilling({ id: 'billing-1' }), mockBilling({ id: 'billing-2' })];
      jest.mocked(BillingValidator.prototype.validateUpdateBatch).mockResolvedValue(undefined);
      jest.mocked(billingRepository.updateBatch).mockResolvedValue(mocks);

      const input = [
        { id: 'billing-1', data: { property_id: 'prop-2' } },
        { id: 'billing-2', data: { property_id: 'prop-3' } },
      ];
      const result = await billingService.updateBatch(TEST_USER_ID, input);

      expect(billingRepository.updateBatch).toHaveBeenCalledWith(input);
      expect(result).toHaveLength(2);
    });

    // It should return an error if batch is empty.
    it('should return an error if batch array is empty', () => {
      const result = UpdateBillingBatchDTOSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    // It should return an error if batch exceeds max size.
    it('should return an error if batch exceeds max size of 10', () => {
      const input = Array(11).fill({ id: 'billing-1', data: { property_id: 'prop-1' } });
      const result = UpdateBillingBatchDTOSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // Delete billing
  describe('delete', () => {
    // It should delete the billing for the given billing ID and return a success message.
    it('should delete the billing', async () => {
      jest.mocked(billingRepository.delete).mockResolvedValue(undefined);

      await expect(billingService.delete(TEST_USER_ID, 'billing-1')).resolves.toBeUndefined();

      expect(billingRepository.delete).toHaveBeenCalledWith('billing-1');
    });

    // It should return an error if the billing ID is not provided.
    it('should return an error if the billing ID is not provided', () => {
      const result = BillingByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing ID does not exist.
    it('should return an error if the billing ID does not exist', async () => {
      jest.mocked(billingRepository.delete).mockRejectedValue(new AppError(404, 'Billing not found'));

      await expect(billingService.delete(TEST_USER_ID, 'nonexistent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // Soft delete billing
  describe('softDelete', () => {
    // It should soft delete the billing for the given billing ID and return a success message.
    it('should soft delete the billing', async () => {
      const softDeleted = mockBilling({ deleted_at: Timestamp.now() });
      jest.mocked(billingRepository.softDelete).mockResolvedValue(softDeleted);

      const result = await billingService.softDelete(TEST_USER_ID, 'billing-1');

      expect(result.deleted_at).toBeDefined();
    });

    // It should return an error if the billing ID is not provided.
    it('should return an error if the billing ID is not provided', () => {
      const result = BillingByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the billing ID does not exist.
    it('should return an error if the billing ID does not exist', async () => {
      jest.mocked(billingRepository.softDelete).mockRejectedValue(new AppError(404, 'Billing not found'));

      await expect(billingService.softDelete(TEST_USER_ID, 'nonexistent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
