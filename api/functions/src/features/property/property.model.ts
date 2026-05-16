import { BaseModel } from "../../utils/model.util";

export interface Property extends BaseModel {
    room_name: string;
    tenant_amount: number;
    meter_group_id: string;
}