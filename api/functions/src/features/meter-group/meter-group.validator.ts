import {CreateMeterGroupDTO} from "./meter-group.dto";
import {MeterGroup} from "./meter-group.model";
import {AppError} from "../../utils/error.util";
import {logger} from "../../utils/logger.util";
import {collectionRef} from "../../lib/firestore.lib";
import {COLLECTIONS} from "../../constants/collection.constants";
import {snapshotToModel} from "../../utils/firestore.util";

const normalizeMeterName = (meterName: string) => meterName.trim().toLowerCase();

export class MeterGroupValidator {
  private async findDuplicateMeterGroup(
    utilityType: MeterGroup["utility_type"],
    meterName: string,
    excludeId?: string
  ): Promise<MeterGroup | undefined> {
    // Use indexed equality query instead of full collection scan
    const normalizedName = normalizeMeterName(meterName);
    const snap = await collectionRef(COLLECTIONS.METER_GROUPS)
      .where("utility_type", "==", utilityType)
      .where("is_deleted", "==", false)
      .get();

    return snap.docs
      .map((doc) => snapshotToModel<MeterGroup>(doc))
      .find((mg) => normalizeMeterName(mg.meter_name) === normalizedName && mg.id !== excludeId);
  }

  async validateCreate(data: CreateMeterGroupDTO): Promise<void> {
    const duplicate = await this.findDuplicateMeterGroup(data.utility_type, data.meter_name);
    if (duplicate) {
      logger.warn({utility_type: data.utility_type, meter_name: data.meter_name}, "Duplicate meter group creation attempt");
      throw new AppError(409, "Meter name already exists for the selected utility type");
    }
  }

  async validateBatch(data: CreateMeterGroupDTO[]): Promise<void> {
    const existingByUtilityType = new Map<MeterGroup["utility_type"], MeterGroup[]>();
    const seenInBatch = new Map<MeterGroup["utility_type"], Set<string>>();

    for (const item of data) {
      if (!existingByUtilityType.has(item.utility_type)) {
        // Indexed query instead of full collection scan
        const snap = await collectionRef(COLLECTIONS.METER_GROUPS)
          .where("utility_type", "==", item.utility_type)
          .where("is_deleted", "==", false)
          .get();
        existingByUtilityType.set(
          item.utility_type,
          snap.docs.map((doc) => snapshotToModel<MeterGroup>(doc))
        );
      }

      const normalizedMeterName = normalizeMeterName(item.meter_name);
      const existing = existingByUtilityType.get(item.utility_type) ?? [];
      const seenNames = seenInBatch.get(item.utility_type) ?? new Set<string>();

      if (existing.some((mg) => normalizeMeterName(mg.meter_name) === normalizedMeterName) || seenNames.has(normalizedMeterName)) {
        logger.warn({utility_type: item.utility_type, meter_name: item.meter_name}, "Duplicate meter group batch creation attempt");
        throw new AppError(409, "Meter name already exists for the selected utility type");
      }

      seenNames.add(normalizedMeterName);
      seenInBatch.set(item.utility_type, seenNames);
    }
  }
}
