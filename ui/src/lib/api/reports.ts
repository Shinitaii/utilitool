import { apiGet, toQueryString } from './client';
import type {
	ReportSummary,
	ConsumptionReport,
	BillingTrendsReport,
	CollectionStatusReport,
	CombinedReportsResponse,
	ReportQueryParams
} from '$lib/types/reports.types';

export async function getAllReports(params?: ReportQueryParams): Promise<CombinedReportsResponse> {
	return apiGet<CombinedReportsResponse>(`/reports${toQueryString(params)}`);
}

export async function getSummaryReport(params?: ReportQueryParams): Promise<ReportSummary> {
	return apiGet<ReportSummary>(`/reports/summary${toQueryString(params)}`);
}

export async function getConsumptionReport(params?: ReportQueryParams): Promise<ConsumptionReport> {
	return apiGet<ConsumptionReport>(`/reports/consumption${toQueryString(params)}`);
}

export async function getBillingTrendsReport(
	params?: ReportQueryParams
): Promise<BillingTrendsReport> {
	return apiGet<BillingTrendsReport>(`/reports/billing-trends${toQueryString(params)}`);
}

export async function getCollectionStatusReport(
	params?: ReportQueryParams
): Promise<CollectionStatusReport> {
	return apiGet<CollectionStatusReport>(`/reports/collection-status${toQueryString(params)}`);
}
