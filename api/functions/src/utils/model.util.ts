import { Timestamp } from "firebase-admin/firestore";

export interface BaseModel {
    id: string;
    created_at: Timestamp,
    updated_at?: Timestamp,
    deleted_at?: Timestamp,
}

export type WithoutBaseModel<T extends BaseModel> = Omit<T, keyof BaseModel>;
