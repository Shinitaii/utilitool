import { Timestamp } from "firebase-admin/firestore";
import { BaseModel } from "../../utils/model.util";

export interface Reading extends BaseModel {
    meter_group_id: string;
    reading_amount: number;
    reading_date: Timestamp;
}