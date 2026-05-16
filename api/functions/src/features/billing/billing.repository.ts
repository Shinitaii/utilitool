import {Repository} from "../../lib/repository.lib";
import {Billing} from "./billing.model";
import {COLLECTIONS} from "../../constants/collection.constants";

export const billingRepository = new Repository<Billing>(COLLECTIONS.BILLINGS);
