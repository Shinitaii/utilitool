import {CreateReadingDTO} from "./reading.dto";
import {readingRepository} from "./reading.repository";
import {AppError} from "../../utils/error.util";
import {meterGroupRepository} from "../meter-group/meter-group.repository";
import {propertyRepository} from "../property/property.repository";
import {findPreviousMonthReading} from "./reading.util";
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

  private async fetchReadingsForConstraintCheck(meterGroupId: string) {
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

    return readings;
  }

  private checkExistingInMonth(
    readings: {property_id: string; reading_date: Timestamp}[],
    propertyId: string,
    readingDate: Timestamp
  ): void {
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

  private async validateMeterGroupConstraints(
    meterGroupId: string,
    propertyId: string,
    readingDate: Timestamp
  ): Promise<void> {
    const readings = await this.fetchReadingsForConstraintCheck(meterGroupId);
    this.checkExistingInMonth(readings, propertyId, readingDate);
  }

  async validateCreate(data: CreateReadingDTO): Promise<void> {
    await this.validateMeterGroupExists(data.meter_group_id);
    this.validateReadingAmount(data.reading_amount);
    this.validateReadingDate(data.reading_date);
    await this.validateMeterGroupConstraints(data.meter_group_id, data.property_id, data.reading_date);
  }

  /**
   * Validates each reading independently so one invalid item (e.g. a
   * duplicate for a property+month) doesn't abort validation for the rest of
   * the batch. Reuses validateCreate's per-item rules; the batch-level query
   * fan-out optimization is dropped in favor of correctness — batches are
   * capped at 10 items (CreateReadingBatchDTOSchema), so sequential per-item
   * validation is cheap enough.
   */
  async validateBatch(
    data: CreateReadingDTO[]
  ): Promise<{validIndexes: number[]; failures: {index: number; error: string}[]}> {
    const validIndexes: number[] = [];
    const failures: {index: number; error: string}[] = [];

    for (let index = 0; index < data.length; index++) {
      try {
        await this.validateCreate(data[index]);
        validIndexes.push(index);
      } catch (err) {
        failures.push({
          index,
          error: err instanceof AppError ? err.message : "Validation failed",
        });
      }
    }

    return {validIndexes, failures};
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

  async validateMeterRollback(
    meterGroupId: string,
    propertyId: string,
    newReadingAmount: number,
    meterVersion: number,
    readingDate: Timestamp
  ): Promise<void> {
    // Look for previous-month reading to check meter rollback
    const prevReading = await findPreviousMonthReading(meterGroupId, propertyId, readingDate);

    if (!prevReading) return; // No previous reading, no rollback check needed

    const prevReadingData = prevReading.data;
    const prevMeterVersion = prevReadingData.meter_version ?? 1;

    // Only enforce rollback check when both readings have same meter version
    if (meterVersion === prevMeterVersion && newReadingAmount <= prevReadingData.reading_amount) {
      throw new AppError(
        400,
        "Current reading must be greater than previous reading (meter rollback not allowed)"
      );
    }
  }

  async validateAnomalous(
    meterGroupId: string,
    newReadingAmount: number,
    meterVersion: number,
    propertyId?: string,
  ): Promise<void> {
    if (propertyId) {
      const property = await propertyRepository.getById(propertyId);
      if (property) {
        const entry = Object.values(property.meter_groups).find(
          (e) => e.meter_group_id === meterGroupId
        );
        if (entry?.is_main_meter) return;
      }
    }

    const recentResult = await readingRepository.search({
      limit: 6,
      orderBy: "reading_date",
      orderDirection: "desc",
      filters: {meter_group_id: meterGroupId},
    });
    const recentReadings = recentResult.data;

    if (recentReadings.length < 2) return;

    const sameVersionReadings = recentReadings.filter(
      (r) => (r.meter_version ?? 1) === meterVersion
    );
    if (sameVersionReadings.length < 1) return;

    const mostRecent = sameVersionReadings[0];
    if (newReadingAmount <= mostRecent.reading_amount) return;

    const deltas: number[] = [];
    for (let i = 0; i < sameVersionReadings.length - 1; i++) {
      const curr = sameVersionReadings[i];
      const prev = sameVersionReadings[i + 1];
      const delta = curr.reading_amount - prev.reading_amount;
      if (delta > 0) deltas.push(delta);
    }
    if (deltas.length === 0) return;

    const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    const newDelta = newReadingAmount - mostRecent.reading_amount;

    if (newDelta > 5 * avgDelta) {
      throw new AppError(
        422,
        `Reading amount ${newReadingAmount} is unusually high. ` +
          `Average monthly delta for this meter group is ${Math.round(avgDelta)} units; ` +
          `this reading implies a delta of ${Math.round(newDelta)} units. ` +
          "If the meter was reset, record a reset on the meter group first."
      );
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
