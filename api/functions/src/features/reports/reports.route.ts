import {Router} from "express";
import {validateRequest} from "../../middlewares/validate-request.middleware";
import {requireRole} from "../../middlewares/require-role.middleware";
import {ReportQueryDTOSchema} from "./reports.dto";
import {
  getSummaryReport,
  getConsumptionReport,
  getBillingTrendsReport,
  getCollectionStatusReport,
  getAllReportsHandler,
} from "./reports.controller";

const router = Router();

router.get(
  "/",
  requireRole("admin", "landlord"),
  validateRequest({query: ReportQueryDTOSchema}),
  getAllReportsHandler
);
router.get(
  "/summary",
  requireRole("admin", "landlord"),
  validateRequest({query: ReportQueryDTOSchema}),
  getSummaryReport
);
router.get(
  "/consumption",
  requireRole("admin", "landlord"),
  validateRequest({query: ReportQueryDTOSchema}),
  getConsumptionReport
);
router.get(
  "/billing-trends",
  requireRole("admin", "landlord"),
  validateRequest({query: ReportQueryDTOSchema}),
  getBillingTrendsReport
);
router.get(
  "/collection-status",
  requireRole("admin", "landlord"),
  validateRequest({query: ReportQueryDTOSchema}),
  getCollectionStatusReport
);

export const reportsRouter = router;
