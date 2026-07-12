import type { BaseModel, FirestoreTimestamp } from './api.types';

export interface Reading extends BaseModel {
	meter_group_id: string;
	property_id: string;
	reading_amount: number;
	reading_date: FirestoreTimestamp;
	meter_version: number;
}

export interface CreateReadingRequest {
	meter_group_id: string;
	property_id: string;
	reading_amount: number;
	reading_date: FirestoreTimestamp | string;
}

export interface CreateSeedReadingRequest {
	meter_group_id: string;
	property_id: string;
	reading_amount: number;
	reading_date: FirestoreTimestamp | string;
}

export interface UpdateReadingRequest {
	meter_group_id?: string;
	reading_amount?: number;
	reading_date?: FirestoreTimestamp | string;
}
