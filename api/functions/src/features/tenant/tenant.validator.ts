import {AppError} from "../../utils/error.util";
import {logger} from "../../utils/logger.util";
import {propertyRepository} from "../property/property.repository";
import {tenantRepository} from "./tenant.repository";
import {CreateTenantDTO, UpdateTenantDTO} from "./tenant.dto";
import {Tenant} from "./tenant.model";
import {Property} from "../property/property.model";
import {collectionRef} from "../../lib/firestore.lib";
import {COLLECTIONS} from "../../constants/collection.constants";
import {snapshotToModel} from "../../utils/firestore.util";

const normalizeTenantName = (tenantName: string) => tenantName.trim().toLowerCase();

export class TenantValidator {
  private async findDuplicateTenant(
    propertyId: string,
    tenantName: string,
    excludeId?: string
  ): Promise<Tenant | undefined> {
    // Indexed query scoped to one property — avoids full collection scan
    const normalizedTenantName = normalizeTenantName(tenantName);
    const snap = await collectionRef(COLLECTIONS.TENANTS)
      .where("property_id", "==", propertyId)
      .where("is_deleted", "==", false)
      .get();

    return snap.docs
      .map((doc) => snapshotToModel<Tenant>(doc))
      .find((t) => t.id !== excludeId && normalizeTenantName(t.tenant_name) === normalizedTenantName);
  }

  private async countTenantsForProperty(propertyId: string): Promise<number> {
    // Indexed count query — no full collection scan
    const snap = await collectionRef(COLLECTIONS.TENANTS)
      .where("property_id", "==", propertyId)
      .where("is_deleted", "==", false)
      .get();

    return snap.size;
  }


  async validateCreate(data: CreateTenantDTO): Promise<void> {
    const property = await propertyRepository.getById(data.property_id);

    if (!property) {
      throw new AppError(404, "Property not found");
    }

    const tenantCount = await this.countTenantsForProperty(data.property_id);
    if (tenantCount >= property.tenant_amount) {
      throw new AppError(409, "Property has reached the maximum number of tenants allowed");
    }

    const duplicate = await this.findDuplicateTenant(data.property_id, data.tenant_name);
    if (duplicate) {
      logger.warn({property_id: data.property_id, tenant_name: data.tenant_name}, "Duplicate tenant creation attempt");
      throw new AppError(409, "Tenant name already exists for the selected property");
    }
  }

  async validateBatchCreate(data: CreateTenantDTO[]): Promise<void> {
    const propertyIds = new Set(data.map((item) => item.property_id));
    const properties = new Map<string, { tenantAmount: number; existingCount: number; seenCount: number }>();
    const seenNamesByProperty = new Map<string, Set<string>>();

    // Batch fetch all properties and their tenant counts upfront
    const fetchedProperties = await Promise.all(
      Array.from(propertyIds).map((id) => propertyRepository.getById(id))
    );

    const tenantCountsByProperty = await Promise.all(
      Array.from(propertyIds).map((id) => this.countTenantsForProperty(id))
    );

    const existingTenantsByProperty = new Map<string, Set<Tenant>>();
    for (const propertyId of propertyIds) {
      const snap = await collectionRef(COLLECTIONS.TENANTS)
        .where("property_id", "==", propertyId)
        .where("is_deleted", "==", false)
        .get();
      existingTenantsByProperty.set(
        propertyId,
        new Set(snap.docs.map((doc) => snapshotToModel<Tenant>(doc)))
      );
    }

    // Build properties map
    let tenantCountIdx = 0;
    for (const property of fetchedProperties) {
      if (!property) {
        throw new AppError(404, "Property not found");
      }
      properties.set(property.id, {
        tenantAmount: property.tenant_amount,
        existingCount: tenantCountsByProperty[tenantCountIdx],
        seenCount: 0,
      });
      tenantCountIdx++;
    }

    // Validate all items using cached data
    for (const item of data) {
      const propertyState = properties.get(item.property_id);
      const seenNames = seenNamesByProperty.get(item.property_id) ?? new Set<string>();
      const normalizedTenantName = normalizeTenantName(item.tenant_name);

      if (propertyState && propertyState.existingCount + propertyState.seenCount >= propertyState.tenantAmount) {
        throw new AppError(409, "Property has reached the maximum number of tenants allowed");
      }

      // Check against existing tenants
      const existingTenants = existingTenantsByProperty.get(item.property_id) || new Set();
      const duplicate = Array.from(existingTenants).find(
        (t) => normalizeTenantName(t.tenant_name) === normalizedTenantName
      );

      if (duplicate || seenNames.has(normalizedTenantName)) {
        logger.warn({property_id: item.property_id, tenant_name: item.tenant_name}, "Duplicate tenant batch creation attempt");
        throw new AppError(409, "Tenant name already exists for the selected property");
      }

      seenNames.add(normalizedTenantName);
      seenNamesByProperty.set(item.property_id, seenNames);

      if (propertyState) {
        propertyState.seenCount += 1;
      }
    }
  }

  async validateUpdate(tenant: Tenant, data: UpdateTenantDTO, property?: any): Promise<void> {
    const nextPropertyId = data.property_id ?? tenant.property_id;
    const nextTenantName = data.tenant_name ?? tenant.tenant_name;

    if (data.property_id && data.property_id !== tenant.property_id) {
      const newProperty = property || await propertyRepository.getById(data.property_id);
      if (!newProperty) {
        throw new AppError(404, "Property not found");
      }

      const tenantCount = await this.countTenantsForProperty(data.property_id);
      if (tenantCount >= newProperty.tenant_amount) {
        throw new AppError(409, "Property has reached the maximum number of tenants allowed");
      }
    }

    const duplicate = await this.findDuplicateTenant(nextPropertyId, nextTenantName, tenant.id);
    if (duplicate) {
      logger.warn({property_id: nextPropertyId, tenant_name: nextTenantName}, "Duplicate tenant update attempt");
      throw new AppError(409, "Tenant name already exists for the selected property");
    }
  }

  async validateBatchUpdate(updates: { id: string; data: UpdateTenantDTO }[]): Promise<void> {
    // Batch fetch all tenants upfront
    const tenantIds = updates.map((u) => u.id);
    const tenants = await tenantRepository.getByIds(tenantIds);

    // Collect property IDs that need to be fetched
    const propertyIds = new Set<string>();
    for (let i = 0; i < tenants.length; i++) {
      const tenant = tenants[i];
      if (!tenant) {
        throw new AppError(404, "Tenant not found");
      }
      propertyIds.add(tenant.property_id);
      const newPropertyId = updates[i].data.property_id;
      if (newPropertyId) {
        propertyIds.add(newPropertyId);
      }
    }

    // Batch fetch all properties using true batch query
    const properties = await propertyRepository.getByIds(Array.from(propertyIds));
    const propertyMap = new Map<string, Property>();
    properties.forEach((p) => p && propertyMap.set(p.id, p));

    // Batch fetch all existing tenants for duplicate checks
    const allExistingTenants = await Promise.all(
      Array.from(propertyIds).map((propertyId) => {
        const snap = collectionRef(COLLECTIONS.TENANTS)
          .where("property_id", "==", propertyId)
          .where("is_deleted", "==", false)
          .get();
        return snap;
      })
    );

    const existingTenantsByProperty = new Map<string, Tenant[]>();
    let idx = 0;
    for (const propertyId of propertyIds) {
      const snap = allExistingTenants[idx++];
      existingTenantsByProperty.set(
        propertyId,
        snap.docs.map((doc) => snapshotToModel<Tenant>(doc))
      );
    }

    // Validate using cached entities
    for (let i = 0; i < tenants.length; i++) {
      const tenant = tenants[i]!;
      const newPropertyIdData = updates[i].data.property_id;
      const newTenantNameData = updates[i].data.tenant_name;
      const nextPropertyId = newPropertyIdData ?? tenant.property_id;
      const nextTenantName = newTenantNameData ?? tenant.tenant_name;

      // Check property change
      if (newPropertyIdData && newPropertyIdData !== tenant.property_id) {
        const newProperty = propertyMap.get(newPropertyIdData);
        if (!newProperty) {
          throw new AppError(404, "Property not found");
        }
        const tenantCount = await this.countTenantsForProperty(newPropertyIdData);
        if (tenantCount >= newProperty.tenant_amount) {
          throw new AppError(409, "Property has reached the maximum number of tenants allowed");
        }
      }

      // Check duplicate using cached existing tenants
      const existingTenants = existingTenantsByProperty.get(nextPropertyId) || [];
      const duplicate = existingTenants.find(
        (t) => t.id !== tenant.id && normalizeTenantName(t.tenant_name) === normalizeTenantName(nextTenantName)
      );

      if (duplicate) {
        logger.warn({property_id: nextPropertyId, tenant_name: nextTenantName}, "Duplicate tenant update attempt");
        throw new AppError(409, "Tenant name already exists for the selected property");
      }
    }
  }
}
