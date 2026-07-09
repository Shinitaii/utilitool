jest.mock('./tenant.repository');
jest.mock('./tenant.validator');
jest.mock('../../config/firebase.config');
jest.mock('../../lib/firestore.lib');

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { tenantService } from './tenant.service';
import { tenantRepository } from './tenant.repository';
import { TenantValidator } from './tenant.validator';
import { CreateTenantDTOSchema, UpdateTenantDTOSchema, TenantByIdParamsDTOSchema, CreateTenantBatchDTOSchema, UpdateTenantBatchDTOSchema } from './tenant.dto';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';
import { firestore } from '../../config/firebase.config';
import { collectionRef } from '../../lib/firestore.lib';

/// Test cases for tenant (TDD)
/// To create a new test case, create pseudo code in the form of a comment.
/// This could mean what it does, and what it returns.
/// You can also add edge cases and error cases as well.
///
/// create()/update()/updateBatch() now re-check the tenant-count cap inside a
/// Firestore transaction (see tenant.service.ts) to close a TOCTOU race —
/// firebase.config/firestore.lib are mocked here so those transactions run
/// against an in-memory stub instead of a real Firestore connection.

const now = Timestamp.now();
const TEST_USER_ID = 'user-1';

let mockTxn: any;
let mockDocRef: any;
let mockCollectionRefQuery: any;

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

    mockTxn = {
      get: jest.fn().mockResolvedValue({ size: 0, docs: [] } as never),
      set: jest.fn(),
      update: jest.fn(),
    };
    (firestore.runTransaction as jest.Mock).mockImplementation(((cb: any) => cb(mockTxn)) as never);

    mockDocRef = { id: 'tenant-1' };
    mockCollectionRefQuery = {
      where: jest.fn().mockReturnThis(),
      doc: jest.fn().mockReturnValue(mockDocRef),
    };
    (collectionRef as jest.Mock).mockReturnValue(mockCollectionRefQuery as never);
  });

  // Create a new tenant
  describe('create', () => {
    // It should create a new tenant with the given name and return the tenant ID.
    // Capacity is now re-checked inside a Firestore transaction (see
    // tenant.service.ts::createTenantWithCapacityCheck) instead of via
    // tenantRepository.create, to close the count-then-create race.
    it('should create a new tenant with the given name and return the tenant ID', async () => {
      jest.mocked(TenantValidator.prototype.validateCreate).mockResolvedValue({ id: 'prop-1', tenant_amount: 5 } as any);

      const result = await tenantService.create(TEST_USER_ID, { tenant_name: 'John Doe', property_id: 'prop-1' });

      expect(mockTxn.set).toHaveBeenCalled();
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

    // Race condition fix: the cap check is re-evaluated inside the Firestore
    // transaction (not just via validateCreate), so a transaction that reads
    // a tenant count already at the cap must reject even if validateCreate
    // itself passed — this is what actually closes the TOCTOU race.
    it('should reject inside the transaction when the transactional count read is already at the cap', async () => {
      jest.mocked(TenantValidator.prototype.validateCreate).mockResolvedValue({ id: 'prop-1', tenant_amount: 1 } as any);
      mockTxn.get.mockResolvedValue({ size: 1, docs: [] } as never);

      await expect(
        tenantService.create(TEST_USER_ID, { tenant_name: 'Jane', property_id: 'prop-1' })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Property has reached the maximum number of tenants allowed',
      });
      expect(mockTxn.set).not.toHaveBeenCalled();
    });

    // Simulates two concurrent create() calls at a property with exactly 1
    // slot open: the first transaction reads count=0 and succeeds; the
    // second transaction (as if it committed after the first, per Firestore's
    // retry-on-conflict semantics) reads count=1 and must be rejected with
    // the capacity error rather than also succeeding.
    it('should allow exactly one of two concurrent creates when only one slot is open', async () => {
      jest.mocked(TenantValidator.prototype.validateCreate).mockResolvedValue({ id: 'prop-1', tenant_amount: 1 } as any);

      let currentCount = 0;
      mockTxn.get.mockImplementation(() => Promise.resolve({ size: currentCount, docs: [] }));
      mockTxn.set.mockImplementation(() => {
        currentCount += 1;
      });

      const first = await tenantService.create(TEST_USER_ID, { tenant_name: 'John', property_id: 'prop-1' });
      expect(first.id).toBe('tenant-1');

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
    // It should create multiple tenants in a batch. Capacity is now re-checked
    // per item inside a Firestore transaction (see
    // tenant.service.ts::createTenantWithCapacityCheck), same as create() —
    // validateBatchCreate only returns the propertyId -> Property map.
    it('should create multiple tenants in a batch', async () => {
      jest.mocked(TenantValidator.prototype.validateBatchCreate).mockResolvedValue(
        new Map([['prop-1', { id: 'prop-1', tenant_amount: 5 } as any]])
      );

      const input = [
        { tenant_name: 'John Doe', property_id: 'prop-1' },
        { tenant_name: 'Jane Doe', property_id: 'prop-1' },
      ];
      const result = await tenantService.createBatch(TEST_USER_ID, input);

      expect(mockTxn.set).toHaveBeenCalledTimes(2);
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

    // Race condition fix: two concurrent batch-create requests against the
    // same property with exactly 1 slot open. Each item re-checks the cap
    // inside its own transaction (sequential per item, per property), so the
    // second request's item must be rejected rather than also succeeding —
    // closes the same TOCTOU gap that create()/update() already had fixed.
    it('should reject a batch item when a concurrent batch create already filled the last slot', async () => {
      jest.mocked(TenantValidator.prototype.validateBatchCreate).mockResolvedValue(
        new Map([['prop-1', { id: 'prop-1', tenant_amount: 1 } as any]])
      );

      let currentCount = 0;
      mockTxn.get.mockImplementation(() => Promise.resolve({ size: currentCount, docs: [] }));
      mockTxn.set.mockImplementation(() => {
        currentCount += 1;
      });

      const first = await tenantService.createBatch(TEST_USER_ID, [
        { tenant_name: 'John Doe', property_id: 'prop-1' },
      ]);
      expect(first).toHaveLength(1);

      await expect(
        tenantService.createBatch(TEST_USER_ID, [{ tenant_name: 'Jane Doe', property_id: 'prop-1' }])
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Property has reached the maximum number of tenants allowed',
      });
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

    // Race condition fix: transferring a tenant to a new property re-checks
    // the new property's cap inside a Firestore transaction (see
    // tenant.service.ts::updateTenantWithCapacityCheck). Simulates two
    // concurrent transfers into a property with exactly 1 slot open — only
    // one should succeed.
    it('should allow exactly one of two concurrent property transfers when only one slot is open', async () => {
      const tenantA = mockTenant({ id: 'tenant-1', property_id: 'prop-old' });
      const tenantB = mockTenant({ id: 'tenant-2', property_id: 'prop-old' });
      const newProperty = { id: 'prop-2', tenant_amount: 1 };

      jest.mocked(tenantRepository.getById)
        .mockResolvedValueOnce(tenantA)
        .mockResolvedValueOnce(tenantB);
      jest.mocked(TenantValidator.prototype.validateUpdate).mockResolvedValue(newProperty as any);

      let currentCount = 0;
      mockTxn.get.mockImplementation(() => Promise.resolve({ size: currentCount, docs: [] }));
      mockTxn.update.mockImplementation(() => {
        currentCount += 1;
      });

      const first = await tenantService.update(TEST_USER_ID, 'tenant-1', { property_id: 'prop-2' });
      expect(first.property_id).toBe('prop-2');

      await expect(
        tenantService.update(TEST_USER_ID, 'tenant-2', { property_id: 'prop-2' })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Property has reached the maximum number of tenants allowed',
      });
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
    // validateBatchUpdate now returns a Map of tenantId -> transfer info for
    // property-transferring items only (see tenant.validator.ts); an empty
    // map means none of the items in this batch change property.
    it('should update multiple tenants in a batch', async () => {
      const mocks = [mockTenant({ id: 'tenant-1' }), mockTenant({ id: 'tenant-2' })];
      jest.mocked(TenantValidator.prototype.validateBatchUpdate).mockResolvedValue(new Map());
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
