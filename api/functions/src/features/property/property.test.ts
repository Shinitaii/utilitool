jest.mock('./property.repository');
jest.mock('./property.validator');

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { propertyService } from './property.service';
import { propertyRepository } from './property.repository';
import { PropertyValidator } from './property.validator';
import { CreatePropertyDTOSchema, UpdatePropertyDTOSchema, PropertyByIdParamsDTOSchema, CreatePropertyBatchDTOSchema, UpdatePropertyBatchDTOSchema } from './property.dto';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';

/// TDD Case for property
/// You must not touch the any of the code here.
/// To create a new test case, create pseudo code in the form of a comment.
/// This could mean what it does, and what it returns.
/// You can also add edge cases and error cases as well.

const now = Timestamp.now();

const mockProperty = (overrides?: Record<string, any>) => ({
  id: 'prop-1',
  room_name: 'Room 101',
  tenant_amount: 2,
  meter_group_id: 'mg-1',
  created_at: now,
  updated_at: now,
  ...overrides,
});

describe('propertyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Create a new property
  describe('create', () => {
    // It should create a new property with the given room name, tenant amount, and meter group ID, and return the property ID.
    it('should create a new property with the given room name, tenant amount, and meter group ID, and return the property ID', async () => {
      jest.mocked(PropertyValidator.prototype.validateCreate).mockResolvedValue(undefined);
      jest.mocked(propertyRepository.create).mockResolvedValue(mockProperty());

      const result = await propertyService.create({
        room_name: 'Room 101',
        tenant_amount: 2,
        meter_group_id: 'mg-1',
      });

      expect(propertyRepository.create).toHaveBeenCalledWith({
        room_name: 'Room 101',
        tenant_amount: 2,
        meter_group_id: 'mg-1',
      });
      expect(result.id).toBe('prop-1');
    });

    // It should return an error if the room name is not provided.
    it('should return an error if the room name is not provided', () => {
      const result = CreatePropertyDTOSchema.safeParse({ tenant_amount: 2, meter_group_id: 'mg-1' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the tenant amount is not provided.
    it('should return an error if the tenant amount is not provided', () => {
      const result = CreatePropertyDTOSchema.safeParse({ room_name: 'Room 101', meter_group_id: 'mg-1' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the meter group ID is not provided.
    it('should return an error if the meter group ID is not provided', () => {
      const result = CreatePropertyDTOSchema.safeParse({ room_name: 'Room 101', tenant_amount: 2 });
      expect(result.success).toBe(false);
    });

    // It should return an error if the selected meter group does not exist.
    it('should return an error if the selected meter group does not exist', async () => {
      jest.mocked(PropertyValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(404, 'Meter group not found')
      );

      await expect(
        propertyService.create({ room_name: 'Room 101', tenant_amount: 2, meter_group_id: 'nonexistent' })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Meter group not found',
      });
    });

    // It should return an error if the room name already exists for the selected meter group.
    it('should return an error if the room name already exists for the selected meter group', async () => {
      jest.mocked(PropertyValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(409, 'Room name already exists for the selected meter group')
      );

      await expect(
        propertyService.create({ room_name: 'Room 101', tenant_amount: 2, meter_group_id: 'mg-1' })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Room name already exists for the selected meter group',
      });
    });
  });

  // Batch create
  describe('createBatch', () => {
    // It should create multiple properties in a batch.
    it('should create multiple properties in a batch', async () => {
      const mocks = [mockProperty({ id: 'prop-1' }), mockProperty({ id: 'prop-2', room_name: 'Room 102' })];
      jest.mocked(PropertyValidator.prototype.validateBatchCreate).mockResolvedValue(undefined);
      jest.mocked(propertyRepository.createBatch).mockResolvedValue(mocks);

      const input = [
        { room_name: 'Room 101', tenant_amount: 2, meter_group_id: 'mg-1' },
        { room_name: 'Room 102', tenant_amount: 3, meter_group_id: 'mg-1' },
      ];
      const result = await propertyService.createBatch(input);

      expect(propertyRepository.createBatch).toHaveBeenCalledWith(input);
      expect(result).toHaveLength(2);
    });

    // It should return an error if batch is empty.
    it('should return an error if batch array is empty', () => {
      const result = CreatePropertyBatchDTOSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    // It should return an error if batch exceeds max size.
    it('should return an error if batch exceeds max size of 10', () => {
      const input = Array(11).fill({
        room_name: 'Room',
        tenant_amount: 1,
        meter_group_id: 'mg-1',
      });
      const result = CreatePropertyBatchDTOSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // Get property by ID
  describe('getById', () => {
    // It should return the property details for the given property ID.
    it('should return the property details for the given property ID', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(mockProperty());

      const result = await propertyService.getById('prop-1');

      expect(propertyRepository.getById).toHaveBeenCalledWith('prop-1');
      expect(result).toEqual(mockProperty());
    });

    // It should return an error if the property ID is not provided.
    it('should return an error if the property ID is not provided', () => {
      const result = PropertyByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the property ID does not exist.
    it('should return an error if the property ID does not exist', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(null);

      const result = await propertyService.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // Search properties
  describe('search', () => {
    // It should return a cursor-based paginated list of all properties based on the provided filters such as room name and meter group ID.
    it('should return a paginated list of properties', async () => {
      const paginated = { data: [mockProperty()], hasMore: false, nextCursor: null };
      jest.mocked(propertyRepository.search).mockResolvedValue(paginated);

      const result = await propertyService.search({ limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    // It should return an empty list if there are no properties matching everything in the query.
    it('should return an empty list if there are no properties matching the query', async () => {
      jest.mocked(propertyRepository.search).mockResolvedValue({ data: [], hasMore: false, nextCursor: null });

      const result = await propertyService.search({ limit: 20, roomName: 'NonExistent' });

      expect(result.data).toHaveLength(0);
    });

    // It should return nextCursor when more results exist.
    it('should return nextCursor when more results exist', async () => {
      jest.mocked(propertyRepository.search).mockResolvedValue({
        data: [mockProperty()],
        hasMore: true,
        nextCursor: 'cursor-abc',
      });

      const result = await propertyService.search({ limit: 1 });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('cursor-abc');
    });
  });

  // Update property
  describe('update', () => {
    // It should update the property details for the given property ID and return the updated property details.
    it('should update the property details', async () => {
      const updated = mockProperty({ room_name: 'Room 202' });
      jest.mocked(propertyRepository.getById).mockResolvedValue(mockProperty());
      jest.mocked(PropertyValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(propertyRepository.update).mockResolvedValue(updated);

      const result = await propertyService.update('prop-1', { room_name: 'Room 202' });

      expect(result.room_name).toBe('Room 202');
    });

    // It should return an error if the property ID is not provided.
    it('should return an error if the property ID is not provided', () => {
      const result = PropertyByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the property ID does not exist.
    it('should return an error if the property ID does not exist', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(null);

      await expect(propertyService.update('nonexistent', { room_name: 'New Name' })).rejects.toMatchObject({
        statusCode: 404,
        message: 'Property not found',
      });
    });

    // It should return an error if the updated meter group ID does not exist.
    it('should return an error if the updated meter group ID does not exist', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(mockProperty());
      jest.mocked(PropertyValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(404, 'Meter group not found')
      );

      await expect(propertyService.update('prop-1', { meter_group_id: 'bad-mg' })).rejects.toMatchObject({
        statusCode: 404,
        message: 'Meter group not found',
      });
    });

    // It should return an error if the updated tenant amount is not a positive integer.
    it('should return an error if the updated tenant amount is not a positive integer', () => {
      const result = UpdatePropertyDTOSchema.safeParse({ tenant_amount: 0 });
      expect(result.success).toBe(false);
    });

    // It should return an error if the updated tenant amount is less than the current tenant amount for the property.
    it('should return an error if the updated tenant amount is less than the current tenant count', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(mockProperty());
      jest.mocked(PropertyValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(409, 'Tenant amount cannot be less than current tenant count')
      );

      await expect(propertyService.update('prop-1', { tenant_amount: 1 })).rejects.toMatchObject({
        statusCode: 409,
        message: 'Tenant amount cannot be less than current tenant count',
      });
    });

    // It should return an error if the updated room name already exists for the selected meter group.
    it('should return an error if the updated room name already exists for the selected meter group', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(mockProperty());
      jest.mocked(PropertyValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(409, 'Room name already exists for the selected meter group')
      );

      await expect(propertyService.update('prop-1', { room_name: 'Existing Room' })).rejects.toMatchObject({
        statusCode: 409,
        message: 'Room name already exists for the selected meter group',
      });
    });
  });

  // Batch update
  describe('updateBatch', () => {
    // It should update multiple properties in a batch.
    it('should update multiple properties in a batch', async () => {
      jest.mocked(PropertyValidator.prototype.validateBatchUpdate).mockResolvedValue(undefined);
      jest.mocked(propertyRepository.update).mockResolvedValue(mockProperty());

      const input = [
        { id: 'prop-1', data: { room_name: 'Updated 1' } },
        { id: 'prop-2', data: { room_name: 'Updated 2' } },
      ];
      const result = await propertyService.updateBatch(input);

      expect(result).toHaveLength(2);
    });

    // It should return an error if batch is empty.
    it('should return an error if batch array is empty', () => {
      const result = UpdatePropertyBatchDTOSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    // It should return an error if batch exceeds max size.
    it('should return an error if batch exceeds max size of 10', () => {
      const input = Array(11).fill({ id: 'prop-1', data: { room_name: 'Room' } });
      const result = UpdatePropertyBatchDTOSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // Delete property
  describe('delete', () => {
    // It should delete the property for the given property ID and return a success message.
    it('should delete the property', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(mockProperty());
      jest.mocked(propertyRepository.delete).mockResolvedValue(undefined);

      await expect(propertyService.delete('prop-1')).resolves.toBeUndefined();

      expect(propertyRepository.delete).toHaveBeenCalledWith('prop-1');
    });

    // It should return an error if the property ID is not provided.
    it('should return an error if the property ID is not provided', () => {
      const result = PropertyByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the property ID does not exist.
    it('should return an error if the property ID does not exist', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(null);

      await expect(propertyService.delete('nonexistent')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Property not found',
      });
    });
  });

  // Soft delete property
  describe('softDelete', () => {
    // It should soft delete the property for the given property ID and return a success message.
    it('should soft delete the property', async () => {
      const softDeleted = mockProperty({ deleted_at: Timestamp.now() });
      jest.mocked(propertyRepository.getById).mockResolvedValue(mockProperty());
      jest.mocked(propertyRepository.softDelete).mockResolvedValue(softDeleted);

      const result = await propertyService.softDelete('prop-1');

      expect(result.deleted_at).toBeDefined();
    });

    // It should return an error if the property ID is not provided.
    it('should return an error if the property ID is not provided', () => {
      const result = PropertyByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the property ID does not exist.
    it('should return an error if the property ID does not exist', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(null);

      await expect(propertyService.softDelete('nonexistent')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Property not found',
      });
    });
  });
});