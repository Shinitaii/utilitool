import {Response} from "express";
import {getSummary, getConsumption, getBillingTrends, getCollectionStatus, getAllReports} from "./reports.service";
import type {ReportQueryDTO} from "./reports.dto";
import type {AuthenticatedRequest} from "../../utils/auth.util";

export async function getSummaryReport(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.userId;
  const query = req.query as ReportQueryDTO;
  const summary = await getSummary(userId, query);
  res.set("Cache-Control", "no-store");
  res.json(summary);
}

export async function getConsumptionReport(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.userId;
  const query = req.query as ReportQueryDTO;
  const consumption = await getConsumption(userId, query);
  res.set("Cache-Control", "no-store");
  res.json(consumption);
}

export async function getBillingTrendsReport(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.userId;
  const query = req.query as ReportQueryDTO;
  const trends = await getBillingTrends(userId, query);
  res.set("Cache-Control", "no-store");
  res.json(trends);
}

export async function getCollectionStatusReport(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.userId;
  const query = req.query as ReportQueryDTO;
  const status = await getCollectionStatus(userId, query);
  res.set("Cache-Control", "no-store");
  res.json(status);
}

export async function getAllReportsHandler(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.userId;
  const query = req.query as ReportQueryDTO;
  const reports = await getAllReports(userId, query);
  res.set("Cache-Control", "no-store");
  res.json(reports);
}
