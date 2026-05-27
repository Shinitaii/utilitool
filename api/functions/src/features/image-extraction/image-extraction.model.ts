import {BaseModel} from "../../utils/model.util";

export interface ExtractedReadingData extends BaseModel {
  meter_group_id?: string;
  property_id?: string;
  reading_amount: number;
  reading_date: string;
  image_url?: string;
}

export interface ExtractedBillingData extends BaseModel {
  billing_start_date: string;
  billing_end_date: string;
  billing_consumption: number;
  billing_rate: number;
  raw_amount?: string;
}
