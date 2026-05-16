import {CreateBillingCycleDTO} from "./billing-cycle.dto";
import {AppError} from "../../utils/error.util";
import {logger} from "../../utils/logger.util";
import {billingRepository} from "../billing/billing.repository";
import {Timestamp} from "firebase-admin/firestore";

const CONSUMPTION_TOLERANCE = 0.03;

export class BillingCycleValidator {
  private async validateBillingIdsExist(billingIds: string[]): Promise<void> {
    for (const billingId of billingIds) {
      const billing = await billingRepository.getById(billingId);
      if (!billing) {
        throw new AppError(404, "Billing not found");
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

  async validateCreate(data: CreateBillingCycleDTO): Promise<void> {
    const billingIds = Object.keys(data.billing_ids);

    if (billingIds.length === 0) {
      throw new AppError(400, "Billing IDs must not be empty");
    }

    await this.validateBillingIdsExist(billingIds);

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
