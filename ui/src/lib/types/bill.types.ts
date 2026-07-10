export interface OcrBillResponse {
	billing_start_date: string;
	billing_end_date: string;
	billing_consumption: number;
	billing_rate: number;
	raw_amount: number;
}
