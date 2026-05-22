import {Timestamp} from "firebase-admin/firestore";
import {BaseModel} from "../../utils/model.util";

export interface BillingCycle extends BaseModel {
    meter_group_id: string;
    billing_ids: Record<string, number>;
    billing_rate: number;
    billing_consumption: number;
    billing_start_date: Timestamp;
    billing_end_date: Timestamp;
}
