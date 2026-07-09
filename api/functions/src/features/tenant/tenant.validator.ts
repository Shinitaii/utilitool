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

  /**
   * Existence + duplicate-name checks only. The tenant-count cap check is NOT
   * performed here — it must be re-checked inside the same Firestore
   * transaction that creates the tenant doc (see tenant.service.ts::create),
   * otherwise concurrent requests can race past a plain read of a stale count.
   * Returns the property so the caller doesn't need to re-fetch it.
   */
  async validateCreate(data: CreateTenantDTO): Promise<Property> {
    const property = await propertyRepository.getById(data.property_id);

    if (!property) {
      throw new AppError(404, "Property not found");
    }

    const duplicate = await this.findDuplicateTenant(data.property_id, data.tenant_name);
    if (duplicate) {
      logger.warn({property_id: data.property_id, tenant_name: data.tenant_name}, "Duplicate tenant creation attempt");
      throw new AppError(409, "Tenant name already exists for the selected property");
    }

    return property;
  }

  /**
   * Existence + duplicate-name checks only, for the whole batch. The tenant-count
   * cap check is NOT performed here — like validateCreate, it must be re-checked
   * inside a Firestore transaction per item (see tenant.service.ts::createBatch),
   * otherwise concurrent batch/single-create requests can race past a plain read
   * of a stale count. Returns propertyId -> Property so the caller doesn't need
   * to re-fetch properties for the transactional cap check.
   */
  async validateBatchCreate(data: CreateTenantDTO[]): Promise<Map<string, Property>> {
    const propertyIds = new Set(data.map((item) => item.property_id));
    const seenNamesByProperty = new Map<string, Set<string>>();

    // Batch fetch all properties upfront
    const fetchedProperties = await Promise.all(
      Array.from(propertyIds).map((id) => propertyRepository.getById(id))
    );

    const propertyMap = new Map<string, Property>();
    for (const property of fetchedProperties) {
      if (!property) {
        throw new AppError(404, "Property not found");
      }
      propertyMap.set(property.id, property);
    }

    // Single fetch per property for duplicate-name checks
    const existingTenantsByPropertySnaps = await Promise.all(
      Array.from(propertyIds).map((propertyId) =>
        collectionRef(COLLECTIONS.TENANTS)
          .where("property_id", "==", propertyId)
          .where("is_deleted", "==", false)
          .get()
      )
    );

    const existingTenantsByProperty = new Map<string, Set<Tenant>>();
    Array.from(propertyIds).forEach((propertyId, i) => {
      const snap = existingTenantsByPropertySnaps[i];
      existingTenantsByProperty.set(
        propertyId,
        new Set(snap.docs.map((doc) => snapshotToModel<Tenant>(doc)))
      );
    });

    // Validate duplicate names across the whole batch using cached data
    for (const item of data) {
      const seenNames = seenNamesByProperty.get(item.property_id) ?? new Set<string>();
      const normalizedTenantName = normalizeTenantName(item.tenant_name);

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
    }

    return propertyMap;
  }

  /**
   * Existence + duplicate-name checks only. When the tenant is transferring to
   * a new property, the tenant-count cap check is NOT performed here — it
   * must be re-checked inside the same Firestore transaction that performs
   * the update (see tenant.service.ts::update), to avoid a stale-count race.
   * Returns the new property when a transfer is requested, so the caller can
   * run the transactional cap check without re-fetching it.
   */
  async validateUpdate(tenant: Tenant, data: UpdateTenantDTO, property?: Property): Promise<Property | undefined> {
    const nextPropertyId = data.property_id ?? tenant.property_id;
    const nextTenantName = data.tenant_name ?? tenant.tenant_name;

    let newProperty: Property | undefined;
    if (data.property_id && data.property_id !== tenant.property_id) {
      newProperty = property || (await propertyRepository.getById(data.property_id)) || undefined;
      if (!newProperty) {
        throw new AppError(404, "Property not found");
      }
    }

    const duplicate = await this.findDuplicateTenant(nextPropertyId, nextTenantName, tenant.id);
    if (duplicate) {
      logger.warn({property_id: nextPropertyId, tenant_name: nextTenantName}, "Duplicate tenant update attempt");
      throw new AppError(409, "Tenant name already exists for the selected property");
    }

    return newProperty;
  }

  /**
   * Existence + duplicate-name checks for the whole batch. Returns a map of
   * tenantId -> { tenant, newProperty } for items that are transferring to a
   * new property; the tenant-count cap check for those is NOT performed here
   * — the caller must re-check it inside a per-transfer Firestore transaction
   * (see tenant.service.ts::updateBatch) to avoid a stale-count race.
   */
  async validateBatchUpdate(
    updates: { id: string; data: UpdateTenantDTO }[]
  ): Promise<Map<string, { tenant: Tenant; newProperty: Property }>> {
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
    const transferMap = new Map<string, { tenant: Tenant; newProperty: Property }>();
    for (let i = 0; i < tenants.length; i++) {
      const tenant = tenants[i]!;
      const newPropertyIdData = updates[i].data.property_id;
      const newTenantNameData = updates[i].data.tenant_name;
      const nextPropertyId = newPropertyIdData ?? tenant.property_id;
      const nextTenantName = newTenantNameData ?? tenant.tenant_name;

      // Check property change (cap check deferred to a per-transfer transaction)
      if (newPropertyIdData && newPropertyIdData !== tenant.property_id) {
        const newProperty = propertyMap.get(newPropertyIdData);
        if (!newProperty) {
          throw new AppError(404, "Property not found");
        }
        transferMap.set(tenant.id, {tenant, newProperty});
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

    return transferMap;
  }
}
