import {meterGroupRepository} from "./meter-group.repository";
import {MeterGroup} from "./meter-group.model";
import {CreateMeterGroupDTO} from "./meter-group.dto";
import {PaginatedResult} from "../../utils/pagination.util";
import {MeterGroupValidator} from "./meter-group.validator";

const validator = new MeterGroupValidator();

type MeterGroupSearchOptions = {
  meterName?: string;
  utilityType?: MeterGroup["utility_type"];
  limit: number;
  cursor?: string | null;
};

export const meterGroupService = {
  async create(data: CreateMeterGroupDTO): Promise<MeterGroup> {
    await validator.validateCreate(data);
    return meterGroupRepository.create(data);
  },

  async createBatch(data: CreateMeterGroupDTO[]): Promise<MeterGroup[]> {
    await validator.validateBatch(data);
    return meterGroupRepository.createBatch(data);
  },


  async search(options: MeterGroupSearchOptions): Promise<PaginatedResult<MeterGroup>> {
    return meterGroupRepository.search({
      limit: options.limit,
      orderBy: "created_at",
      orderDirection: "desc",
      cursor: options.cursor,
      filters: {
        ...(options.meterName ? {meter_name: options.meterName} : {}),
        ...(options.utilityType ? {utility_type: options.utilityType} : {}),
      },
    });
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
    return meterGroupRepository.delete(id);
  },

  async softDelete(id: string): Promise<MeterGroup> {
    return meterGroupRepository.softDelete(id);
  },
};
