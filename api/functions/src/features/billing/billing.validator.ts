import {CreateBillingDTO} from "./billing.dto";
import {AppError} from "../../utils/error.util";
import {propertyRepository} from "../property/property.repository";
import {readingRepository} from "../reading/reading.repository";
import {billingRepository} from "./billing.repository";
import type {Property} from "../property/property.model";
import type {Reading} from "../reading/reading.model";

export class BillingValidator {
  private async validateReadingsBelongToProperty(
    property: Property,
    previousReading: Reading,
    currentReading: Reading
  ): Promise<void> {
    if (previousReading.meter_group_id !== currentReading.meter_group_id) {
      throw new AppError(
        400,
        "Previous and current readings must belong to the same meter group"
      );
    }

    // Skip rollback check if meter was reset (indicated by version bump)
    if (currentReading.meter_version === previousReading.meter_version) {
      if (currentReading.reading_amount <= previousReading.reading_amount) {
        throw new AppError(
          400,
          "Current reading must be greater than previous reading (meter rollback not allowed)"
        );
      }
    }
  }

  private validatePropertyIsNotMainMeter(
    property: Property,
    meterGroupId: string
  ): void {
    const entry = Object.values(property.meter_groups).find(
      (e) => e.meter_group_id === meterGroupId
    );
    if (entry?.is_main_meter) {
      throw new AppError(
        400,
        `Property ${property.id} is the main meter for meter group ${meterGroupId}. ` +
        "Its billings are generated automatically at billing cycle creation."
      );
    }
  }

  private async ensureNoDuplicateBilling(
    propertyId: string,
    currentReadingId: string
  ): Promise<void> {
    const {data: existing} = await billingRepository.search({
      limit: 1,
      orderBy: "created_at",
      filters: {
        property_id: propertyId,
        current_reading_id: currentReadingId,
      },
    });

    if (existing.length > 0) {
      throw new AppError(
        409,
        "A billing for this property with this reading already exists"
      );
    }
  }

  async validateCreate(data: CreateBillingDTO): Promise<void> {
    const [property, previousReading, currentReading] = await Promise.all([
      propertyRepository.getById(data.property_id),
      readingRepository.getById(data.previous_reading_id),
      readingRepository.getById(data.current_reading_id),
    ]);

    if (!property) {
      throw new AppError(404, "Property not found");
    }
    if (!previousReading || !currentReading) {
      throw new AppError(404, "Reading not found");
    }

    await this.validateReadingsBelongToProperty(property, previousReading, currentReading);
    this.validatePropertyIsNotMainMeter(property, currentReading.meter_group_id);
    await this.ensureNoDuplicateBilling(data.property_id, data.current_reading_id);
  }

  async validateBatch(data: CreateBillingDTO[]): Promise<void> {
    const propertyIds = new Set(data.map((item) => item.property_id));
    const readingIds = new Set<string>();

    for (const item of data) {
      readingIds.add(item.previous_reading_id);
      readingIds.add(item.current_reading_id);
    }

    // Batch fetch all entities using true batch queries
    const properties = await propertyRepository.getByIds(Array.from(propertyIds));
    const readings = await readingRepository.getByIds(Array.from(readingIds));

    // Validate all entities exist and build maps
    const propertyMap = new Map<string, Property>();
    for (const p of properties) {
      if (p) {
        propertyMap.set(p.id, p);
      }
    }

    const readingMap = new Map<string, Reading>();
    for (const r of readings) {
      if (r) {
        readingMap.set(r.id, r);
      }
    }

    for (const id of propertyIds) {
      if (!propertyMap.has(id)) {
        throw new AppError(404, "Property not found");
      }
    }
    for (const id of readingIds) {
      if (!readingMap.has(id)) {
        throw new AppError(404, "Reading not found");
      }
    }

    // Batch check for duplicate billings once instead of per-item
    const duplicateCheck = await billingRepository.search({
      limit: 1000,
      orderBy: "created_at",
      filters: {},
    });
    const existingBillings = new Map<string, boolean>();
    for (const billing of duplicateCheck.data) {
      const key = `${billing.property_id}:${billing.current_reading_id}`;
      existingBillings.set(key, true);
    }

    // Validate each item using cached entities
    for (const item of data) {
      const property = propertyMap.get(item.property_id)!;
      const previousReading = readingMap.get(item.previous_reading_id)!;
      const currentReading = readingMap.get(item.current_reading_id)!;

      await this.validateReadingsBelongToProperty(property, previousReading, currentReading);
      this.validatePropertyIsNotMainMeter(property, currentReading.meter_group_id);

      // Check against cached existing billings instead of querying
      const duplicateKey = `${item.property_id}:${item.current_reading_id}`;
      if (existingBillings.has(duplicateKey)) {
        throw new AppError(
          409,
          "A billing for this property with this reading already exists"
        );
      }
    }
  }

  async validateUpdate(
    id: string,
    data: Partial<CreateBillingDTO>
  ): Promise<void> {
    // Only a change to one of the readings needs cross-entity re-validation.
    const changesReadingPair =
      data.previous_reading_id !== undefined || data.current_reading_id !== undefined;

    if (!changesReadingPair) {
      return;
    }

    // The correction escape hatch: a PATCH may send only current_reading_id (or
    // only previous_reading_id). Resolve the full triple, falling back to the
    // stored billing for whatever isn't in this PATCH, so a lone reading change
    // still passes the same-meter-group / rollback / main-meter checks instead
    // of silently skipping them.
    let propertyId = data.property_id;
    let previousReadingId = data.previous_reading_id;
    let currentReadingId = data.current_reading_id;

    if (!propertyId || !previousReadingId || !currentReadingId) {
      const existing = await billingRepository.getById(id);
      if (!existing) {
        throw new AppError(404, "Billing not found");
      }
      propertyId = propertyId ?? existing.property_id;
      previousReadingId = previousReadingId ?? existing.previous_reading_id;
      currentReadingId = currentReadingId ?? existing.current_reading_id;
    }

    const [property, previousReading, currentReading] = await Promise.all([
      propertyRepository.getById(propertyId),
      readingRepository.getById(previousReadingId),
      readingRepository.getById(currentReadingId),
    ]);

    if (!property) {
      throw new AppError(404, "Property not found");
    }
    if (!previousReading || !currentReading) {
      throw new AppError(404, "Reading not found");
    }

    await this.validateReadingsBelongToProperty(property, previousReading, currentReading);
    this.validatePropertyIsNotMainMeter(property, currentReading.meter_group_id);
  }

  async validateUpdateBatch(
    updates: {id: string; data: Partial<CreateBillingDTO>}[]
  ): Promise<void> {
    for (const {id, data} of updates) {
      await this.validateUpdate(id, data);
    }
  }
}
