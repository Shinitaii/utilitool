import {CreateReadingDTO} from "./reading.dto";
import {readingRepository} from "./reading.repository";
import {AppError} from "../../utils/error.util";
import {meterGroupRepository} from "../meter-group/meter-group.repository";
import {propertyRepository} from "../property/property.repository";
import {Timestamp} from "firebase-admin/firestore";

const MAX_READINGS_PER_METER_GROUP = 1000;

export class ReadingValidator {
  private async validateMeterGroupExists(
    meterGroupId: string
  ): Promise<void> {
    const meterGroup = await meterGroupRepository.getById(meterGroupId);
    if (!meterGroup) {
      throw new AppError(404, "Meter group not found");
    }
  }

  private validateReadingAmount(amount: number): void {
    if (amount < 0) {
      throw new AppError(400, "Reading amount cannot be negative");
    }
  }

  private validateReadingDate(date: Timestamp): void {
    const now = Timestamp.now();
    if (date > now) {
      throw new AppError(400, "Reading date cannot be in the future");
    }
  }

  private async validateMeterGroupConstraints(
    meterGroupId: string,
    propertyId: string,
    readingDate: Timestamp
  ): Promise<void> {
    const {data: readings} = await readingRepository.search({
      limit: MAX_READINGS_PER_METER_GROUP + 1,
      orderBy: "created_at",
      filters: {meter_group_id: meterGroupId},
    });

    if (readings.length >= MAX_READINGS_PER_METER_GROUP) {
      throw new AppError(
        400,
        "Maximum number of readings allowed for this meter group has been exceeded"
      );
    }

    const d = readingDate.toDate();
    const month = d.getUTCMonth();
    const year = d.getUTCFullYear();

    const existingInMonth = readings.some((r) => {
      const rd = r.reading_date.toDate();
      return (
        r.property_id === propertyId &&
        rd.getUTCMonth() === month &&
        rd.getUTCFullYear() === year
      );
    });

    if (existingInMonth) {
      throw new AppError(
        409,
        "A reading for this property and meter group already exists in this month"
      );
    }
  }

  async validateCreate(data: CreateReadingDTO): Promise<void> {
    await this.validateMeterGroupExists(data.meter_group_id);
    this.validateReadingAmount(data.reading_amount);
    this.validateReadingDate(data.reading_date);
    await this.validateMeterGroupConstraints(data.meter_group_id, data.property_id, data.reading_date);
  }

  async validateBatch(data: CreateReadingDTO[]): Promise<void> {
    const meterGroupIds = new Set(data.map((item) => item.meter_group_id));

    for (const meterGroupId of meterGroupIds) {
      await this.validateMeterGroupExists(meterGroupId);
    }

    for (const item of data) {
      this.validateReadingAmount(item.reading_amount);
      this.validateReadingDate(item.reading_date);
    }

    for (const item of data) {
      await this.validateMeterGroupConstraints(item.meter_group_id, item.property_id, item.reading_date);
    }
  }

  async validateUpdate(
    data: Partial<CreateReadingDTO>
  ): Promise<void> {
    if (data.meter_group_id) {
      await this.validateMeterGroupExists(data.meter_group_id);
    }
    if (data.reading_amount !== undefined) {
      this.validateReadingAmount(data.reading_amount);
    }
    if (data.reading_date) {
      this.validateReadingDate(data.reading_date);
    }
  }

  async validateUpdateBatch(
    updates: {id: string; data: Partial<CreateReadingDTO>}[]
  ): Promise<void> {
    for (const {data} of updates) {
      await this.validateUpdate(data);
    }
  }

  async validateSeedCreate(data: CreateReadingDTO): Promise<void> {
    await this.validateMeterGroupExists(data.meter_group_id);
    this.validateReadingAmount(data.reading_amount);
    this.validateReadingDate(data.reading_date);

    const property = await propertyRepository.getById(data.property_id);
    if (!property) {
      throw new AppError(404, "Property not found");
    }

    const entry = Object.values(property.meter_groups).find(
      (e) => e.meter_group_id === data.meter_group_id
    );
    if (!entry?.is_main_meter) {
      throw new AppError(
        400,
        `Property ${data.property_id} is not the main meter for meter group ${data.meter_group_id}`
      );
    }

    const existing = await readingRepository.search({
      limit: 1,
      orderBy: "created_at",
      filters: {
        property_id: data.property_id,
        meter_group_id: data.meter_group_id,
      },
    });

    if (existing.data.length > 0) {
      throw new AppError(
        409,
        "A seed reading already exists for this property and meter group. " +
          "All subsequent readings are auto-derived at billing cycle creation."
      );
    }
  }
}
