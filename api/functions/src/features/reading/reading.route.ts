import {Router} from "express";
import {
  createReading,
  getReadingById,
  getReadings,
  updateReading,
  deleteReading,
  softDeleteReading,
  restoreReading,
  createBatchReadings,
  updateBatchReadings,
  ocrReading,
} from "./reading.controller";
import {
  CreateReadingBatchDTOSchema,
  CreateReadingDTOSchema,
  ReadingByIdParamsDTOSchema,
  GetReadingsQueryDTOSchema,
  UpdateReadingBatchDTOSchema,
  UpdateReadingDTOSchema,
  OcrReadingDTOSchema,
} from "./reading.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";
import {requireRole} from "../../middlewares/require-role.middleware";

const router = Router();

router.post(
  "/ocr",
  validateRequest({body: OcrReadingDTOSchema}),
  requireRole('admin', 'landlord', 'assistant'),
  ocrReading
);

router.post(
  "/batch",
  validateRequest({body: CreateReadingBatchDTOSchema}),
  requireRole('admin', 'landlord', 'assistant'),
  createBatchReadings
);

router.patch(
  "/batch",
  validateRequest({body: UpdateReadingBatchDTOSchema}),
  requireRole('admin', 'landlord', 'assistant'),
  updateBatchReadings
);

router.post(
  "/",
  validateRequest({body: CreateReadingDTOSchema}),
  createReading
);

router.get(
  "/",
  validateRequest({query: GetReadingsQueryDTOSchema}),
  getReadings
);

router.get(
  "/:id",
  validateRequest({params: ReadingByIdParamsDTOSchema}),
  getReadingById
);

router.patch(
  "/:id",
  validateRequest({params: ReadingByIdParamsDTOSchema, body: UpdateReadingDTOSchema}),
  updateReading
);

router.delete(
  "/:id",
  validateRequest({params: ReadingByIdParamsDTOSchema}),
  requireRole('admin', 'landlord'),
  softDeleteReading
);

router.patch(
  "/:id/restore",
  validateRequest({params: ReadingByIdParamsDTOSchema}),
  requireRole('admin', 'landlord'),
  restoreReading
);

export default router;
