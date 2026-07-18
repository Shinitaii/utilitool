export interface ReportSummary {
  total_revenue: number;
  total_billed: number;
  collection_rate: number;
  paid_count: number;
  pending_count: number;
  overdue_count: number;
  pending_amount: number;
  overdue_amount: number;
}

export interface ConsumptionByMonth {
  period: string;
  electricity: number;
  water: number;
}

export interface ConsumptionByProperty {
  property_id: string;
  room_name: string;
  electricity: number;
  water: number;
}

export interface ConsumptionReport {
  by_month: ConsumptionByMonth[];
  by_property: ConsumptionByProperty[];
}

export interface BillingTrendByMonth {
  period: string;
  total_billed: number;
  total_collected: number;
  total_pending: number;
  total_overdue: number;
}

export interface BillingTrendsReport {
  by_month: BillingTrendByMonth[];
}

export interface CollectionStatusItem {
  count: number;
  amount: number;
}

export interface CollectionStatusReport {
  paid: CollectionStatusItem;
  pending: CollectionStatusItem;
  overdue: CollectionStatusItem;
}

export interface JoinedBilling {
  billingId: string;
  amount: number;
  consumption: number;
  cycleStartDate: Date;
  cycleEndDate: Date;
  utilityType: string;
  propertyId: string;
  roomName: string;
  paymentStatus: string;
  isOverdue: boolean;
}
