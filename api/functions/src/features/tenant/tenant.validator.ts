import { AppError } from '../../utils/error.util';
import { logger } from '../../utils/logger.util';
import { propertyRepository } from '../property/property.repository';
import { tenantRepository } from './tenant.repository';
import { CreateTenantDTO, UpdateTenantDTO } from './tenant.dto';
import { Tenant } from './tenant.model';

const normalizeTenantName = (tenantName: string) => tenantName.trim().toLowerCase();

export class TenantValidator {
  private async findDuplicateTenant(
    propertyId: string,
    tenantName: string,
    excludeId?: string
  ): Promise<Tenant | undefined> {
    const { data: candidates } = await tenantRepository.search({
      limit: 1000,
      orderBy: 'created_at',
      filters: { property_id: propertyId },
    });

    const normalizedTenantName = normalizeTenantName(tenantName);

    return candidates.find((tenant) => {
      if (excludeId && tenant.id === excludeId) {
        return false;
      }

      return normalizeTenantName(tenant.tenant_name) === normalizedTenantName;
    });
  }

  private async countTenantsForProperty(propertyId: string): Promise<number> {
    let cursor: string | null = null;
    let total = 0;

    do {
      const { data, hasMore, nextCursor } = await tenantRepository.search({
        limit: 1000,
        orderBy: 'created_at',
        cursor,
        filters: { property_id: propertyId },
      });

      total += data.length;
      cursor = hasMore ? nextCursor : null;
    } while (cursor);

    return total;
  }

  private async ensurePropertyExists(propertyId: string): Promise<void> {
    const property = await propertyRepository.getById(propertyId);
    if (!property) {
      throw new AppError(404, 'Property not found');
    }
  }

  async validateCreate(data: CreateTenantDTO): Promise<void> {
    const property = await propertyRepository.getById(data.property_id);

    if (!property) {
      throw new AppError(404, 'Property not found');
    }

    const tenantCount = await this.countTenantsForProperty(data.property_id);
    if (tenantCount >= property.tenant_amount) {
      throw new AppError(409, 'Property has reached the maximum number of tenants allowed');
    }

    const duplicate = await this.findDuplicateTenant(data.property_id, data.tenant_name);
    if (duplicate) {
      logger.warn({ property_id: data.property_id, tenant_name: data.tenant_name }, 'Duplicate tenant creation attempt');
      throw new AppError(409, 'Tenant name already exists for the selected property');
    }
  }

  async validateBatchCreate(data: CreateTenantDTO[]): Promise<void> {
    const properties = new Map<string, { tenantAmount: number; existingCount: number; seenCount: number }>();
    const seenNamesByProperty = new Map<string, Set<string>>();

    for (const item of data) {
      if (!properties.has(item.property_id)) {
        const property = await propertyRepository.getById(item.property_id);

        if (!property) {
          throw new AppError(404, 'Property not found');
        }

        const existingCount = await this.countTenantsForProperty(item.property_id);

        properties.set(item.property_id, {
          tenantAmount: property.tenant_amount,
          existingCount,
          seenCount: 0,
        });
      }

      const propertyState = properties.get(item.property_id);
      const seenNames = seenNamesByProperty.get(item.property_id) ?? new Set<string>();
      const normalizedTenantName = normalizeTenantName(item.tenant_name);

      if (propertyState && propertyState.existingCount + propertyState.seenCount >= propertyState.tenantAmount) {
        throw new AppError(409, 'Property has reached the maximum number of tenants allowed');
      }

      const duplicate = await this.findDuplicateTenant(item.property_id, item.tenant_name);
      if (duplicate || seenNames.has(normalizedTenantName)) {
        logger.warn({ property_id: item.property_id, tenant_name: item.tenant_name }, 'Duplicate tenant batch creation attempt');
        throw new AppError(409, 'Tenant name already exists for the selected property');
      }

      seenNames.add(normalizedTenantName);
      seenNamesByProperty.set(item.property_id, seenNames);

      if (propertyState) {
        propertyState.seenCount += 1;
      }
    }
  }

  async validateUpdate(tenant: Tenant, data: UpdateTenantDTO): Promise<void> {
    const nextPropertyId = data.property_id ?? tenant.property_id;
    const nextTenantName = data.tenant_name ?? tenant.tenant_name;

    if (data.property_id && data.property_id !== tenant.property_id) {
      await this.ensurePropertyExists(data.property_id);

      const property = await propertyRepository.getById(data.property_id);
      if (property) {
        const tenantCount = await this.countTenantsForProperty(data.property_id);
        if (tenantCount >= property.tenant_amount) {
          throw new AppError(409, 'Property has reached the maximum number of tenants allowed');
        }
      }
    }

    const duplicate = await this.findDuplicateTenant(nextPropertyId, nextTenantName, tenant.id);
    if (duplicate) {
      logger.warn({ property_id: nextPropertyId, tenant_name: nextTenantName }, 'Duplicate tenant update attempt');
      throw new AppError(409, 'Tenant name already exists for the selected property');
    }
  }

  async validateBatchUpdate(updates: { id: string; data: UpdateTenantDTO }[]): Promise<void> {
    for (const update of updates) {
      const tenant = await tenantRepository.getById(update.id);

      if (!tenant) {
        throw new AppError(404, 'Tenant not found');
      }

      await this.validateUpdate(tenant, update.data);
    }
  }
}