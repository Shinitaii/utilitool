import {Timestamp} from "firebase-admin/firestore";
import {BaseModel} from "../../utils/model.util";

export interface Billing extends BaseModel {
    property_id: string;
    previous_reading_id: string;
    current_reading_id: string;
    meter_group_id: string;
    billing_period_date: Timestamp;
    payment_status: "pending" | "paid";
    paid_at?: string;
}
