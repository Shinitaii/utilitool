import {readingRepository} from "./reading.repository";
import {Reading} from "./reading.model";
import {CreateReadingDTO} from "./reading.dto";
import {PaginatedResult} from "../../utils/pagination.util";
import {ReadingValidator} from "./reading.validator";
import {AppError} from "../../utils/error.util";
import {geminiLib} from "../../lib/gemini.lib";

const validator = new ReadingValidator();

type ReadingSearchOptions = {
  meterGroupId?: string;
  limit: number;
  cursor?: string | null;
  archived?: boolean;
};

export const readingService = {
  async create(data: CreateReadingDTO): Promise<Reading> {
    await validator.validateCreate(data);
    return readingRepository.create(data);
  },

  async createBatch(data: CreateReadingDTO[]): Promise<Reading[]> {
    await validator.validateBatch(data);
    return readingRepository.createBatch(data);
  },

  async search(options: ReadingSearchOptions): Promise<PaginatedResult<Reading>> {
    return readingRepository.search({
      limit: options.limit,
      orderBy: "created_at",
      orderDirection: "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {
        ...(options.meterGroupId ? {meter_group_id: options.meterGroupId} : {}),
      },
    });
  },

  async getById(id: string): Promise<Reading | null> {
    return readingRepository.getById(id);
  },

  async update(id: string, data: Partial<CreateReadingDTO>): Promise<Reading> {
    await validator.validateUpdate(data);
    return readingRepository.update(id, data);
  },

  async updateBatch(updates: {id: string, data: Partial<CreateReadingDTO>}[]): Promise<Reading[]> {
    await validator.validateUpdateBatch(updates);
    return readingRepository.updateBatch(updates);
  },

  async delete(id: string): Promise<void> {
    return readingRepository.delete(id);
  },

  async softDelete(id: string): Promise<Reading> {
    return readingRepository.softDelete(id);
  },

  async restore(id: string): Promise<Reading> {
    const reading = await readingRepository.getById(id);
    if (!reading) {
      throw new AppError(404, "Reading not found");
    }
    return readingRepository.restore(id);
  },

  async extractReadingFromImage(imageUrl: string): Promise<number | null> {
    return geminiLib.extractReadingFromImage(imageUrl);
  },
};
