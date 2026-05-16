import {Repository} from "../../lib/repository.lib";
import {BillingCycle} from "./billing-cycle.model";
import {COLLECTIONS} from "../../constants/collection.constants";

export const billingCycleRepository = new Repository<BillingCycle>(
  COLLECTIONS.BILLING_CYCLES
);
