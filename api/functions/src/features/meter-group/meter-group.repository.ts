import {Repository} from "../../lib/repository.lib";
import {MeterGroup} from "./meter-group.model";
import {COLLECTIONS} from "../../constants/collection.constants";

export const meterGroupRepository = new Repository<MeterGroup>(COLLECTIONS.METER_GROUPS);
