jest.mock('../../config/firebase.config', () => {
  const makeQueryChain = (getResult: { empty: boolean; docs: any[] }) => ({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue(getResult),
    doc: jest.fn().mockReturnValue({
      id: 'new-reading-id',
      get: jest.fn().mockResolvedValue({
        id: 'new-reading-id',
        exists: true,
        data: () => ({ meter_group_id: 'mg-1', reading_amount: 200, is_deleted: false }),
      }),
    }),
  });

  return {
    firestore: {
      collection: jest.fn().mockImplementation(() => makeQueryChain({ empty: true, docs: [] })),
      runTransaction: jest.fn().mockImplementation(async (fn: Function) => {
        await fn({ set: jest.fn(), create: jest.fn() });
      }),
    },
  };
});
jest.mock('../billing/billing.service', () => ({
  billingService: {
    createFromReadings: jest.fn(),
  },
}));
jest.mock('../../utils/firestore.util', () => ({
  ...jest.requireActual('../../utils/firestore.util'),
  snapshotToModel: jest.fn().mockImplementation((snap: any) => ({ id: snap.id, ...snap.data() })),
}));
jest.mock('./reading.repository');
jest.mock('./reading.validator');
// softDelete/restore now delegate to cascadeDeleteReading/cascadeRestoreReading
// (which run real Firestore transactions) — mock those out for unit-level service tests.
jest.mock('../../utils/cascade-delete.util', () => ({
  cascadeDeleteReading: jest.fn().mockResolvedValue({ primary: 1, billings: 0 }),
  cascadeRestoreReading: jest.fn().mockResolvedValue({ primary: 1, billings: 0 }),
}));
jest.mock('../meter-group/meter-group.repository', () => ({
  meterGroupRepository: {
    getById: jest.fn().mockResolvedValue({ id: 'mg-1', meter_name: 'Main Electric', utility_type: 'electricity', current_version: 1, versions: {} }),
    getByIds: jest.fn().mockResolvedValue([{ id: 'mg-1', meter_name: 'Main Electric', utility_type: 'electricity', current_version: 1, versions: {} }]),
  },
}));
jest.mock('../property/property.repository', () => ({
  propertyRepository: {
    getById: jest.fn().mockResolvedValue(null),
    getByIds: jest.fn().mockResolvedValue([]),
  },
}));

import { describe, it, expect, beforeEach } from '@jest/globals';
import { readingService } from './reading.service';
import { readingRepository } from './reading.repository';
import { cascadeDeleteReading } from '../../utils/cascade-delete.util';
import { ReadingValidator } from './reading.validator';
import { CreateReadingDTOSchema, UpdateReadingDTOSchema, ReadingByIdParamsDTOSchema, CreateReadingBatchDTOSchema, UpdateReadingBatchDTOSchema } from './reading.dto';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';

/// Test cases for reading (TDD)
/// You must not touch the any of the code here.
/// To create a new test case, create pseudo code in the form of a comment.
/// This could mean what it does, and what it returns.
/// You can also add edge cases and error cases as well.

const now = Timestamp.now();
const TEST_USER_ID = 'user-1';

const mockReading = (overrides?: Record<string, any>) => ({
  id: 'reading-1',
  meter_group_id: 'mg-1',
  reading_amount: 100,
  reading_date: now,
  created_at: now,
  updated_at: now,
  ...overrides,
});

describe('readingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Create a new reading
  describe('create', () => {
    beforeEach(() => {
      // checkAnomalousReading calls readingRepository.search; return empty list so check short-circuits
      jest.mocked(readingRepository.search).mockResolvedValue({ data: [], hasMore: false, nextCursor: null });
    });

    // It should create a new reading with the given name and return the reading ID.
    it('should create a new reading with the given meter group ID and return the reading ID', async () => {
      jest.mocked(ReadingValidator.prototype.validateCreate).mockResolvedValue(undefined);
      jest.mocked(readingRepository.create).mockResolvedValue(mockReading());

      const input = {
        meter_group_id: 'mg-1',
        reading_amount: 100,
        reading_date: Timestamp.now(),
      };
      const result = await readingService.create(TEST_USER_ID, input);

      expect(readingRepository.create).toHaveBeenCalledWith({ ...input, meter_version: 1 });
      expect(result.id).toBe('reading-1');
    });

    // It should return an error if the selected meter group is not provided.
    it('should return an error if the selected meter group is not provided', () => {
      const result = CreateReadingDTOSchema.safeParse({
        reading_amount: 100,
        reading_date: Timestamp.now(),
      });
      expect(result.success).toBe(false);
    });

    // It should return an error if the selected meter group does not exist.
    it('should return an error if the selected meter group does not exist', async () => {
      jest.mocked(ReadingValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(404, 'Meter group not found')
      );

      await expect(
        readingService.create(TEST_USER_ID, {
          meter_group_id: 'nonexistent',
          reading_amount: 100,
          reading_date: Timestamp.now(),
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    // It should return an error if the reading value is not a valid number.
    it('should return an error if the reading value is not a valid number', () => {
      const result = CreateReadingDTOSchema.safeParse({
        meter_group_id: 'mg-1',
        reading_amount: 'not-a-number',
        reading_date: Timestamp.now(),
      });
      expect(result.success).toBe(false);
    });

    // It should return an error if the reading value is negative.
    it('should return an error if the reading value is negative', async () => {
      jest.mocked(ReadingValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(400, 'Reading amount cannot be negative')
      );

      await expect(
        readingService.create(TEST_USER_ID, {
          meter_group_id: 'mg-1',
          reading_amount: -50,
          reading_date: Timestamp.now(),
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // It should return an error if the reading date is not a valid date.
    it('should return an error if the reading date is not a valid date', () => {
      const result = CreateReadingDTOSchema.safeParse({
        meter_group_id: 'mg-1',
        reading_amount: 100,
        reading_date: 'not-a-date',
      });
      expect(result.success).toBe(false);
    });

    // It should return an error if the reading date is in the future.
    it('should return an error if the reading date is in the future', async () => {
      const futureDate = Timestamp.fromDate(new Date(Date.now() + 86400000));
      jest.mocked(ReadingValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(400, 'Reading date cannot be in the future')
      );

      await expect(
        readingService.create(TEST_USER_ID, {
          meter_group_id: 'mg-1',
          reading_amount: 100,
          reading_date: futureDate,
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // It should return an error if the selected meter group already has the maximum number of readings allowed.
    it('should return an error if the selected meter group already has the maximum number of readings allowed', async () => {
      jest.mocked(ReadingValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(400, 'Maximum number of readings allowed for this meter group has been exceeded')
      );

      await expect(
        readingService.create(TEST_USER_ID, {
          meter_group_id: 'mg-full',
          reading_amount: 100,
          reading_date: Timestamp.now(),
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // Auto-billing behavior tests
    describe('auto-billing behavior', () => {
      it('should create reading without billing when no previous-month reading exists', async () => {
        // firestore.collection default returns { empty: true } → falls back to readingRepository.create
        jest.mocked(ReadingValidator.prototype.validateCreate).mockResolvedValue(undefined);
        jest.mocked(readingRepository.create).mockResolvedValue(mockReading());

        const result = await readingService.create(TEST_USER_ID, {
          meter_group_id: 'mg-1',
          reading_amount: 200,
          reading_date: Timestamp.now(),
        });

        expect(readingRepository.create).toHaveBeenCalled();
        expect(result.id).toBe('reading-1');

        // Transaction should NOT have been called
        const { firestore } = require('../../config/firebase.config');
        expect(firestore.runTransaction).not.toHaveBeenCalled();
      });

      it('should run a Firestore transaction when previous-month reading exists', async () => {
        const { firestore } = require('../../config/firebase.config');
        const prevReadingDoc = {
          id: 'prev-reading-id',
          data: () => ({ meter_group_id: 'mg-1', reading_amount: 100 }),
        };

        // First collection() call: READINGS query → has previous reading
        // Second collection() call: PROPERTIES.doc(property_id) → property exists
        // Third collection() call: READINGS.doc() for new reading
        jest.mocked(firestore.collection)
          .mockReturnValueOnce({
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: false, docs: [prevReadingDoc] }),
          })
          .mockReturnValueOnce({
            doc: jest.fn().mockReturnValue({
              id: 'prop-1',
              get: jest.fn().mockResolvedValue({
                id: 'prop-1',
                exists: true,
                data: () => ({ is_deleted: false }),
              }),
            }),
          })
          .mockReturnValueOnce({
            doc: jest.fn().mockReturnValue({
              id: 'new-id',
              get: jest.fn().mockResolvedValue({
                id: 'new-id',
                exists: true,
                data: () => ({ meter_group_id: 'mg-1', reading_amount: 200 }),
              }),
            }),
          });

        jest.mocked(ReadingValidator.prototype.validateCreate).mockResolvedValue(undefined);

        const result = await readingService.create(TEST_USER_ID, {
          meter_group_id: 'mg-1',
          property_id: 'prop-1',
          reading_amount: 200,
          reading_date: Timestamp.now(),
        });

        expect(firestore.runTransaction).toHaveBeenCalled();
        expect(result).toBeDefined();
      });

      it('should not include meter_version in DTO schema (server-set field)', () => {
        const result = CreateReadingDTOSchema.safeParse({
          meter_group_id: 'mg-1',
          property_id: 'prop-1',
          reading_amount: 50,
          reading_date: Timestamp.now(),
        });
        expect(result.success).toBe(true);
        expect((result.data as any)?.meter_version).toBeUndefined();
      });

      it('should reject with 409 when a reading for the same meter group already exists this month', async () => {
        jest.mocked(ReadingValidator.prototype.validateCreate).mockRejectedValue(
          new AppError(409, 'A reading for this meter group already exists in this month')
        );

        await expect(
          readingService.create(TEST_USER_ID, {
            meter_group_id: 'mg-1',
            reading_amount: 200,
            reading_date: Timestamp.now(),
          })
        ).rejects.toMatchObject({ statusCode: 409 });
      });
    });
  });

  // Batch create readings
  describe('createBatch', () => {
    // It should create multiple readings in a batch.
    it('should create multiple readings in a batch', async () => {
      jest.mocked(ReadingValidator.prototype.validateBatch).mockResolvedValue({ validIndexes: [0, 1], failures: [] });
      jest.mocked(readingRepository.create)
        .mockResolvedValueOnce(mockReading({ id: 'reading-1' }))
        .mockResolvedValueOnce(mockReading({ id: 'reading-2', reading_amount: 200 }));

      const input = [
        {
          meter_group_id: 'mg-1',
          reading_amount: 100,
          reading_date: Timestamp.now(),
        },
        {
          meter_group_id: 'mg-1',
          reading_amount: 200,
          reading_date: Timestamp.now(),
        },
      ];
      const result = await readingService.createBatch(TEST_USER_ID, input);

      expect(readingRepository.create).toHaveBeenCalledTimes(2);
      expect(result.created).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    // It should return an error if batch is empty.
    it('should return an error if batch array is empty', () => {
      const result = CreateReadingBatchDTOSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    // It should return an error if batch exceeds max size.
    it('should return an error if batch exceeds max size of 10', () => {
      const input = Array(11).fill({
        meter_group_id: 'mg-1',
        reading_amount: 100,
        reading_date: Timestamp.now(),
      });
      const result = CreateReadingBatchDTOSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    // It should return an error if any item in the batch has a validation error.
    it('should return an error if any item in the batch has a negative reading', async () => {
      jest.mocked(ReadingValidator.prototype.validateBatch).mockRejectedValue(
        new AppError(400, 'Reading amount cannot be negative')
      );

      const input = [
        {
          meter_group_id: 'mg-1',
          reading_amount: 100,
          reading_date: Timestamp.now(),
        },
        {
          meter_group_id: 'mg-1',
          reading_amount: -50,
          reading_date: Timestamp.now(),
        },
      ];

      await expect(readingService.createBatch(TEST_USER_ID, input)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // Get reading by ID
  describe('getById', () => {
    // It should return the reading details for the given reading ID.
    it('should return the reading details for the given reading ID', async () => {
      jest.mocked(readingRepository.getById).mockResolvedValue(mockReading());

      const result = await readingService.getById(TEST_USER_ID, 'reading-1');

      expect(readingRepository.getById).toHaveBeenCalledWith('reading-1');
      expect(result).toEqual(mockReading());
    });

    // It should return an error if the reading ID is not provided.
    it('should return an error if the reading ID is not provided', () => {
      const result = ReadingByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the reading ID does not exist.
    it('should return an error if the reading ID does not exist', async () => {
      jest.mocked(readingRepository.getById).mockResolvedValue(null);

      const result = await readingService.getById(TEST_USER_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // Search readings
  describe('search', () => {
    // It should return a cursor-based paginated list of all readings based on the provided filters such as name and property ID.
    it('should return a paginated list of readings with meterGroupId filter', async () => {
      const paginated = { data: [mockReading()], hasMore: false, nextCursor: null };
      jest.mocked(readingRepository.search).mockResolvedValue(paginated);

      const result = await readingService.search(TEST_USER_ID, { meterGroupId: 'mg-1', limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    // It should return an empty list if there are no readings matching everything in the query.
    it('should return an empty list if there are no readings matching the query', async () => {
      jest.mocked(readingRepository.search).mockResolvedValue({ data: [], hasMore: false, nextCursor: null });

      const result = await readingService.search(TEST_USER_ID, { meterGroupId: 'nonexistent', limit: 20 });

      expect(result.data).toHaveLength(0);
    });

    // It should return nextCursor when more results exist.
    it('should return nextCursor when more results exist', async () => {
      // CachedRepository.search loads ALL pages via loadAll (loops until hasMore
      // is false) before paginating in-memory — the mock must terminate the loop.
      jest.mocked(readingRepository.search)
        .mockResolvedValueOnce({
          data: [mockReading({ id: 'reading-1' }), mockReading({ id: 'reading-2' })],
          hasMore: false,
          nextCursor: null,
        });

      const result = await readingService.search(TEST_USER_ID, { limit: 1 });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('reading-1');
    });

    // It should handle cursor pagination edge cases.
    it('should handle cursor pagination with no more results', async () => {
      jest.mocked(readingRepository.search).mockResolvedValue({
        data: [mockReading()],
        hasMore: false,
        nextCursor: null,
      });

      const result = await readingService.search(TEST_USER_ID, { cursor: 'cursor-xyz', limit: 20 });

      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
    });
  });

  // Update reading
  describe('update', () => {
    // It should update the reading details for the given reading ID and return the updated reading details.
    it('should update the reading details', async () => {
      const updated = mockReading({ reading_amount: 150 });
      jest.mocked(ReadingValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(readingRepository.update).mockResolvedValue(updated);

      const result = await readingService.update(TEST_USER_ID, 'reading-1', { reading_amount: 150 });

      expect(readingRepository.update).toHaveBeenCalledWith('reading-1', { reading_amount: 150 });
      expect(result.reading_amount).toBe(150);
    });

    // It should return an error if the reading ID is not provided.
    it('should return an error if the reading ID is not provided', () => {
      const result = ReadingByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the reading ID does not exist.
    it('should return an error if the reading ID does not exist', async () => {
      jest.mocked(readingRepository.update).mockRejectedValue(new AppError(404, 'Reading not found'));

      await expect(
        readingService.update(TEST_USER_ID, 'nonexistent', { reading_amount: 150 })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    // It should return an error if the updated meter group ID does not exist.
    it('should return an error if the updated meter group ID does not exist', async () => {
      jest.mocked(ReadingValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(404, 'Meter group not found')
      );

      await expect(
        readingService.update(TEST_USER_ID, 'reading-1', { meter_group_id: 'nonexistent' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    // It should return an error if the updated reading value is not a valid number.
    it('should return an error if the updated reading value is not a valid number', () => {
      const result = UpdateReadingDTOSchema.safeParse({ reading_amount: 'invalid' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the updated reading value is negative.
    it('should return an error if the updated reading value is negative', async () => {
      jest.mocked(ReadingValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(400, 'Reading amount cannot be negative')
      );

      await expect(
        readingService.update(TEST_USER_ID, 'reading-1', { reading_amount: -50 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // It should return an error if the updated reading date is not a valid date.
    it('should return an error if the updated reading date is not a valid date', () => {
      const result = UpdateReadingDTOSchema.safeParse({ reading_date: 'not-a-date' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the updated reading date is in the future.
    it('should return an error if the updated reading date is in the future', async () => {
      const futureDate = Timestamp.fromDate(new Date(Date.now() + 86400000));
      jest.mocked(ReadingValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(400, 'Reading date cannot be in the future')
      );

      await expect(
        readingService.update(TEST_USER_ID, 'reading-1', { reading_date: futureDate })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // Batch update readings
  describe('updateBatch', () => {
    // It should update multiple readings in a batch.
    it('should update multiple readings in a batch', async () => {
      const mocks = [
        mockReading({ id: 'reading-1', reading_amount: 150 }),
        mockReading({ id: 'reading-2', reading_amount: 250 }),
      ];
      jest.mocked(ReadingValidator.prototype.validateUpdateBatch).mockResolvedValue(undefined);
      jest.mocked(readingRepository.updateBatch).mockResolvedValue(mocks);

      const input = [
        { id: 'reading-1', data: { reading_amount: 150 } },
        { id: 'reading-2', data: { reading_amount: 250 } },
      ];
      const result = await readingService.updateBatch(TEST_USER_ID, input);

      expect(readingRepository.updateBatch).toHaveBeenCalledWith(input);
      expect(result).toHaveLength(2);
    });

    // It should return an error if batch is empty.
    it('should return an error if batch array is empty', () => {
      const result = UpdateReadingBatchDTOSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    // It should return an error if batch exceeds max size.
    it('should return an error if batch exceeds max size of 10', () => {
      const input = Array(11).fill({ id: 'reading-1', data: { reading_amount: 100 } });
      const result = UpdateReadingBatchDTOSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // Delete reading
  describe('delete', () => {
    // It should delete the reading for the given reading ID and return a success message.
    it('should delete the reading', async () => {
      jest.mocked(readingRepository.delete).mockResolvedValue(undefined);

      await expect(readingService.delete(TEST_USER_ID, 'reading-1')).resolves.toBeUndefined();

      expect(readingRepository.delete).toHaveBeenCalledWith('reading-1');
    });

    // It should return an error if the reading ID is not provided.
    it('should return an error if the reading ID is not provided', () => {
      const result = ReadingByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the reading ID does not exist.
    it('should return an error if the reading ID does not exist', async () => {
      jest.mocked(readingRepository.delete).mockRejectedValue(new AppError(404, 'Reading not found'));

      await expect(readingService.delete(TEST_USER_ID, 'nonexistent')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // Soft delete reading
  describe('softDelete', () => {
    // It should soft delete the reading for the given reading ID and return a success message.
    it('should soft delete the reading', async () => {
      const softDeleted = mockReading({ deleted_at: Timestamp.now() });
      jest.mocked(readingRepository.getById)
        .mockResolvedValueOnce(mockReading())
        .mockResolvedValueOnce(softDeleted);

      const result = await readingService.softDelete(TEST_USER_ID, 'reading-1');

      expect(cascadeDeleteReading).toHaveBeenCalledWith('reading-1');
      expect(result.deleted_at).toBeDefined();
    });

    // It should return an error if the reading ID is not provided.
    it('should return an error if the reading ID is not provided', () => {
      const result = ReadingByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the reading ID does not exist.
    it('should return an error if the reading ID does not exist', async () => {
      jest.mocked(readingRepository.softDelete).mockRejectedValue(new AppError(404, 'Reading not found'));

      await expect(readingService.softDelete(TEST_USER_ID, 'nonexistent')).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
