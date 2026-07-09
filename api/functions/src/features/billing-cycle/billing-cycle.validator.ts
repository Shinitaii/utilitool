import {CreateBillingCycleDTO} from "./billing-cycle.dto";
import {AppError} from "../../utils/error.util";
import {logger} from "../../utils/logger.util";
import {billingRepository} from "../billing/billing.repository";
import {readingRepository} from "../reading/reading.repository";
import {meterGroupRepository} from "../meter-group/meter-group.repository";
import {billingCycleRepository} from "./billing-cycle.repository";
import {MeterGroup} from "../meter-group/meter-group.model";
import {propertyRepository} from "../property/property.repository";
import {Property} from "../property/property.model";
import {Reading} from "../reading/reading.model";
import {Timestamp} from "firebase-admin/firestore";
import {calculateTrueReading, resolveVersionsSource} from "../reading/reading.util";

const CONSUMPTION_TOLERANCE = 0.03;

export class BillingCycleValidator {

  private async validateBillingIdsExist(billingIds: string[]): Promise<void> {
    const billings = await Promise.all(
      billingIds.map((id) => billingRepository.getById(id))
    );
    for (let i = 0; i < billings.length; i++) {
      if (!billings[i]) {
        throw new AppError(404, `Billing not found: ${billingIds[i]}`);
      }
    }
  }

  private async validateBillingConsumptionAmounts(
    billingIds: Record<string, number>
  ): Promise<void> {
    const PER_BILLING_TOLERANCE = 0.05;
    const billingIdList = Object.keys(billingIds);

    // Batch fetch all billings
    const billings = await billingRepository.getByIds(billingIdList);

    const readingIds = new Set<string>();
    const propertyIds = new Set<string>();

    for (let i = 0; i < billings.length; i++) {
      const billing = billings[i];
      if (!billing) continue;
      readingIds.add(billing.previous_reading_id);
      readingIds.add(billing.current_reading_id);
      propertyIds.add(billing.property_id);
    }

    // Batch fetch all readings and properties upfront
    const readings = await readingRepository.getByIds(Array.from(readingIds));
    const properties = await propertyRepository.getByIds(Array.from(propertyIds));

    const readingMap = new Map<string, Reading>();
    readings.forEach((r) => r && readingMap.set(r.id, r));

    const propertyMap = new Map<string, Property>();
    properties.forEach((p) => p && propertyMap.set(p.id, p));

    // Meter groups are only known once readings are resolved (meter_group_id lives on Reading)
    const uniqueMeterGroupIds = [...new Set(Array.from(readingMap.values()).map((r) => r.meter_group_id))];

    const meterGroupMap = new Map<string, MeterGroup | null>();
    const uniqueMeterGroups = await meterGroupRepository.getByIds(uniqueMeterGroupIds);
    uniqueMeterGroups.forEach((mg) => mg && meterGroupMap.set(mg.id, mg));

    // Now validate each billing using cached entities
    for (let i = 0; i < billingIdList.length; i++) {
      const billingId = billingIdList[i];
      const providedConsumption = billingIds[billingId];
      const billing = billings[i];

      if (!billing) continue;

      const prevReading = readingMap.get(billing.previous_reading_id);
      const currReading = readingMap.get(billing.current_reading_id);

      if (!prevReading || !currReading) continue;

      const meterGroup = meterGroupMap.get(currReading.meter_group_id);
      const property = propertyMap.get(billing.property_id);

      const versionsSource = resolveVersionsSource(meterGroup, property, currReading.meter_group_id);
      const expectedConsumption = calculateTrueReading(currReading, versionsSource) - calculateTrueReading(prevReading, versionsSource);

      const tolerance = Math.abs(expectedConsumption) * PER_BILLING_TOLERANCE;
      if (Math.abs(providedConsumption - expectedConsumption) > tolerance) {
        throw new AppError(
          400,
          `Billing ${billingId}: provided consumption ${providedConsumption} deviates more than 5% from expected ${expectedConsumption}`
        );
      }
    }
  }

  private validateConsumptionTolerance(
    calculatedConsumption: number,
    expectedConsumption: number
  ): void {
    const tolerance = expectedConsumption * CONSUMPTION_TOLERANCE;
    const difference = Math.abs(calculatedConsumption - expectedConsumption);

    if (difference > tolerance) {
      logger.warn(
        {
          calculated: calculatedConsumption,
          expected: expectedConsumption,
          tolerance,
        },
        "Consumption mismatch exceeds tolerance"
      );
      const percent = CONSUMPTION_TOLERANCE * 100;
      throw new AppError(
        400,
        `Consumption mismatch: calculated ${calculatedConsumption} ` +
          `differs from expected ${expectedConsumption} by more than ${percent}%`
      );
    }
  }

  private validateBillingDates(
    startDate: Timestamp,
    endDate: Timestamp
  ): void {
    if (startDate >= endDate) {
      throw new AppError(
        400,
        "Billing start date must be before billing end date"
      );
    }
  }

  private validateBillingRate(rate: number): void {
    if (rate < 0) {
      throw new AppError(400, "Billing rate cannot be negative");
    }
  }

  private validateBillingConsumption(consumption: number): void {
    if (consumption < 0) {
      throw new AppError(400, "Billing consumption cannot be negative");
    }
  }

  private async ensureBillingCycleNotDuplicate(
    meterGroupId: string,
    billingStartDate: Timestamp
  ): Promise<void> {
    const {data: existing} = await billingCycleRepository.search({
      limit: 1,
      orderBy: "created_at",
      filters: {
        meter_group_id: meterGroupId,
        billing_start_date: billingStartDate.toDate(),
      },
    });

    if (existing.length > 0) {
      throw new AppError(
        409,
        "A billing cycle for this meter group with this start date already exists"
      );
    }
  }

  /**
   * Validates that each submitted submeter consumption is within 5% of the
   * true, version-aware expected delta (see calculateTrueReading/
   * resolveVersionsSource). Must run BEFORE injectMainMeterBilling
   * synthesizes a main-meter reading from these numbers — otherwise a bad
   * submeter consumption (e.g. from a meter-reset boundary) silently drives
   * the derived main-meter reading below its previous value, surfacing a
   * confusing "meter rollback" error on the main meter instead of the
   * actual, actionable "consumption deviates from expected" error on the
   * offending submeter billing.
   */
  async validateSubmeterConsumption(data: CreateBillingCycleDTO): Promise<void> {
    const billingIds = Object.keys(data.billing_ids);

    if (billingIds.length === 0) {
      throw new AppError(400, "Billing IDs must not be empty");
    }

    await this.validateBillingIdsExist(billingIds);
    await this.validateBillingConsumptionAmounts(data.billing_ids);
  }

  async validateCreate(data: CreateBillingCycleDTO): Promise<void> {
    const billingIds = Object.keys(data.billing_ids);

    if (billingIds.length === 0) {
      throw new AppError(400, "Billing IDs must not be empty");
    }

    await this.validateBillingIdsExist(billingIds);
    await this.validateBillingConsumptionAmounts(data.billing_ids);
    await this.ensureBillingCycleNotDuplicate(data.meter_group_id, data.billing_start_date);

    this.validateBillingDates(
      data.billing_start_date,
      data.billing_end_date
    );
    this.validateBillingRate(data.billing_rate);
    this.validateBillingConsumption(data.billing_consumption);

    const totalBilledAmount = Object.values(data.billing_ids).reduce(
      (sum, amount) => sum + amount,
      0
    );
    this.validateConsumptionTolerance(totalBilledAmount, data.billing_consumption);
  }

  /**
   * Validates each cycle independently so one invalid item (e.g. a duplicate
   * meter_group_id + billing_start_date pair) doesn't abort validation for the
   * rest of the batch. Reuses validateCreate's per-item rules; the batch-level
   * query fan-out optimization is dropped in favor of correctness — batches
   * are capped at 10 items (CreateBillingCycleBatchDTOSchema), so sequential
   * per-item validation is cheap enough.
   */
  async validateBatch(
    data: CreateBillingCycleDTO[]
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
    data: Partial<CreateBillingCycleDTO>
  ): Promise<void> {
    if (data.billing_ids !== undefined) {
      const billingIds = Object.keys(data.billing_ids);

      if (billingIds.length === 0) {
        throw new AppError(400, "Billing IDs must not be empty");
      }

      await this.validateBillingIdsExist(billingIds);
      await this.validateBillingConsumptionAmounts(data.billing_ids);
    }

    if (data.billing_start_date && data.billing_end_date) {
      this.validateBillingDates(data.billing_start_date, data.billing_end_date);
    }

    if (data.billing_rate !== undefined) {
      this.validateBillingRate(data.billing_rate);
    }

    if (data.billing_consumption !== undefined) {
      this.validateBillingConsumption(data.billing_consumption);
    }

    if (data.billing_ids && data.billing_consumption !== undefined) {
      const totalBilledAmount = Object.values(data.billing_ids).reduce(
        (sum, amount) => sum + amount,
        0
      );
      this.validateConsumptionTolerance(
        totalBilledAmount,
        data.billing_consumption
      );
    }
  }

  async validateUpdateBatch(
    updates: {id: string; data: Partial<CreateBillingCycleDTO>}[]
  ): Promise<void> {
    for (const {data} of updates) {
      await this.validateUpdate(data);
    }
  }
}
