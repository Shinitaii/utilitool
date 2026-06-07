jest.mock('./tenant.repository');
jest.mock('./tenant.validator');

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { tenantService } from './tenant.service';
import { tenantRepository } from './tenant.repository';
import { TenantValidator } from './tenant.validator';
import { CreateTenantDTOSchema, UpdateTenantDTOSchema, TenantByIdParamsDTOSchema, CreateTenantBatchDTOSchema, UpdateTenantBatchDTOSchema } from './tenant.dto';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';

/// Test cases for tenant (TDD)
/// You must not touch the any of the code here.
/// To create a new test case, create pseudo code in the form of a comment.
/// This could mean what it does, and what it returns.
/// You can also add edge cases and error cases as well.

const now = Timestamp.now();
const TEST_USER_ID = 'user-1';

const mockTenant = (overrides?: Record<string, any>) => ({
  id: 'tenant-1',
  tenant_name: 'John Doe',
  property_id: 'prop-1',
  tenant_start_date: now,
  created_at: now,
  updated_at: now,
  ...overrides,
});

describe('tenantService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Create a new tenant
  describe('create', () => {
    // It should create a new tenant with the given name and return the tenant ID.
    it('should create a new tenant with the given name and return the tenant ID', async () => {
      jest.mocked(TenantValidator.prototype.validateCreate).mockResolvedValue(undefined);
      jest.mocked(tenantRepository.create).mockResolvedValue(mockTenant());

      const result = await tenantService.create(TEST_USER_ID, { tenant_name: 'John Doe', property_id: 'prop-1' });

      expect(tenantRepository.create).toHaveBeenCalled();
      expect(result.id).toBe('tenant-1');
    });

    // It should return an error if the tenant name is not provided.
    it('should return an error if the tenant name is not provided', () => {
      const result = CreateTenantDTOSchema.safeParse({ property_id: 'prop-1' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the selected property is not provided.
    it('should return an error if the selected property is not provided', () => {
      const result = CreateTenantDTOSchema.safeParse({ tenant_name: 'John' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the selected property does not exist.
    it('should return an error if the selected property does not exist', async () => {
      jest.mocked(TenantValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(404, 'Property not found')
      );

      await expect(
        tenantService.create(TEST_USER_ID, { tenant_name: 'John', property_id: 'bad-prop' })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Property not found',
      });
    });

    // It should return an error if the tenant name already exists for the selected property.
    it('should return an error if the tenant name already exists for the selected property', async () => {
      jest.mocked(TenantValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(409, 'Tenant name already exists for the selected property')
      );

      await expect(
        tenantService.create(TEST_USER_ID, { tenant_name: 'John', property_id: 'prop-1' })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Tenant name already exists for the selected property',
      });
    });

    // It should return an error if the selected property already has the maximum number of tenants allowed.
    it('should return an error if the selected property already has the maximum number of tenants allowed', async () => {
      jest.mocked(TenantValidator.prototype.validateCreate).mockRejectedValue(
        new AppError(409, 'Property has reached the maximum number of tenants allowed')
      );

      await expect(
        tenantService.create(TEST_USER_ID, { tenant_name: 'Jane', property_id: 'prop-1' })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Property has reached the maximum number of tenants allowed',
      });
    });
  });

  // Batch create
  describe('createBatch', () => {
    // It should create multiple tenants in a batch.
    it('should create multiple tenants in a batch', async () => {
      const mocks = [mockTenant({ id: 'tenant-1' }), mockTenant({ id: 'tenant-2', tenant_name: 'Jane Doe' })];
      jest.mocked(TenantValidator.prototype.validateBatchCreate).mockResolvedValue(undefined);
      jest.mocked(tenantRepository.createBatch).mockResolvedValue(mocks);

      const input = [
        { tenant_name: 'John Doe', property_id: 'prop-1' },
        { tenant_name: 'Jane Doe', property_id: 'prop-1' },
      ];
      const result = await tenantService.createBatch(TEST_USER_ID, input);

      expect(tenantRepository.createBatch).toHaveBeenCalledWith(expect.any(Array));
      expect(result).toHaveLength(2);
    });

    // It should return an error if batch is empty.
    it('should return an error if batch array is empty', () => {
      const result = CreateTenantBatchDTOSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    // It should return an error if batch exceeds max size.
    it('should return an error if batch exceeds max size of 10', () => {
      const input = Array(11).fill({ tenant_name: 'Test', property_id: 'prop-1' });
      const result = CreateTenantBatchDTOSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // Get tenant by ID
  describe('getById', () => {
    // It should return the tenant details for the given tenant ID.
    it('should return the tenant details for the given tenant ID', async () => {
      jest.mocked(tenantRepository.getById).mockResolvedValue(mockTenant());

      const result = await tenantService.getById(TEST_USER_ID, 'tenant-1');

      expect(tenantRepository.getById).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual(mockTenant());
    });

    // It should return an error if the tenant ID is not provided.
    it('should return an error if the tenant ID is not provided', () => {
      const result = TenantByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the tenant ID does not exist.
    it('should return an error if the tenant ID does not exist', async () => {
      jest.mocked(tenantRepository.getById).mockResolvedValue(null);

      const result = await tenantService.getById(TEST_USER_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // Search tenants
  describe('search', () => {
    // It should return a cursor-based paginated list of all tenants based on the provided filters such as name and property ID.
    it('should return a paginated list of tenants', async () => {
      const paginated = { data: [mockTenant()], hasMore: false, nextCursor: null };
      jest.mocked(tenantRepository.search).mockResolvedValue(paginated);

      const result = await tenantService.search(TEST_USER_ID, { limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    // It should return an empty list if there are no tenants matching everything in the query.
    it('should return an empty list if there are no tenants matching the query', async () => {
      jest.mocked(tenantRepository.search).mockResolvedValue({ data: [], hasMore: false, nextCursor: null });

      const result = await tenantService.search(TEST_USER_ID, { limit: 20, tenantName: 'NonExistent' });

      expect(result.data).toHaveLength(0);
    });

    // It should return nextCursor when more results exist.
    it('should return nextCursor when more results exist', async () => {
      // CachedRepository.search loads ALL pages from the repo (loadAll loops until
      // hasMore is false), then paginates in-memory — so the mock must terminate
      // the loop or it spins forever accumulating memory.
      jest.mocked(tenantRepository.search)
        .mockResolvedValueOnce({
          data: [mockTenant({ id: 'tenant-1' }), mockTenant({ id: 'tenant-2' })],
          hasMore: false,
          nextCursor: null,
        });

      const result = await tenantService.search(TEST_USER_ID, { limit: 1 });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('tenant-1');
    });
  });

  // Update tenant
  describe('update', () => {
    // It should update the tenant details for the given tenant ID and return the updated tenant details.
    it('should update the tenant details', async () => {
      const updated = mockTenant({ tenant_name: 'Jane Smith' });
      jest.mocked(tenantRepository.getById).mockResolvedValue(mockTenant());
      jest.mocked(TenantValidator.prototype.validateUpdate).mockResolvedValue(undefined);
      jest.mocked(tenantRepository.update).mockResolvedValue(updated);

      const result = await tenantService.update(TEST_USER_ID, 'tenant-1', { tenant_name: 'Jane Smith' });

      expect(result.tenant_name).toBe('Jane Smith');
    });

    // It should return an error if the tenant ID is not provided.
    it('should return an error if the tenant ID is not provided', () => {
      const result = TenantByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the tenant ID does not exist.
    it('should return an error if the tenant ID does not exist', async () => {
      jest.mocked(tenantRepository.getById).mockResolvedValue(null);

      await expect(tenantService.update(TEST_USER_ID, 'nonexistent', { tenant_name: 'New Name' })).rejects.toMatchObject({
        statusCode: 404,
        message: 'Tenant not found',
      });
    });

    // It should return an error if the updated property ID does not exist.
    it('should return an error if the updated property ID does not exist', async () => {
      jest.mocked(tenantRepository.getById).mockResolvedValue(mockTenant());
      jest.mocked(TenantValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(404, 'Property not found')
      );

      await expect(tenantService.update(TEST_USER_ID, 'tenant-1', { property_id: 'bad-prop' })).rejects.toMatchObject({
        statusCode: 404,
        message: 'Property not found',
      });
    });

    // It should return an error if the updated tenant name already exists for the selected property.
    it('should return an error if the updated tenant name already exists for the selected property', async () => {
      jest.mocked(tenantRepository.getById).mockResolvedValue(mockTenant());
      jest.mocked(TenantValidator.prototype.validateUpdate).mockRejectedValue(
        new AppError(409, 'Tenant name already exists for the selected property')
      );

      await expect(tenantService.update(TEST_USER_ID, 'tenant-1', { tenant_name: 'Existing Name' })).rejects.toMatchObject({
        statusCode: 409,
        message: 'Tenant name already exists for the selected property',
      });
    });
  });

  // Batch update
  describe('updateBatch', () => {
    // It should update multiple tenants in a batch.
    it('should update multiple tenants in a batch', async () => {
      const mocks = [mockTenant({ id: 'tenant-1' }), mockTenant({ id: 'tenant-2' })];
      jest.mocked(TenantValidator.prototype.validateBatchUpdate).mockResolvedValue(undefined);
      jest.mocked(tenantRepository.updateBatch).mockResolvedValue(mocks);

      const input = [
        { id: 'tenant-1', data: { tenant_name: 'Updated 1' } },
        { id: 'tenant-2', data: { tenant_name: 'Updated 2' } },
      ];
      const result = await tenantService.updateBatch(TEST_USER_ID, input);

      expect(tenantRepository.updateBatch).toHaveBeenCalledWith(input);
      expect(result).toHaveLength(2);
    });

    // It should return an error if batch is empty.
    it('should return an error if batch array is empty', () => {
      const result = UpdateTenantBatchDTOSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    // It should return an error if batch exceeds max size.
    it('should return an error if batch exceeds max size of 10', () => {
      const input = Array(11).fill({ id: 'tenant-1', data: { tenant_name: 'Test' } });
      const result = UpdateTenantBatchDTOSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // Delete tenant
  describe('delete', () => {
    // It should delete the tenant for the given tenant ID and return a success message.
    it('should delete the tenant', async () => {
      jest.mocked(tenantRepository.getById).mockResolvedValue(mockTenant());
      jest.mocked(tenantRepository.delete).mockResolvedValue(undefined);

      await expect(tenantService.delete(TEST_USER_ID, 'tenant-1')).resolves.toBeUndefined();

      expect(tenantRepository.delete).toHaveBeenCalledWith('tenant-1');
    });

    // It should return an error if the tenant ID is not provided.
    it('should return an error if the tenant ID is not provided', () => {
      const result = TenantByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the tenant ID does not exist.
    it('should return an error if the tenant ID does not exist', async () => {
      jest.mocked(tenantRepository.getById).mockResolvedValue(null);

      await expect(tenantService.delete(TEST_USER_ID, 'nonexistent')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Tenant not found',
      });
    });
  });

  // Soft delete tenant
  describe('softDelete', () => {
    // It should soft delete the tenant for the given tenant ID and return a success message.
    it('should soft delete the tenant', async () => {
      const softDeleted = mockTenant({ deleted_at: Timestamp.now() });
      jest.mocked(tenantRepository.getById).mockResolvedValue(mockTenant());
      jest.mocked(tenantRepository.softDelete).mockResolvedValue(softDeleted);

      const result = await tenantService.softDelete(TEST_USER_ID, 'tenant-1');

      expect(result.deleted_at).toBeDefined();
    });

    // It should return an error if the tenant ID is not provided.
    it('should return an error if the tenant ID is not provided', () => {
      const result = TenantByIdParamsDTOSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    // It should return an error if the tenant ID does not exist.
    it('should return an error if the tenant ID does not exist', async () => {
      jest.mocked(tenantRepository.getById).mockResolvedValue(null);

      await expect(tenantService.softDelete(TEST_USER_ID, 'nonexistent')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Tenant not found',
      });
    });
  });
});
