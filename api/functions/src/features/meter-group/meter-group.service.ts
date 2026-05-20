import {Timestamp} from "firebase-admin/firestore";
import {meterGroupRepository} from "./meter-group.repository";
import {MeterGroup, MeterGroupVersionEntry} from "./meter-group.model";
import {CreateMeterGroupDTO} from "./meter-group.dto";
import {readingRepository} from "../reading/reading.repository";
import {PaginatedResult} from "../../utils/pagination.util";
import {MeterGroupValidator} from "./meter-group.validator";
import {AppError} from "../../utils/error.util";
import {collectionRef} from "../../lib/firestore.lib";
import {COLLECTIONS} from "../../constants/collection.constants";

const validator = new MeterGroupValidator();

type MeterGroupSearchOptions = {
  meterName?: string;
  utilityType?: MeterGroup["utility_type"];
  limit: number;
  cursor?: string | null;
  minimal?: boolean;
  archived?: boolean;
};

type MinimalMeterGroup = {
  id: string;
  meter_name: string;
};

export const meterGroupService = {
  async create(data: CreateMeterGroupDTO): Promise<MeterGroup> {
    await validator.validateCreate(data);
    return meterGroupRepository.create({
      ...data,
      current_version: 1,
      versions: {},
    });
  },

  async createBatch(data: CreateMeterGroupDTO[]): Promise<MeterGroup[]> {
    await validator.validateBatch(data);
    return meterGroupRepository.createBatch(
      data.map((item) => ({
        ...item,
        current_version: 1,
        versions: {},
      }))
    );
  },

  async search(
    options: MeterGroupSearchOptions
  ): Promise<PaginatedResult<MeterGroup | MinimalMeterGroup>> {
    const result = await meterGroupRepository.search({
      limit: options.limit,
      orderBy: "created_at",
      orderDirection: "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {
        ...(options.meterName ? {meter_name: options.meterName} : {}),
        ...(options.utilityType ? {utility_type: options.utilityType} : {}),
      },
    });

    if (options.minimal) {
      return {
        ...result,
        data: result.data.map((mg) => ({
          id: mg.id,
          meter_name: mg.meter_name,
        })),
      };
    }

    return result;
  },

  async getById(id: string): Promise<MeterGroup | null> {
    return meterGroupRepository.getById(id);
  },

  async update(id: string, data: Partial<CreateMeterGroupDTO>): Promise<MeterGroup> {
    return meterGroupRepository.update(id, data);
  },

  async updateBatch(updates: {id: string, data: Partial<CreateMeterGroupDTO>}[]): Promise<MeterGroup[]> {
    return meterGroupRepository.updateBatch(updates);
  },

  async delete(id: string): Promise<void> {
    // Prevent hard delete if any active readings reference this meter group
    const readingsSnap = await collectionRef(COLLECTIONS.READINGS)
      .where("meter_group_id", "==", id)
      .where("is_deleted", "==", false)
      .limit(1)
      .get();

    if (!readingsSnap.empty) {
      throw new AppError(409, "Cannot delete meter group: it has active readings. Archive readings first.");
    }

    return meterGroupRepository.delete(id);
  },

  async softDelete(id: string): Promise<MeterGroup> {
    return meterGroupRepository.softDelete(id);
  },

  async restore(id: string): Promise<MeterGroup> {
    const meterGroup = await meterGroupRepository.getById(id);
    if (!meterGroup) {
      throw new AppError(404, "Meter group not found");
    }
    return meterGroupRepository.restore(id);
  },

  async recordReset(id: string): Promise<MeterGroup> {
    const meterGroup = await meterGroupRepository.getById(id);
    if (!meterGroup) {
      throw new AppError(404, "Meter group not found");
    }

    const latestReadingsResult = await readingRepository.search({
      limit: 1,
      orderBy: "reading_date",
      orderDirection: "desc",
      archived: false,
      filters: { meter_group_id: id },
    });

    if (latestReadingsResult.data.length === 0) {
      throw new AppError(422, "Cannot record reset: no readings found for this meter group");
    }

    const latestReading = latestReadingsResult.data[0];
    const currentVersion = meterGroup.current_version ?? 1;

    const updatedVersions: Record<string, MeterGroupVersionEntry> = {
      ...(meterGroup.versions ?? {}),
      [String(currentVersion)]: {
        reset_at: Timestamp.now(),
        last_reading: latestReading.reading_amount,
      },
    };

    const updatePayload: Partial<MeterGroup> = {
      current_version: currentVersion + 1,
      versions: updatedVersions,
    };
    return meterGroupRepository.update(id, updatePayload);
  },
};
