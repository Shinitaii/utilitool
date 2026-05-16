import { Timestamp } from "firebase-admin/firestore";
import { BaseModel } from "../../utils/model.util";

export interface Tenant extends BaseModel{
    tenant_name: string;
    property_id: string;
    tenant_start_date: Timestamp;
    tenant_end_date?: Timestamp;
}