import { apiGet } from './client';
import type {
  ReportSummary,
  ConsumptionReport,
  BillingTrendsReport,
  CollectionStatusReport,
  ReportQueryParams,
} from '$lib/types/reports.types';

function buildQueryString(params?: ReportQueryParams): string {
  if (!params) return '';
  const query = new URLSearchParams();
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  if (params.meterGroupId) query.set('meterGroupId', params.meterGroupId);
  if (params.propertyId) query.set('propertyId', params.propertyId);
  return query.toString() ? `?${query}` : '';
}

export async function getSummaryReport(params?: ReportQueryParams): Promise<ReportSummary> {
  const query = buildQueryString(params);
  return apiGet<ReportSummary>(`/reports/summary${query}`);
}

export async function getConsumptionReport(params?: ReportQueryParams): Promise<ConsumptionReport> {
  const query = buildQueryString(params);
  return apiGet<ConsumptionReport>(`/reports/consumption${query}`);
}

export async function getBillingTrendsReport(params?: ReportQueryParams): Promise<BillingTrendsReport> {
  const query = buildQueryString(params);
  return apiGet<BillingTrendsReport>(`/reports/billing-trends${query}`);
}

export async function getCollectionStatusReport(params?: ReportQueryParams): Promise<CollectionStatusReport> {
  const query = buildQueryString(params);
  return apiGet<CollectionStatusReport>(`/reports/collection-status${query}`);
}
