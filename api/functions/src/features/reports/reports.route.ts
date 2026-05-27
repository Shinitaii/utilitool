import { Router } from 'express';
import { validateRequest } from '../../middlewares/validate-request.middleware';
import { ReportQueryDTOSchema } from './reports.dto';
import {
  getSummaryReport,
  getConsumptionReport,
  getBillingTrendsReport,
  getCollectionStatusReport,
} from './reports.controller';

const router = Router();

router.get('/summary', validateRequest({query: ReportQueryDTOSchema}), getSummaryReport);
router.get('/consumption', validateRequest({query: ReportQueryDTOSchema}), getConsumptionReport);
router.get('/billing-trends', validateRequest({query: ReportQueryDTOSchema}), getBillingTrendsReport);
router.get('/collection-status', validateRequest({query: ReportQueryDTOSchema}), getCollectionStatusReport);

export default router;
