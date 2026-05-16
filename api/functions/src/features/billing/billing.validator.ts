import {CreateBillingDTO} from "./billing.dto";
import {AppError} from "../../utils/error.util";
import {propertyRepository} from "../property/property.repository";
import {readingRepository} from "../reading/reading.repository";

export class BillingValidator {
  private async validatePropertyExists(propertyId: string): Promise<void> {
    const property = await propertyRepository.getById(propertyId);
    if (!property) {
      throw new AppError(404, "Property not found");
    }
  }

  private async validateReadingExists(readingId: string): Promise<void> {
    const reading = await readingRepository.getById(readingId);
    if (!reading) {
      throw new AppError(404, "Reading not found");
    }
  }

  private async validateReadingsBelongToProperty(
    propertyId: string,
    previousReadingId: string,
    currentReadingId: string
  ): Promise<void> {
    const previousReading = await readingRepository.getById(
      previousReadingId
    );
    const currentReading = await readingRepository.getById(currentReadingId);

    if (!previousReading || !currentReading) {
      throw new AppError(404, "Reading not found");
    }

    const property = await propertyRepository.getById(propertyId);
    if (!property) {
      throw new AppError(404, "Property not found");
    }

    if (previousReading.meter_group_id !== currentReading.meter_group_id) {
      throw new AppError(
        400,
        "Previous and current readings must belong to the same meter group"
      );
    }
  }

  async validateCreate(data: CreateBillingDTO): Promise<void> {
    await this.validatePropertyExists(data.property_id);
    await this.validateReadingExists(data.previous_reading_id);
    await this.validateReadingExists(data.current_reading_id);
    await this.validateReadingsBelongToProperty(
      data.property_id,
      data.previous_reading_id,
      data.current_reading_id
    );
  }

  async validateBatch(data: CreateBillingDTO[]): Promise<void> {
    const propertyIds = new Set(data.map((item) => item.property_id));
    const readingIds = new Set<string>();

    for (const item of data) {
      readingIds.add(item.previous_reading_id);
      readingIds.add(item.current_reading_id);
    }

    for (const propertyId of propertyIds) {
      await this.validatePropertyExists(propertyId);
    }

    for (const readingId of readingIds) {
      await this.validateReadingExists(readingId);
    }

    for (const item of data) {
      await this.validateReadingsBelongToProperty(
        item.property_id,
        item.previous_reading_id,
        item.current_reading_id
      );
    }
  }

  async validateUpdate(
    data: Partial<CreateBillingDTO>
  ): Promise<void> {
    if (data.property_id) {
      await this.validatePropertyExists(data.property_id);
    }
    if (data.previous_reading_id) {
      await this.validateReadingExists(data.previous_reading_id);
    }
    if (data.current_reading_id) {
      await this.validateReadingExists(data.current_reading_id);
    }

    if (
      data.property_id ||
      data.previous_reading_id ||
      data.current_reading_id
    ) {
      const propertyId = data.property_id;
      const previousReadingId = data.previous_reading_id;
      const currentReadingId = data.current_reading_id;

      if (propertyId && previousReadingId && currentReadingId) {
        await this.validateReadingsBelongToProperty(
          propertyId,
          previousReadingId,
          currentReadingId
        );
      }
    }
  }

  async validateUpdateBatch(
    updates: {id: string; data: Partial<CreateBillingDTO>}[]
  ): Promise<void> {
    for (const {data} of updates) {
      await this.validateUpdate(data);
    }
  }
}
