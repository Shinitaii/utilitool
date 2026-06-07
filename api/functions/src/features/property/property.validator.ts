import {AppError} from "../../utils/error.util";
import {logger} from "../../utils/logger.util";
import {fetchAllPages} from "../../utils/list-cache.util";
import {meterGroupRepository} from "../meter-group/meter-group.repository";
import {tenantRepository} from "../tenant/tenant.repository";
import {propertyRepository} from "./property.repository";
import {CreatePropertyDTO, UpdatePropertyDTO} from "./property.dto";
import {Property, MeterGroupEntry} from "./property.model";

const normalizeRoomName = (roomName: string) =>
  roomName.trim().toLowerCase();

export class PropertyValidator {
  private async findDuplicateProperty(
    roomName: string,
    excludeId?: string
  ): Promise<Property | undefined> {
    const {data: candidates} = await propertyRepository.search({
      limit: 100,
      orderBy: "created_at",
      filters: {room_name: roomName},
    });

    const normalizedRoomName = normalizeRoomName(roomName);

    return candidates.find((property) => {
      if (excludeId && property.id === excludeId) return false;
      return normalizeRoomName(property.room_name) === normalizedRoomName;
    });
  }

  private async countTenantsForProperty(propertyId: string): Promise<number> {
    const tenants = await fetchAllPages((cursor) => tenantRepository.search({
      limit: 1000,
      orderBy: "created_at",
      cursor,
      filters: {property_id: propertyId},
    }));

    return tenants.length;
  }

  private async ensureMeterGroupsExist(meterGroupIds: string[]): Promise<void> {
    for (const meterGroupId of meterGroupIds) {
      const meterGroup = await meterGroupRepository.getById(meterGroupId);
      if (!meterGroup) {
        throw new AppError(404, "Meter group not found");
      }
    }
  }

  private async ensureMainMeterUniqueness(
    meterGroups: Record<string, MeterGroupEntry | undefined>,
    excludePropertyId?: string
  ): Promise<void> {
    const mainMeterEntries = Object.values(meterGroups)
      .filter((e): e is MeterGroupEntry => e !== undefined)
      .filter((e) => e.is_main_meter);
    if (mainMeterEntries.length === 0) return;

    // Fetch all properties with cursor-based pagination to avoid the 100-item hard limit
    const allProperties = await fetchAllPages((cursor) => propertyRepository.search({
      limit: 1000,
      orderBy: "created_at",
      cursor,
    }));

    for (const entry of mainMeterEntries) {
      const conflict = allProperties.find((p) => {
        if (excludePropertyId && p.id === excludePropertyId) return false;
        return Object.values(p.meter_groups).some(
          (pv) => pv.meter_group_id === entry.meter_group_id && pv.is_main_meter
        );
      });

      if (conflict) {
        throw new AppError(
          409,
          `Meter group ${entry.meter_group_id} already has a main meter property`
        );
      }
    }
  }

  async validateCreate(data: CreatePropertyDTO): Promise<void> {
    const meterGroupIds = Object.values(data.meter_groups)
      .filter((e): e is MeterGroupEntry => e !== undefined)
      .map((e) => e.meter_group_id);
    await this.ensureMeterGroupsExist(meterGroupIds);
    await this.ensureMainMeterUniqueness(data.meter_groups);

    const duplicate = await this.findDuplicateProperty(data.room_name);
    if (duplicate) {
      logger.warn({room_name: data.room_name}, "Duplicate property creation attempt");
      throw new AppError(409, "Room name already exists");
    }
  }

  async validateBatchCreate(data: CreatePropertyDTO[]): Promise<void> {
    const seenRoomNames = new Set<string>();
    const allMeterGroupIds = new Set<string>();

    for (const item of data) {
      const normalizedRoomName = normalizeRoomName(item.room_name);
      if (seenRoomNames.has(normalizedRoomName)) {
        logger.warn({room_name: item.room_name}, "Duplicate property in batch");
        throw new AppError(409, "Room name already exists");
      }
      seenRoomNames.add(normalizedRoomName);
      Object.values(item.meter_groups)
        .filter((e): e is MeterGroupEntry => e !== undefined)
        .forEach((e) => allMeterGroupIds.add(e.meter_group_id));
    }

    await this.ensureMeterGroupsExist(Array.from(allMeterGroupIds));

    // Check for intra-batch main meter conflicts before per-item validation
    const batchMainMeters = new Map<string, string>(); // meter_group_id → room_name claiming it
    for (const item of data) {
      for (const entry of Object.values(item.meter_groups).filter((e): e is MeterGroupEntry => e !== undefined)) {
        if (!entry.is_main_meter) continue;
        if (batchMainMeters.has(entry.meter_group_id)) {
          throw new AppError(
            409,
            `Meter group ${entry.meter_group_id} is claimed as main meter by multiple properties in this batch`
          );
        }
        batchMainMeters.set(entry.meter_group_id, item.room_name);
      }
    }

    for (const item of data) {
      await this.ensureMainMeterUniqueness(item.meter_groups);
      const duplicate = await this.findDuplicateProperty(item.room_name);
      if (duplicate) {
        logger.warn({room_name: item.room_name}, "Duplicate property batch creation attempt");
        throw new AppError(409, "Room name already exists");
      }
    }
  }

  async validateUpdate(property: Property, data: UpdatePropertyDTO): Promise<void> {
    if (data.meter_groups) {
      const meterGroupIds = Object.values(data.meter_groups)
        .filter((e): e is MeterGroupEntry => e !== undefined)
        .map((e) => e.meter_group_id);
      await this.ensureMeterGroupsExist(meterGroupIds);
      await this.ensureMainMeterUniqueness(data.meter_groups, property.id);
    }

    if (data.room_name) {
      const duplicate = await this.findDuplicateProperty(data.room_name, property.id);
      if (duplicate) {
        logger.warn({room_name: data.room_name}, "Duplicate property update attempt");
        throw new AppError(409, "Room name already exists");
      }
    }

    if (data.tenant_amount !== undefined) {
      const tenantCount = await this.countTenantsForProperty(property.id);
      if (data.tenant_amount < tenantCount) {
        throw new AppError(409, "Tenant amount cannot be less than current tenant count");
      }
    }
  }

  async validateBatchUpdate(
    updates: {id: string; data: UpdatePropertyDTO}[]
  ): Promise<void> {
    for (const update of updates) {
      const property = await propertyRepository.getById(update.id);
      if (!property) {
        throw new AppError(404, "Property not found");
      }
      await this.validateUpdate(property, update.data);
    }
  }
}
