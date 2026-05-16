import {Repository} from "../../lib/repository.lib";
import {COLLECTIONS} from "../../constants/collection.constants";
import {Tenant} from "./tenant.model";

export const tenantRepository = new Repository<Tenant>(COLLECTIONS.TENANTS);
