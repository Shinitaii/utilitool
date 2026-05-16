import { CreateMeterGroupDTO } from './meter-group.dto';
import { MeterGroup } from './meter-group.model';
import { meterGroupRepository } from './meter-group.repository';
import { AppError } from '../../utils/error.util';
import { logger } from '../../utils/logger.util';

const normalizeMeterName = (meterName: string) => meterName.trim().toLowerCase();

export class MeterGroupValidator {
  private async findDuplicateMeterGroup(
    utilityType: MeterGroup['utility_type'],
    meterName: string
  ): Promise<MeterGroup | undefined> {
    const { data: candidates } = await meterGroupRepository.search({
      limit: 1000,
      orderBy: 'created_at',
      filters: { utility_type: utilityType },
    });

    const normalizedMeterName = normalizeMeterName(meterName);

    return candidates.find(
      (meterGroup) => normalizeMeterName(meterGroup.meter_name) === normalizedMeterName
    );
  }

  async validateCreate(data: CreateMeterGroupDTO): Promise<void> {
    const duplicate = await this.findDuplicateMeterGroup(data.utility_type, data.meter_name);
    if (duplicate) {
      logger.warn({ utility_type: data.utility_type, meter_name: data.meter_name }, 'Duplicate meter group creation attempt');
      throw new AppError(409, 'Meter name already exists for the selected utility type');
    }
  }

  async validateBatch(data: CreateMeterGroupDTO[]): Promise<void> {
    const existingByUtilityType = new Map<MeterGroup['utility_type'], MeterGroup[]>();
    const seenInBatch = new Map<MeterGroup['utility_type'], Set<string>>();

    for (const item of data) {
      if (!existingByUtilityType.has(item.utility_type)) {
        const { data: candidates } = await meterGroupRepository.search({
          limit: 1000,
          orderBy: 'created_at',
          filters: { utility_type: item.utility_type },
        });
        existingByUtilityType.set(item.utility_type, candidates);
      }

      const normalizedMeterName = normalizeMeterName(item.meter_name);
      const existing = existingByUtilityType.get(item.utility_type) ?? [];
      const seenNames = seenInBatch.get(item.utility_type) ?? new Set<string>();

      if (existing.some(mg => normalizeMeterName(mg.meter_name) === normalizedMeterName) || seenNames.has(normalizedMeterName)) {
        logger.warn({ utility_type: item.utility_type, meter_name: item.meter_name }, 'Duplicate meter group batch creation attempt');
        throw new AppError(409, 'Meter name already exists for the selected utility type');
      }

      seenNames.add(normalizedMeterName);
      seenInBatch.set(item.utility_type, seenNames);
    }
  }
}