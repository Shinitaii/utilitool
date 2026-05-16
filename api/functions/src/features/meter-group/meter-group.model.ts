import {UtilityType} from "../../constants/utility.constants";
import {BaseModel} from "../../utils/model.util";

export interface MeterGroup extends BaseModel {
    meter_name: string;
    utility_type: UtilityType;
}
