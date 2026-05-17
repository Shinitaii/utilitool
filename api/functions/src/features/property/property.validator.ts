import {AppError} from "../../utils/error.util";
import {logger} from "../../utils/logger.util";
import {meterGroupRepository} from "../meter-group/meter-group.repository";
import {tenantRepository} from "../tenant/tenant.repository";
import {propertyRepository} from "./property.repository";
import {CreatePropertyDTO, UpdatePropertyDTO} from "./property.dto";
import {Property} from "./property.model";

const normalizeRoomName = (roomName: string) =>
  roomName.trim().toLowerCase();

export class PropertyValidator {
  private async findDuplicateProperty(
    roomName: string,
    excludeId?: string
  ): Promise<Property | undefined> {
    const {data: candidates} = await propertyRepository.search({
      limit: 1000,
      orderBy: "created_at",
      filters: {},
    });

    const normalizedRoomName = normalizeRoomName(roomName);

    return candidates.find((property) => {
      if (excludeId && property.id === excludeId) {
        return false;
      }

      return normalizeRoomName(property.room_name) === normalizedRoomName;
    });
  }

  private async countTenantsForProperty(
    propertyId: string
  ): Promise<number> {
    let cursor: string | null = null;
    let total = 0;

    do {
      const {data, hasMore, nextCursor} = await tenantRepository.search({
        limit: 1000,
        orderBy: "created_at",
        cursor,
        filters: {property_id: propertyId},
      });

      total += data.length;
      cursor = hasMore ? nextCursor : null;
    } while (cursor);

    return total;
  }

  private async ensureMeterGroupsExist(
    meterGroupIds: string[]
  ): Promise<void> {
    for (const meterGroupId of meterGroupIds) {
      const meterGroup = await meterGroupRepository.getById(meterGroupId);
      if (!meterGroup) {
        throw new AppError(404, "Meter group not found");
      }
    }
  }

  async validateCreate(data: CreatePropertyDTO): Promise<void> {
    const meterGroupIds = Object.values(data.meter_groups);
    await this.ensureMeterGroupsExist(meterGroupIds);

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
      Object.values(item.meter_groups).forEach((id) =>
        allMeterGroupIds.add(id)
      );
    }

    await this.ensureMeterGroupsExist(Array.from(allMeterGroupIds));

    const {data: existingProperties} = await propertyRepository.search({
      limit: 1000,
      orderBy: "created_at",
      filters: {},
    });

    for (const item of data) {
      const normalizedRoomName = normalizeRoomName(item.room_name);

      if (
        existingProperties.some(
          (property) =>
            normalizeRoomName(property.room_name) === normalizedRoomName
        )
      ) {
        logger.warn({room_name: item.room_name}, "Duplicate property batch creation attempt");
        throw new AppError(409, "Room name already exists");
      }
    }
  }

  async validateUpdate(
    property: Property,
    data: UpdatePropertyDTO
  ): Promise<void> {
    if (data.meter_groups) {
      const meterGroupIds = Object.values(data.meter_groups);
      await this.ensureMeterGroupsExist(meterGroupIds);
    }

    if (data.room_name) {
      const duplicate = await this.findDuplicateProperty(
        data.room_name,
        property.id
      );
      if (duplicate) {
        logger.warn({room_name: data.room_name}, "Duplicate property update attempt");
        throw new AppError(409, "Room name already exists");
      }
    }

    if (data.tenant_amount !== undefined) {
      const tenantCount = await this.countTenantsForProperty(property.id);

      if (data.tenant_amount < tenantCount) {
        throw new AppError(
          409,
          "Tenant amount cannot be less than current tenant count"
        );
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
