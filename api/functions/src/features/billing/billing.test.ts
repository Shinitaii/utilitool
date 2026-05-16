jest.mock('./billing.repository');
jest.mock('./billing.validator');

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { billingService } from './billing.service';
import { billingRepository } from './billing.repository';
import { BillingValidator } from './billing.validator';
import { CreateBillingDTOSchema, UpdateBillingDTOSchema, BillingByIdParamsDTOSchema, CreateBillingBatchDTOSchema, UpdateBillingBatchDTOSchema } from './billing.dto';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';

const now = Timestamp.now();

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

  // Create a new billing
  describe('create', () => {
    // It should create a new billing with the given details and return the billing ID.
    it('should create a new billing with the given details and return the billing ID', async () => {
      jest.mocked(BillingValidator.prototype.validateCreate).mockResolvedValue(undefined);
      jest.mocked(billingRepository.create).mockResolvedValue(mockBilling());

      const result = await billingService.create({
        property_id: 'prop-1',
        previous_reading_id: 'reading-1',
        current_reading_id: 'reading-2',
      });

      expect(billingRepository.create).toHaveBeenCalled();
      expect(result.id).toBe('billing-1');
    });

    // It should return an error if the property ID is not provided.
    it('should return an error if the property ID is not provided', () => {
      const result = CreateBillingDTOSchema.safeParse({
        previous_reading_id: 'reading-1',
        current_reading_id: 'reading-2',
      });
      expect(result.success).toBe(false);
    });

    // It should return an error if the previous reading ID is not provided.
    it('should return an error if the previous reading ID is not provided', () => {
      const result = CreateBillingDTOSchema.safeParse({
        property_id: 'prop-1',
        current_reading_id: 'reading-2',
      });
      expect(result.success).toBe(false);
    });

    // It should return an error if the current reading ID is not provided.
    it('should return an error if the current reading ID is not provided', () => {
      const result = CreateBillingDTOSchema.safeParse({
        property_id: 'prop-1',
        previous_reading_id: 'reading-1',
      });
      expect(result.success).toBe(false);
    });

    // It should return an error if the property ID does not exist.
    it('should return an error if the property ID does not exist', async () => {
      jest.mocked(BillingValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(404, 'Property not found')
      );

      await expect(
        billingService.create({
          property_id: 'bad-prop',
          previous_reading_id: 'reading-1',
          current_reading_id: 'reading-2',
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Property not found',
      });
    });

    // It should return an error if the previous reading ID does not exist.
    it('should return an error if the previous reading ID does not exist', async () => {
      jest.mocked(BillingValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(404, 'Reading not found')
      );

      await expect(
        billingService.create({
          property_id: 'prop-1',
          previous_reading_id: 'bad-reading',
          current_reading_id: 'reading-2',
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Reading not found',
      });
    });

    // It should return an error if the current reading ID does not exist.
    it('should return an error if the current reading ID does not exist', async () => {
      jest.mocked(BillingValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(404, 'Reading not found')
      );

      await expect(
        billingService.create({
          property_id: 'prop-1',
          previous_reading_id: 'reading-1',
          current_reading_id: 'bad-reading',
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Reading not found',
      });
    });

    // It should return an error if the previous reading and current reading do not belong to the same property.
    it('should return an error if the previous reading and current reading do not belong to the same property', async () => {
      jest.mocked(BillingValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(400, 'Previous and current readings must belong to the same meter group')
      );

      await expect(
        billingService.create({
          property_id: 'prop-1',
          previous_reading_id: 'reading-1',
          current_reading_id: 'reading-2',
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Previous and current readings must belong to the same meter group',
      });
    });
  });

  // Batch create
  describe('createBatch', () => {
    // It should create multiple billings in a batch.
    it('should create multiple billings in a batch', async () => {
      const mocks = [mockBilling({ id: 'billing-1' }), mockBilling({ id: 'billing-2' })];
      jest.mocked(BillingValidator.prototype.validateBatch).mockResolvedValue(undefined);
      jest.mocked(billingRepository.createBatch).mockResolvedValue(mocks);

      const input = [
        { property_id: 'prop-1', previous_reading_id: 'reading-1', current_reading_id: 'reading-2' },
        { property_id: 'prop-1', previous_reading_id: 'reading-2', current_reading_id: 'reading-3' },
      ];
      const result = await billingService.createBatch(input);

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

      const result = await billingService.getById('billing-1');

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

      const result = await billingService.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // Search billings
  describe('search', () => {
    // It should return a cursor-based paginated list of all billing based on the provided filters such as property ID.
    it('should return a paginated list of billings', async () => {
      const paginated = { data: [mockBilling()], hasMore: false, nextCursor: null };
      jest.mocked(billingRepository.search).mockResolvedValue(paginated);

      const result = await billingService.search({ limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    // It should return an empty list if there are no billing matching everything in the query.
    it('should return an empty list if there are no billings matching the query', async () => {
      jest.mocked(billingRepository.search).mockResolvedValue({ data: [], hasMore: false, nextCursor: null });

      const result = await billingService.search({ limit: 20, propertyId: 'nonexistent' });

      expect(result.data).toHaveLength(0);
    });

    // It should return nextCursor when more results exist.
    it('should return nextCursor when more results exist', async () => {
      jest.mocked(billingRepository.search).mockResolvedValue({
        data: [mockBilling()],
        hasMore: true,
        nextCursor: 'cursor-abc',
      });

      const result = await billingService.search({ limit: 1 });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('cursor-abc');
    });
  });

  // Update billing
  describe('update', () => {
    // It should update the billing details for the given billing ID and return the updated billing details.
    it('should update the billing details', async () => {
      const updated = mockBilling({ property_id: 'prop-2' });
      jest.mocked(BillingValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingRepository.update).mockResolvedValue(updated);

      const result = await billingService.update('billing-1', { property_id: 'prop-2' });

      expect(result.property_id).toBe('prop-2');
    });

    // It should return an error if the property ID is not provided.
    it('should return an error if the property ID is not provided', async () => {
      jest.mocked(BillingValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingRepository.update).mockResolvedValue(mockBilling());

      await expect(
        billingService.update('billing-1', { previous_reading_id: 'reading-3' })
      ).resolves.toBeDefined();
    });

    // It should return an error if the property ID does not exist.
    it('should return an error if the property ID does not exist', async () => {
      jest.mocked(BillingValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(404, 'Property not found')
      );

      await expect(billingService.update('billing-1', { property_id: 'bad-prop' })).rejects.toMatchObject({
        statusCode: 404,
        message: 'Property not found',
      });
    });

    // It should return an error if the previous reading ID is not provided.
    it('should return an error if the previous reading ID is not provided', async () => {
      jest.mocked(BillingValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(billingRepository.update).mockResolvedValue(mockBilling());

      await expect(
        billingService.update('billing-1', { property_id: 'prop-1' })
      ).resolves.toBeDefined();
    });

    // It should return an error if the previous reading ID does not exist.
    it('should return an error if the previous reading ID does not exist', async () => {
      jest.mocked(BillingValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(404, 'Reading not found')
      );

      await expect(
        billingService.update('billing-1', { previous_reading_id: 'bad-reading' })
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
        billingService.update('billing-1', { property_id: 'prop-1' })
      ).resolves.toBeDefined();
    });

    // It should return an error if the current reading ID does not exist.
    it('should return an error if the current reading ID does not exist', async () => {
      jest.mocked(BillingValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(404, 'Reading not found')
      );

      await expect(
        billingService.update('billing-1', { current_reading_id: 'bad-reading' })
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
        billingService.update('billing-1', { current_reading_id: 'reading-3' })
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
      const result = await billingService.updateBatch(input);

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

      await expect(billingService.delete('billing-1')).resolves.toBeUndefined();

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

      await expect(billingService.delete('nonexistent')).rejects.toMatchObject({
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

      const result = await billingService.softDelete('billing-1');

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

      await expect(billingService.softDelete('nonexistent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
