import { AppError } from '../../utils/error.util';
import { logger } from '../../utils/logger.util';
import { meterGroupRepository } from '../meter-group/meter-group.repository';
import { tenantRepository } from '../tenant/tenant.repository';
import { propertyRepository } from './property.repository';
import { CreatePropertyDTO, UpdatePropertyDTO } from './property.dto';
import { Property } from './property.model';

const normalizeRoomName = (roomName: string) => roomName.trim().toLowerCase();

export class PropertyValidator {
  private async findDuplicateProperty(
    meterGroupId: string,
    roomName: string,
    excludeId?: string
  ): Promise<Property | undefined> {
    const { data: candidates } = await propertyRepository.search({
      limit: 1000,
      orderBy: 'created_at',
      filters: { meter_group_id: meterGroupId },
    });

    const normalizedRoomName = normalizeRoomName(roomName);

    return candidates.find((property) => {
      if (excludeId && property.id === excludeId) {
        return false;
      }

      return normalizeRoomName(property.room_name) === normalizedRoomName;
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

  private async ensureMeterGroupExists(meterGroupId: string): Promise<void> {
    const meterGroup = await meterGroupRepository.getById(meterGroupId);
    if (!meterGroup) {
      throw new AppError(404, 'Meter group not found');
    }
  }

  async validateCreate(data: CreatePropertyDTO): Promise<void> {
    await this.ensureMeterGroupExists(data.meter_group_id);

    const duplicate = await this.findDuplicateProperty(data.meter_group_id, data.room_name);
    if (duplicate) {
      logger.warn({ meter_group_id: data.meter_group_id, room_name: data.room_name }, 'Duplicate property creation attempt');
      throw new AppError(409, 'Room name already exists for the selected meter group');
    }
  }

  async validateBatchCreate(data: CreatePropertyDTO[]): Promise<void> {
    const seenByMeterGroup = new Map<string, Set<string>>();
    const existingByMeterGroup = new Map<string, Property[]>();
    const knownMeterGroups = new Set<string>();

    for (const item of data) {
      if (!knownMeterGroups.has(item.meter_group_id)) {
        const meterGroup = await meterGroupRepository.getById(item.meter_group_id);

        if (!meterGroup) {
          throw new AppError(404, 'Meter group not found');
        }

        knownMeterGroups.add(item.meter_group_id);
      }

      if (!existingByMeterGroup.has(item.meter_group_id)) {
        const { data: candidates } = await propertyRepository.search({
          limit: 1000,
          orderBy: 'created_at',
          filters: { meter_group_id: item.meter_group_id },
        });

        existingByMeterGroup.set(item.meter_group_id, candidates);
      }

      const normalizedRoomName = normalizeRoomName(item.room_name);
      const existing = existingByMeterGroup.get(item.meter_group_id) ?? [];
      const seenNames = seenByMeterGroup.get(item.meter_group_id) ?? new Set<string>();

      if (
        existing.some((property) => normalizeRoomName(property.room_name) === normalizedRoomName) ||
        seenNames.has(normalizedRoomName)
      ) {
        logger.warn({ meter_group_id: item.meter_group_id, room_name: item.room_name }, 'Duplicate property batch creation attempt');
        throw new AppError(409, 'Room name already exists for the selected meter group');
      }

      seenNames.add(normalizedRoomName);
      seenByMeterGroup.set(item.meter_group_id, seenNames);
    }
  }

  async validateUpdate(property: Property, data: UpdatePropertyDTO): Promise<void> {
    const nextMeterGroupId = data.meter_group_id ?? property.meter_group_id;
    const nextRoomName = data.room_name ?? property.room_name;

    if (data.meter_group_id) {
      await this.ensureMeterGroupExists(data.meter_group_id);
    }

    const duplicate = await this.findDuplicateProperty(nextMeterGroupId, nextRoomName, property.id);
    if (duplicate) {
      logger.warn({ meter_group_id: nextMeterGroupId, room_name: nextRoomName }, 'Duplicate property update attempt');
      throw new AppError(409, 'Room name already exists for the selected meter group');
    }

    if (data.tenant_amount !== undefined) {
      const tenantCount = await this.countTenantsForProperty(property.id);

      if (data.tenant_amount < tenantCount) {
        throw new AppError(409, 'Tenant amount cannot be less than current tenant count');
      }
    }
  }

  async validateBatchUpdate(updates: { id: string; data: UpdatePropertyDTO }[]): Promise<void> {
    for (const update of updates) {
      const property = await propertyRepository.getById(update.id);

      if (!property) {
        throw new AppError(404, 'Property not found');
      }

      await this.validateUpdate(property, update.data);
    }
  }
}