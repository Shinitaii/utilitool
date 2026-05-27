import {CreateBillingCycleDTO} from "./billing-cycle.dto";
import {AppError} from "../../utils/error.util";
import {logger} from "../../utils/logger.util";
import {billingRepository} from "../billing/billing.repository";
import {readingRepository} from "../reading/reading.repository";
import {meterGroupRepository} from "../meter-group/meter-group.repository";
import {billingCycleRepository} from "./billing-cycle.repository";
import {MeterGroup} from "../meter-group/meter-group.model";
import {Timestamp} from "firebase-admin/firestore";

const CONSUMPTION_TOLERANCE = 0.03;

export class BillingCycleValidator {
  private getCumulativeOffset(meterGroup: MeterGroup | null, version: number): number {
    if (!meterGroup?.versions) return 0;
    let offset = 0;
    for (let v = 1; v < version; v++) {
      const versionData = meterGroup.versions[String(v)];
      if (versionData) offset += versionData.last_reading;
    }
    return offset;
  }

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
    const meterGroupCache = new Map<string, MeterGroup | null>();

    for (const [billingId, providedConsumption] of Object.entries(billingIds)) {
      const billing = await billingRepository.getById(billingId);
      if (!billing) continue; // Already caught by validateBillingIdsExist

      const [prevReading, currReading] = await Promise.all([
        readingRepository.getById(billing.previous_reading_id),
        readingRepository.getById(billing.current_reading_id),
      ]);

      if (!prevReading || !currReading) continue; // Shouldn't happen if billings are valid

      if (!meterGroupCache.has(currReading.meter_group_id)) {
        meterGroupCache.set(currReading.meter_group_id, await meterGroupRepository.getById(currReading.meter_group_id));
      }
      const meterGroup = meterGroupCache.get(currReading.meter_group_id)!;

      const prevVersion = prevReading.meter_version ?? 1;
      const currVersion = currReading.meter_version ?? 1;
      const prevOffset = this.getCumulativeOffset(meterGroup, prevVersion);
      const currOffset = this.getCumulativeOffset(meterGroup, currVersion);
      const expectedConsumption = (currOffset + currReading.reading_amount) - (prevOffset + prevReading.reading_amount);

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
        billing_start_date: billingStartDate
      }
    });

    if (existing.length > 0) {
      throw new AppError(
        409,
        "A billing cycle for this meter group with this start date already exists"
      );
    }
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

  async validateBatch(data: CreateBillingCycleDTO[]): Promise<void> {
    const allBillingIds = new Set<string>();

    for (const cycle of data) {
      const billingIds = Object.keys(cycle.billing_ids);

      if (billingIds.length === 0) {
        throw new AppError(400, "Billing IDs must not be empty");
      }

      billingIds.forEach((id) => allBillingIds.add(id));

      await this.ensureBillingCycleNotDuplicate(cycle.meter_group_id, cycle.billing_start_date);

      this.validateBillingDates(cycle.billing_start_date, cycle.billing_end_date);
      this.validateBillingRate(cycle.billing_rate);
      this.validateBillingConsumption(cycle.billing_consumption);

      const totalBilledAmount = Object.values(cycle.billing_ids).reduce(
        (sum, amount) => sum + amount,
        0
      );
      this.validateConsumptionTolerance(
        totalBilledAmount,
        cycle.billing_consumption
      );
    }

    await this.validateBillingIdsExist(Array.from(allBillingIds));
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
