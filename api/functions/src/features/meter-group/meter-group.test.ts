jest.mock('./meter-group.repository');
jest.mock('./meter-group.validator');

// Mock Firestore for cascade delete check in meterGroupService.delete
jest.mock('../../config/firebase.config', () => ({
  firestore: {
    collection: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ empty: true }),
    })),
  },
}));

import { describe, it, expect } from '@jest/globals';
import { meterGroupService } from './meter-group.service';
import { meterGroupRepository } from './meter-group.repository';
import { MeterGroupValidator } from './meter-group.validator';
import { CreateMeterGroupDTOSchema, UpdateMeterGroupDTOSchema, MeterGroupByIdParamsDTOSchema, CreateMeterGroupBatchDTOSchema, UpdateMeterGroupBatchDTOSchema } from './meter-group.dto';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';

const now = Timestamp.now();

const mockMeterGroup = (overrides?: Record<string, any>) => ({
  id: 'mg-1',
  meter_name: 'Main Electric',
  utility_type: 'electricity' as const,
  created_at: now,
  updated_at: now,
  ...overrides,
});

describe('meterGroupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Create a new meter group
  describe('create', () => {
    // It should create a new meter group with the given meter name, utility type, and return the meter group ID.
    it('should create a new meter group with the given meter name, utility type, and return the meter group ID', async () => {
      jest.mocked(MeterGroupValidator.prototype.validateCreate).mockResolvedValue(undefined);
      jest.mocked(meterGroupRepository.create).mockResolvedValue(mockMeterGroup());

      const result = await meterGroupService.create({ meter_name: 'Main Electric', utility_type: 'electricity' });

      expect(meterGroupRepository.create).toHaveBeenCalledWith({ meter_name: 'Main Electric', utility_type: 'electricity', current_version: 1, versions: {} });
      expect(result.id).toBe('mg-1');
    });

    // It should return an error if the meter name is not provided.
    it('should return an error if the meter name is not provided', () => {
      const result = CreateMeterGroupDTOSchema.safeParse({ utility_type: 'electricity' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the utility type is not provided.
    it('should return an error if the utility type is not provided', () => {
      const result = CreateMeterGroupDTOSchema.safeParse({ meter_name: 'Main Electric' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the utility type is not valid.
    it('should return an error if the utility type is not valid', () => {
      const result = CreateMeterGroupDTOSchema.safeParse({ meter_name: 'Main Electric', utility_type: 'gas' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the meter name already exists for the selected utility type.
    it('should return an error if the meter name already exists for the selected utility type', async () => {
      jest.mocked(MeterGroupValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(409, 'Meter name already exists for the selected utility type')
      );

      await expect(
        meterGroupService.create({ meter_name: 'Duplicate', utility_type: 'electricity' })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Meter name already exists for the selected utility type',
      });
    });
  });

  // Batch create
  describe('createBatch', () => {
    // It should create multiple meter groups.
    it('should create multiple meter groups in a batch', async () => {
      const mocks = [mockMeterGroup({ id: 'mg-1' }), mockMeterGroup({ id: 'mg-2', meter_name: 'Water' })];
      jest.mocked(MeterGroupValidator.prototype.validateBatch).mockResolvedValue(undefined);
      jest.mocked(meterGroupRepository.createBatch).mockResolvedValue(mocks);

      const input = [
        { meter_name: 'Main Electric', utility_type: 'electricity' as const },
        { meter_name: 'Water', utility_type: 'water' as const },
      ];
      const result = await meterGroupService.createBatch(input);

      expect(meterGroupRepository.createBatch).toHaveBeenCalledWith(
        input.map((item) => ({ ...item, current_version: 1, versions: {} }))
      );
      expect(result).toHaveLength(2);
    });

    // It should return an error if batch is empty.
    it('should return an error if batch array is empty', () => {
      const result = CreateMeterGroupBatchDTOSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    // It should return an error if batch exceeds max size.
    it('should return an error if batch exceeds max size of 10', () => {
      const input = Array(11).fill({ meter_name: 'Test', utility_type: 'electricity' as const });
      const result = CreateMeterGroupBatchDTOSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    // It should return an error if any item in the batch has a validation error.
    it('should return an error if any item in the batch has duplicate name', async () => {
      jest.mocked(MeterGroupValidator.prototype.validateBatch).mockRejectedValue(
        new AppError(409, 'Meter name already exists for the selected utility type')
      );

      const input = [
        { meter_name: 'Main Electric', utility_type: 'electricity' as const },
        { meter_name: 'Main Electric', utility_type: 'electricity' as const },
      ];

      await expect(meterGroupService.createBatch(input)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  // Get meter group by ID
  describe('getById', () => {
    // It should return the meter group details for the given meter group ID.
    it('should return the meter group details for the given meter group ID', async () => {
      jest.mocked(meterGroupRepository.getById).mockResolvedValue(mockMeterGroup());

      const result = await meterGroupService.getById('mg-1');

      expect(meterGroupRepository.getById).toHaveBeenCalledWith('mg-1');
      expect(result).toEqual(mockMeterGroup());
    });

    // It should return an error if the meter group ID is not provided.
    it('should return an error if the meter group ID is not provided', () => {
      const result = MeterGroupByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the meter group ID does not exist.
    it('should return an error if the meter group ID does not exist', async () => {
      jest.mocked(meterGroupRepository.getById).mockResolvedValue(null);

      const result = await meterGroupService.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // Search meter groups
  describe('search', () => {
    // It should return a cursor-based paginated list of all meter groups based on the provided filters such as name, utility type, and active status.
    it('should return a paginated list of meter groups', async () => {
      const paginated = { data: [mockMeterGroup()], hasMore: false, nextCursor: null };
      jest.mocked(meterGroupRepository.search).mockResolvedValue(paginated);

      const result = await meterGroupService.search({ limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    // It should return an empty list if there are no meter groups matching everything in the query.
    it('should return an empty list if there are no meter groups matching the query', async () => {
      jest.mocked(meterGroupRepository.search).mockResolvedValue({ data: [], hasMore: false, nextCursor: null });

      const result = await meterGroupService.search({ limit: 20, utilityType: 'water' });

      expect(result.data).toHaveLength(0);
    });

    // It should return nextCursor when more results exist.
    it('should return nextCursor when more results exist', async () => {
      jest.mocked(meterGroupRepository.search).mockResolvedValue({
        data: [mockMeterGroup()],
        hasMore: true,
        nextCursor: 'cursor-abc',
      });

      const result = await meterGroupService.search({ limit: 1 });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('cursor-abc');
    });
  });

  // Update meter group
  describe('update', () => {
    // It should update the meter group details for the given meter group ID and return the updated meter group details.
    it('should update the meter group details', async () => {
      const updated = mockMeterGroup({ meter_name: 'Updated Name' });
      jest.mocked(meterGroupRepository.update).mockResolvedValue(updated);

      const result = await meterGroupService.update('mg-1', { meter_name: 'Updated Name' });

      expect(meterGroupRepository.update).toHaveBeenCalledWith('mg-1', { meter_name: 'Updated Name' });
      expect(result.meter_name).toBe('Updated Name');
    });

    // It should return an error if the meter group ID is not provided.
    it('should return an error if the meter group ID is not provided', () => {
      const result = MeterGroupByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the meter group ID does not exist.
    it('should return an error if the meter group ID does not exist', async () => {
      jest.mocked(meterGroupRepository.update).mockRejectedValue(new AppError(404, 'Meter group not found'));

      await expect(meterGroupService.update('nonexistent', { meter_name: 'X' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    // It should return an error if the updated utility type is not valid.
    it('should return an error if the updated utility type is not valid', () => {
      const result = UpdateMeterGroupDTOSchema.safeParse({ utility_type: 'gas' });
      expect(result.success).toBe(false);
    });
  });

  // Batch update
  describe('updateBatch', () => {
    // It should update multiple meter groups.
    it('should update multiple meter groups in a batch', async () => {
      const mocks = [mockMeterGroup({ id: 'mg-1' }), mockMeterGroup({ id: 'mg-2' })];
      jest.mocked(meterGroupRepository.updateBatch).mockResolvedValue(mocks);

      const input = [
        { id: 'mg-1', data: { meter_name: 'Updated 1' } },
        { id: 'mg-2', data: { meter_name: 'Updated 2' } },
      ];
      const result = await meterGroupService.updateBatch(input);

      expect(meterGroupRepository.updateBatch).toHaveBeenCalledWith(input);
      expect(result).toHaveLength(2);
    });

    // It should return an error if batch is empty.
    it('should return an error if batch array is empty', () => {
      const result = UpdateMeterGroupBatchDTOSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    // It should return an error if batch exceeds max size.
    it('should return an error if batch exceeds max size of 10', () => {
      const input = Array(11).fill({ id: 'mg-1', data: { meter_name: 'Test' } });
      const result = UpdateMeterGroupBatchDTOSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // Delete meter group
  describe('delete', () => {
    // It should delete the meter group for the given meter group ID and return a success message.
    it('should delete the meter group', async () => {
      jest.mocked(meterGroupRepository.delete).mockResolvedValue(undefined);

      await expect(meterGroupService.delete('mg-1')).resolves.toBeUndefined();

      expect(meterGroupRepository.delete).toHaveBeenCalledWith('mg-1');
    });

    // It should return an error if the meter group ID is not provided.
    it('should return an error if the meter group ID is not provided', () => {
      const result = MeterGroupByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the meter group ID does not exist.
    it('should return an error if the meter group ID does not exist', async () => {
      jest.mocked(meterGroupRepository.delete).mockRejectedValue(new AppError(404, 'Meter group not found'));

      await expect(meterGroupService.delete('nonexistent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // Soft delete meter group
  describe('softDelete', () => {
    // It should soft delete the meter group for the given meter group ID and return a success message.
    it('should soft delete the meter group', async () => {
      const softDeleted = mockMeterGroup({ deleted_at: Timestamp.now() });
      jest.mocked(meterGroupRepository.softDelete).mockResolvedValue(softDeleted);

      const result = await meterGroupService.softDelete('mg-1');

      expect(meterGroupRepository.softDelete).toHaveBeenCalledWith('mg-1');
      expect(result.deleted_at).toBeDefined();
    });

    // It should return an error if the meter group ID is not provided.
    it('should return an error if the meter group ID is not provided', () => {
      const result = MeterGroupByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the meter group ID does not exist.
    it('should return an error if the meter group ID does not exist', async () => {
      jest.mocked(meterGroupRepository.softDelete).mockRejectedValue(new AppError(404, 'Meter group not found'));

      await expect(meterGroupService.softDelete('nonexistent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
